// Deterministic mock data generator for ES index stats
// Simulates 7 days of index data with realistic patterns

export interface MockIndex {
  index: string;
  health: string;
  status: string;
  pri: string;
  rep: string;
  docsCount: number;
  storeSize: number; // bytes
}

const INDICES = [
  { name: "logs-nginx-prod", baseSize: 18_000_000_000, growth: 0.12, shards: 3, health: "green" },
  { name: "logs-app-events", baseSize: 52_000_000_000, growth: 0.08, shards: 5, health: "yellow" }, // over 40GB
  { name: "metrics-infra", baseSize: 9_500_000_000, growth: 0.25, shards: 2, health: "green" },
  { name: "apm-traces-2026.05", baseSize: 6_200_000_000, growth: 0.32, shards: 2, health: "green" },
  { name: "security-alerts", baseSize: 2_800_000_000, growth: 0.05, shards: 1, health: "green" },
  { name: "filebeat-syslog", baseSize: 14_000_000_000, growth: 0.18, shards: 3, health: "green" },
  { name: "winlogbeat-prod", baseSize: 28_000_000_000, growth: 0.09, shards: 4, health: "green" },
  { name: "packetbeat-net", baseSize: 7_300_000_000, growth: 0.15, shards: 2, health: "green" },
  { name: ".kibana_1", baseSize: 45_000_000, growth: 0.01, shards: 1, health: "green" },
  { name: "ilm-history-5", baseSize: 120_000_000, growth: 0.02, shards: 1, health: "green" },
];

function seededRand(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function generateDailySnapshots(daysBack: number): Array<{
  snapshotDate: string;
  snapshotHour: number;
  indexName: string;
  docsCount: number;
  storeSizeBytes: number;
  primaryShards: number;
  replicaShards: number;
  health: string;
  status: string;
  capturedAt: string;
}> {
  const results = [];
  const today = new Date();

  for (let d = daysBack; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().slice(0, 10);
    const dayIndex = daysBack - d;

    // Stamp daily snapshots at noon on their respective day so the
    // timeframe query's captured_at filter correctly places them in history
    const captureTime = new Date(date);
    captureTime.setHours(12, 0, 0, 0);
    const capturedAt = captureTime.toISOString();

    for (const idx of INDICES) {
      // Apply compound daily growth with slight noise
      const growthFactor = Math.pow(1 + idx.growth / 30, dayIndex);
      const noise = 1 + (seededRand(dayIndex * 100 + idx.name.charCodeAt(0)) - 0.5) * 0.04;
      const sizeBytes = Math.round(idx.baseSize * growthFactor * noise);
      const docsCount = Math.round((sizeBytes / 800)); // ~800 bytes per doc

      results.push({
        snapshotDate: dateStr,
        snapshotHour: 12,
        indexName: idx.name,
        docsCount,
        storeSizeBytes: sizeBytes,
        primaryShards: idx.shards,
        replicaShards: 1,
        health: idx.health,
        status: "open",
        capturedAt,
      });
    }
  }

  return results;
}

export function getMockCurrentIndices(): MockIndex[] {
  const snapshots = generateDailySnapshots(0);
  return snapshots.map(s => {
    const idx = INDICES.find(i => i.name === s.indexName)!;
    return {
      index: s.indexName,
      health: s.health,
      status: s.status,
      pri: String(idx?.shards ?? 1),
      rep: "1",
      docsCount: s.docsCount,
      storeSize: s.storeSizeBytes,
    };
  });
}

// Generate sub-daily (hourly) mock snapshots for short timeframes
export function generateHourlySnapshots(hoursBack: number): Array<{
  snapshotDate: string;
  snapshotHour: number;
  indexName: string;
  docsCount: number;
  storeSizeBytes: number;
  primaryShards: number;
  replicaShards: number;
  health: string;
  status: string;
  capturedAt: string;
}> {
  const results = [];
  const now = new Date();

  for (let h = hoursBack; h >= 0; h--) {
    const ts = new Date(now);
    ts.setHours(ts.getHours() - h);
    // Snap to the hour boundary
    ts.setMinutes(0, 0, 0);
    const dateStr = ts.toISOString().slice(0, 10);
    const hour = ts.getHours();
    const capturedAt = ts.toISOString();

    for (const idx of INDICES) {
      // Hourly ingest: spread daily growth across 24 hours with a diurnal curve
      const hourlyGrowthRate = idx.growth / 30 / 24;
      const diurnal = 1 + 0.4 * Math.sin((hour - 6) * Math.PI / 12); // peak midday
      const elapsed = hoursBack - h;
      const growthFactor = Math.pow(1 + hourlyGrowthRate * diurnal, elapsed);
      const noise = 1 + (seededRand(elapsed * 1000 + hour + idx.name.charCodeAt(0)) - 0.5) * 0.01;
      const sizeBytes = Math.round(idx.baseSize * growthFactor * noise);
      const docsCount = Math.round(sizeBytes / 800);

      results.push({
        snapshotDate: dateStr,
        snapshotHour: hour,
        indexName: idx.name,
        docsCount,
        storeSizeBytes: sizeBytes,
        primaryShards: idx.shards,
        replicaShards: 1,
        health: idx.health,
        status: "open",
        capturedAt,
      });
    }
  }

  return results;
}
