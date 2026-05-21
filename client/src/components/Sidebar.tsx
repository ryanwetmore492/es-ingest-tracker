import { useHashLocation } from "wouter/use-hash-location";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { BarChart2, Layers, Bell, Settings, RefreshCw, Timer, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { SiGithub } from "react-icons/si";

const NAV = [
  { href: "/", label: "Overview", Icon: BarChart2 },
  { href: "/indices", label: "Indices", Icon: Layers },
  { href: "/alerts", label: "Alerts", Icon: Bell },
  { href: "/settings", label: "Settings", Icon: Settings },
];

function formatCountdown(sec: number): string {
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  if (sec >= 60) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${sec}s`;
}

export default function Sidebar() {
  const [location] = useHashLocation();
  const { toast } = useToast();

  const { data: cfg } = useQuery<any>({ queryKey: ["/api/config"], refetchInterval: 10000 });
  const { data: events } = useQuery<any[]>({ queryKey: ["/api/alerts/events"], refetchInterval: 30000 });

  const isMock = !cfg || cfg.useMockData;
  const activeAlerts = (events ?? []).filter((e: any) => !e.acknowledged).length;

  const { enabled, countdown, lastRefreshed, refreshing, doRefresh } = useAutoRefresh(cfg);

  // Toggle auto-refresh on/off
  const toggleRefresh = useMutation({
    mutationFn: () => apiRequest("POST", "/api/config", {
      ...cfg,
      password: cfg?.password ?? "",
      apiKey: cfg?.apiKey ?? "",
      autoRefreshEnabled: !cfg?.autoRefreshEnabled,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/config"] }),
  });

  async function handleManualRefresh() {
    try {
      await doRefresh();
      toast({ title: "Data refreshed" });
    } catch (e: any) {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <aside className="w-56 flex-shrink-0 border-r border-border flex flex-col bg-card">
      {/* Logo */}
      <div className="h-14 flex items-center gap-3 px-4 border-b border-border">
        <svg aria-label="ES Ingest Tracker" width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="7" fill="hsl(196 85% 52% / 0.15)" />
          <rect x="5" y="16" width="4" height="7" rx="1" fill="hsl(196 85% 52%)" />
          <rect x="12" y="10" width="4" height="13" rx="1" fill="hsl(196 85% 52% / 0.8)" />
          <rect x="19" y="5" width="4" height="18" rx="1" fill="hsl(196 85% 52% / 0.6)" />
          <path d="M7 14 L14 8 L21 3" stroke="hsl(38 90% 58%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div>
          <p className="text-sm font-semibold leading-tight text-foreground">ES Ingest</p>
          <p className="text-xs text-muted-foreground leading-tight">Tracker</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5">
        {NAV.map(({ href, label, Icon }) => {
          const active = location === href || (href !== "/" && location.startsWith(href));
          return (
            <Link key={href} href={href}>
              <a
                data-testid={`nav-${label.toLowerCase()}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150",
                  active
                    ? "bg-secondary text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                )}
              >
                <Icon size={16} className={active ? "text-primary" : ""} />
                <span>{label}</span>
                {label === "Alerts" && activeAlerts > 0 && (
                  <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1 text-xs tabular-nums">
                    {activeAlerts}
                  </Badge>
                )}
              </a>
            </Link>
          );
        })}
      </nav>

      {/* Auto-refresh status (live mode only) */}
      {!isMock && (
        <div className="px-3 pb-2">
          <div className={cn(
            "rounded-md border px-3 py-2 space-y-1.5",
            enabled ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"
          )}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Timer size={11} className={enabled ? "text-primary" : "text-muted-foreground"} />
                Auto-refresh
              </span>
              <button
                data-testid="button-toggle-autorefresh"
                onClick={() => toggleRefresh.mutate()}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors",
                  enabled
                    ? "bg-primary/20 text-primary hover:bg-primary/30"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {enabled ? <Pause size={10} /> : <Play size={10} />}
                {enabled ? "On" : "Off"}
              </button>
            </div>
            {enabled && (
              <div className="text-xs text-muted-foreground mono">
                Next: <span className="text-foreground">{formatCountdown(countdown)}</span>
              </div>
            )}
            {lastRefreshed && (
              <div className="text-xs text-muted-foreground">
                Last: {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Refresh + Version */}
      <div className="p-3 border-t border-border space-y-2">
        <Button
          data-testid="button-refresh"
          variant="secondary"
          size="sm"
          className="w-full gap-2 text-xs"
          onClick={handleManualRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh Data"}
        </Button>
        <a
          href="https://github.com/ryanwetmore492/es-ingest-tracker"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="link-github"
          className="flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          title="View on GitHub"
        >
          <SiGithub size={11} />
          <span className="text-xs">v1.0.0</span>
        </a>
      </div>
    </aside>
  );
}
