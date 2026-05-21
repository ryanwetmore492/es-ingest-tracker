import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ServerCog, Eye, EyeOff, CheckCircle, XCircle, Loader2, Info, ShieldCheck, Key, User, Trash2, ShieldOff, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ConnStatus = "idle" | "testing" | "ok" | "error";

const REQUIRED_PRIVILEGES = [
  {
    privilege: "monitor",
    scope: "Cluster",
    api: "_cat/indices, _cluster/health",
    notes: "Grants read access to cluster stats and index metadata",
  },
  {
    privilege: "view_index_metadata",
    scope: "Index (all or pattern)",
    api: "_cat/indices",
    notes: "Required to read index-level settings, mappings, aliases",
  },
  {
    privilege: "read",
    scope: "Index (all or pattern)",
    api: "_cat/indices store.size, docs.count",
    notes: "Allows reading index stats used for ingest volume calculations",
  },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const [showPass, setShowPass] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [connMsg, setConnMsg] = useState("");
  const [form, setForm] = useState({
    host: "http://localhost:9200",
    authType: "basic" as "basic" | "apikey" | "none",
    username: "",
    password: "",
    apiKey: "",
    kibanaHost: "",
    useMockData: true,
    autoRefreshEnabled: false,
    autoRefreshInterval: 300,
  });

  const { data: cfg } = useQuery<any>({ queryKey: ["/api/config"] });

  useEffect(() => {
    if (cfg) {
      setForm({
        host: cfg.host ?? "http://localhost:9200",
        authType: cfg.authType ?? "basic",
        username: cfg.username ?? "",
        password: cfg.password ?? "",
        apiKey: cfg.apiKey ?? "",
        kibanaHost: cfg.kibanaHost ?? "",
        useMockData: cfg.useMockData ?? true,
        autoRefreshEnabled: cfg.autoRefreshEnabled ?? false,
        autoRefreshInterval: cfg.autoRefreshInterval ?? 300,
      });
    }
  }, [cfg]);

  const saveConfig = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/config", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/indices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/daily-ingest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/trend"] });
      toast({ title: "Settings saved", description: "Connection settings updated." });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const clearSnapshots = useMutation({
    mutationFn: () => apiRequest("POST", "/api/snapshots/clear"),
    onSuccess: async (res: any) => {
      const data = await res.json?.() ?? res;
      await queryClient.invalidateQueries();
      toast({ title: "Snapshot history cleared", description: data.message ?? "All historical data removed." });
    },
    onError: (e: any) => toast({ title: "Clear failed", description: e.message, variant: "destructive" }),
  });

  const clearCredentials = useMutation({
    mutationFn: () => apiRequest("POST", "/api/credentials/clear"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      // Reset local form auth fields
      setForm(p => ({ ...p, authType: "none", username: "", password: "", apiKey: "" }));
      toast({ title: "Credentials cleared", description: "All authentication credentials removed from the database." });
    },
    onError: (e: any) => toast({ title: "Clear failed", description: e.message, variant: "destructive" }),
  });

  async function testConnection() {
    setConnStatus("testing");
    setConnMsg("");
    try {
      const result = await apiRequest("POST", "/api/test-connection", {
        host: form.host,
        authType: form.authType,
        username: form.username,
        password: form.password === "••••••••" ? "" : form.password,
        apiKey: form.apiKey === "••••••••" ? "" : form.apiKey,
      }) as any;
      const data = await result.json?.() ?? result;
      if (data.success) {
        setConnStatus("ok");
        setConnMsg(`Connected — cluster "${data.clusterName}" · status: ${data.status}`);
      } else {
        setConnStatus("error");
        setConnMsg(data.error ?? "Connection failed");
      }
    } catch (e: any) {
      setConnStatus("error");
      setConnMsg(e.message);
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Elasticsearch connection and data source configuration</p>
      </div>

      {/* Mock Mode Toggle */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Demo / Mock Mode</p>
            <p className="text-xs text-muted-foreground mt-0.5">Use built-in simulated data instead of a live cluster</p>
          </div>
          <Switch
            data-testid="toggle-mock-mode"
            checked={form.useMockData}
            onCheckedChange={v => setForm(p => ({ ...p, useMockData: v }))}
          />
        </div>
        {form.useMockData && (
          <div className="flex items-start gap-2 bg-primary/10 border border-primary/20 rounded-md p-3 text-xs text-primary">
            <Info size={13} className="flex-shrink-0 mt-0.5" />
            <span>Mock data simulates 10 realistic indices over 7 days — including a <strong>logs-app-events</strong> index exceeding 40 GB and a <strong>metrics-infra</strong> index with &gt;20% daily growth to demonstrate alerts.</span>
          </div>
        )}
      </div>

      {/* ES Connection */}
      <div className={`bg-card border border-border rounded-lg p-4 space-y-4 ${form.useMockData ? "opacity-50 pointer-events-none" : ""}`}>
        <div className="flex items-center gap-2">
          <ServerCog size={15} className="text-primary" />
          <p className="text-sm font-semibold text-foreground">Elasticsearch Connection</p>
          {form.useMockData && <Badge variant="outline" className="text-xs ml-auto">Disabled in mock mode</Badge>}
        </div>

        {/* Host */}
        <div className="space-y-1.5">
          <Label className="text-xs">Elasticsearch Host</Label>
          <Input
            data-testid="input-es-host"
            placeholder="https://my-cluster.es.io:9200"
            value={form.host}
            onChange={e => setForm(p => ({ ...p, host: e.target.value }))}
            className="h-8 text-sm mono"
          />
        </div>

        {/* Auth type tabs */}
        <div className="space-y-1.5">
          <Label className="text-xs">Authentication</Label>
          <Tabs value={form.authType} onValueChange={v => setForm(p => ({ ...p, authType: v as any }))}>
            <TabsList className="h-8 text-xs">
              <TabsTrigger value="basic" className="gap-1.5 text-xs h-7" data-testid="tab-auth-basic">
                <User size={12} />
                Username / Password
              </TabsTrigger>
              <TabsTrigger value="apikey" className="gap-1.5 text-xs h-7" data-testid="tab-auth-apikey">
                <Key size={12} />
                API Key
              </TabsTrigger>
              <TabsTrigger value="none" className="text-xs h-7" data-testid="tab-auth-none">
                None
              </TabsTrigger>
            </TabsList>

            {/* Basic auth */}
            <TabsContent value="basic" className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Username</Label>
                  <Input
                    data-testid="input-es-user"
                    placeholder="elastic"
                    value={form.username}
                    onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Password</Label>
                  <div className="relative">
                    <Input
                      data-testid="input-es-pass"
                      type={showPass ? "text" : "password"}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      className="h-8 text-sm pr-8"
                    />
                    <button type="button" onClick={() => setShowPass(p => !p)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* API Key auth */}
            <TabsContent value="apikey" className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">API Key</Label>
                <div className="relative">
                  <Input
                    data-testid="input-es-apikey"
                    type={showApiKey ? "text" : "password"}
                    placeholder="Paste your API key (id:key or encoded)"
                    value={form.apiKey}
                    onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))}
                    className="h-8 text-sm mono pr-8"
                  />
                  <button type="button" onClick={() => setShowApiKey(p => !p)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <div className="bg-muted/50 border border-border rounded-md p-3 space-y-1.5 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground flex items-center gap-1.5"><Key size={11} /> API Key Formats</p>
                  <p>Paste the key in either of these formats:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><span className="mono text-foreground">id:api_key</span> — the raw colon-separated form from Kibana Dev Tools or the Create API Key API</li>
                    <li><span className="mono text-foreground">base64(id:api_key)</span> — the pre-encoded form (the dashboard auto-detects which you provided)</li>
                  </ul>
                  <p className="pt-1">To create one in Kibana: <span className="mono text-foreground">Stack Management → API Keys → Create API Key</span>. To create via API:</p>
                  <pre className="bg-muted rounded p-2 text-xs overflow-x-auto">{`POST /_security/api_key
{
  "name": "es-ingest-tracker",
  "role_descriptors": {
    "ingest_monitor": {
      "cluster": ["monitor"],
      "indices": [{
        "names": ["*"],
        "privileges": ["monitor", "view_index_metadata"]
      }]
    }
  }
}`}</pre>
                </div>
              </div>
            </TabsContent>

            {/* No auth */}
            <TabsContent value="none" className="mt-3">
              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-md p-3 text-xs text-amber-400">
                <Info size={13} className="flex-shrink-0 mt-0.5" />
                <span>Only use this for local development clusters with security disabled. Never use on a production cluster.</span>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Kibana Host */}
        <div className="space-y-1.5">
          <Label className="text-xs">Kibana Host (optional)</Label>
          <Input
            data-testid="input-kibana-host"
            placeholder="https://my-cluster.kb.io:5601"
            value={form.kibanaHost}
            onChange={e => setForm(p => ({ ...p, kibanaHost: e.target.value }))}
            className="h-8 text-sm mono"
          />
          <p className="text-xs text-muted-foreground">Used for Stack Monitoring deep-link integration</p>
        </div>

        {/* Test Connection */}
        <div className="space-y-2">
          <Button
            data-testid="button-test-conn"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={testConnection}
            disabled={connStatus === "testing" || !form.host}
          >
            {connStatus === "testing" ? <Loader2 size={12} className="animate-spin" /> : null}
            Test Connection
          </Button>
          {connStatus === "ok" && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle size={12} /><span>{connMsg}</span>
            </div>
          )}
          {connStatus === "error" && (
            <div className="flex items-center gap-1.5 text-xs text-red-400">
              <XCircle size={12} /><span>{connMsg}</span>
            </div>
          )}
        </div>
      </div>

      {/* Auto-Refresh Settings — live mode only */}
      {!form.useMockData && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Timer size={15} className="text-primary" />
            <p className="text-sm font-semibold text-foreground">Auto-Refresh</p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-foreground">Enable Auto-Refresh</p>
              <p className="text-xs text-muted-foreground mt-0.5">Automatically poll Elasticsearch on a configurable interval</p>
            </div>
            <Switch
              data-testid="toggle-autorefresh"
              checked={form.autoRefreshEnabled}
              onCheckedChange={v => setForm(p => ({ ...p, autoRefreshEnabled: v }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Refresh Interval</Label>
            <Select
              value={String(form.autoRefreshInterval)}
              onValueChange={v => setForm(p => ({ ...p, autoRefreshInterval: Number(v) }))}
            >
              <SelectTrigger data-testid="select-refresh-interval" className="h-8 text-xs w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">1 minute</SelectItem>
                <SelectItem value="300">5 minutes</SelectItem>
                <SelectItem value="900">15 minutes</SelectItem>
                <SelectItem value="1800">30 minutes</SelectItem>
                <SelectItem value="3600">1 hour</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Applies immediately after saving. The sidebar shows a live countdown.</p>
          </div>
        </div>
      )}

      {/* Required Permissions */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-primary" />
          <p className="text-sm font-semibold text-foreground">Required Permissions</p>
        </div>
        <p className="text-xs text-muted-foreground">
          The user account or API key needs the following minimum privileges. No write access is required — this tool is entirely read-only.
        </p>
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Privilege</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Scope</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden md:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody>
              {REQUIRED_PRIVILEGES.map((p, i) => (
                <tr key={p.privilege} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  <td className="px-3 py-2.5 mono font-medium text-primary">{p.privilege}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.scope}</td>
                  <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{p.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Minimal role definition (Kibana Dev Tools)</p>
          <pre className="bg-muted rounded-md p-3 overflow-x-auto text-xs mono">{`POST /_security/role/es_ingest_tracker
{
  "cluster": ["monitor"],
  "indices": [
    {
      "names": ["*"],
      "privileges": ["monitor", "view_index_metadata"]
    }
  ]
}`}</pre>
          <p>Then create a user assigned to this role, or generate an API key with the <span className="mono text-foreground">ingest_monitor</span> role descriptor shown in the API Key tab above.</p>
          <p className="flex items-start gap-1.5 mt-1">
            <Info size={11} className="flex-shrink-0 mt-0.5" />
            On Elastic Cloud or ECE, the built-in <span className="mono text-foreground">monitoring_user</span> role also satisfies these requirements if you prefer not to create a custom role.
          </p>
        </div>
      </div>

      <Separator />

      {/* How it works */}
      <div className="space-y-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">How it works</p>
        <ul className="list-disc pl-4 space-y-1.5">
          <li>Polls <span className="mono text-foreground">_cat/indices</span> to retrieve per-index store size, doc count, primary/replica shard counts, and health.</li>
          <li>Daily snapshots are stored locally and diffed to compute ingest deltas and growth percentages.</li>
          <li>Alert rules are evaluated on each refresh against the most recent snapshot.</li>
          <li>Credentials are stored server-side only and never appear in full in API responses.</li>
        </ul>
      </div>

      {/* Danger zone */}
      <div className="bg-card border border-destructive/30 rounded-lg p-4 space-y-3">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Trash2 size={14} className="text-destructive" />
          Danger Zone
        </p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-foreground">Clear Snapshot History</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Removes all stored index snapshots. Charts and growth % will be empty until the next refresh.
              {form.useMockData ? " Mock data will be re-seeded immediately." : " Switch to mock mode to re-seed demo data."}
            </p>
          </div>
          <Button
            data-testid="button-clear-snapshots"
            variant="destructive"
            size="sm"
            className="flex-shrink-0 gap-1.5 text-xs h-8"
            onClick={() => clearSnapshots.mutate()}
            disabled={clearSnapshots.isPending}
          >
            {clearSnapshots.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            {clearSnapshots.isPending ? "Clearing…" : "Clear History"}
          </Button>
        </div>

        <div className="border-t border-destructive/20 pt-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-foreground">Clear Stored Credentials</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Wipes username, password, and API key from the database immediately. Auth type is set to None. Use before decommissioning or sharing this instance.
            </p>
          </div>
          <Button
            data-testid="button-clear-credentials"
            variant="destructive"
            size="sm"
            className="flex-shrink-0 gap-1.5 text-xs h-8"
            onClick={() => clearCredentials.mutate()}
            disabled={clearCredentials.isPending}
          >
            {clearCredentials.isPending ? <Loader2 size={12} className="animate-spin" /> : <ShieldOff size={12} />}
            {clearCredentials.isPending ? "Clearing…" : "Clear Credentials"}
          </Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          data-testid="button-save-settings"
          size="sm"
          onClick={() => saveConfig.mutate(form)}
          disabled={saveConfig.isPending}
          className="gap-1.5"
        >
          {saveConfig.isPending ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
