# ES Ingest Tracker

A self-hostable Elasticsearch ingest-tracking dashboard that queries the `_cat/indices` API to display daily ingest volume per index/data stream, 7-day trends, average shard size, and ILM rollover guidance. Includes configurable alerts that fire when an index exceeds a size threshold or shows excessive daily growth.

Live demo: [es-ingest.pplx.app](https://es-ingest.pplx.app)

---

## Features

- **Daily Ingest Volume** — stacked bar chart showing per-index storage delta over the last 7 days
- **7-Day Trend** — cumulative store size line chart across all indices
- **Index Table** — sortable/filterable list with health status, store size, doc count, daily growth %, average shard size, and shard counts. Indices exceeding 40 GB are highlighted.
- **Alert Rules** — configurable rules that fire when an index exceeds a GB size threshold or daily growth exceeds a specified %. Includes acknowledgement workflow.
- **ILM Guidance** — inline recommendations for shard size targets, rollover triggers, and hardware sizing estimates
- **Mock Mode** — built-in simulated data for exploring the UI without a live cluster
- **Multiple Auth Methods** — Basic auth (username/password) or API Key (raw `id:key` or pre-encoded)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui, Recharts |
| Backend | Express.js (Node.js) |
| Database | SQLite via Drizzle ORM (`better-sqlite3`) |
| Language | TypeScript (full-stack) |

---

## Quick Start

### Requirements

- Node.js 18+ LTS
- npm 9+

### Run locally

```bash
git clone https://github.com/your-username/es-ingest-tracker.git
cd es-ingest-tracker
npm install
npm run dev
```

Open [http://localhost:5000](http://localhost:5000). Mock data is enabled by default — no Elasticsearch cluster required to explore the UI.

### Production build

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

> **Note for self-hosting:** Before building, update `client/src/lib/queryClient.ts` and change the `API_BASE` sentinel to an empty string so API calls resolve relative to your own domain:
> ```ts
> const API_BASE = "";
> ```

---

## Connecting to Elasticsearch

Go to **Settings** in the sidebar and disable Mock Mode. Enter your cluster details:

- **Host** — e.g. `https://my-cluster.es.io:9200`
- **Auth** — Username/Password or API Key
- **Kibana Host** (optional) — for Stack Monitoring deep links

### Minimum Required Permissions

The user account or API key needs these privileges only — no write access required:

| Privilege | Scope |
|---|---|
| `monitor` | Cluster |
| `monitor` | Index (`*`) |
| `view_index_metadata` | Index (`*`) |

**Create a minimal role via Dev Tools:**

```json
POST /_security/role/es_ingest_tracker
{
  "cluster": ["monitor"],
  "indices": [
    {
      "names": ["*"],
      "privileges": ["monitor", "view_index_metadata"]
    }
  ]
}
```

**Or create a scoped API key:**

```json
POST /_security/api_key
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
}
```

> **Elastic Cloud / ECE note:** The built-in `monitoring_user` role does **not** satisfy these requirements — it lacks the `monitor` cluster privilege needed for `_cluster/health` and `_cat/indices`. Create the custom role above or use a scoped API key instead.

---

## Self-Hosting with Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 5000
ENV NODE_ENV=production
CMD ["node", "dist/index.cjs"]
```

```bash
docker build -t es-ingest-tracker .
docker run -d \
  --name es-ingest \
  -p 5000:5000 \
  -v /opt/es-ingest-data:/app/data.db \
  es-ingest-tracker
```

Mount `-v` to persist `data.db` (config, alert rules, snapshots) across container rebuilds.

---

## Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name es-ingest.yourdomain.com;

    root /opt/es-ingest-tracker/dist/public;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Project Structure

```
├── client/               # React frontend (Vite)
│   └── src/
│       ├── pages/        # OverviewPage, IndicesPage, AlertsPage, SettingsPage
│       ├── components/   # Sidebar, KpiCard, shadcn/ui components
│       └── lib/          # queryClient, formatters
├── server/               # Express backend
│   ├── index.ts          # App entry, Helmet security headers
│   ├── routes.ts         # All API endpoints + ES proxy
│   ├── storage.ts        # Drizzle ORM + SQLite storage layer
│   └── mockData.ts       # Deterministic mock data generator
├── shared/
│   └── schema.ts         # Drizzle schema + Zod types (shared frontend/backend)
└── data.db               # SQLite database (gitignored)
```

---

## How Ingest Is Calculated

The dashboard measures **store size delta** — the difference in `store.size` bytes between consecutive daily snapshots from `_cat/indices`. This reflects on-disk storage after Lucene compression and merging, not raw wire-level ingest. It is a reliable proxy for ILM rollover planning since ES rollover policies themselves use `max_size` (physical store size).

Factors that cause divergence from true raw ingest: segment merges, replica shard inflation, ILM rollovers, and delete/update tombstones before merge.

---

## License

MIT
