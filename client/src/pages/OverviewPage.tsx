import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Database, HardDrive, BarChart2, AlertCircle, Layers } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import { formatBytes, formatGB, formatDocs, formatPct, shortDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const CHART_COLORS = [
  "hsl(196, 85%, 52%)",
  "hsl(38, 90%, 58%)",
  "hsl(160, 60%, 48%)",
  "hsl(280, 65%, 62%)",
  "hsl(15, 80%, 58%)",
  "hsl(340, 70%, 60%)",
];

function PageHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      {children}
    </div>
  );
}

export default function OverviewPage() {
  const { data: cfg } = useQuery<any>({
    queryKey: ["/api/config"],
  });
  const isMock = cfg?.useMockData !== false;

  const { data: summary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/summary"],
    refetchInterval: 60000,
  });

  const { data: dailyIngest, isLoading: ingestLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/daily-ingest"],
    refetchInterval: 60000,
  });

  const { data: trend, isLoading: trendLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/trend"],
    refetchInterval: 60000,
  });

  // Build stacked bar chart data
  const barData = dailyIngest
    ? dailyIngest.dates.map((date: string, i: number) => {
        const entry: Record<string, any> = { date: shortDate(date) };
        for (const idx of dailyIngest.topIndices) {
          entry[idx] = Math.round((dailyIngest.series[idx]?.[i] ?? 0) / 1_073_741_824 * 100) / 100; // GB
        }
        return entry;
      })
    : [];

  // Build line chart data
  const lineData = trend
    ? trend.dates.map((date: string, i: number) => ({
        date: shortDate(date),
        total: +(trend.totals[i] / 1_073_741_824).toFixed(1),
        docs: trend.docTotals[i],
      }))
    : [];

  const truncateIndex = (name: string, max = 20) =>
    name.length > max ? name.slice(0, max) + "…" : name;

  return (
    <div className="p-6 space-y-6">
      <PageHeader>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Ingest volume · shard sizing · 7-day trends</p>
        </div>
        {isMock ? (
          <Badge variant="outline" className="text-xs gap-1.5 border-amber-500/40 text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
            Mock Data
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs gap-1.5 border-emerald-500/40 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
            Live
          </Badge>
        )}
      </PageHeader>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <KpiCard
          testId="kpi-total-size"
          label="Total Store Size"
          value={summaryLoading ? "—" : formatBytes(summary?.totalSizeBytes ?? 0)}
          delta={summary?.ingestDeltaPct ?? null}
          icon={<HardDrive size={14} />}
          accent
          loading={summaryLoading}
        />
        <KpiCard
          testId="kpi-total-docs"
          label="Total Documents"
          value={summaryLoading ? "—" : formatDocs(summary?.totalDocs ?? 0)}
          icon={<Database size={14} />}
          loading={summaryLoading}
        />
        <KpiCard
          testId="kpi-avg-shard"
          label="Avg Shard Size"
          value={summaryLoading ? "—" : formatGB(summary?.avgShardSizeBytes ?? 0)}
          icon={<Layers size={14} />}
          loading={summaryLoading}
        />
        <KpiCard
          testId="kpi-indices"
          label="Index Count"
          value={summaryLoading ? "—" : String(summary?.indexCount ?? 0)}
          icon={<BarChart2 size={14} />}
          loading={summaryLoading}
        />
        <KpiCard
          testId="kpi-alerts"
          label="Active Alerts"
          value={summaryLoading ? "—" : String(summary?.alertsActive ?? 0)}
          icon={<AlertCircle size={14} />}
          warn={(summary?.alertsActive ?? 0) > 0}
          loading={summaryLoading}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Daily Ingest Volume Bar Chart */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="mb-4">
            <p className="text-sm font-semibold text-foreground">Daily Ingest Volume</p>
            <p className="text-xs text-muted-foreground">Storage delta per index — last 7 days (GB)</p>
          </div>
          {ingestLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}G`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
                  formatter={(val: any, name: any) => [`${Number(val).toFixed(2)} GB`, truncateIndex(name)]}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
                />
                {dailyIngest?.topIndices?.map((idx: string, i: number) => (
                  <Bar key={idx} dataKey={idx} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} radius={i === (dailyIngest.topIndices.length - 1) ? [2, 2, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 7-day Total Store Size Trend */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="mb-4">
            <p className="text-sm font-semibold text-foreground">7-Day Ingest Trend</p>
            <p className="text-xs text-muted-foreground">Total cumulative store size across all indices (GB)</p>
          </div>
          {trendLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={lineData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}G`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px" }}
                  formatter={(val: any, name: any) => [name === "total" ? `${Number(val).toFixed(1)} GB` : formatDocs(Number(val)), name === "total" ? "Store Size" : "Documents"]}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  cursor={{ stroke: "hsl(var(--border))" }}
                />
                <Line type="monotone" dataKey="total" stroke="hsl(196, 85%, 52%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(196, 85%, 52%)" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ILM Guidance */}
      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-sm font-semibold text-foreground mb-3">ILM Rollover Guidance</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
          <div className="space-y-1">
            <p className="text-foreground font-medium">Avg Shard Size Target</p>
            <p>Recommended: <span className="mono text-primary">20–50 GB</span> per primary shard. Below 20 GB → too many shards. Above 50 GB → slow searches.</p>
          </div>
          <div className="space-y-1">
            <p className="text-foreground font-medium">Rollover Trigger Signals</p>
            <p>Consider rolling over indices when they exceed <span className="mono text-orange-400">40 GB</span> or show sustained daily growth above <span className="mono text-orange-400">20%</span>.</p>
          </div>
          <div className="space-y-1">
            <p className="text-foreground font-medium">Hardware Sizing</p>
            <p>Use 7-day trend × 30 to estimate monthly growth. Add 30% headroom for merge overhead and future surge capacity.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
