import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { generateDailySnapshots, generateHourlySnapshots, getMockCurrentIndices } from "./mockData";
import { insertEsConfigSchema, insertAlertRuleSchema } from "@shared/schema";
import { z } from "zod";

// Seed mock data on first launch
function seedMockDataIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  const existing = storage.getSnapshotsByDate(today);
  if (existing.length === 0) {
    const dailySnaps = generateDailySnapshots(6); // 7 days including today
    storage.saveSnapshots(dailySnaps);
    // Also seed hourly data for short timeframe views (last 24h)
    const hourlySnaps = generateHourlySnapshots(24);
    storage.saveSnapshots(hourlySnaps);
  }
}

// Evaluate alert rules against current snapshot data
function evaluateAlerts() {
  const rules = storage.getAlertRules().filter(r => r.enabled);
  const latestSnapshots = storage.getLatestSnapshotPerIndex();

  // Build yesterday's snapshots for growth calc
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const yesterdaySnaps = storage.getSnapshotsByDate(yesterdayStr);
  const yesterdayMap = new Map(yesterdaySnaps.map(s => [s.indexName, s]));

  for (const rule of rules) {
    const pattern = rule.indexPattern.replace(/\*/g, ".*").replace(/\?/g, ".");
    const regex = new RegExp(`^${pattern}$`);

    for (const snap of latestSnapshots) {
      if (!regex.test(snap.indexName)) continue;

      let currentValue = 0;
      let shouldFire = false;

      if (rule.type === "size_gb") {
        currentValue = snap.storeSizeBytes / 1_073_741_824; // bytes → GB
        shouldFire = currentValue > rule.threshold;
      } else if (rule.type === "growth_pct") {
        const prev = yesterdayMap.get(snap.indexName);
        if (prev && prev.storeSizeBytes > 0) {
          currentValue = ((snap.storeSizeBytes - prev.storeSizeBytes) / prev.storeSizeBytes) * 100;
          shouldFire = currentValue > rule.threshold;
        }
      }

      if (shouldFire) {
        // Check if we already fired this rule for this index today
        const today = new Date().toISOString().slice(0, 10);
        const existingEvents = storage.getAlertEvents(200);
        const alreadyFired = existingEvents.some(
          e => e.ruleId === rule.id && e.indexName === snap.indexName && e.firedAt.slice(0, 10) === today
        );

        if (!alreadyFired) {
          storage.createAlertEvent({
            ruleId: rule.id,
            ruleName: rule.name,
            indexName: snap.indexName,
            currentValue,
            threshold: rule.threshold,
            type: rule.type,
            acknowledged: false,
          });
        }
      }
    }
  }
}

// Build Authorization header based on auth type
function buildAuthHeader(authType: string, username: string, password: string, apiKey: string): string | null {
  if (authType === "apikey" && apiKey) {
    // ES API key format: already base64(id:key) OR raw key — detect by presence of ":"
    // If the user pastes a raw "id:api_key" string we encode it; if it looks pre-encoded, use as-is
    const isPreEncoded = !apiKey.includes(":");
    const encoded = isPreEncoded ? apiKey : Buffer.from(apiKey).toString("base64");
    return `ApiKey ${encoded}`;
  }
  if (authType === "basic" && username) {
    return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }
  return null;
}

// Fetch live data from Elasticsearch
async function fetchLiveData(host: string, authType: string, username: string, password: string, apiKey: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const authHeader = buildAuthHeader(authType, username, password, apiKey);
  if (authHeader) headers["Authorization"] = authHeader;

  const baseUrl = host.replace(/\/$/, "");
  const catUrl = `${baseUrl}/_cat/indices?v=true&format=json&bytes=b&h=index,health,status,pri,rep,docs.count,store.size`;

  const resp = await fetch(catUrl, { headers });
  if (!resp.ok) throw new Error(`ES responded ${resp.status}: ${await resp.text()}`);

  const data = (await resp.json()) as Array<Record<string, string>>;
  return data.map(row => ({
    index: row.index,
    health: row.health ?? "unknown",
    status: row.status ?? "open",
    pri: row.pri ?? "1",
    rep: row.rep ?? "0",
    docsCount: parseInt(row["docs.count"] ?? "0", 10) || 0,
    storeSize: parseInt(row["store.size"] ?? "0", 10) || 0,
  }));
}

export async function registerRoutes(httpServer: Server, app: Express) {
  // Seed data on boot
  seedMockDataIfNeeded();
  evaluateAlerts();

  // --- Config ---
  app.get("/api/config", (_req, res) => {
    const cfg = storage.getConfig();
    if (!cfg) return res.json({ host: "", username: "", password: "", kibanaHost: "", useMockData: true });
    // Don't leak password
    res.json({ ...cfg, password: cfg.password ? "••••••••" : "", apiKey: cfg.apiKey ? "••••••••" : "" });
  });

  app.post("/api/config", (req, res) => {
    try {
      const data = insertEsConfigSchema.parse(req.body);
      // Preserve masked secrets if placeholder sent back
      const existing = storage.getConfig();
      if (data.password === "••••••••" && existing) {
        data.password = existing.password;
      }
      if ((data.apiKey === "••••••••" || !data.apiKey) && existing?.apiKey) {
        data.apiKey = existing.apiKey;
      }

      // Detect mode change — clear stale snapshots AND alert events so old data never bleeds through
      const modeChanged = existing && (existing.useMockData !== data.useMockData);
      if (modeChanged) {
        storage.clearAllSnapshots();
        storage.clearAlertEvents();
        // Switching back to mock: immediately re-seed so charts aren't empty
        if (data.useMockData) {
          const dailySnaps = generateDailySnapshots(6);
          storage.saveSnapshots(dailySnaps);
          const hourlySnaps = generateHourlySnapshots(24);
          storage.saveSnapshots(hourlySnaps);
        }
      }

      const cfg = storage.upsertConfig(data);
      res.json({ ...cfg, password: cfg.password ? "••••••••" : "", apiKey: cfg.apiKey ? "••••••••" : "" });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // --- Refresh / Poll ---
  app.post("/api/refresh", async (_req, res) => {
    try {
      const cfg = storage.getConfig();
      const useMock = !cfg || cfg.useMockData;

      if (!useMock) {
        const liveData = await fetchLiveData(cfg!.host, cfg!.authType ?? 'basic', cfg!.username, cfg!.password, cfg!.apiKey ?? '');
        const today = new Date().toISOString().slice(0, 10);
        const now = new Date();
        const snapshotHour = now.getHours();
        const snapshots = liveData.map(row => ({
          snapshotDate: today,
          snapshotHour,
          indexName: row.index,
          docsCount: row.docsCount,
          storeSizeBytes: row.storeSize,
          primaryShards: parseInt(row.pri, 10) || 1,
          replicaShards: parseInt(row.rep, 10) || 0,
          health: row.health,
          status: row.status,
        }));
        // Replace today's snapshots (same hour) so we don't accumulate duplicate rows
        storage.replaceHourlySnapshots(today, snapshotHour, snapshots);
      } else {
        // Re-seed mock if today is missing
        const today = new Date().toISOString().slice(0, 10);
        const existing = storage.getSnapshotsByDate(today);
        if (existing.length === 0) {
          const snapshots = generateDailySnapshots(6);
          storage.saveSnapshots(snapshots);
        }
      }

      evaluateAlerts();
      res.json({ success: true, message: useMock ? "Mock data refreshed" : "Live data fetched" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Dashboard summary ---
  app.get("/api/dashboard/summary", (_req, res) => {
    const latest = storage.getLatestSnapshotPerIndex();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdaySnaps = storage.getSnapshotsByDate(yesterday.toISOString().slice(0, 10));
    const yesterdayMap = new Map(yesterdaySnaps.map(s => [s.indexName, s]));

    const totalSizeBytes = latest.reduce((sum, s) => sum + s.storeSizeBytes, 0);
    const totalDocs = latest.reduce((sum, s) => sum + s.docsCount, 0);
    const totalShards = latest.reduce((sum, s) => sum + s.primaryShards + s.replicaShards, 0);
    const avgShardSizeBytes = totalShards > 0 ? totalSizeBytes / totalShards : 0;

    // Total ingest delta today vs yesterday
    const totalYesterdayBytes = yesterdaySnaps.reduce((sum, s) => sum + s.storeSizeBytes, 0);
    const ingestDeltaPct = totalYesterdayBytes > 0 ? ((totalSizeBytes - totalYesterdayBytes) / totalYesterdayBytes) * 100 : 0;

    const alertsActive = storage.getAlertEvents(200).filter(e => !e.acknowledged).length;

    // Largest index
    const largest = latest.length > 0
      ? { name: latest[0].indexName, sizeBytes: latest[0].storeSizeBytes }
      : null;

    res.json({
      totalSizeBytes,
      totalDocs,
      avgShardSizeBytes,
      ingestDeltaPct,
      indexCount: latest.length,
      alertsActive,
      largest,
    });
  });

  // --- Index list (latest snapshot per index) ---
  app.get("/api/dashboard/indices", (_req, res) => {
    const latest = storage.getLatestSnapshotPerIndex();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdaySnaps = storage.getSnapshotsByDate(yesterday.toISOString().slice(0, 10));
    const yesterdayMap = new Map(yesterdaySnaps.map(s => [s.indexName, s]));

    const result = latest.map(snap => {
      const prev = yesterdayMap.get(snap.indexName);
      const growthPct = prev && prev.storeSizeBytes > 0
        ? ((snap.storeSizeBytes - prev.storeSizeBytes) / prev.storeSizeBytes) * 100
        : null;
      const totalShards = snap.primaryShards + snap.replicaShards;
      const avgShardBytes = totalShards > 0 ? snap.storeSizeBytes / totalShards : 0;
      return {
        ...snap,
        growthPct,
        avgShardBytes,
        sizeGb: snap.storeSizeBytes / 1_073_741_824,
        over40gb: snap.storeSizeBytes > 40 * 1_073_741_824,
      };
    });

    res.json(result);
  });

  // --- Daily ingest per index (7-day chart data) ---
  app.get("/api/dashboard/daily-ingest", (_req, res) => {
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    const startDateStr = startDate.toISOString().slice(0, 10);

    const snapshots = storage.getSnapshotsForRange(startDateStr, endDate);

    // Group by date then index
    const byDate = new Map<string, Map<string, number>>();
    for (const snap of snapshots) {
      if (!byDate.has(snap.snapshotDate)) byDate.set(snap.snapshotDate, new Map());
      byDate.get(snap.snapshotDate)!.set(snap.indexName, snap.storeSizeBytes);
    }

    // Build sorted date list
    const dates: string[] = [];
    for (let d = 6; d >= 0; d--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      dates.push(dt.toISOString().slice(0, 10));
    }

    // Top 6 indices by current size
    const latest = storage.getLatestSnapshotPerIndex();
    const topIndices = latest
      .filter(s => !s.indexName.startsWith("."))
      .slice(0, 6)
      .map(s => s.indexName);

    // Calculate daily ingest delta (size change day-over-day)
    const series: Record<string, number[]> = {};
    for (const idx of topIndices) series[idx] = [];

    for (let i = 0; i < dates.length; i++) {
      const dateMap = byDate.get(dates[i]);
      const prevDateMap = i > 0 ? byDate.get(dates[i - 1]) : null;

      for (const idx of topIndices) {
        const current = dateMap?.get(idx) ?? 0;
        const prev = prevDateMap?.get(idx) ?? 0;
        const delta = i === 0 ? current * 0.08 : Math.max(0, current - prev); // first day estimate
        series[idx].push(Math.round(delta));
      }
    }

    res.json({ dates, series, topIndices });
  });

  // --- 7-day total trend ---
  app.get("/api/dashboard/trend", (_req, res) => {
    const endDate = new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    const startDateStr = startDate.toISOString().slice(0, 10);
    const snapshots = storage.getSnapshotsForRange(startDateStr, endDate);

    const dates: string[] = [];
    for (let d = 6; d >= 0; d--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      dates.push(dt.toISOString().slice(0, 10));
    }

    const totalByDate = new Map<string, number>();
    for (const snap of snapshots) {
      totalByDate.set(snap.snapshotDate, (totalByDate.get(snap.snapshotDate) ?? 0) + snap.storeSizeBytes);
    }

    const totals = dates.map(d => totalByDate.get(d) ?? 0);
    const docsbyDate = new Map<string, number>();
    for (const snap of snapshots) {
      docsbyDate.set(snap.snapshotDate, (docsbyDate.get(snap.snapshotDate) ?? 0) + snap.docsCount);
    }
    const docTotals = dates.map(d => docsbyDate.get(d) ?? 0);

    res.json({ dates, totals, docTotals });
  });

  // --- Timeframe trend (supports 1h, 6h, 12h, 24h, 48h, 168h=7d) ---
  app.get("/api/dashboard/timeframe", (req, res) => {
    const hours = Math.min(Math.max(parseInt(req.query.hours as string ?? "168", 10), 1), 168);

    // Use hourly buckets for ≤48h, daily for >48h
    const useHourly = hours <= 48;

    // Helper: snap → bucket label
    function snapLabel(snap: any): string {
      if (useHourly) {
        const d = new Date(snap.capturedAt);
        return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${String(d.getHours()).padStart(2, "0")}:00`;
      } else {
        const d = new Date(snap.snapshotDate + "T12:00:00Z");
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
    }

    // Generate ordered bucket labels covering the full window
    const labels: string[] = [];
    const now = new Date();
    if (useHourly) {
      for (let h = hours; h >= 0; h--) {
        const t = new Date(now);
        t.setHours(t.getHours() - h, 0, 0, 0);
        const label = `${t.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${String(t.getHours()).padStart(2, "0")}:00`;
        if (!labels.includes(label)) labels.push(label);
      }
    } else {
      for (let d = Math.ceil(hours / 24); d >= 0; d--) {
        const dt = new Date(now);
        dt.setDate(dt.getDate() - d);
        const label = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        if (!labels.includes(label)) labels.push(label);
      }
    }

    // Fetch snapshots covering this window PLUS one extra prior bucket for delta
    // (extend lookback by one bucket so we can diff the first visible bucket)
    const extraHours = useHourly ? hours + 1 : hours + 24;
    const snapshots = storage.getSnapshotsForTimeframe(extraHours);

    // ── Trend line: aggregate total store size per bucket (sum latest per index per bucket) ──
    // For each bucket, sum the LATEST size seen for each index within that bucket
    // This prevents duplicate inflation when multiple refresh snapshots land in same bucket.
    type BucketIndexMap = Map<string, Map<string, number>>; // bucket → indexName → maxBytes
    const bucketIndexSize: BucketIndexMap = new Map();
    const bucketIndexDocs: Map<string, Map<string, number>> = new Map();

    for (const snap of snapshots) {
      const label = snapLabel(snap);
      if (!bucketIndexSize.has(label)) bucketIndexSize.set(label, new Map());
      if (!bucketIndexDocs.has(label)) bucketIndexDocs.set(label, new Map());
      // keep latest (highest captured_at = highest bytes for live polls)
      const existing = bucketIndexSize.get(label)!.get(snap.indexName) ?? -1;
      if (snap.storeSizeBytes >= existing) {
        bucketIndexSize.get(label)!.set(snap.indexName, snap.storeSizeBytes);
        bucketIndexDocs.get(label)!.set(snap.indexName, snap.docsCount);
      }
    }

    const totals = labels.map(l => {
      const m = bucketIndexSize.get(l);
      if (!m) return 0;
      let sum = 0;
      for (const v of m.values()) sum += v;
      return +(sum / 1_073_741_824).toFixed(2);
    });
    const docTotals = labels.map(l => {
      const m = bucketIndexDocs.get(l);
      if (!m) return 0;
      let sum = 0;
      for (const v of m.values()) sum += v;
      return sum;
    });

    // ── Bar chart: per-index ingest delta per bucket ──
    const latestSnaps = storage.getLatestSnapshotPerIndex();
    const topIndices = latestSnaps.filter(s => !s.indexName.startsWith(".")).slice(0, 6).map(s => s.indexName);

    // Build per-index, per-bucket size map (including the extra pre-window bucket)
    const allLabels = new Set<string>();
    for (const snap of snapshots) allLabels.add(snapLabel(snap));

    const indexBuckets = new Map<string, Map<string, number>>();
    for (const idx of topIndices) indexBuckets.set(idx, new Map());

    for (const snap of snapshots) {
      if (!topIndices.includes(snap.indexName)) continue;
      const label = snapLabel(snap);
      const m = indexBuckets.get(snap.indexName)!;
      // Keep max (latest) size per bucket per index
      if (!m.has(label) || snap.storeSizeBytes > m.get(label)!) {
        m.set(label, snap.storeSizeBytes);
      }
    }

    // Build the full ordered label list (may include one pre-window bucket)
    const allOrderedLabels = [...labels]; // labels already covers the visible window

    // Count distinct buckets that actually have data (to detect if we have enough to diff)
    const series: Record<string, number[]> = {};
    for (const idx of topIndices) {
      const m = indexBuckets.get(idx)!;
      const vals = allOrderedLabels.map(l => m.has(l) ? m.get(l)! / 1_073_741_824 : null);

      series[idx] = vals.map((v, i) => {
        if (v === null) return 0;
        // Find the previous non-null bucket for diffing
        let prev: number | null = null;
        for (let j = i - 1; j >= 0; j--) {
          if (vals[j] !== null) { prev = vals[j]; break; }
        }
        if (prev === null) {
          // No prior snapshot: show the absolute size so chart isn't empty
          return +v.toFixed(3);
        }
        return +Math.max(0, v - prev).toFixed(3);
      });
    }

    res.json({ labels, totals, docTotals, series, topIndices, useHourly, hours });
  });

  // --- Alert Rules ---
  app.get("/api/alerts/rules", (_req, res) => {
    res.json(storage.getAlertRules());
  });

  app.post("/api/alerts/rules", (req, res) => {
    try {
      const data = insertAlertRuleSchema.parse(req.body);
      const rule = storage.createAlertRule(data);
      res.json(rule);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch("/api/alerts/rules/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
      const data = insertAlertRuleSchema.partial().parse(req.body);
      const updated = storage.updateAlertRule(id, data);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/alerts/rules/:id", (req, res) => {
    storage.deleteAlertRule(parseInt(req.params.id, 10));
    res.json({ success: true });
  });

  // --- Alert Events ---
  app.get("/api/alerts/events", (_req, res) => {
    res.json(storage.getAlertEvents(100));
  });

  app.post("/api/alerts/events/:id/ack", (req, res) => {
    const evt = storage.acknowledgeAlertEvent(parseInt(req.params.id, 10));
    if (!evt) return res.status(404).json({ error: "Not found" });
    res.json(evt);
  });

  app.post("/api/alerts/events/clear", (_req, res) => {
    storage.clearAcknowledgedEvents();
    res.json({ success: true });
  });

  // --- Clear snapshot history ---
  app.post("/api/snapshots/clear", (req, res) => {
    storage.clearAllSnapshots();
    storage.clearAlertEvents();
    // Re-seed mock data if in mock mode
    const cfg = storage.getConfig();
    if (!cfg || cfg.useMockData) {
      const dailySnaps = generateDailySnapshots(6);
      storage.saveSnapshots(dailySnaps);
      const hourlySnaps = generateHourlySnapshots(24);
      storage.saveSnapshots(hourlySnaps);
      return res.json({ success: true, message: "Snapshots and alerts cleared; mock data re-seeded" });
    }
    res.json({ success: true, message: "All snapshot history and alert events cleared" });
  });

  // --- Clear credentials ---
  app.post("/api/credentials/clear", (req, res) => {
    storage.clearCredentials();
    res.json({ success: true, message: "Credentials cleared from database" });
  });

  // --- Test connection ---
  app.post("/api/test-connection", async (req, res) => {
    try {
      const { host, authType, username, password, apiKey } = z.object({
        host: z.string(),
        authType: z.string().optional().default("basic"),
        username: z.string().optional().default(""),
        password: z.string().optional().default(""),
        apiKey: z.string().optional().default(""),
      }).parse(req.body);

      const headers: Record<string, string> = { Accept: "application/json" };
      const authHeader = buildAuthHeader(authType, username, password, apiKey);
      if (authHeader) headers["Authorization"] = authHeader;

      const resp = await fetch(`${host.replace(/\/$/, "")}/_cluster/health`, { headers });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      res.json({ success: true, status: data.status, clusterName: data.cluster_name });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });
}
