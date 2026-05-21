import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, gte } from "drizzle-orm";
import {
  esConfig, alertRules, alertEvents, indexSnapshots,
  type EsConfig, type InsertEsConfig,
  type AlertRule, type InsertAlertRule,
  type AlertEvent, type InsertAlertEvent,
  type IndexSnapshot, type InsertIndexSnapshot,
} from "@shared/schema";

const sqlite = new Database("data.db");
const db = drizzle(sqlite);

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS es_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host TEXT NOT NULL DEFAULT 'http://localhost:9200',
    auth_type TEXT NOT NULL DEFAULT 'basic',
    username TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
    kibana_host TEXT NOT NULL DEFAULT '',
    use_mock_data INTEGER NOT NULL DEFAULT 1,
    auto_refresh_enabled INTEGER NOT NULL DEFAULT 0,
    auto_refresh_interval INTEGER NOT NULL DEFAULT 300,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );


  CREATE TABLE IF NOT EXISTS alert_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    threshold REAL NOT NULL,
    index_pattern TEXT NOT NULL DEFAULT '*',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alert_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL,
    rule_name TEXT NOT NULL,
    index_name TEXT NOT NULL,
    current_value REAL NOT NULL,
    threshold REAL NOT NULL,
    type TEXT NOT NULL,
    fired_at TEXT NOT NULL DEFAULT (datetime('now')),
    acknowledged INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS index_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date TEXT NOT NULL,
    snapshot_hour INTEGER NOT NULL DEFAULT 0,
    index_name TEXT NOT NULL,
    docs_count INTEGER NOT NULL DEFAULT 0,
    store_size_bytes INTEGER NOT NULL DEFAULT 0,
    primary_shards INTEGER NOT NULL DEFAULT 1,
    replica_shards INTEGER NOT NULL DEFAULT 1,
    health TEXT NOT NULL DEFAULT 'green',
    status TEXT NOT NULL DEFAULT 'open',
    captured_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Safe migration: add new columns to existing tables
const existingCols = (sqlite.prepare("PRAGMA table_info(es_config)").all() as any[]).map((c: any) => c.name);
if (!existingCols.includes("auth_type")) {
  sqlite.exec("ALTER TABLE es_config ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'basic'");
}
if (!existingCols.includes("api_key")) {
  sqlite.exec("ALTER TABLE es_config ADD COLUMN api_key TEXT NOT NULL DEFAULT ''");
}
if (!existingCols.includes("auto_refresh_enabled")) {
  sqlite.exec("ALTER TABLE es_config ADD COLUMN auto_refresh_enabled INTEGER NOT NULL DEFAULT 0");
}
if (!existingCols.includes("auto_refresh_interval")) {
  sqlite.exec("ALTER TABLE es_config ADD COLUMN auto_refresh_interval INTEGER NOT NULL DEFAULT 300");
}
const snapCols = (sqlite.prepare("PRAGMA table_info(index_snapshots)").all() as any[]).map((c: any) => c.name);
if (!snapCols.includes("snapshot_hour")) {
  sqlite.exec("ALTER TABLE index_snapshots ADD COLUMN snapshot_hour INTEGER NOT NULL DEFAULT 0");
}

// Seed default config if empty
const configCount = sqlite.prepare("SELECT COUNT(*) as c FROM es_config").get() as { c: number };
if (configCount.c === 0) {
  sqlite.exec(`INSERT INTO es_config (host, username, password, kibana_host, use_mock_data) VALUES ('http://localhost:9200','','','',1)`);
}

// Seed default alert rules if empty
const ruleCount = sqlite.prepare("SELECT COUNT(*) as c FROM alert_rules").get() as { c: number };
if (ruleCount.c === 0) {
  sqlite.exec(`
    INSERT INTO alert_rules (name, type, threshold, index_pattern, enabled) VALUES
      ('Index Size > 40 GB', 'size_gb', 40, '*', 1),
      ('Daily Ingest Growth > 20%', 'growth_pct', 20, '*', 1);
  `);
}

export interface IStorage {
  // Config
  getConfig(): EsConfig | undefined;
  upsertConfig(data: InsertEsConfig): EsConfig;

  // Alert rules
  getAlertRules(): AlertRule[];
  createAlertRule(data: InsertAlertRule): AlertRule;
  updateAlertRule(id: number, data: Partial<InsertAlertRule>): AlertRule | undefined;
  deleteAlertRule(id: number): void;

  // Alert events
  getAlertEvents(limit?: number): AlertEvent[];
  createAlertEvent(data: InsertAlertEvent): AlertEvent;
  acknowledgeAlertEvent(id: number): AlertEvent | undefined;
  clearAcknowledgedEvents(): void;

  // Snapshots
  saveSnapshots(snapshots: InsertIndexSnapshot[]): void;
  replaceHourlySnapshots(date: string, hour: number, snapshots: InsertIndexSnapshot[]): void;
  getSnapshotsByDate(date: string): IndexSnapshot[];
  getSnapshotsForRange(startDate: string, endDate: string): IndexSnapshot[];
  getLatestSnapshotPerIndex(): IndexSnapshot[];
  deleteSnapshotsOlderThan(days: number): void;
  clearAllSnapshots(): void;
  clearAlertEvents(): void;
  clearCredentials(): void;
  getSnapshotsForTimeframe(hours: number): IndexSnapshot[];
}

export const storage: IStorage = {
  getConfig() {
    return db.select().from(esConfig).limit(1).get();
  },

  upsertConfig(data) {
    const existing = db.select().from(esConfig).limit(1).get();
    if (existing) {
      db.update(esConfig)
        .set({ ...data, updatedAt: new Date().toISOString() })
        .where(eq(esConfig.id, existing.id))
        .run();
      return db.select().from(esConfig).where(eq(esConfig.id, existing.id)).get()!;
    } else {
      return db.insert(esConfig).values({ ...data, updatedAt: new Date().toISOString() }).returning().get();
    }
  },

  getAlertRules() {
    return db.select().from(alertRules).all();
  },

  createAlertRule(data) {
    return db.insert(alertRules).values({ ...data, createdAt: new Date().toISOString() }).returning().get();
  },

  updateAlertRule(id, data) {
    db.update(alertRules).set(data).where(eq(alertRules.id, id)).run();
    return db.select().from(alertRules).where(eq(alertRules.id, id)).get();
  },

  deleteAlertRule(id) {
    db.delete(alertRules).where(eq(alertRules.id, id)).run();
  },

  getAlertEvents(limit = 50) {
    return db.select().from(alertEvents).orderBy(desc(alertEvents.firedAt)).limit(limit).all();
  },

  createAlertEvent(data) {
    return db.insert(alertEvents).values({ ...data, firedAt: new Date().toISOString() }).returning().get();
  },

  acknowledgeAlertEvent(id) {
    db.update(alertEvents).set({ acknowledged: true }).where(eq(alertEvents.id, id)).run();
    return db.select().from(alertEvents).where(eq(alertEvents.id, id)).get();
  },

  clearAcknowledgedEvents() {
    db.delete(alertEvents).where(eq(alertEvents.acknowledged, true)).run();
  },

  saveSnapshots(snapshots) {
    for (const snap of snapshots) {
      db.insert(indexSnapshots).values({ ...snap, capturedAt: new Date().toISOString() }).run();
    }
  },

  replaceHourlySnapshots(date, hour, snapshots) {
    // Delete existing rows for this date+hour, then insert fresh ones.
    // This prevents duplicate accumulation when polling runs multiple times per hour.
    sqlite.prepare(
      "DELETE FROM index_snapshots WHERE snapshot_date = ? AND snapshot_hour = ?"
    ).run(date, hour);
    const capturedAt = new Date().toISOString();
    for (const snap of snapshots) {
      db.insert(indexSnapshots).values({ ...snap, capturedAt }).run();
    }
  },

  getSnapshotsByDate(date) {
    return db.select().from(indexSnapshots).where(eq(indexSnapshots.snapshotDate, date)).all();
  },

  getSnapshotsForRange(startDate, endDate) {
    return db.select().from(indexSnapshots)
      .where(and(gte(indexSnapshots.snapshotDate, startDate), gte(endDate, indexSnapshots.snapshotDate)))
      .orderBy(indexSnapshots.snapshotDate)
      .all();
  },

  getLatestSnapshotPerIndex() {
    const rows = sqlite.prepare(`
      SELECT s.id,
             s.snapshot_date    AS snapshotDate,
             s.index_name       AS indexName,
             s.docs_count       AS docsCount,
             s.store_size_bytes AS storeSizeBytes,
             s.primary_shards   AS primaryShards,
             s.replica_shards   AS replicaShards,
             s.health,
             s.status,
             s.captured_at      AS capturedAt
      FROM index_snapshots s
      INNER JOIN (
        SELECT index_name, MAX(captured_at) as max_captured
        FROM index_snapshots
        GROUP BY index_name
      ) latest ON s.index_name = latest.index_name AND s.captured_at = latest.max_captured
      ORDER BY s.store_size_bytes DESC
    `).all() as IndexSnapshot[];
    return rows;
  },

  deleteSnapshotsOlderThan(days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    sqlite.prepare("DELETE FROM index_snapshots WHERE snapshot_date < ?").run(cutoffStr);
  },

  getSnapshotsForTimeframe(hours: number) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    const cutoffStr = cutoff.toISOString();
    const rows = sqlite.prepare(`
      SELECT id,
             snapshot_date   AS snapshotDate,
             snapshot_hour   AS snapshotHour,
             index_name      AS indexName,
             docs_count      AS docsCount,
             store_size_bytes AS storeSizeBytes,
             primary_shards  AS primaryShards,
             replica_shards  AS replicaShards,
             health,
             status,
             captured_at     AS capturedAt
      FROM index_snapshots
      WHERE captured_at >= ?
      ORDER BY captured_at ASC
    `).all(cutoffStr) as IndexSnapshot[];
    return rows;
  },

  clearAllSnapshots() {
    sqlite.prepare("DELETE FROM index_snapshots").run();
  },

  clearAlertEvents() {
    sqlite.prepare("DELETE FROM alert_events").run();
  },

  clearCredentials() {
    sqlite.prepare(
      "UPDATE es_config SET username = '', password = '', api_key = '', auth_type = 'none' WHERE id = 1"
    ).run();
  },
};
