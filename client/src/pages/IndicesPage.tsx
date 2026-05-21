import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowUpDown, AlertTriangle, CheckCircle, Circle, XCircle } from "lucide-react";
import { formatBytes, formatGB, formatDocs, formatPct, shortDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SortKey = "indexName" | "sizeGb" | "docsCount" | "growthPct" | "avgShardBytes" | "health";
type SortDir = "asc" | "desc";

function HealthDot({ health }: { health: string }) {
  if (health === "green") return <CheckCircle size={13} className="health-green flex-shrink-0" />;
  if (health === "yellow") return <AlertTriangle size={13} className="health-yellow flex-shrink-0" />;
  if (health === "red") return <XCircle size={13} className="health-red flex-shrink-0" />;
  return <Circle size={13} className="health-unknown flex-shrink-0" />;
}

export default function IndicesPage() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sizeGb");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showSystemIndices, setShowSystemIndices] = useState(false);

  const { data: indices, isLoading } = useQuery<any[]>({
    queryKey: ["/api/dashboard/indices"],
    refetchInterval: 60000,
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = (indices ?? [])
    .filter((idx: any) => {
      if (!showSystemIndices && idx.indexName.startsWith(".")) return false;
      if (search && !idx.indexName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const mul = sortDir === "asc" ? 1 : -1;
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string") return mul * av.localeCompare(bv);
      return mul * ((av as number) - (bv as number));
    });

  function SortHeader({ label, col }: { label: string; col: SortKey }) {
    const active = sortKey === col;
    return (
      <th
        onClick={() => toggleSort(col)}
        className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap"
      >
        <span className={cn("flex items-center gap-1", active && "text-foreground")}>
          {label}
          <ArrowUpDown size={10} className={active ? "text-primary" : "opacity-40"} />
        </span>
      </th>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Indices</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Per-index store size, doc count, shard metrics</p>
        </div>
        <Badge variant="outline" className="mono text-xs">
          {filtered.length} {filtered.length === 1 ? "index" : "indices"}
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <Input
          data-testid="input-search-index"
          placeholder="Filter indices…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-64 h-8 text-sm"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showSystemIndices}
            onChange={e => setShowSystemIndices(e.target.checked)}
            className="accent-primary"
            data-testid="checkbox-system-indices"
          />
          Show system indices (.)
        </label>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card sticky-thead">
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-8">Health</th>
                <SortHeader label="Index Name" col="indexName" />
                <SortHeader label="Store Size" col="sizeGb" />
                <SortHeader label="Documents" col="docsCount" />
                <SortHeader label="Daily Growth" col="growthPct" />
                <SortHeader label="Avg Shard" col="avgShardBytes" />
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Shards</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={8} className="px-3 py-2.5">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                : filtered.map((idx: any) => {
                    const isOver40 = idx.over40gb;
                    const growthWarn = idx.growthPct !== null && idx.growthPct > 20;
                    const shardWarn = idx.avgShardBytes > 50 * 1_073_741_824;
                    return (
                      <tr
                        key={idx.indexName}
                        data-testid={`row-index-${idx.indexName}`}
                        className={cn(
                          "border-b border-border/50 hover:bg-muted/40 transition-colors",
                          isOver40 && "row-over-limit"
                        )}
                      >
                        <td className="px-3 py-2.5">
                          <HealthDot health={idx.health} />
                        </td>
                        <td className="px-3 py-2.5 mono text-xs text-foreground font-medium max-w-[200px] truncate" title={idx.indexName}>
                          {idx.indexName}
                          {isOver40 && (
                            <Badge variant="outline" className="ml-2 text-orange-400 border-orange-400/40 text-xs py-0 h-4">
                              &gt;40 GB
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5 mono text-xs">
                          <span className={isOver40 ? "text-orange-400 font-semibold" : "text-foreground"}>
                            {formatGB(idx.storeSizeBytes ?? 0)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 mono text-xs text-muted-foreground">
                          {formatDocs(idx.docsCount ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 mono text-xs">
                          {idx.growthPct !== null ? (
                            <span className={growthWarn ? "text-orange-400 font-semibold" : idx.growthPct > 0 ? "text-emerald-400" : "text-muted-foreground"}>
                              {formatPct(idx.growthPct)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 mono text-xs">
                          <span className={shardWarn ? "text-orange-400" : "text-muted-foreground"}>
                            {formatGB(idx.avgShardBytes ?? 0)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground mono">
                          {idx.primaryShards}p / {idx.replicaShards}r
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              idx.status === "open" ? "border-emerald-500/30 text-emerald-400" : "text-muted-foreground"
                            )}
                          >
                            {idx.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground text-xs">
                    No indices match your filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><CheckCircle size={11} className="health-green" /> Healthy</span>
        <span className="flex items-center gap-1.5"><AlertTriangle size={11} className="health-yellow" /> Degraded</span>
        <span className="flex items-center gap-1.5"><XCircle size={11} className="health-red" /> Critical</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm border border-orange-400/60 bg-orange-400/10 inline-block"></span> Over 40 GB — review rollover policy</span>
      </div>
    </div>
  );
}
