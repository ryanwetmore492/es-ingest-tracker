import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: number | null; // percentage change
  deltaLabel?: string;
  accent?: boolean;
  warn?: boolean;
  loading?: boolean;
  testId?: string;
  icon?: React.ReactNode;
}

export default function KpiCard({ label, value, delta, deltaLabel, accent, warn, loading, testId, icon }: KpiCardProps) {
  const deltaColor =
    delta === null || delta === undefined
      ? "text-muted-foreground"
      : delta > 0
      ? "text-emerald-400"
      : delta < 0
      ? "text-red-400"
      : "text-muted-foreground";

  const DeltaIcon = delta && delta > 0 ? TrendingUp : delta && delta < 0 ? TrendingDown : Minus;

  return (
    <div
      data-testid={testId ?? "kpi-card"}
      className={cn(
        "rounded-lg border border-border bg-card p-4 flex flex-col gap-2",
        accent && "border-primary/30 bg-primary/5",
        warn && "border-orange-500/40 bg-orange-500/5"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>

      {loading ? (
        <div className="h-8 w-28 rounded bg-muted animate-pulse" />
      ) : (
        <span
          data-testid={`${testId ?? "kpi"}-value`}
          className={cn(
            "text-xl font-semibold mono count-appear",
            accent && "text-primary",
            warn && "text-orange-400"
          )}
        >
          {value}
        </span>
      )}

      {delta !== undefined && delta !== null && (
        <div className={cn("flex items-center gap-1 text-xs", deltaColor)}>
          <DeltaIcon size={12} />
          <span className="mono">{Math.abs(delta).toFixed(1)}% {deltaLabel ?? "vs yesterday"}</span>
        </div>
      )}
    </div>
  );
}
