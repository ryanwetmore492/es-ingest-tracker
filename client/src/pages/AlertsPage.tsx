import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, BellOff, Plus, Trash2, Check, AlertTriangle, HardDrive, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AlertRule, AlertEvent } from "@shared/schema";

function RelativeTime({ dateStr }: { dateStr: string }) {
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return <span>{diff}s ago</span>;
  if (diff < 3600) return <span>{Math.floor(diff / 60)}m ago</span>;
  if (diff < 86400) return <span>{Math.floor(diff / 3600)}h ago</span>;
  return <span>{d.toLocaleDateString()}</span>;
}

export default function AlertsPage() {
  const { toast } = useToast();
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRule, setNewRule] = useState({ name: "", type: "size_gb", threshold: "40", indexPattern: "*" });

  const { data: rules = [], isLoading: rulesLoading } = useQuery<AlertRule[]>({
    queryKey: ["/api/alerts/rules"],
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<AlertEvent[]>({
    queryKey: ["/api/alerts/events"],
    refetchInterval: 30000,
  });

  const activeEvents = events.filter(e => !e.acknowledged);
  const ackedEvents = events.filter(e => e.acknowledged);

  const createRule = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/alerts/rules", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/rules"] });
      setShowNewRule(false);
      setNewRule({ name: "", type: "size_gb", threshold: "40", indexPattern: "*" });
      toast({ title: "Rule created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleRule = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiRequest("PATCH", `/api/alerts/rules/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/alerts/rules"] }),
  });

  const deleteRule = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/alerts/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/rules"] });
      toast({ title: "Rule deleted" });
    },
  });

  const ackEvent = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/alerts/events/${id}/ack`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/alerts/events"] }),
  });

  const clearAcked = useMutation({
    mutationFn: () => apiRequest("POST", "/api/alerts/events/clear"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/events"] });
      toast({ title: "Cleared acknowledged events" });
    },
  });

  function handleCreateRule() {
    if (!newRule.name || !newRule.threshold) return;
    createRule.mutate({
      name: newRule.name,
      type: newRule.type,
      threshold: parseFloat(newRule.threshold),
      indexPattern: newRule.indexPattern || "*",
      enabled: true,
    });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Alerts</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Rules, fired events, and acknowledgements</p>
        </div>
        <div className="flex items-center gap-2">
          {activeEvents.length > 0 && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-white inline-block pulse-alert"></span>
              {activeEvents.length} active
            </Badge>
          )}
          <Button data-testid="button-new-rule" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setShowNewRule(true)}>
            <Plus size={13} />
            New Rule
          </Button>
        </div>
      </div>

      {/* Alert Rules */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Alert Rules</p>
        <div className="space-y-2">
          {rules.map(rule => (
            <div
              key={rule.id}
              data-testid={`rule-${rule.id}`}
              className={cn(
                "bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-4",
                !rule.enabled && "opacity-50"
              )}
            >
              <div className="flex-shrink-0">
                {rule.type === "size_gb" ? (
                  <HardDrive size={15} className="text-orange-400" />
                ) : (
                  <TrendingUp size={15} className="text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{rule.name}</p>
                <p className="text-xs text-muted-foreground mono mt-0.5">
                  {rule.type === "size_gb" ? `Store > ${rule.threshold} GB` : `Daily growth > ${rule.threshold}%`}
                  {" · "}Pattern: <span className="text-foreground">{rule.indexPattern}</span>
                </p>
              </div>
              <Switch
                data-testid={`toggle-rule-${rule.id}`}
                checked={rule.enabled}
                onCheckedChange={enabled => toggleRule.mutate({ id: rule.id, enabled })}
              />
              <Button
                data-testid={`delete-rule-${rule.id}`}
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                onClick={() => deleteRule.mutate(rule.id)}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
          {!rulesLoading && rules.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No rules — create one above</p>
          )}
        </div>
      </div>

      {/* Active Events */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell size={14} className={activeEvents.length > 0 ? "text-red-400" : "text-muted-foreground"} />
            Active Alerts
          </p>
        </div>
        {activeEvents.length === 0 ? (
          <div className="bg-card border border-border rounded-lg px-4 py-6 text-center">
            <Check size={18} className="text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">All clear — no active alerts</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeEvents.map(evt => (
              <div
                key={evt.id}
                data-testid={`alert-event-${evt.id}`}
                className="bg-card border border-red-500/30 rounded-lg px-4 py-3 flex items-center gap-4"
              >
                <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{evt.ruleName}</p>
                  <p className="text-xs text-muted-foreground mono mt-0.5">
                    <span className="text-foreground">{evt.indexName}</span>
                    {" — "}
                    {evt.type === "size_gb"
                      ? `${evt.currentValue.toFixed(1)} GB (threshold: ${evt.threshold} GB)`
                      : `${evt.currentValue.toFixed(1)}% growth (threshold: ${evt.threshold}%)`}
                    {" · "}
                    <RelativeTime dateStr={evt.firedAt} />
                  </p>
                </div>
                <Button
                  data-testid={`ack-event-${evt.id}`}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => ackEvent.mutate(evt.id)}
                >
                  <Check size={11} />
                  Ack
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Acknowledged Events */}
      {ackedEvents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <BellOff size={14} />
              Acknowledged ({ackedEvents.length})
            </p>
            <Button
              data-testid="button-clear-acked"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={() => clearAcked.mutate()}
            >
              <X size={11} />
              Clear all
            </Button>
          </div>
          <div className="space-y-1.5 opacity-60">
            {ackedEvents.slice(0, 5).map(evt => (
              <div key={evt.id} className="bg-card border border-border rounded-lg px-4 py-2.5 flex items-center gap-3">
                <Check size={12} className="text-emerald-400 flex-shrink-0" />
                <p className="text-xs text-muted-foreground mono flex-1 truncate">
                  {evt.indexName} — {evt.ruleName}
                </p>
                <RelativeTime dateStr={evt.firedAt} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Rule Dialog */}
      <Dialog open={showNewRule} onOpenChange={setShowNewRule}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">New Alert Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Rule Name</Label>
              <Input
                data-testid="input-rule-name"
                placeholder="e.g. Logs index over 40 GB"
                value={newRule.name}
                onChange={e => setNewRule(p => ({ ...p, name: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Trigger Type</Label>
              <Select value={newRule.type} onValueChange={v => setNewRule(p => ({ ...p, type: v }))}>
                <SelectTrigger data-testid="select-rule-type" className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="size_gb">Index size exceeds GB threshold</SelectItem>
                  <SelectItem value="growth_pct">Daily ingest growth exceeds %</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {newRule.type === "size_gb" ? "Threshold (GB)" : "Threshold (%)"}
              </Label>
              <Input
                data-testid="input-rule-threshold"
                type="number"
                min="0"
                step={newRule.type === "size_gb" ? "1" : "0.5"}
                value={newRule.threshold}
                onChange={e => setNewRule(p => ({ ...p, threshold: e.target.value }))}
                className="h-8 text-sm mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Index Pattern</Label>
              <Input
                data-testid="input-rule-pattern"
                placeholder="* or logs-* or specific-index"
                value={newRule.indexPattern}
                onChange={e => setNewRule(p => ({ ...p, indexPattern: e.target.value }))}
                className="h-8 text-sm mono"
              />
              <p className="text-xs text-muted-foreground">Use * as wildcard, e.g. logs-* matches all log indices</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowNewRule(false)}>Cancel</Button>
            <Button
              data-testid="button-create-rule"
              size="sm"
              onClick={handleCreateRule}
              disabled={createRule.isPending || !newRule.name}
            >
              {createRule.isPending ? "Creating…" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
