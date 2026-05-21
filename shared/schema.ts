import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ES connection config (single row, id=1)
// NOTE: credentials (authType, username, password, apiKey) are intentionally
// NOT stored in SQLite — they live in server memory only for the session.
// Only non-sensitive fields (host, kibanaHost, useMockData, autoRefresh*) are persisted.
export const esConfig = sqliteTable("es_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  host: text("host").notNull().default("http://localhost:9200"),
  kibanaHost: text("kibana_host").notNull().default(""),
  useMockData: integer("use_mock_data", { mode: "boolean" }).notNull().default(true),
  // Auto-refresh: interval in seconds (0 = disabled), only active in live mode
  autoRefreshEnabled: integer("auto_refresh_enabled", { mode: "boolean" }).notNull().default(false),
  autoRefreshInterval: integer("auto_refresh_interval").notNull().default(300), // seconds
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

// Alert rules
export const alertRules = sqliteTable("alert_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  threshold: real("threshold").notNull(),
  indexPattern: text("index_pattern").notNull().default("*"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
});

// Fired alert events
export const alertEvents = sqliteTable("alert_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ruleId: integer("rule_id").notNull(),
  ruleName: text("rule_name").notNull(),
  indexName: text("index_name").notNull(),
  currentValue: real("current_value").notNull(),
  threshold: real("threshold").notNull(),
  type: text("type").notNull(),
  firedAt: text("fired_at").notNull().default(new Date().toISOString()),
  acknowledged: integer("acknowledged", { mode: "boolean" }).notNull().default(false),
});

// Snapshots now store a full ISO timestamp so sub-daily timeframes work.
// snapshotDate is still stored (YYYY-MM-DD) for daily queries.
// capturedAt (ISO) is the authoritative timestamp for hourly/6h/12h grouping.
export const indexSnapshots = sqliteTable("index_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotDate: text("snapshot_date").notNull(),
  snapshotHour: integer("snapshot_hour").notNull().default(0), // 0-23
  indexName: text("index_name").notNull(),
  docsCount: integer("docs_count").notNull().default(0),
  storeSizeBytes: integer("store_size_bytes").notNull().default(0),
  primaryShards: integer("primary_shards").notNull().default(1),
  replicaShards: integer("replica_shards").notNull().default(1),
  health: text("health").notNull().default("green"),
  status: text("status").notNull().default("open"),
  capturedAt: text("captured_at").notNull().default(new Date().toISOString()),
});

// Insert schemas
export const insertEsConfigSchema = createInsertSchema(esConfig).omit({ id: true, updatedAt: true });
export const insertAlertRuleSchema = createInsertSchema(alertRules).omit({ id: true, createdAt: true });
export const insertAlertEventSchema = createInsertSchema(alertEvents).omit({ id: true, firedAt: true });
export const insertIndexSnapshotSchema = createInsertSchema(indexSnapshots).omit({ id: true, capturedAt: true });

// Types
export type EsConfig = typeof esConfig.$inferSelect;
export type InsertEsConfig = z.infer<typeof insertEsConfigSchema>;
export type AlertRule = typeof alertRules.$inferSelect;
export type InsertAlertRule = z.infer<typeof insertAlertRuleSchema>;
export type AlertEvent = typeof alertEvents.$inferSelect;
export type InsertAlertEvent = z.infer<typeof insertAlertEventSchema>;
export type IndexSnapshot = typeof indexSnapshots.$inferSelect;
export type InsertIndexSnapshot = z.infer<typeof insertIndexSnapshotSchema>;
