import { useLocation, Link } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, Layers, Bell, Settings, RefreshCw, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const NAV = [
  { href: "/", label: "Overview", Icon: BarChart2 },
  { href: "/indices", label: "Indices", Icon: Layers },
  { href: "/alerts", label: "Alerts", Icon: Bell },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export default function Sidebar() {
  const [location] = useHashLocation();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const { data: events } = useQuery<any[]>({
    queryKey: ["/api/alerts/events"],
    refetchInterval: 30000,
  });
  const activeAlerts = (events ?? []).filter((e: any) => !e.acknowledged).length;

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await apiRequest("POST", "/api/refresh");
      await queryClient.invalidateQueries();
      toast({ title: "Data refreshed", description: "Dashboard updated with latest stats." });
    } catch (e: any) {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    } finally {
      setRefreshing(false);
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

      {/* Refresh */}
      <div className="p-3 border-t border-border">
        <Button
          data-testid="button-refresh"
          variant="secondary"
          size="sm"
          className="w-full gap-2 text-xs"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh Data"}
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-2 leading-tight">
          Elasticsearch<br />Ingest Dashboard
        </p>
      </div>
    </aside>
  );
}
