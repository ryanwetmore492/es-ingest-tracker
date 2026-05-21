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
  indexName: string;
  docsCount: number;
  storeSizeBytes: number;
  primaryShards: number;
  replicaShards: number;
  health: string;
  status: string;
}> {
  const results = [];
  const today = new Date();

  for (let d = daysBack; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().slice(0, 10);
    const dayIndex = daysBack - d;

    for (const idx of INDICES) {
      // Apply compound daily growth with slight noise
      const growthFactor = Math.pow(1 + idx.growth / 30, dayIndex);
      const noise = 1 + (seededRand(dayIndex * 100 + idx.name.charCodeAt(0)) - 0.5) * 0.04;
      const sizeBytes = Math.round(idx.baseSize * growthFactor * noise);
      const docsCount = Math.round((sizeBytes / 800)); // ~800 bytes per doc

      results.push({
        snapshotDate: dateStr,
        indexName: idx.name,
        docsCount,
        storeSizeBytes: sizeBytes,
        primaryShards: idx.shards,
        replicaShards: 1,
        health: idx.health,
        status: "open",
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
