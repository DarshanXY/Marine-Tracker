# Marine Plastic Tracker — Complete Reverse‑Engineering & Teaching Guide

> **Purpose of this document.** You inherited this codebase and want to understand it so
> deeply that you can explain it, modify it, debug it, extend it, and defend it in an
> interview. This guide reverse‑engineers the project from first principles — beginner‑friendly
> in language, staff‑engineer in depth. Nothing is assumed. Every important file is explained,
> with *why* it exists (not just *what* it does) and what breaks if you remove it.
>
> **How to read it.** The guide follows 17 "phases", from a bird's‑eye overview down to
> line‑level analysis of the critical files, then up again to architecture, security,
> performance, and a final production‑readiness verdict. Read Phase 1 first; after that you can
> jump around using the Table of Contents. Wherever you see a **🧠 Checkpoint**, pause and make
> sure you can answer it — if you can't, re‑read the section above it. Ask me to "go deeper on
> file X" and I'll expand any single file to true line‑by‑line detail.

---

## Table of Contents

1. [Phase 1 — Project Overview](#phase-1--project-overview)
2. [Phase 2 — Folder‑by‑Folder](#phase-2--folder-by-folder)
3. [Phase 3 — File‑by‑File Analysis](#phase-3--file-by-file-analysis)
4. [Phase 4 — Workflow Analysis](#phase-4--workflow-analysis)
5. [Phase 5 — Architecture Patterns](#phase-5--architecture-patterns)
6. [Phase 6 — Wiring (Boot Order)](#phase-6--wiring-boot-order)
7. [Phase 7 — Request Journey (one request, end‑to‑end)](#phase-7--request-journey)
8. [Phase 8 — Database](#phase-8--database)
9. [Phase 9 — Frontend](#phase-9--frontend)
10. [Phase 10 — Backend](#phase-10--backend)
11. [Phase 11 — Data Flow (one datum across the system)](#phase-11--data-flow)
12. [Phase 12 — Debugging](#phase-12--debugging)
13. [Phase 13 — Interview Preparation](#phase-13--interview-preparation)
14. [Phase 14 — Refactoring](#phase-14--refactoring)
15. [Phase 15 — Learning Checkpoints](#phase-15--learning-checkpoints)
16. [Phase 16 — Diagrams & Maps](#phase-16--diagrams--maps)
17. [Phase 17 — Weakness Analysis, Scores & Verdict](#phase-17--weakness-analysis-scores--verdict)

---

# Phase 1 — Project Overview

## 1.1 What problem does this project solve?

The ocean is filling with floating plastic. Agencies like **INCOIS** (Indian National Centre for
Ocean Information Services), **NCCR**, and the **Indian Coast Guard** need to know *where* debris
is, *how confident* we are that it's plastic (and not algae, sea‑foam, or plain water), and
*where it will drift* over the next few days so a boat can be sent to the right place.

Satellites already photograph the entire ocean for free (the EU's **Sentinel‑2** program). The
problem is that raw satellite pixels are not answers — turning "a 10‑metre pixel reflects this
much light at five wavelengths" into "there is probably a plastic patch here, drifting toward
Mumbai, arriving in ~40 hours" requires a whole processing chain.

**This project is that chain, wrapped in a web application.** In one sentence:

> It ingests free Sentinel‑2 satellite imagery, detects candidate floating‑plastic pixels with a
> published spectral index, classifies them with a machine‑learning model, groups them into
> "hotspots", forecasts their 72‑hour drift, and presents all of it through a dashboard with
> logins, roles, alerts, and field‑operation tracking — running at **₹0** on free tiers.

**Analogy.** Think of it as a *weather service for ocean plastic*. A weather service takes raw
sensor readings (pressure, temperature, wind), runs physics models, and produces a human‑useful
forecast ("rain tomorrow, 70% chance"). This project takes raw *light* readings from space, runs
*spectral + ML + drift* models, and produces "plastic here, 74% confidence, landfall in 40h".

**A crucial honesty principle baked into the code:** this is a **decision‑support pilot**, not an
operational sensor. Optical satellites revisit a spot only every ~5 days, at 10 m resolution, and
can't see through cloud or at night. Every number in the UI is traceable to a source pixel and a
model score, and every synthetic/demo fallback is *labelled as such*. This "never fake data
silently" discipline is one of the project's strongest engineering traits (see Phase 17).

## 1.2 What type of project is it?

A **full‑stack, multi‑service geospatial web application** with a machine‑learning /
remote‑sensing core. It is a **monorepo** containing three cooperating services plus data,
models, and infrastructure:

| Service | Language / Runtime | Port | Job |
|---|---|---|---|
| **Frontend** | React 18 + Vite 5 + TypeScript | 5173 | The UI: maps, dashboards, forms |
| **Backend API** | Node.js 20 + Express 4 + TypeScript | 3001 | REST API, auth, RBAC, DB, queue, persistence |
| **Python engine** | FastAPI + uvicorn (Python) | 8000 | The science: satellite ingest → FDI → ML → DBSCAN → drift |
| **PostgreSQL 15** (+ PostGIS planned) | — | 5432 | The database of record |
| **Redis 7** | — | 6379 | BullMQ job queue (decouples backend ↔ engine) |

## 1.3 Which technologies are used, and *why* each was chosen?

**Backend (Node/Express/TypeScript):**
- **Express 4** — the most widely‑taught, minimal HTTP framework; easy to reason about middleware.
- **Prisma 5** — type‑safe ORM: you get autocompletion and compile‑time checks on every query.
- **jsonwebtoken / bcrypt / otplib / qrcode** — real authentication (JWT), password hashing,
  time‑based 2FA (TOTP), and QR generation for authenticator apps.
- **helmet / express‑rate‑limit / cors** — standard HTTP hardening.
- **zod** — runtime validation of request bodies (types alone don't validate incoming JSON).
- **BullMQ + ioredis** — a Redis‑backed job queue so a slow satellite scan doesn't block the API.
- **pdfkit** — server‑side PDF report generation. **ws** — WebSocket live events. **winston** — logging.
- **Zero‑dependency `.env` loader** (no `dotenv`) — a deliberate "one less install" choice for the ₹0 goal.

**Python engine (FastAPI):**
- **FastAPI + pydantic 2** — typed request/response models with automatic OpenAPI docs, and
  camelCase serialization that matches the frontend's TypeScript types.
- **Algorithms are pure Python (stdlib)** where possible — FDI, DBSCAN, and drift are written from
  scratch so the engine runs with *no heavy dependencies* (₹0). `numpy`, `tifffile`, and
  `onnxruntime` are **optional add‑ons** that unlock real pixel ingest and ML inference.
- **ONNX Runtime** — runs the trained model without needing PyTorch at runtime (train on GPU,
  export to ONNX, infer anywhere).

**Frontend (React/Vite):**
- **React 18 + Vite 5** — fast dev server, code‑splitting, huge ecosystem.
- **React Router 6** — client‑side routing (SPA). **@tanstack/react‑query** — server‑state cache
  with automatic refetch/invalidate. **zustand** — tiny global store for auth. **axios** — HTTP.
- **Leaflet + react‑leaflet** — interactive maps (free tiles, no Google key). **recharts** — charts.
- **TailwindCSS** — utility‑first styling. **framer‑motion** — animations. **lucide‑react** — icons.

**Why these and not alternatives?** The unifying constraint is **₹0 cost + low setup friction +
type safety end‑to‑end**. TypeScript on both frontend and backend, pydantic on the engine, and a
shared camelCase contract mean a field renamed in one place surfaces as a compile error rather
than a runtime surprise. Free data sources (AWS Open Data STAC, Copernicus Data Space, Open‑Meteo)
were chosen precisely because they need no paid key.

## 1.4 High‑level architecture

```
                         ┌────────────────────────┐
                         │  Frontend (React/Vite) │  :5173
                         │  routed SPA + Leaflet  │
                         └───────────┬────────────┘
                                     │ /api  (Vite dev proxy → :3001)
                         ┌───────────▼────────────┐
                         │  Backend (Node/Express)│  :3001
                         │  REST API + JWT + RBAC │
                         │  + persistence + queue │
                         └─────┬──────────────┬───┘
                    Prisma     │              │  HTTP fetch  +  BullMQ/Redis
                  ┌────────────▼───┐   ┌──────▼───────────────┐
                  │ PostgreSQL 15  │   │ Python Engine        │  :8000
                  │ (+ PostGIS)    │   │ FastAPI: ingest→FDI→ │
                  └────────────────┘   │ CNN→DBSCAN→drift     │
                                       └──────┬───────────────┘
                                              │  urllib / OAuth2 (no heavy deps)
                    ┌─────────────────────────┼─────────────────────────┐
              ┌─────▼──────┐        ┌─────────▼─────────┐      ┌─────────▼────────┐
              │ Earth      │        │ Copernicus Data   │      │ Open‑Meteo       │
              │ Search STAC│        │ Space (CDSE) —    │      │ currents + winds │
              │ (scene     │        │ Sentinel Hub      │      │ (drift forcing,  │
              │  metadata) │        │ pixel reflectance │      │  keyless)        │
              └────────────┘        └───────────────────┘      └──────────────────┘
```

Three independently‑runnable services. Each one **degrades gracefully**: if the DB is down the
backend serves demo data; if the engine is down the backend returns a labelled offline result; if
the backend is down the frontend serves a bundled mock dataset. This is why the whole thing "just
runs" even with nothing else installed — a core design principle (Phase 12/17).

## 1.5 Folder structure (top level)

```
marine-plastic-tracker/
├── frontend/          React SPA (Vite). src/{pages,components,hooks,lib,stores,types}
├── backend/           Node/Express API. src/{routes,services,data,lib,middleware,types}; prisma/
├── python_engine/     FastAPI engine. api/ satellite/ ml/ hotspot/ trajectory/ scheduler/ analysis/
├── models/            Trained ONNX weights + metrics.json + Clay indices (checkpoints/, weights/)
├── data/              Downloaded training datasets (MARIDA, MADOS, PLP…) — gitignored, huge
├── database/          Legacy SQL/mongo scaffolding (mostly dead — see Phase 17)
├── infra/             Portable PostgreSQL + Redis binaries and data dirs, start scripts
├── docker-compose.yml Local orchestration (Postgres + Redis + services)
├── .env / .env.example  Shared config for BOTH Node and Python
├── PROJECT_SUMMARY.md   Human status doc (rich; read alongside this guide)
├── TECHNICAL_AUDIT.md   Honest science/security audit (what's real vs simulated)
└── README.md            Quick start
```

**Mental model of the three source trees:**

```
frontend/src            backend/src              python_engine/
  pages/     ← screens     routes/    ← HTTP        api/         ← FastAPI routers
  components/← UI kit       services/  ← logic       satellite/   ← ingest, FDI, masks
  hooks/     ← react-query  data/      ← repo+mock   ml/          ← model, classify, Clay
  lib/       ← api client   lib/       ← env,prisma  hotspot/     ← DBSCAN, severity, alerts
  stores/    ← zustand      middleware/← auth,errors  trajectory/  ← drift, forcing, ETA
  types/     ← TS types     prisma/    ← schema+seed  scheduler/   ← cron, region sweep
```

## 1.6 Entry points

| Service | Entry file | What it does on start |
|---|---|---|
| Backend | [backend/src/index.ts](backend/src/index.ts) | Builds the Express app, probes DB, starts queue worker + scheduler, listens on :3001, attaches WebSocket |
| Engine | [python_engine/api/app.py](python_engine/api/app.py) | Builds the FastAPI app, mounts 9 routers, CORS. Run: `python -m uvicorn api.app:app --port 8000` |
| Frontend | [frontend/src/main.tsx](frontend/src/main.tsx) → [App.tsx](frontend/src/App.tsx) | Mounts React, sets up router + react‑query + toaster |

## 1.7 Execution flow (the 6‑stage pipeline — the heart of the app)

Every detection you see travels through exactly six stages inside the Python engine
([main_pipeline.py](python_engine/main_pipeline.py)):

```
1. DOWNLOAD   real Sentinel‑2 reflectance pixels (CDSE) OR synthetic fallback
      ↓        → SceneData{pixels, arr6, surface, mask}
2. FDI        Floating Debris Index per pixel; keep pixels where FDI > 0.02
      ↓        → list of candidate pixels
3. CNN        ONNX model classifies each candidate: Plastic|Algae|Sea_Foam|Water (+ confidence)
      ↓        → Detection objects
4. DBSCAN     cluster nearby Plastic detections (eps 0.09°, min 3) → Hotspots
      ↓        → Hotspot objects (severity HIGH/MEDIUM/LOW by size)
5. DRIFT      Lagrangian ensemble + real currents/winds → 72h path + uncertainty cone + coast ETA
      ↓        → Trajectory objects
6. ALERT      HIGH/MEDIUM hotspots → alert count
             → PipelineResult (fully typed, camelCase)
```

An optional **CLAY** stage (a geospatial foundation model) re‑scores hotspots into
CONFIRMED/POSSIBLE tiers when a GPU sidecar is available; it never blocks the base result.

## 1.8 Request lifecycle (the web side)

```
User clicks / draws box
      ↓
React page → react‑query hook → api.ts (axios)  → GET/POST /api/...
      ↓
Vite dev proxy forwards /api → http://localhost:3001
      ↓
Express: helmet → cors → json → rate‑limit → X‑Data‑Source tag → /api router
      ↓
Route handler (asyncHandler) → [authenticate] → repo.ts pick(live, demo)  OR  callEngine()
      ↓
Prisma → PostgreSQL     |     fetch → Python engine → satellite/ML/drift
      ↓
{ data, meta } envelope ← errorHandler catches thrown ApiError
      ↓
axios unwraps .data → react‑query cache → React re‑renders
```

## 1.9 Build process

- **Frontend:** `npm run build` = `tsc && vite build`. TypeScript type‑checks, then Vite bundles
  with **code‑splitting** (every page is `lazy()`‑loaded so heavy libs like recharts/leaflet only
  ship when their page is opened; main bundle ~86 kB).
- **Backend:** `npm run build` = `tsc` → `dist/`. Dev uses `tsx watch src/index.ts` (no build step).
- **Engine:** no build — Python runs from source. Optional deps installed via
  `requirements-demo.txt` (minimal), `-ingest.txt` (numpy+tifffile), `-ml.txt` (onnxruntime).

## 1.10 Deployment process

Designed for free tiers: frontend → Vercel/Netlify static host; backend → Render/Railway/Fly;
engine → same or a small VM; DB → Neon/Supabase Postgres; Redis → Upstash. A `docker-compose.yml`
exists for local orchestration. **Current reality:** it runs on the author's Windows laptop with a
*portable* PostgreSQL + Redis (`infra/start-db.cmd`, `infra/start-redis.cmd`) — no admin install
needed. Full cloud deployment is a roadmap item (Phase 17), not yet wired.

## 1.11 Runtime workflow (continuous operation)

Real‑time scanning is driven by an **external scheduler** hitting
`GET /api/pipeline/scheduled-run` (cron‑job.org / GitHub Actions / Windows Task Scheduler), which
enqueues one BullMQ job per region. There is *also* an optional **internal** BullMQ repeatable
job (`SCHEDULER_ENABLED=1`, default off so it never burns satellite quota). Either way a worker
runs the engine per region and persists results; a WebSocket pushes "new run/alert" events to open
dashboards the moment persistence completes.

## 1.12 External services, APIs, DB, auth, jobs, scheduler, config, env

- **External services:** AWS Earth Search STAC (scene metadata, no key), Copernicus Data Space
  Ecosystem / Sentinel Hub (pixel reflectance, OAuth2), Open‑Meteo (ocean currents + winds, no key).
- **APIs:** Backend REST under `/api/*` (documented in [routes/index.ts](backend/src/routes/index.ts));
  Engine REST on :8000 (`/health`, `/pipeline/run`, `/similarity/*`, `/model/*`, …).
- **Database:** PostgreSQL via Prisma (12+ models — Phase 8).
- **Auth:** real JWT access (15 min) + rotating refresh (7 days, one‑time use) + bcrypt + TOTP 2FA;
  3‑role RBAC (ADMIN/COASTGUARD/FIELD). Works against Postgres *or* an in‑memory demo store.
- **Background jobs:** BullMQ worker executes engine runs with retries (3×, exponential backoff).
- **Scheduler:** external cron (preferred) or internal repeatable job (opt‑in).
- **Config/env:** one shared `.env` at the repo root, loaded by *both* a zero‑dep Node loader
  ([lib/env.ts](backend/src/lib/env.ts)) and a zero‑dep Python loader ([config.py](python_engine/config.py)).
  Shell env always wins; `.env` never overwrites an already‑set variable.

**🧠 Checkpoint 1.** Can you name the three services, their ports, and the six pipeline stages in
order? Can you explain what "degrades gracefully" means and give one concrete example?

---

# Phase 2 — Folder‑by‑Folder

For each folder: **Purpose · What's inside · Depends on · Used by · Common mistakes.**

## 2.1 `frontend/src/`

| Sub‑folder | Purpose | Key contents | Uses | Used by |
|---|---|---|---|---|
| `pages/` | One component per screen (route target) | Landing, Login, CommandCenter, MapExplorer, Records, AILab, AnalyticsReports, Pipeline, Operations, Settings, AdminPanel, detail pages, marketing pages | hooks, components, lib/api | `App.tsx` routes |
| `components/` | Reusable UI. `ui/` = design‑system kit (~19), plus `layout/`, `map/`, `effects/`, `operations/`, `pipeline/`, `dashboard/` | Button, Card, Table, Modal, MapContainer, AppLayout, ProtectedRoute | lib/utils | pages |
| `hooks/` | React‑Query data hooks + notifications + live feed | useApi, useLiveFeed, useAlertNotifications | lib/api, queryClient | pages |
| `lib/` | Cross‑cutting utilities | **api.ts** (axios client + mock fallback), mockData, queryClient, authToken, utils | axios, types | everything |
| `stores/` | Global client state (zustand) | authStore (persisted), mapStore | lib/api, authToken | pages, ProtectedRoute |
| `config/` | Static config | nav.ts (sidebar structure, role‑gated) | types | AppLayout |
| `types/` | Shared TypeScript types | index.ts (all DTOs), leaflet.heat.d.ts | — | everything |
| `test/` | Vitest setup | setup.ts | — | test runner |

**Common mistakes here:** editing a `pages/*` file that App.tsx no longer routes to (several old
pages like `Dashboard.tsx`, `Detections.tsx`, `Alerts.tsx` were **consolidated** into
`CommandCenter`, `Records`, etc. — the old files still exist but are *not* routed; see App.tsx
redirects). Always confirm a page is in `App.tsx`'s `<Routes>` before assuming it's live.

## 2.2 `backend/src/`

| Sub‑folder | Purpose | Key contents | Uses | Used by |
|---|---|---|---|---|
| `routes/` | HTTP endpoint definitions (thin) | auth, stats, detections, hotspots, regions, alerts, satellite, pipeline, operations, export, features, system + index | middleware, data/repo, services, lib | `index.ts` |
| `services/` | Business logic (fat) | auth.service, pipelinePersist.service, report.service, satellite.service | prisma, lib | routes |
| `data/` | Repository + demo data | **repo.ts** (`pick(live,demo)`), operations.repo, mock.ts, users.ts | prisma, dataMode | routes |
| `lib/` | Infrastructure singletons | env, prisma, dataMode, engine, queue, live (WS), logger, serviceControl | — | everything |
| `middleware/` | Express middleware | auth (authenticate/requireMinLevel/requireRole), errorHandler (ApiError/asyncHandler) | lib/env, types | routes |
| `types/` | TS types + ambient decls | auth (Role/ROLE_LEVEL), domain (DTOs), express.d.ts, cors.d.ts | — | everything |
| `utils/` | Small helpers | query.ts (safe query‑param coercion) | — | routes |

**Common mistakes:** touching Prisma directly from a route instead of going through
`data/repo.ts` (breaks the demo fallback); forgetting that a thrown `ApiError` is the *correct* way
to signal HTTP errors (the errorHandler formats them) — returning `res.status(400)` by hand
bypasses the consistent envelope.

## 2.3 `backend/prisma/`

Purpose: the **single source of truth for the data model**. `schema.prisma` defines every table,
enum, index, and relation; `seed.ts` populates a realistic demo dataset (5 regions, users,
detections, hotspots, trajectory, alerts, a model version); `reseed-model.ts` refreshes just the
ModelVersion row from real `metrics.json`; `migrations/` holds SQL migration history. Used by the
whole backend via the generated Prisma client. **Mistake to avoid:** editing the DB by hand instead
of via schema + `prisma db push` / migrate — the schema must stay authoritative.

## 2.4 `python_engine/` packages

| Package | Purpose | Representative files |
|---|---|---|
| `api/` | FastAPI routers (HTTP surface) | app.py, health_route, predict_route, forecast_route, similarity_route, model_route, analysis_route, export_route, stream_route, system_route |
| `satellite/` | Ingest + spectral processing | download.py (orchestrator), band_loader, cloud_masker, landmask, fdi_calculator, spectral_indices, threshold_applier, patch_extractor, geotiff_exporter |
| `ml/` | Classification + foundation model + training | inference_engine, model_loader, batch_classifier, confidence_*, detection_merger, clay_* , similarity_service, site_change, embed_*, train_* , datasets/ |
| `hotspot/` | Clustering + severity + alerts | dbscan_clusterer, severity_scorer, alert_trigger, hotspot_storage |
| `trajectory/` | Drift forecasting | lagrangian_model, ensemble_model, data_interpolator, gridded_forcing, fetch_ocean_currents, fetch_wind_data, eta_calculator, coastline_loader, landfall, back_tracker, forecast |
| `analysis/` | Calibration + change detection | calibration, change_detection |
| `scheduler/` | Region sweeps | cron, pipeline_runner |
| `tests/` | Pytest | test_core.py |
| root | Orchestration + config | **main_pipeline.py**, config.py, schemas.py, clay_service.py, cache.py, logger.py, metrics.py, db_connector.py |

**Note on layout history:** older docs (and some comments) reference `app/pipeline/` and
`app/ml/…`. The engine was **consolidated** into this flat‑package layout; there is *no* `pipeline/`
directory now — that logic lives in `main_pipeline.py` plus the domain packages. When a comment
says `app/ml/model.py`, the real file is `ml/inference_engine.py` / `ml/model_loader.py`.

## 2.5 `models/`, `data/`, `infra/`, `database/`

- **`models/`** — the trained artefacts the engine loads at runtime: `marinenet.onnx` (default
  per‑pixel MLP), `metrics.json` (held‑out evaluation, surfaced in the UI model card), Clay indices
  (`clay_index.npz`, `hotspot_embeddings.npz`). Removing these forces the engine into its heuristic
  fallback.
- **`data/`** — downloaded training benchmarks (MARIDA, MADOS, PLP, Durban, RefinedFloatingObjects).
  **Gitignored, multi‑GB.** Only needed for (re)training, never at serving time.
- **`infra/`** — portable PostgreSQL + Redis binaries and their data directories, plus start
  scripts. This is *dev convenience*, not production infrastructure.
- **`database/`** — legacy `mysql/` and `mongo/` folders from an abandoned earlier scaffold. Largely
  **dead**; the real DB is Postgres via Prisma. Treat as historical unless a file is imported.

**🧠 Checkpoint 2.** Which folder holds the code that turns raw pixels into detections? Which folder
must you edit to add a new database column? Why should a route never call Prisma directly?

---

# Phase 3 — File‑by‑File Analysis

This phase covers **every real source file**, grouped by service. Format per file:
**role · imports (uses) · exports · key logic**. The most important files then get a **deep dive**
with line‑level explanation. (Dependency `node_modules`, `.venv`, and the huge `data/`/`infra/`
binaries are not source and are excluded.)

## 3.1 Backend — `backend/src/`

### 3.1.1 Entry & infrastructure

**[index.ts](backend/src/index.ts) — the backend entry point.** *Uses:* express, helmet, cors,
rate‑limit, env, prisma, logger, dataMode, routes, errorHandler; lazily imports queue + live.
*Exports:* the Express `app` (default) and re‑exports `prisma`. *Key logic:* builds the middleware
chain (security → body parse → rate‑limit → `X-Data-Source` tag), mounts `/health`, `/`, and
`/api`, then 404 + error handlers; `start()` probes the DB, starts DB health polling, **always**
starts the BullMQ worker (BullMQ retries Redis forever, so booting while Redis is down mustn't
disable the queue), starts the optional internal scheduler, listens, and attaches the WebSocket.
Handles SIGTERM/SIGINT for graceful shutdown (close queue, disconnect Prisma).

> **Deep dive — the middleware order matters.** `helmet()` sets security headers first; `cors()`
> with `exposedHeaders: ['X-Data-Source']` lets the browser read the live/demo tag; `express.json`
> caps body at 10 MB; `rateLimit` (300 req / 15 min) throttles; then a tiny middleware stamps every
> response with `X-Data-Source: db|demo`. If you reordered rate‑limit *after* the router, abusive
> requests would already have hit your handlers — order is a security property, not cosmetics.

**[lib/env.ts](backend/src/lib/env.ts) — zero‑dependency `.env` loader + typed config.** *Uses:* `fs`,
`path`. *Exports:* `env` (frozen config object) and `Env` type. *Key logic:* `parseEnvFile` reads a
file line‑by‑line, ignoring comments/blank lines, and sets `process.env[key]` **only if not already
set** (`if (!key || key in process.env) continue`) — so shell env wins. It probes four candidate
paths (backend `.env`, parent, and two `__dirname`‑relative) so it works both in `tsx` dev and
compiled `dist`. Then it builds a typed `env` with sane demo‑ready defaults (`DEMO_MODE` default
**true**, `port` 3001, dev‑only JWT secrets flagged via `usingDefaultSecret`). This file is *why*
you don't need `dotenv` and why the same `.env` powers Node and Python.

**[lib/prisma.ts](backend/src/lib/prisma.ts) — Prisma client singleton.** Prevents "too many
connections" in dev by reusing one client across `tsx watch` reloads (stored on `globalThis`).

**[lib/dataMode.ts](backend/src/lib/dataMode.ts) — DB health + mode.** *Exports:* `dataMode`
(mutable `{dbHealthy}`), `probeDatabase`, `startDbHealthPolling`, `isDemo`, `strictReal`,
`sourceLabel`. *Key logic:* runs `SELECT 1` to test the DB; a background poll flips `dbHealthy`
back to true automatically when Postgres recovers (no restart needed). `sourceLabel()` returns
`'demo'` when `DEMO_MODE` or DB down, else `'db'` — this is the value stamped on `X-Data-Source`
and read by the frontend badge. `strictReal()` = `!DEMO_MODE && DATA_STRICT` (fail loudly instead
of silently mocking).

**[lib/logger.ts](backend/src/lib/logger.ts)** — winston logger (levels, timestamps). **[lib/engine.ts](backend/src/lib/engine.ts)** —
`callEngine(path, init, timeoutMs)`: a `fetch` wrapper to the Python engine with an `AbortController`
timeout; throws on non‑2xx so callers can fall back. **[lib/queue.ts](backend/src/lib/queue.ts)** —
BullMQ setup: `enqueueRun`, `jobStatus`, `queueAvailable`, `queueCounts`, `startWorker`,
`startScheduler`, `closeQueue`. The worker runs `callEngine('/pipeline/run')` + `persistRun` with
retries/backoff; everything probes Redis per call and falls back to the direct path if it's down.
**[lib/live.ts](backend/src/lib/live.ts)** — `attachLiveSocket(server)` + `publishLive(event)`: a
`ws` server at `/ws/live` that broadcasts run/alert/job events. **[lib/serviceControl.ts](backend/src/lib/serviceControl.ts)** —
read‑only status probes of engine/queue/DB/Clay for the system route (service start/stop from the
UI was deliberately removed — see memory notes).

### 3.1.2 Middleware

**[middleware/auth.ts](backend/src/middleware/auth.ts) — auth + RBAC.** *Exports:* `authenticate`
(verify Bearer JWT → `req.user`), `requireMinLevel(n)` (clearance ≥ n), `requireRole(...roles)`.
All throw `ApiError(401/403)` on failure. **This is the entire access‑control primitive set** —
every protected route composes these three. *Key subtlety:* `authenticate` only checks the token is
valid; `requireMinLevel`/`requireRole` check *authorisation* and assume `authenticate` ran first
(they read `req.user`).

**[middleware/errorHandler.ts](backend/src/middleware/errorHandler.ts) — error plumbing.** *Exports:*
`ApiError` (class with `status`, `message`, optional `details`), `asyncHandler` (wraps an async
route so a rejected promise reaches Express's error path — without it, async throws hang the
request), `notFoundHandler` (404), `errorHandler` (final formatter → `{ error: { status, message,
details? } }`). This is why **every** error response has the same shape.

### 3.1.3 Data layer

**[data/repo.ts](backend/src/data/repo.ts) — the repository (deep dive).** This is the most
important backend file after `index.ts`. Every read/write goes through the `pick(live, demo)`
helper:

```ts
async function pick<T>(live: () => Promise<T>, demo: () => T): Promise<T> {
  if (env.DEMO_MODE) return demo();                 // explicitly demo → always mock
  if (!dataMode.dbHealthy) {                        // DB down
    if (strictReal()) throw new Error('DATA_STRICT: …');  // real deploy: fail loud
    return demo();                                  // pilot: fall back to demo
  }
  try { return await live(); }                      // normal path: real Prisma query
  catch (err) {
    if (strictReal()) throw err;                    // don't mask a real error with mock
    logger.warn('Live query failed — falling back to demo data.', err);
    return demo();
  }
}
```

Every exported function (`getOverview`, `getTrend`, `getByRegion`, `getByClass`,
`listDetections`, `getDetection`, `labelDetection`, `exportTrainingLabels`, `listHotspots`,
`getHotspot`, `listRegions`, `getRegion`, `listAlerts`, `ackAlert`, `listScenes`,
`listPipelineLogs`) is a `pick(...)` with a **Prisma implementation** and a **mock implementation
that mirrors the same filtering/sorting semantics**. For example `getOverview` fires eleven
`prisma.*.count/aggregate` queries in parallel via `Promise.all` for the live path, and computes
the identical numbers from the `mock.detections` array for the demo path. `labelDetection` is the
active‑learning write: it stamps `validatedBy/validatedAt` on CONFIRMED/FALSE_ALARM and clears them
on reset — those human verdicts are the ground truth an active‑learning retrain consumes
(`exportTrainingLabels` emits them as CSV/JSON).

> **Why this design is clever *and* risky.** Clever: one function shape gives the whole app a demo
> mode for free, and the mock path documents the exact query semantics in plain TS. Risky: the two
> implementations can drift (a filter added to `live` but forgotten in `demo`), and outside
> `DATA_STRICT` a *real* query bug is silently swallowed as "fall back to demo" and only whispered
> to the logs. In production you want `DATA_STRICT=1`.

**[data/mock.ts](backend/src/data/mock.ts)** — the bundled demo dataset (regions, detections,
hotspots, trajectories, alerts, scenes, modelVersion) used by `repo.ts`'s demo path.
**[data/users.ts](backend/src/data/users.ts)** — in‑memory demo users (3 roles, password
`Demo@1234!`) with real bcrypt hashes, used by `auth.service` when `isDemo()`.
**[data/operations.repo.ts](backend/src/data/operations.repo.ts)** — the same `pick` pattern for
field Operations (create, list, status‑transition, file report, stats, sequential `OP‑YYYY‑NNNN`
codes).

### 3.1.4 Routes (thin HTTP layer)

Each route file is a small `Router` that reads/validates query/body, calls a repo/service, and
returns `{ data, meta? }`. Summary table:

| File | Endpoints | Notable |
|---|---|---|
| [auth.routes.ts](backend/src/routes/auth.routes.ts) | register, login, refresh, logout, me, users, 2fa/setup·enable·disable | `login` handles `needsTotp`; `users` is `requireMinLevel(ADMIN)` |
| [stats.routes.ts](backend/src/routes/stats.routes.ts) | overview, trend, by-region, by-class | pure reads via repo |
| [detections.routes.ts](backend/src/routes/detections.routes.ts) | list, `:id`, `:id/label`, labels/export | label is `requireMinLevel(COASTGUARD)` |
| [hotspots.routes.ts](backend/src/routes/hotspots.routes.ts) | list, `:id` | includes trajectory join on detail |
| [regions.routes.ts](backend/src/routes/regions.routes.ts) | list, `:code` | monitored zones |
| [alerts.routes.ts](backend/src/routes/alerts.routes.ts) | list, `:id/ack` | ack flips isAcked |
| [satellite.routes.ts](backend/src/routes/satellite.routes.ts) | status, scenes (`?region=` or `?bbox=`) | proxies engine STAC; bbox = user AOI |
| [pipeline.routes.ts](backend/src/routes/pipeline.routes.ts) | run, stream, logs, jobs/:id, scheduled-run, status | the engine proxy + persistence (deep dive below) |
| [features.routes.ts](backend/src/routes/features.routes.ts) | mounted at `/api/engine/*` | proxies engine similarity/forecast/change/model/export/capabilities |
| [operations.routes.ts](backend/src/routes/operations.routes.ts) | list, stats, `:id`, create, `:id/status`, `:id/report` | writes require ≥FIELD |
| [export.routes.ts](backend/src/routes/export.routes.ts) | detections.csv, hotspots.pdf, operations/:id.pdf | server‑side PDF/CSV |
| [system.routes.ts](backend/src/routes/system.routes.ts) | services | read‑only health tiles |
| [index.ts](backend/src/routes/index.ts) | mounts all of the above under `/api` | API discovery index at `/api` |

**[pipeline.routes.ts](backend/src/routes/pipeline.routes.ts) — deep dive (the engine proxy).** The
`POST /run` handler is gated by `authenticate` (so scans can't be hammered anonymously). It parses
`region` or a validated `bbox` (via `parseBbox`, which rejects inverted boxes), plus opt‑in
modifiers (`minConfidence`, `dedupe`, `biofouling`). If `queued===true` and Redis is up it enqueues
and returns `202 {jobId}` immediately; otherwise it calls the engine with a **120‑second** timeout
(a cold real run = OAuth + pixel fetch + STAC + drift forcing, so 20 s would abort genuine work),
persists the result best‑effort (`tryPersist` never lets a broken DB break a run), and returns
`{ data, meta: { engine: 'online', persisted } }`. On engine failure it returns a **labelled**
`offlineAoiResult` (empty, `engineOffline: true` — *fabricates nothing* for AOI) or
`demoPipelineResult` (mock rows for a region). `scheduled-run` enqueues one job per region (guarded
by `SCHEDULER_TOKEN` **or** a signed‑in user via `schedulerOrAuth`).

### 3.1.5 Services (business logic)

**[services/auth.service.ts](backend/src/services/auth.service.ts) — deep dive.** *Exports:*
`validateCredentials`, `register`, `issueTokens`, `rotateRefresh`, `revokeRefresh`, TOTP fns
(`setupTotp`/`enableTotp`/`disableTotp`/`verifyTotp`), `listUsers`, `toPublic`. *Key logic:*
`isDemo()` switches every lookup between the in‑memory `demoUsers` array and Prisma — the *same*
bcrypt + JWT + TOTP code runs in both modes, so demo auth is real auth, just backed by RAM.
`issueTokens` signs a 15‑min access JWT (payload includes `role` + numeric `level`) and a refresh
JWT carrying a random `jti` that is added to an in‑memory allow‑list. `rotateRefresh` verifies the
refresh token, checks the `jti` is still valid, **deletes it (one‑time use)**, and issues a fresh
pair — so replaying an old refresh token 401s. `register` always creates a `FIELD` user.

> **Deep dive — the refresh‑token rotation.** Access tokens are short (15 min) so a stolen one
> expires fast; the long‑lived refresh token is single‑use and tracked by `jti`, so reuse (a sign of
> theft) is detectable and rejected. The catch: the allow‑list is *in memory*, so a backend restart
> invalidates all refresh tokens and logs everyone out — fine for a pilot, but a production system
> would store `jti`s in Redis/DB (the `RefreshToken` Prisma model exists for exactly this and is a
> Phase‑17 upgrade).

**[services/pipelinePersist.service.ts](backend/src/services/pipelinePersist.service.ts)** —
`persistRun(engineResult)`: writes the engine's `PipelineResult` into Postgres — creates/links a
`SatelliteImage`, inserts `Detection` rows (with `rawBandValues` for audit), `Hotspot` rows,
`Trajectory` rows, `Alert` rows for HIGH/MEDIUM, and `PipelineLog` stage rows; returns a
`PersistSummary` of counts. This is the bridge from "engine computed it" to "the dashboards show
accumulated real data". **[services/report.service.ts](backend/src/services/report.service.ts)** —
builds PDFs (pdfkit) and RFC‑4180 CSVs with an honest advisory footer.
**[services/satellite.service.ts](backend/src/services/satellite.service.ts)** — proxies/normalizes
the engine's scene endpoints and status.

### 3.1.6 Types & utils

**[types/auth.ts](backend/src/types/auth.ts)** — `Role` union, `ROLE_LEVEL` map (ADMIN 3 /
COASTGUARD 2 / FIELD 1), `AuthPayload`, `PublicUser`, `TokenPair`. **[types/domain.ts](backend/src/types/domain.ts)** —
every DTO the API returns (DetectionDto, HotspotDto, OverviewStats, …). **[types/express.d.ts](backend/src/types/express.d.ts)** —
ambient declaration adding `req.user`. **[utils/query.ts](backend/src/utils/query.ts)** — `str()`/number
coercers that safely narrow Express's `string | string[] | undefined` query values.

## 3.2 Python engine — `python_engine/`

### 3.2.1 Orchestration & config

**[main_pipeline.py](python_engine/main_pipeline.py) — the orchestrator (deep dive).** *Uses:* config,
hotspot.dbscan_clusterer, hotspot.severity_scorer, ml.*, satellite.download, satellite.fdi_calculator,
schemas, trajectory.*. *Exports:* `run_aoi(bbox,…)`, `run_pipeline(region,…)`, `run_aoi_events(bbox)`
(SSE generator twin). *Key logic:* both `run_aoi` and `run_pipeline` walk the six stages, timing each
with `time.perf_counter()` and appending a typed `StageLog`. Helpers keep it DRY: `_fdi_candidates`
(stage 2), `_make_hotspots` (DBSCAN + severity + centroid), `_drift_stage` (per‑hotspot ETA + tracks
for the top 2), `_alert_stage`, `_embed_sites` (queues 64×64×5 chips for offline Clay embedding),
and `clay_live.enrich_hotspots` (optional tier‑2 re‑score). A subtle correctness fix is documented
in the code: region drift uses `coast_lon_for(h.label.split("-H")[0])` (derive region from the
hotspot label) rather than an index lookup, so it's robust to the post‑sort reordering. Everything
returns a fully‑typed `PipelineResult` (pydantic, camelCase) — *no module globals*, so a synthetic
fallback can never report a previous scan's surface.

**[config.py](python_engine/config.py)** — zero‑dep `.env` loader (mirrors the Node one: `setdefault`
so shell env wins) + `Settings` singleton exposing `demo_mode`, `satellite_provider`, Sentinel Hub
creds, and the scientific knobs (`fdi_threshold` 0.02, `dbscan_eps_deg` 0.09, `dbscan_min_samples`
3, `drift_horizon_hours` 72) with a `satellite_configured` property. **[schemas.py](python_engine/schemas.py)** —
the pydantic models (`Detection`, `Hotspot`, `Trajectory`, `TrajectoryPoint`, `ConePoint`,
`PipelineResult`, `PipelineStats`, `StageLog`, `SceneRef`, `Surface`, `BBox`) with camelCase
serialization aliases — the contract the Node backend and React frontend depend on.
**[logger.py](python_engine/logger.py)** — `get_logger(name)`. **[cache.py](python_engine/cache.py)** —
small TTL caches (STAC scenes 10 min, drift forcing 1 h/cell). **[metrics.py](python_engine/metrics.py)** —
confusion/P/R/F1 helpers. **[clay_service.py](python_engine/clay_service.py)** — the GPU sidecar client.
**[db_connector.py](python_engine/db_connector.py)** — optional direct DB access (engine‑side).
**[conftest.py](python_engine/conftest.py)** — pytest fixtures.

### 3.2.2 `api/` — FastAPI routers

**[app.py](python_engine/api/app.py)** — builds the FastAPI app, adds CORS for :3001/:5173, mounts
nine routers. Every other file here is a `router` grouping related endpoints:

| Router | Endpoints (engine side) |
|---|---|
| health_route | `/`, `/health` (config + model card), `/model/info` |
| predict_route | `/pipeline/run`, `/pipeline/last`, `/compute/fdi` |
| forecast_route | `/compute/drift`, `/forecast/trajectory`, `/forecast/backtrack` |
| model_route | `/model/evaluate`, `/model/validation` |
| analysis_route | `/change`, calibration endpoints |
| export_route | `/export/geotiff` |
| similarity_route | `/similarity/{info,demo,search,hotspot,change,sites}` |
| stream_route | `/pipeline/stream` (SSE live‑scan) |
| system_route | `/capabilities` |

### 3.2.3 `satellite/` — ingest & spectral processing

| File | Role |
|---|---|
| **download.py** | Orchestrator (deep dive below): `scene_for(region)`, `scene_for_bbox(bbox)`, `search_scenes` (STAC), `SceneData` dataclass, synthetic fallbacks, `REGIONS` metadata |
| band_loader.py | Sentinel Hub Process API: OAuth2 token → evalscript → `(H,W,6)` float32 array; `available()` gate |
| cloud_masker.py | `split_scl` (bands vs SCL), `surface_from_scl` (water/land/cloud %), `mask_stats`, `KEEP_SCL` (classes 2/6/7) |
| landmask.py | Keyless elevation‑based land/water estimate for the synthetic surface readout |
| **fdi_calculator.py** | Biermann FDI (deep dive below): scalar + vectorized + `is_candidate` |
| spectral_indices.py | NDVI, PI, MNDWI, red‑edge NDVI, brightness (the engineered features) |
| threshold_applier.py | `extract_candidates`: vectorized FDI + SCL mask → candidate pixels + `arr6` |
| patch_extractor.py | 64×64 window extraction (edge‑clamped) for patch/Clay models |
| cloud_filter.py, band_normalizer.py, band_resampler.py | supporting band ops |
| geotiff_exporter.py | writes a georeferenced index raster (FDI/NDVI/FAI) as GeoTIFF for export |

**download.py — deep dive.** `SceneData` is a dataclass carrying *its own* `pixels`, `arr6`,
`surface`, `mask`, `source`, and `error` — deliberately no module globals, which fixed a real bug
where a synthetic fallback reported the *previous* scan's "88% water" surface. `scene_for*` calls
`band_loader.available()`: if real ingest is configured it tries `_real_ingest` (fetch → `split_scl`
→ surface/mask → `extract_candidates`) and on any exception **degrades to a synthetic scene** with
the error recorded (so the UI can say "real ingest failed → synthetic (reason)"). The synthetic
generators (`_synthetic_region`, `_synthetic_bbox`) use a *seeded* `random.Random` so the same
selection always yields the same plausible pixels (deterministic demo). `search_scenes` POSTs to the
AWS Earth Search STAC API with `urllib` (no key, no dependency) and returns real Sentinel‑2 L2A
metadata (id, date, cloud %, MGRS tile, thumbnail, footprint bbox).

**fdi_calculator.py — deep dive.** Implements the Floating Debris Index from Biermann et al. (2020):
`FDI = B08 − [ B06 + (B11 − B06) · SLOPE · 10 ]` where `SLOPE = (λ8−λ6)/(λ11−λ6) ≈ 0.1172` using
Sentinel‑2 central wavelengths (740/842/1610 nm). The idea: floating material reflects near‑infrared
(B08) *above* the water baseline interpolated between red‑edge (B06) and SWIR (B11); how far above =
FDI. A pixel is a candidate when `FDI > threshold` (0.02). This is real, peer‑reviewed physics —
the scientifically strongest part of the app.

### 3.2.4 `ml/` — classification, foundation model, training

| File | Role |
|---|---|
| **inference_engine.py** | (deep dive) `classify(bands,fdi)` → model or heuristic; `predict`/`predict_patches`; builds the **11‑feature** vector |
| model_loader.py | Lazy ONNX Runtime session; `CLASSES`, `input_kind` (patch/pixel), `patch_geometry`, `is_available` |
| batch_classifier.py | Stage‑3 driver: routes candidates through per‑pixel or patch inference; returns detection dicts + mode |
| confidence_filter.py / confidence_fusion.py | drop weak detections; fuse MLP+Clay into High/Med/Low with reasons |
| detection_merger.py | collapse near‑duplicate detections |
| area_estimator.py | (pseudo‑)area per detection — see the honesty caveat in Phase 17 |
| biofouling_corrector.py | optional reclassification of likely‑biofouled plastic |
| clay_embed.py / clay_live.py / clay_index.py / clay_analytics.py | Clay foundation‑model embedding, live sidecar re‑score, numpy similarity index, analytics |
| similarity_service.py | nearest‑neighbour search over embeddings (find‑sites‑like‑this, retrieval vote, novelty) |
| embed_hotspots.py / embedding_spool.py / hotspot_embeddings.py | queue + store + serve per‑hotspot embeddings (GPU node drains the queue) |
| site_change.py | temporal change of a site across dated fingerprints |
| seed_hotspot_store.py / inference helpers | store bootstrap |
| datasets/ (dataset, marida, mados, patches, rfo) | training‑data loaders (synthetic + real MARIDA/MADOS/RFO) |
| train*.py (train, train_marida, train_combined, train_patch, train_patch_cnn, train_perpixel_gpu, train_clay_head) | training scripts (GPU + CPU) exporting ONNX |
| evaluate.py / tune_*.py / validate_*.py | held‑out eval, threshold/fusion tuning, PLP independent validation |

**inference_engine.py — deep dive.** `classify(bands, fdi)` first tries the model (unless a *patch*
model is loaded, in which case per‑pixel calls fall through to the heuristic). `_features` builds the
**11‑feature** vector the GPU‑trained `marinenet.onnx` expects: the 5 bands + FDI + NDVI, plus four
engineered indices (PI, MNDWI, red‑edge NDVI, brightness) — all derived from the *same 5 bands*, so
zero extra data. `predict` runs the ONNX session, applies a numerically‑stable softmax
(`exp(x − max)`), and returns `(class, confidence)`. If no model is loaded, an **interpretable
heuristic** fires (`FDI>0.028 & NDVI<0.55 → Plastic`, etc.) with *arbitrary* confidence constants
(e.g. `min(0.98, 0.62 + 6·fdi)`) — clearly a placeholder, only active without a model, and a known
honesty caveat (Phase 17).

### 3.2.5 `hotspot/`, `trajectory/`, `analysis/`, `scheduler/`, `tests/`

- **hotspot/dbscan_clusterer.py — deep dive.** DBSCAN from scratch (no scikit‑learn). `dbscan()`
  labels each point (‑1 = noise) by expanding density‑reachable neighbourhoods within `eps` (decimal
  degrees, Euclidean via `math.hypot`); `cluster()` returns `{label: [indices]}` for non‑noise
  clusters — the shape the pipeline consumes. Defaults eps 0.09° (~10 km), min_samples 3.
  **severity_scorer.py** maps cluster size → HIGH (≥10) / MEDIUM (≥5) / LOW (≥3).
  **alert_trigger.py** / **hotspot_storage.py** — alerting + persistence helpers.
- **trajectory/** — `lagrangian_model.simulate` advects a 4‑member windage ensemble (1.5–3%) to
  produce a mean path + uncertainty cone; `data_interpolator.fetch_forcing` pulls **real** hourly
  currents+winds from Open‑Meteo (keyless), with `gridded_forcing`/`fetch_ocean_currents`/
  `fetch_wind_data` as the richer/alternate paths; `eta_calculator.coast_eta_hours` estimates coast
  arrival via a longitude‑crossing check; `coastline_loader.coast_lon_for` gives a region's coast
  longitude; `back_tracker`/`landfall`/`forecast` power the "where did it come from / where will it
  land" endpoints. `ensemble_model.DEFAULT_WINDAGE` holds the coefficients.
- **analysis/** — `calibration` (confidence calibration) + `change_detection` (AOI debris‑density
  trend over time windows).
- **scheduler/** — `cron` + `pipeline_runner`: sweep all regions (engine‑side twin of the backend
  scheduled‑run).
- **tests/test_core.py** — pytest covering FDI, DBSCAN, and pipeline shape.

## 3.3 Frontend — `frontend/src/`

### 3.3.1 Entry, routing, data client

**[main.tsx](frontend/src/main.tsx)** — React root: `createRoot(...).render(<App/>)`, imports
`index.css`. **[App.tsx](frontend/src/App.tsx) — deep dive.** Wraps everything in
`QueryClientProvider` (react‑query) + `BrowserRouter`, renders the fixed animated background
(`WaveBackground` + `ParticleField`), a `ScrollToTop`, a custom **`ErrorBoundary`** (catches the
classic "failed to fetch dynamically imported module" after a dev‑server restart and offers a
reload), and a `Suspense` fallback around lazy‑loaded routes. Routes are grouped: public/marketing
under `MarketingLayout`, `/login` + `/signup`, and the protected app under
`ProtectedRoute → AppLayout` at `/app/*`. Note the **IA v2 consolidation**: 14 pages became 10 —
`CommandCenter` merges Dashboard + Live Ops + Alerts; `Records` merges Detections + Hotspots;
`AILab` merges Model Health + Similarity; `AnalyticsReports` merges Analytics + Reports. Retired
routes (`/app/detections`, `/app/alerts`, …) are permanent `<Navigate replace>` redirects so old
bookmarks don't 404.

**[lib/api.ts](frontend/src/lib/api.ts) — the API client (deep dive).** One axios instance
(`baseURL` from `VITE_API_URL`, 8 s default timeout). A **request interceptor** attaches the JWT
from `authToken`. A **response interceptor** implements *transparent refresh*: on a 401 (not on
`/api/auth/*`), it refreshes the access token once via the rotating refresh token and retries the
original request; concurrent 401s share one in‑flight refresh (`refreshing` promise). Generic
helpers: `get` (unwraps `{data}`, records `X-Data-Source` as db/demo/mock, **falls back to a bundled
mock on any failure** so reads never break), `patch`, `post`/`patchBody` (throw on failure — writes
need the backend), `downloadBlob` (binary → browser download). The `api` object exposes one method
per endpoint (overview, detections, hotspots, analyzeAoi, forecastTrajectory, similarity*, exports,
operations, auth, admin, …). `api.isLive()` / `api.source()` report whether the last call hit the
real backend and its data source — the UI's live/demo/offline badge reads these.

**[lib/mockData.ts](frontend/src/lib/mockData.ts)** — the frontend's bundled mock dataset (mirrors
the backend mock) so the SPA is fully browsable offline. **[lib/queryClient.ts](frontend/src/lib/queryClient.ts)** —
react‑query client config (staleTime, gcTime; AOI runs use `staleTime:0, gcTime:0` for true
on‑demand). **[lib/authToken.ts](frontend/src/lib/authToken.ts)** — a tiny module holding the current
access/refresh tokens, mirrored from the zustand store so the axios interceptor can read them without
a React hook. **[lib/utils.ts](frontend/src/lib/utils.ts)** — `cn()` (clsx + tailwind‑merge) and
formatters.

### 3.3.2 State, hooks, config, types

**[stores/authStore.ts](frontend/src/stores/authStore.ts)** — zustand store (persisted to
localStorage): `user`, `accessToken`, `refreshToken`, `isAuthenticated`, and async `login`/
`register`/`logout` that call `api.*` and fall back to an offline demo login; a subscription mirrors
tokens into `authToken`. **[stores/mapStore.ts](frontend/src/stores/mapStore.ts)** — map UI state
(selected AOI, live mode). **[hooks/useApi.ts](frontend/src/hooks/useApi.ts)** — a react‑query hook
per endpoint (`useOverview`, `useDetections`, `useHotspots`, …) wrapping `api.*` with query keys +
cache config. **[hooks/useLiveFeed.ts](frontend/src/hooks/useLiveFeed.ts)** — subscribes to the
`/ws/live` WebSocket and invalidates react‑query caches on push events. **[hooks/useAlertNotifications.ts](frontend/src/hooks/useAlertNotifications.ts)** —
browser + toast notifications on new HIGH alerts (baselined seen‑set, no replay).
**[config/nav.ts](frontend/src/config/nav.ts)** — the sidebar structure, grouped and role‑gated (Admin
only sees Admin). **[types/index.ts](frontend/src/types/index.ts)** — all shared TS types mirroring the
backend DTOs + engine schemas (the compile‑time contract).

### 3.3.3 Components & pages

**Layout:** `AppLayout` (sidebar + top bar for `/app/*`), `MarketingLayout` (nav + footer),
`ProtectedRoute` (redirects to `/login` if unauthenticated), `CommandPalette` (⌘K quick nav),
`NotificationCenter`, `OnboardingTour` (5‑step first‑login), `Logo`, `Footer`, `ScrollToTop`.
**UI kit (`components/ui/`):** Button, Card, Badge, Modal, Table, StatCard, ChartCard, Tabs, Input,
Select, Skeleton, EmptyState, PageHeader, RoleBadge, SeverityPill, Toast, InfoTip — the reusable
design system. **Map:** `MapContainer` (Leaflet wrapper: Esri World Imagery basemap, draw‑bbox,
markers scaled by confidence, drift cones, scene overlay), `SimilarSitesDrawer`. **Effects:**
`WaveBackground`, `ParticleField`. **Operations:** `OperationCard`, `OperationForm`,
`MissionReportForm`, `status.ts`. **Pipeline:** `LiveScanProgress` (animated 6‑stage timeline).
**Dashboard:** `LiveStatusRail`.

**Pages (routed, per App.tsx):** `Landing`, `About`, `Contact`, `Documentation`, `FAQ`, `Terms`,
`Privacy`, `Compliance` (marketing); `Login`, `SignUp` (auth); `CommandCenter`, `MapExplorer`,
`Records`, `DetectionDetail`, `HotspotDetail`, `AILab`, `ActiveLearning`, `Pipeline`, `Operations`,
`AnalyticsReports`, `Settings`, `AdminPanel`, `NotFound` (app). *Present but not routed* (legacy,
kept for reference): `Dashboard`, `Detections`, `Hotspots`, `Alerts`, `Analytics`, `Reports`,
`OpsBoard`, `Intelligence`, `ModelHealth`, `CommandCenter`'s predecessors — the App.tsx redirects
point old paths at the consolidated pages.

**🧠 Checkpoint 3.** Trace `api.analyzeAoi(bbox)` in your head: which frontend file builds the
request, which backend route receives it, which engine function runs, and where does the result get
persisted? (Answer in Phase 7.)

---

# Phase 4 — Workflow Analysis

Each major feature is traced as a flowchart from trigger to completion.

## 4.1 Feature: Analyze a user‑drawn AOI (the flagship feature)

```
User draws a box on the map (MapExplorer)
        ↓  mapStore holds the bbox
Click "Analyze"  →  useMutation → api.analyzeAoi(bbox, sceneSize, options)
        ↓  axios POST /api/pipeline/run { bbox, sceneSize, ... }  (timeout 130s)
Backend: authenticate → parseBbox (reject inverted) → callEngine('/pipeline/run', 120s)
        ↓
Python engine run_aoi(bbox):
   DOWNLOAD  scene_for_bbox → real CDSE pixels (or synthetic, labelled) → SceneData
   FDI       _fdi_candidates → pixels with FDI>0.02
   CNN       batch_classifier → ONNX classify → Detection[]  (+ opt-in filters)
   DBSCAN    _make_hotspots → clusters → Hotspot[] (severity by size)
   [CLAY]    clay_live.enrich_hotspots → CONFIRMED/POSSIBLE (if GPU sidecar up)
   DRIFT     _drift_stage → 72h path + cone + coast ETA (real Open-Meteo forcing)
   ALERT     _alert_stage → count HIGH/MEDIUM
        ↓  PipelineResult (camelCase, per-stage timings, scene ref)
Backend: tryPersist(result) → PostgreSQL (detections, hotspots, trajectories, alerts, logs)
        ↓  publishLive over /ws/live
Response { data: PipelineResult, meta: { engine:'online', persisted:{counts} } }
        ↓
axios unwraps → react-query → MapExplorer renders markers + drift cones + scene overlay
        ↓  useLiveFeed also invalidates dashboards
Completion: user sees detections pinned to the real Sentinel-2 footprint, stage timeline, model badge
```

**Error/edge handling along the way:** invalid bbox → engine never called (400‑ish reject); engine
down → `offlineAoiResult` (empty, `engineOffline:true`, *no fabricated points*); real pixel fetch
fails → engine silently degrades to synthetic pixels but labels them; DB write fails → run still
returns, `persisted:null`, warning logged.

## 4.2 Feature: Log in (with optional 2FA)

```
Login page → authStore.login(identifier, password, totp?)
   → api.authLogin → POST /api/auth/login
Backend auth.routes /login → validateCredentials (bcrypt.compare)
   → if user.totpEnabled && !totp: respond { needsTotp: true }   (UI reveals code field)
   → else verifyTotp(user, totp) → issueTokens (access 15m + rotating refresh 7d)
Response { data: { user, accessToken, refreshToken } }
   → authStore persists tokens → authToken mirror → axios attaches Bearer henceforth
```

## 4.3 Feature: Acknowledge an alert

```
CommandCenter alert row → api.ackAlert(id) → PATCH /api/alerts/:id/ack
Backend alerts.routes → repo.ackAlert → pick(live: prisma.alert.update{isAcked,ackedAt}, demo: mutate mock)
Response { data: Alert } → react-query invalidates alerts → row shows acknowledged
```

## 4.4 Feature: Dispatch a field operation

```
Operations page → OperationForm → api.createOperation(input)  (auth ≥ FIELD)
   → POST /api/operations → operations.repo.create → OP-YYYY-NNNN, snapshot targetLat/Lon,
     OperationEvent(PLANNED)
Status transitions → PATCH /api/operations/:id/status → append OperationEvent
Complete → POST /api/operations/:id/report → MissionReport (1:1) → export PDF dossier
```

Note the **soft references**: `hotspotId`/`detectionId` are plain strings, not FKs — because
hotspots are recomputed every run, a cascade FK would delete completed operations. `targetLat/Lon`
snapshot the location so the op survives its source hotspot being replaced.

## 4.5 Feature: Continuous scheduled scanning

```
External cron (cron-job.org/GitHub Actions/Task Scheduler) → GET /api/pipeline/scheduled-run?token=
Backend schedulerOrAuth (token OR signed-in) → for each region: enqueueRun (BullMQ)
   → 202 { mode:'queued', jobs:{MUM:jobId,...} }   (cron ack in ~0.1s, not 60s)
BullMQ worker (per job) → callEngine('/pipeline/run',{region}) → persistRun → publishLive
   → retries 3× exponential backoff on failure
If Redis down → serial inline fallback (blocks, still persists)
```

**🧠 Checkpoint 4.** Why does the AOI feature return *empty* results when the engine is offline, but
the region feature returns *mock* results? (Hint: AOI data is 100% computed live; a region has a
plausible seeded dataset. Fabricating AOI points would be dishonest; showing seeded region rows is a
labelled demo.)

---

# Phase 5 — Architecture Patterns

| Pattern | Where it lives | Why |
|---|---|---|
| **Layered architecture** | routes (presentation) → services/repo (logic) → prisma (data) | separation of concerns; routes stay thin |
| **Repository pattern** | `data/repo.ts`, `data/operations.repo.ts` | one place to swap live↔demo; routes never touch Prisma |
| **Service pattern** | `services/*.ts` | business logic (auth, persistence, reports) isolated from HTTP |
| **Adapter / graceful‑degradation** | `pick(live,demo)`, `callEngine` try/catch, axios mock fallback | every layer has a fallback → ₹0, no hard deps |
| **Pipeline / pipes‑and‑filters** | `main_pipeline.py` six stages | each stage transforms and passes on a typed payload |
| **Strategy (pluggable model)** | `model_loader` auto‑detects patch vs per‑pixel ONNX; heuristic fallback | drop in a new ONNX with no code change |
| **Producer/consumer (queue)** | BullMQ enqueue (producer) + worker (consumer) | decouple slow scans from the API thread |
| **Observer / pub‑sub** | `/ws/live` publishLive → useLiveFeed | push dashboards on new data |
| **Singleton** | `prisma` client, `settings`, `env` | one shared instance |
| **DTO / contract** | pydantic camelCase ↔ TS types | typed boundary between services |
| **Middleware chain** | Express `app.use(...)` order | cross‑cutting concerns (security, auth, errors) |

**What it is *not*:** there is no full Clean/Hexagonal architecture (no ports/adapters interfaces),
no CQRS, no event‑sourcing (though `AuditLog`/`OperationEvent` are append‑only logs), no message
broker beyond BullMQ/Redis. For a pilot this is appropriately pragmatic — the layering that matters
(repo + service + graceful fallback) is present; heavyweight abstractions were correctly avoided.

## 5.1 The three architectural "spines"

1. **Graceful degradation spine** — DB→demo, engine→offline, backend→mock, model→heuristic,
   real‑ingest→synthetic, real‑forcing→sinusoidal. Every one is *labelled*.
2. **Type/contract spine** — TS (frontend) ↔ TS (backend) ↔ pydantic camelCase (engine). Rename a
   field and three type systems complain at compile time.
3. **Honesty spine** — `X-Data-Source` header, `meta.source/engine`, `provider` fields, stage
   `detail` text, and the model card all propagate provenance from the pixel to the badge.

---

# Phase 6 — Wiring (Boot Order)

## 6.1 Backend boot sequence (`index.ts` → `start()`)

```
1. import env       → loads .env (shell wins), builds typed config, flags dev JWT secret
2. import prisma    → singleton client (reused across tsx reloads)
3. build app        → helmet → cors(exposedHeaders X-Data-Source) → json(10mb) → urlencoded
4.                    → rateLimit(300/15min) → res.setHeader(X-Data-Source)
5. mount /health, /, /api(router)          → routes/index registers 12 sub-routers
6. mount notFoundHandler, errorHandler     → LAST, so they catch everything
7. start(): probeDatabase() → dataMode.dbHealthy
8.           startDbHealthPolling()        → auto-revive to 'db' mode
9.           import queue → startWorker()  → BullMQ worker (retries Redis forever)
10.          queueAvailable()? else warn
11.          startScheduler()              → internal repeatable job (no-op unless SCHEDULER_ENABLED)
12.          app.listen(3001)
13.          attachLiveSocket(server)       → ws /ws/live
   SIGTERM/SIGINT → closeQueue → prisma.$disconnect → exit
```

## 6.2 Engine boot (`api/app.py`)

```
config.py imported first anywhere → _load_env_files() populates os.environ (shell wins)
FastAPI(app) → CORSMiddleware(:3001,:5173) → include 9 routers
model_loader lazily loads marinenet.onnx on first classify (not at boot)
```

## 6.3 Frontend boot (`main.tsx` → `App.tsx`)

```
createRoot(#root).render(<App/>)
App: QueryClientProvider(queryClient) → BrowserRouter
   → WaveBackground + ParticleField (fixed bg) → ScrollToTop
   → ErrorBoundary → Suspense(PageLoader) → <Routes> (all pages lazy())
   → Toaster (react-hot-toast)
authStore rehydrates from localStorage → authToken mirror set → axios ready
```

## 6.4 Cross‑service wiring (who talks to whom)

```
Browser ──/api──▶ Vite dev proxy ──▶ Backend :3001
Backend ──fetch──▶ Engine :8000            (callEngine, lib/engine.ts)
Backend ──Prisma──▶ Postgres :5432
Backend ──BullMQ──▶ Redis :6379 ──▶ Worker ──fetch──▶ Engine
Backend ──ws──▶ Browser (/ws/live)
Engine  ──urllib──▶ AWS STAC / CDSE Sentinel Hub / Open-Meteo
```

**🧠 Checkpoint 6.** Why is the BullMQ worker started *unconditionally* even when Redis is down at
boot? (Because BullMQ retries the Redis connection forever; if we gated the worker on a boot‑time
probe, a backend that started before Redis would never process jobs.)

---

# Phase 7 — Request Journey

**One request, every file it touches.** We trace **`POST /api/pipeline/run` with a bbox** (analyze
an AOI) — the richest path in the app.

```
① MapExplorer.tsx           user clicks Analyze → useMutation
② hooks/useApi.ts           calls api.analyzeAoi(bbox, 64, options)
③ lib/api.ts                axios.post('/api/pipeline/run', {bbox,sceneSize,...}, timeout 130s)
                            request interceptor attaches Bearer <access token>
④ lib/authToken.ts          supplies the token (mirrored from authStore)
   ── network ──▶ Vite proxy ──▶ :3001
⑤ index.ts middleware       helmet, cors, json, rateLimit, X-Data-Source tag
⑥ routes/index.ts           '/api/pipeline' → pipeline.routes
⑦ pipeline.routes.ts        authenticate (middleware/auth.ts) verifies JWT → req.user
                            parseBbox validates {n>s, e>w}; reads opts
⑧ (queued?) lib/queue.ts    if body.queued && Redis up → enqueue → 202 {jobId}; else continue
⑨ lib/engine.ts callEngine  fetch POST http://localhost:8000/pipeline/run (AbortController 120s)
   ── network ──▶ :8000
⑩ api/predict_route.py      FastAPI handler → main_pipeline.run_aoi(bbox)
⑪ satellite/download.py     scene_for_bbox → band_loader.available()?
      ⑪a band_loader.py     OAuth2 token (config.py creds) → Process API → (H,W,6) array
      ⑪b cloud_masker.py    split_scl → surface_from_scl → mask_stats
      ⑪c threshold_applier  vectorized FDI (fdi_calculator) + SCL mask → candidates + arr6
⑫ main_pipeline _fdi_candidates → FDI>0.02
⑬ ml/batch_classifier.py    → ml/inference_engine.classify → model_loader ONNX session
⑭ hotspot/dbscan_clusterer  → _make_hotspots → severity_scorer
⑮ ml/clay_live.py           (optional) enrich_hotspots via clay_service sidecar
⑯ trajectory/lagrangian_model.simulate + data_interpolator.fetch_forcing (Open-Meteo)
                            + eta_calculator.coast_eta_hours
⑰ schemas.py               assemble PipelineResult (camelCase)
   ── response ──▶ back to ⑨
⑱ services/pipelinePersist.service.ts  persistRun → Prisma writes (SatelliteImage, Detection,
                            Hotspot, Trajectory, Alert, PipelineLog)
⑲ lib/prisma.ts ──▶ Postgres
⑳ lib/live.ts publishLive  ── ws ──▶ open dashboards
㉑ pipeline.routes res.json { data, meta:{engine:'online', persisted} }
   ── response ──▶ back to ③
㉒ lib/api.ts               unwrap res.data.data; live=true
㉓ react-query cache        stores result; MapExplorer re-renders markers/cones/overlay
㉔ hooks/useLiveFeed.ts     ws event invalidates CommandCenter/Analytics caches
```

**24 hops, ~15 files, 3 services, 2 external APIs.** If any of ⑨–⑰ throws, the backend catch returns
`offlineAoiResult` (labelled, empty). If ⑱ throws, the run still returns with `persisted:null`.

---

# Phase 8 — Database

## 8.1 Engine & ORM

**PostgreSQL 15** (portable dev cluster in `infra/`; production would be Neon/Supabase). **PostGIS
is planned but not enabled** — geometry is stored as plain `lat`/`lon` floats today (the portable
cluster lacks the extension). Access is via **Prisma** (`schema.prisma` → generated client). Two
Postgres extensions *are* declared: `pgcrypto`, `unaccent`.

## 8.2 The models (tables)

```
User ──< RefreshToken            User ──< UserRegion >── Region
User ──< AuditLog                Region ──< SatelliteImage ──< Detection >── (Region)
User ──< ApiKey                  Detection ──< Trajectory
                                 Detection ──< Alert
SatelliteImage ──< PipelineLog   Operation ──< OperationEvent   Operation ──1 MissionReport
ModelVersion (standalone registry)
```

| Table | Purpose | Key columns / notes |
|---|---|---|
| **User** | accounts | `role` (ADMIN/COASTGUARD/FIELD), `passwordHash`, `totpSecret/Enabled` |
| **Region** | monitored zones | `code` (MUM/GOA/KCH/CHN/AND), `boundingBox` JSON, center + zoom |
| **UserRegion** | M:N user↔region | composite PK `(userId, regionId)`, cascade delete |
| **SatelliteImage** | a Sentinel‑2 scene | `sceneId` unique, `tile`, `cloudCoverPct`, `bandsMeta` JSON |
| **Detection** | one debris candidate | `lat/lon`, `classification`, `confidence`, `fdiScore`, `areaSqKm`, `status`, `rawBandValues` JSON, `validatedBy/At` |
| **Hotspot** | DBSCAN cluster | centroid, `detectionCount`, `severity`, `etaHours` (null=open ocean) |
| **Trajectory** | 72h drift | `pathData` JSON `{points[],cone[]}`, `windageCoeffs[]`, `dataSource` |
| **Alert** | notifications | `type`, `severity`, `isAcked/ackedBy/At`, `sentVia[]` |
| **RefreshToken** | (schema‑ready) refresh store | `token` unique, `revokedAt` |
| **AuditLog** | append‑only trail | `action`, `resource`, `ipAddress`, never updated |
| **PipelineLog** | per‑stage run log | `stage`, `status`, `durationMs`, `metadata` JSON |
| **ModelVersion** | model registry | `f1Score`, `precision`, `recall`, `confusionMatrix` JSON, `isActive` |
| **Operation** | field task | `code` OP‑YYYY‑NNNN, soft `hotspotId/detectionId`, `targetLat/Lon` snapshot |
| **OperationEvent** | op timeline | append‑only status/notes, cascade with Operation |
| **MissionReport** | after‑action (1:1) | `outcome`, `plasticCollectedKg`, `areaClearedSqKm` |
| **ApiKey** | programmatic access | `keyHash` (SHA‑256), `expiresAt`, `isRevoked` |

## 8.3 Relations, keys, indexes

- **Foreign keys with cascade:** `RefreshToken`, `UserRegion`, `Trajectory`, `OperationEvent`,
  `MissionReport`, `ApiKey` cascade‑delete with their parent. `Detection`→`SatelliteImage` is a hard
  FK; `Detection`/`Hotspot`→`Region` are *nullable* FKs (a detection can exist without a region tag).
- **Soft references (deliberate non‑FK):** `Operation.hotspotId/detectionId` are plain strings.
  *Why:* hotspots are recomputed and replaced every pipeline run; a cascade FK would silently delete
  a completed operation when its source hotspot vanished. The `targetLat/Lon` snapshot makes the op
  self‑contained.
- **Indexes:** heavy read columns are indexed — `Detection(lat,lon)`, `(regionId)`, `(status)`,
  `(classification)`, `(createdAt)`; `Hotspot(severity)`, `(isActive)`; `Alert(type,severity,
  isAcked,createdAt)`; `SatelliteImage(acquisitionDate)`. These back the dashboard aggregates.

## 8.4 Queries, transactions, ORM vs raw SQL

- Most reads are Prisma query‑builder (`findMany`, `count`, `aggregate`, `groupBy`). The **trend**
  endpoint drops to **raw SQL** (`prisma.$queryRaw`) for a `date_trunc('day')` time‑series with a
  `FILTER (WHERE status='CONFIRMED')` — cleaner than emulating it in the ORM.
- `getOverview` runs **eleven queries in parallel** (`Promise.all`) — one round‑trip of latency
  instead of eleven sequential ones.
- `persistRun` writes many rows per run; it is a candidate for wrapping in a single
  `prisma.$transaction` (currently sequential — a Phase‑17 hardening item).

## 8.5 Migrations & seeders

`prisma db push` (schema→DB, dev) or `prisma migrate` (versioned SQL in `prisma/migrations/`).
`prisma db seed` runs `seed.ts` (5 regions, users, detections, hotspots, a 72h trajectory, alerts,
a ModelVersion). `reseed-model.ts` refreshes just the ModelVersion from the real `metrics.json` so
the UI model card never shows a fabricated F1. `npm run db:reset` rebuilds from scratch.

**🧠 Checkpoint 8.** Why are `Operation.hotspotId` and `detectionId` *not* foreign keys? What real
bug would a cascade FK have caused?

---

# Phase 9 — Frontend

## 9.1 Component tree (protected app)

```
App (QueryClientProvider, BrowserRouter, ErrorBoundary, Toaster)
└─ ProtectedRoute (redirect if !isAuthenticated)
   └─ AppLayout (Sidebar[nav.ts, role-gated] + TopBar + NotificationCenter + CommandPalette + Outlet)
      ├─ CommandCenter   StatCards, trend/class/region charts, active alerts (ack), recent detections
      ├─ MapExplorer     MapContainer(Leaflet) + draw bbox + LiveScanProgress + SimilarSitesDrawer
      ├─ Records         Detections + Hotspots (filters, tables, bars)
      ├─ AILab           model card + similarity/fusion + PLP validation
      ├─ ActiveLearning  analyst labeling → training-set export
      ├─ Pipeline        run engine, 6-stage animation, model card
      ├─ Operations      dispatch → track → mission report (OperationForm, MissionReportForm)
      ├─ AnalyticsReports charts + CSV/PDF/GeoJSON export
      ├─ Settings        profile + 2FA (QR → verify → enable)
      └─ AdminPanel      users/roles/2FA table (ADMIN only)
```

## 9.2 Routing

React Router 6, nested. Public pages under `MarketingLayout`; `/login` + `/signup` standalone;
`/app/*` under `ProtectedRoute → AppLayout`. All pages `lazy()`‑loaded (code‑split). Retired routes
are permanent redirects. A catch‑all `*` renders `NotFound`.

## 9.3 State management (three tiers)

1. **Server state → react‑query** (`hooks/useApi.ts`): caching, background refetch, invalidation.
   Query keys are per‑endpoint; AOI runs use `staleTime:0` for true on‑demand.
2. **Global client state → zustand** (`authStore`, `mapStore`): auth session (persisted) + map UI.
3. **Local component state → `useState`/`useReducer`**: form fields, toggles, drawer open/close.

The token lives in zustand (persisted) *and* is mirrored to a plain module (`authToken`) so the
non‑React axios interceptor can read it.

## 9.4 Props, hooks, rendering, lifecycle

- **Hooks:** custom (`useApi`, `useLiveFeed`, `useAlertNotifications`) compose react‑query + zustand.
- **Rendering:** `Suspense` shows `PageLoader` while a lazy chunk loads; `ErrorBoundary` catches
  chunk‑load failures after a dev restart and offers reload.
- **Lifecycle:** `useLiveFeed` opens the WebSocket on mount and invalidates caches on push;
  `useAlertNotifications` baselines a seen‑set so old HIGH alerts don't re‑notify.

## 9.5 API calls, forms, validation, styling, performance

- **API:** all through `lib/api.ts` (one axios instance; transparent refresh; mock fallback on reads).
- **Forms:** `react-hook-form` + `zod` (login, signup password strength, operation dispatch, report).
- **Styling:** TailwindCSS utility classes + the `ui/` kit; light "pisces turquoise" ocean theme,
  glassmorphism (`.glass`), `framer-motion` animations. **The app is intentionally light‑theme only.**
- **Performance:** code‑splitting (main ~86 kB vs a 1 MB monolith before), lazy heavy libs (recharts
  422 kB, leaflet 154 kB load on demand), react‑query dedupes/caches requests.

**🧠 Checkpoint 9.** Where does the JWT live, and why is it mirrored out of the zustand store into a
plain module?

---

# Phase 10 — Backend

## 10.1 Layer responsibilities

| Layer | Files | Responsibility |
|---|---|---|
| Routes | `routes/*.ts` | parse/validate input, call repo/service, shape `{data,meta}` |
| Middleware | `middleware/*.ts` | auth, RBAC, error formatting, async wrapping |
| Services | `services/*.ts` | auth logic, persistence, reports, satellite proxy |
| Repository | `data/*.ts` | live↔demo data access (`pick`) |
| Lib | `lib/*.ts` | env, prisma, queue, engine client, WebSocket, logger, dataMode |
| Types | `types/*.ts` | DTOs, roles, ambient Express augmentation |

## 10.2 Authentication & authorization

- **authenticate** — verify Bearer JWT → `req.user` (401 if missing/invalid).
- **requireMinLevel(n)** — numeric clearance gate (FIELD 1 < COASTGUARD 2 < ADMIN 3).
- **requireRole(...roles)** — exact‑role gate.
- Token issuance/rotation/TOTP in `auth.service.ts`; RBAC verified end‑to‑end (a FIELD user hitting
  an ADMIN route → 403). **Current gap:** several domain *write* routes are public for demo UX;
  moving them behind `authenticate` is a Phase‑17 item (pipeline `/run` and labeling *are* gated).

## 10.3 Validation, logging, exception handling

- **Validation:** `utils/query.ts` coerces query params; `zod`/`express-validator` for bodies where
  present; `parseBbox` rejects malformed AOIs.
- **Logging:** winston (`lib/logger.ts`); `X-Data-Source` on every response for observability.
- **Exceptions:** throw `ApiError(status,msg)` anywhere; `asyncHandler` funnels async rejections to
  `errorHandler`, which emits the uniform `{error:{status,message,details?}}` envelope.

## 10.4 Background workers, queue, caching

- **Queue:** BullMQ (`lib/queue.ts`) — `enqueueRun`, worker with 3× retry + exponential backoff,
  `jobStatus` polling, `queueCounts`. Falls back to direct execution when Redis is down.
- **Worker job:** `callEngine('/pipeline/run')` → `persistRun` → `publishLive`.
- **Caching:** engine‑side TTL caches (STAC 10 min, forcing 1 h/cell); frontend react‑query caches;
  no backend response cache (reads are cheap Postgres aggregates).

## 10.5 Utilities & helpers

`lib/engine.ts` (`callEngine` fetch+timeout), `lib/live.ts` (WS), `lib/serviceControl.ts` (status
probes), `utils/query.ts` (param coercion), `data/mock.ts` + `data/users.ts` (demo data).

---

# Phase 11 — Data Flow

**One datum — a single pixel's reflectance — traced across the entire system.**

```
① ESA Sentinel-2 satellite measures reflectance at 5 bands over a 10m ground cell
② CDSE Sentinel Hub Process API returns it in a (H,W,6) float32 array   [band_loader.py]
③ cloud_masker.split_scl separates the SCL class; if it's water/dark/unclassified, keep it
④ fdi_calculator: FDI = B08 − baseline(B06,B11)   → say FDI = 0.045 (> 0.02 → candidate)
⑤ inference_engine._features builds [B04,B06,B08,B8A,B11,FDI,NDVI,PI,MNDWI,ndvi_re,bright]
⑥ ONNX MLP → softmax → ("Plastic", 0.74)                    [one Detection is born]
⑦ schemas.Detection{lat,lon,classification:'Plastic',confidence:0.74,fdiScore:0.045,areaSqKm,...}
⑧ DBSCAN groups it with neighbours → part of Hotspot "AOI-H1" (severity by cluster size)
⑨ PipelineResult (camelCase JSON) ── HTTP ──▶ backend
⑩ persistRun → INSERT INTO detections(lat,lon,classification,confidence,fdi_score,raw_band_values,…)
⑪ dashboards query: prisma.detection.count / aggregate → OverviewStats.plasticDetections++
⑫ GET /api/stats/overview → { data } → react-query → StatCard "Plastic detections: N+1"
⑬ MapExplorer renders a marker at (lat,lon), radius scaled by confidence 0.74, colored 'Plastic'
⑭ analyst clicks "Confirm plastic" → PATCH status=CONFIRMED, validatedBy/At stamped
⑮ exportTrainingLabels emits {…, label:'CONFIRMED', rawBandValues} → next active-learning retrain
```

**Transformations at each hop:** physical light → float32 array → masked band dict → scalar FDI →
feature vector → (class,confidence) → typed Detection → DB row → aggregate count → UI number → map
marker → human verdict → training label. The `rawBandValues` JSON preserves the *original evidence*
at every step, which is what makes the whole chain auditable.

**🧠 Checkpoint 11.** Name every representation a single pixel takes on between the satellite and the
"Plastic detections" number on the dashboard. Which stored field lets you re‑derive the FDI later?

---

# Phase 12 — Debugging

## 12.1 How to run the whole thing (so you can debug it)

```bash
# 0) DB + Redis (portable, no admin) — after every reboot
infra\start-db.cmd
infra\start-redis.cmd

# 1) Engine :8000
cd python_engine
python -m pip install -r requirements-demo.txt      # minimal
python -m uvicorn api.app:app --port 8000            # add --reload for dev

# 2) Backend :3001
cd backend && npm install && npm run dev             # tsx watch

# 3) Frontend :5173
cd frontend && npm install && npm run dev            # open http://localhost:5173
```
Sign in with `cg_officer` / `Demo@1234!` (or one‑click any demo role).

## 12.2 The single most useful debugging signal: `X-Data-Source`

Every backend response carries `X-Data-Source: db|demo`. The frontend surfaces it as a live/demo/
offline badge (`api.source()`). **First question for any "wrong data" bug:** is the badge `db`,
`demo`, or `mock`? That instantly tells you which of the three layers is actually serving you.

| Badge | Meaning | Where to look |
|---|---|---|
| `db` | real Postgres | Prisma query / seed / persistence |
| `demo` | backend up, DB down or DEMO_MODE | `dataMode`, `.env DEMO_MODE`, is Postgres running? |
| `mock` | backend unreachable | is `npm run dev` up on :3001? Vite proxy? |

## 12.3 Where to place breakpoints (by symptom)

| Symptom | Breakpoint / log |
|---|---|
| Login fails | `auth.service.validateCredentials` (bcrypt), `issueTokens`; check `env.auth.jwtSecret` |
| 401 after a while | axios response interceptor `refreshAccess` (`lib/api.ts`); refresh `jti` allow‑list |
| AOI returns empty | backend `callEngine` catch → `offlineAoiResult`; is engine on :8000? |
| AOI returns synthetic | `download.scene_for_bbox` → `band_loader.available()`; are CDSE creds set? check `sd.error` |
| Wrong detections | `inference_engine.classify`; is `model_loaded`? else heuristic constants |
| Dashboard not updating | `useLiveFeed` WS connection; `publishLive`; react‑query invalidation |
| Persistence missing | `pipelinePersist.persistRun` try/catch; `persisted:null` in `meta` |
| Queue stuck | `lib/queue.ts` worker; `queueAvailable()`; is Redis on :6379? |

## 12.4 Which logs matter

- **Backend (winston):** `Live query failed — falling back to demo` (a real query threw and was
  masked — set `DATA_STRICT=1` to see the real error), `pipeline persistence failed`, `Redis
  unreachable`.
- **Engine:** stage `detail` text in the `PipelineResult` (e.g. "REAL Sentinel‑2 reflectance · SCL
  kept 36.8% water px" vs "synthetic") — the fastest way to confirm you're on the real path.
- **Frontend:** the network tab — check `X-Data-Source`, the `meta.engine`/`meta.persisted` fields,
  and whether requests 401→retry.

## 12.5 How professionals debug this project

1. **Bisect by service.** Curl the engine directly (`POST :8000/pipeline/run`), then the backend
   (`:3001/api/pipeline/run`), then the browser. The failing hop is where the payload first goes wrong.
2. **Trust the labels.** The honesty spine means the system *tells you* which path it took — read
   `provider`, `source`, stage `detail`, `X-Data-Source` before guessing.
3. **Reproduce with `DATA_STRICT=1`** to stop the demo fallback from hiding real errors.
4. **Check the contract.** A frontend `undefined` is usually a camelCase/DTO mismatch — compare
   `types/index.ts` (TS) against `schemas.py` (pydantic) and `types/domain.ts`.

## 12.6 Common bugs (already fixed — learn from them)

- **Stale surface bug:** a synthetic fallback once reported the *previous* scan's water%. Fixed by
  making `SceneData` carry its own surface (no module globals).
- **Fake‑async froze the engine:** a blocking handler declared `async def` blocked the event loop.
  Lesson: never `async def` a synchronous‑blocking FastAPI handler.
- **Area inflation:** `areaSqKm` from an FDI heuristic over‑states area ~1000× — caveated in the
  explain drawer; don't sum it into headline dashboards without the caveat (Phase 17).

---

# Phase 13 — Interview Preparation

Questions graded by level, with model answers. Practice saying the answers aloud.

## 13.1 Beginner

- **Q: What does this app do?** *A:* Ingests free Sentinel‑2 imagery, detects candidate floating
  plastic via the FDI spectral index, classifies pixels with an ONNX model, clusters them into
  hotspots with DBSCAN, forecasts 72‑hour drift, and shows it all in a role‑based dashboard.
- **Q: What are the three services and their ports?** *A:* React frontend (5173), Node/Express API
  (3001), Python FastAPI engine (8000), plus Postgres (5432) and Redis (6379).
- **Q: What is `X-Data-Source`?** *A:* A response header tagging every payload as `db` or `demo` so
  the UI can show truthful live/demo/offline badges.

## 13.2 Intermediate

- **Q: How does the app run with no database?** *A:* The repository's `pick(live,demo)` tries Prisma
  and falls back to a bundled mock that mirrors the same filter/sort semantics; the frontend axios
  client falls back to its own mock on network failure. `DEMO_MODE=true` forces demo.
- **Q: Explain the auth flow.** *A:* bcrypt‑verified login issues a 15‑min access JWT + a 7‑day
  rotating refresh token (one‑time use, tracked by `jti`). Optional TOTP 2FA. Axios transparently
  refreshes on a 401 and retries. RBAC via `authenticate` + `requireMinLevel`/`requireRole`.
- **Q: Why a queue?** *A:* A cold satellite scan takes ~60 s; enqueuing returns a job id in ~0.1 s so
  the cron/API isn't blocked. A BullMQ worker executes with retries; direct fallback if Redis is down.

## 13.3 Advanced

- **Q: Walk through the six pipeline stages and where each is implemented.** *A:* DOWNLOAD
  (`satellite/download.py` + `band_loader`), FDI (`fdi_calculator`), CNN (`ml/inference_engine` via
  `batch_classifier`), DBSCAN (`hotspot/dbscan_clusterer`), DRIFT (`trajectory/lagrangian_model` +
  Open‑Meteo forcing), ALERT (severity threshold). Orchestrated in `main_pipeline.py` with per‑stage
  timings and a typed `PipelineResult`.
- **Q: How is the model swappable?** *A:* `model_loader` auto‑detects ONNX input shape — 4‑D →
  patch path, 2‑D → per‑pixel path — so a trained ResNet exported to `[N,6,64,64]` drops in with no
  code change; a heuristic is the no‑model fallback.
- **Q: How does honesty propagate?** *A:* Provenance flows from the pixel (`provider`, `source`, SCL
  %) through `PipelineResult` stage `detail`, into `meta`/`X-Data-Source`, up to the model card and
  UI badges; synthetic fallbacks are always labelled.

## 13.4 Staff / architecture / system design

- **Q: Where does this break at 100k→1M users, and how would you fix it?** *A:* (See Phase 17.5.)
  First: the single‑node engine + synchronous per‑request satellite fetch. Fix: pre‑ingest tiles
  into object storage, make the engine stateless behind a queue+autoscaler, cache FDI rasters,
  precompute region runs on the ~5‑day revisit cadence rather than on demand.
- **Q: What are the top risks to correctness/credibility?** *A:* The pseudo‑area heuristic summed
  into dashboards; heuristic confidence constants when no model is loaded; validation is
  benchmark‑internal (MARIDA/MADOS), not independent Indian‑Ocean field truth; Sea‑Foam precision is
  weak. All are documented, not hidden — which is itself a strength.
- **Q: How would you make the demo fallback safe for production?** *A:* `DATA_STRICT=1` to fail loud;
  persist refresh `jti`s in Redis/DB; wrap `persistRun` in a transaction; put write routes behind
  auth; rotate secrets out of `.env`.

## 13.5 Common interview mistakes to avoid

- Claiming it's "real‑time video from satellites" — it's near‑real‑time archive (~5‑day revisit).
- Saying the CNN is a ResNet — the default is an 11‑feature per‑pixel **MLP**; the patch CNN lost to
  it and is opt‑in.
- Calling the area a real measurement — it's a display heuristic.
- Forgetting the fallbacks are *labelled* — that honesty is the project's differentiator.

---

# Phase 14 — Refactoring

Per module: current design → problem → improved design → trade‑off.

| Module | Current | Problem | Improved | Trade‑off |
|---|---|---|---|---|
| **repo.ts `pick`** | live & demo impls hand‑written per function | can drift; masks real errors outside DATA_STRICT | extract shared filter/sort into pure helpers used by both paths; make DATA_STRICT the default in prod | more indirection |
| **persistRun** | sequential inserts | partial writes on failure; slower | wrap in `prisma.$transaction`; batch `createMany` | all‑or‑nothing (usually desirable) |
| **Refresh jti allow‑list** | in‑memory `Set` | restart logs everyone out; no multi‑instance | store in Redis/`RefreshToken` table | one more dependency in the hot path |
| **area_estimator** | FDI→km² heuristic summed into KPIs | ~1000× inflation; misleading if uncaveated | `area = pixel_count × (10m)²`; keep sub‑pixel fraction optional | smaller, less "impressive" numbers (but honest) |
| **inference heuristic constants** | arbitrary confidence formulas | not distinguishable from model confidence in tables | tag heuristic detections; grey them out; or require a model in prod | fewer results when no model |
| **write routes** | several public for demo UX | anyone can mutate domain data | `authenticate` + `requireMinLevel` on all writes | demo needs a token (already solved for pipeline) |
| **Engine layout drift** | comments reference old `app/ml/*` paths | onboarding confusion | one pass to fix stale docstrings/paths | pure churn, low risk |
| **Dead scaffold** | `database/mysql|mongo`, unrouted `pages/*` | noise, shadows the real stack | delete or move to `/_legacy` | lose historical reference |
| **Types duplication** | DTOs restated in TS (×2) + pydantic | manual sync | generate TS from pydantic/OpenAPI (or Prisma) | build‑time codegen step |

## 14.1 A cleaner target folder shape (illustrative)

```
backend/src/
  http/        routes + middleware (presentation)
  domain/      services (auth, pipeline, reports, operations)
  data/        repositories + prisma + mock (one live+demo pair per aggregate)
  infra/       env, queue, ws, engine-client, logger
  contracts/   generated DTOs (single source: prisma + openapi)
```

---

# Phase 15 — Learning Checkpoints

Because this is a document, "learning mode" is delivered as checkpoints (above) plus this
**self‑test**. If you can answer all of these, you understand the project well enough to maintain it.
Ask me to expand any file to true line‑by‑line depth.

1. Draw the three services and the five external/data dependencies from memory.
2. List the six pipeline stages and the file that implements each.
3. Explain `pick(live, demo)` and when each branch runs (including `DATA_STRICT`).
4. Trace a 401 through the axios interceptor to a successful retry.
5. Explain why hotspots use soft references from Operations.
6. Explain what makes a pixel a "candidate" and then a "Plastic detection".
7. Name three graceful‑degradation fallbacks and how each is labelled.
8. Explain the model‑swap mechanism (patch vs per‑pixel auto‑detection).
9. Give the single most misleading number in the UI and why (area).
10. Describe how you'd take this to production in one month (Phase 17.8).

---

# Phase 16 — Diagrams & Maps

## 16.1 Complete architecture

```
┌───────────────────────────── Browser (SPA) ─────────────────────────────┐
│ React 18 · Vite · Router · react-query · zustand · Leaflet · Recharts    │
│  pages ─ hooks(useApi/useLiveFeed) ─ lib/api(axios+mock) ─ authToken      │
└───────────────┬───────────────────────────────────────────┬─────────────┘
        /api (Vite proxy)                              ws /ws/live
┌───────────────▼───────────────────────────────────────────▼─────────────┐
│ Backend  Node/Express/TS  :3001                                          │
│ helmet·cors·json·rateLimit·X-Data-Source → routes → middleware(auth/err) │
│ services(auth,persist,report) → data/repo pick(live,demo) → lib(prisma,  │
│ queue,engine,live)                                                       │
└───────┬───────────────────────┬───────────────────────────┬─────────────┘
   Prisma│                 BullMQ│Redis :6379           fetch│ callEngine
┌────────▼────────┐      ┌───────▼────────┐         ┌────────▼──────────────┐
│ PostgreSQL 15   │      │ Worker (retries)│────────▶│ Python Engine :8000    │
│ 16 models       │      └────────────────┘  fetch  │ FastAPI · main_pipeline│
└─────────────────┘                                  │ satellite·ml·hotspot·  │
                                                     │ trajectory·analysis    │
                                                     └───────┬────────────────┘
                                            urllib/OAuth2/http│
                        ┌────────────────────┬────────────────┼───────────────┐
                   ┌────▼─────┐        ┌──────▼──────┐   ┌─────▼─────┐   ┌──────▼─────┐
                   │Earth     │        │CDSE Sentinel│   │Open-Meteo │   │Clay GPU    │
                   │Search    │        │Hub (pixels) │   │(forcing)  │   │sidecar     │
                   │STAC      │        └─────────────┘   └───────────┘   │(optional)  │
                   └──────────┘                                          └────────────┘
```

## 16.2 Feature map

```
Detect ─ AOI scan / region scan / scheduled sweep
Classify ─ FDI gate → ONNX MLP (11-feat) → [opt] Clay re-score → tiered CONFIRMED/POSSIBLE
Cluster ─ DBSCAN → Hotspots (HIGH/MED/LOW)
Forecast ─ 72h Lagrangian drift + cone + coast ETA + backtrack + landfall
Intelligence ─ Clay similarity (find-sites-like-this), fusion, temporal change, novelty
Act ─ Alerts (ack) → Operations (dispatch→track→mission report) → PDF/CSV/GeoJSON export
Learn ─ analyst labeling → training-set export → retrain (active learning)
Operate ─ auth/RBAC/2FA · dashboards · model card · admin panel · live WS
```

## 16.3 Dependency graph (source, high level)

```
frontend/pages → hooks → lib/api → (types) ; stores → lib/api ; components ← pages
backend/routes → middleware ; routes → data/repo → lib/prisma ; routes → services → lib
backend/routes(pipeline) → lib/engine → [HTTP] → engine/api → main_pipeline → {satellite,ml,hotspot,trajectory}
engine/main_pipeline → schemas ; ml/inference → model_loader → onnxruntime ; satellite/download → band_loader,cloud_masker,fdi
```

## 16.4 Learning roadmap (suggested reading order)

```
1. README.md + PROJECT_SUMMARY.md        (context)
2. main_pipeline.py                        (the heart)
3. satellite/download.py + fdi_calculator  (ingest + physics)
4. ml/inference_engine + model_loader      (classification)
5. hotspot/dbscan_clusterer                (clustering)
6. backend/index.ts + routes/index.ts      (API shape)
7. data/repo.ts + lib/dataMode.ts          (live↔demo)
8. routes/pipeline.routes.ts + services/pipelinePersist  (the bridge)
9. middleware/auth.ts + services/auth.service (security)
10. frontend App.tsx + lib/api.ts + hooks/useApi (UI wiring)
11. prisma/schema.prisma                   (data model)
12. TECHNICAL_AUDIT.md                      (what's real vs simulated)
```

---

# Phase 17 — Weakness Analysis, Scores & Verdict

A staff‑engineer production‑readiness review. Every claim below is grounded in the code read above
and cross‑checked against the project's own `TECHNICAL_AUDIT.md`.

## 17.1 Current limitations (by module)

- **Satellite ingest** — synchronous per‑request fetch (OAuth + Process API + STAC) makes a cold AOI
  scan ~60 s; no local imagery archive; at scale this is the first bottleneck.
- **Classifier** — default is a per‑pixel MLP trained on MARIDA+MADOS; **validation is
  benchmark‑internal**, not an independent Indian‑Ocean field campaign. Sea‑Foam precision is weak
  (~0.02–0.6 depending on split). Heuristic fallback uses arbitrary confidence constants.
- **Area** — `areaSqKm` is a display heuristic (~1000× a true pixel area); it is summed into KPIs and
  should not be treated as a measurement.
- **Drift** — release‑point time‑series forcing, not a gridded field sampled along the path; coast
  ETA is a crude longitude‑crossing check.
- **Repo `pick`** — live/demo can drift; outside `DATA_STRICT` real query errors are masked as demo.
- **Auth** — refresh `jti` allow‑list is in memory (restart logs everyone out; no multi‑instance);
  several write routes are public for demo UX.
- **Persistence** — `persistRun` is not transactional (partial writes possible).
- **Tests** — minimal (`test_core.py` on the engine; vitest/jest configured but few tests).
- **Deployment** — no IaC; portable single‑node dev infra; secrets in `.env`.

**Scaling assumptions the code makes:** one engine instance, one backend instance, on‑demand
compute, a DB that fits headline aggregates cheaply, Redis reachable on localhost. All fine for a
pilot; none true at 100k+ users.

## 17.2 Engineering weaknesses (best‑practice audit)

| Category | Finding |
|---|---|
| Duplicate code | DTOs restated in TS×2 + pydantic; live/demo pairs duplicated |
| Dead code | `database/mysql|mongo`, unrouted legacy `pages/*` |
| Tight coupling | frontend mock mirrors backend mock mirrors seed — three copies to keep in sync |
| Magic numbers | FDI 0.02, DBSCAN 0.09°/3, windage 1.5–3%, heuristic confidence constants (some env‑tunable, some hardcoded) |
| Error handling | demo fallback can swallow real errors (mitigated by `DATA_STRICT`) |
| Testing | near‑zero automated coverage on the money paths (auth, persist, pipeline) |
| Docs vs code | stale path references (`app/ml/*`) after the engine consolidation |
| Blocking ops | synchronous satellite fetch on the request path (mitigated by the queue for scheduled runs) |

**Strengths that offset these:** fully typed end‑to‑end; consistent response envelope; genuine
graceful degradation; **honest labeling of every fallback**; real physics (FDI/Biermann), real
imagery, real masking, real ML inference, real drift forcing; a swappable‑model contract; a clean
layered backend; code‑split frontend.

## 17.3 Security audit

| Issue | Severity | Scenario | Fix |
|---|---|---|---|
| Public domain **write** routes (some) | **High** | anonymous user mutates alerts/data | `authenticate` + `requireMinLevel` on all writes |
| Dev JWT secrets as defaults | **High** | if shipped, tokens forgeable | require `JWT_SECRET`/`JWT_REFRESH_SECRET` in prod; fail boot if default (`usingDefaultSecret` flag already exists) |
| Secrets in `.env` (CDSE creds appeared in chat) | **High** | credential leak | rotate keys; use a secret manager; never commit `.env` |
| Scheduler endpoint open by default | **Medium** | anyone triggers expensive scans | set `SCHEDULER_TOKEN` (already supported) |
| Redis/Postgres unauthenticated on localhost | **Medium** | lateral movement on shared host | bind to localhost only / add auth in prod |
| Refresh tokens in memory | **Medium** | no revocation across instances; restart logout | Redis/DB‑backed `jti` store |
| Rate limit is global, not per‑route | **Low** | auth brute force within global budget | stricter limiter on `/auth/login` |
| No CSRF tokens | **Low** | JWT in header (not cookie) largely mitigates | keep tokens out of cookies; or add CSRF if cookie‑based |

**Positives:** bcrypt(12), TOTP 2FA, rotating one‑time refresh, server‑side RBAC, helmet, CORS
allow‑list, rate limiting, SHA‑256 API‑key hashing, no raw SQL string interpolation (Prisma
parameterizes; the one `$queryRaw` uses tagged‑template parameters, not concatenation → **no SQL
injection**). No obvious XSS sink (React escapes; no `dangerouslySetInnerHTML` on user data seen).

## 17.4 Performance review

| Issue | Current | Optimized | Expected gain |
|---|---|---|---|
| Cold AOI scan ~60 s | synchronous OAuth+fetch+STAC per request | token cache + pre‑ingested tiles + FDI raster cache | 60 s → seconds |
| `getOverview` | 11 parallel queries (already good) | materialized view / cached counters at 1M rows | flat latency at scale |
| `persistRun` | row‑by‑row inserts | `createMany` + transaction | fewer round‑trips |
| Frontend bundle | code‑split, ~86 kB main | already good | — |
| Drift forcing | 1 h TTL cache per 0.1° cell (good) | precompute per region | fewer API calls |
| No N+1 seen | Prisma `include`/`_count` used correctly | — | — |

## 17.5 Scalability review

| Users | First thing to fail | Company‑grade fix |
|---|---|---|
| 100 | nothing (pilot fits) | — |
| 10k | single engine instance under concurrent scans | stateless engine behind the queue + horizontal autoscale |
| 100k | on‑demand satellite fetch + single Postgres | pre‑ingest tiles to object storage (S3), read replicas, cache layer (Redis) for aggregates |
| 1M | synchronous request path, single‑node infra, in‑memory refresh store | event‑driven ingest pipeline (precompute on the ~5‑day revisit), CDN for tiles/rasters, sharded/partitioned detections table by region+time, Redis‑backed sessions, Kubernetes + IaC, observability (metrics/traces/logs), object‑storage model registry |

How Google/Amazon/Netflix would redesign the hot parts: **decouple ingest from serving** — a
streaming pipeline pre‑processes new Sentinel‑2 passes into detection tiles in object storage; the
API just serves precomputed results (sub‑100 ms), and on‑demand AOI scans hit a warm tile cache
rather than the satellite API. The stateless API + queue already point in this direction.

## 17.6 Code‑quality scores (1–10, per concern)

| Concern | Score | Rationale |
|---|---|---|
| Readability | 8 | clear names, docstrings, honest comments |
| Maintainability | 7 | layered, typed; some duplication + stale docs |
| Scalability | 6 | stateless API + queue path exists; single‑node today |
| Performance | 7 | fine for pilot; cold scan is the weak spot |
| Security | 5 | strong auth primitives; public writes + dev secrets + open scheduler |
| Reliability | 7 | graceful degradation everywhere; few tests |
| Testability | 4 | wired but near‑zero coverage on money paths |
| Modularity | 8 | clean package boundaries in all three services |
| Documentation | 8 | unusually rich (SUMMARY + AUDIT + this) |
| Scientific integrity | 7 | real physics + honest labeling; area heuristic + internal‑only validation cap it |

## 17.7 Improvement roadmap (prioritized)

**Immediate (High):**
1. Put all domain **write** routes behind `authenticate` (+ level). *Impact: high · Effort: easy · Risk if skipped: data tampering.*
2. Rotate leaked credentials; require non‑default JWT secrets in prod (fail boot otherwise). *High · Easy · Critical.*
3. Fix the **area** number (real pixel area or clear "indicative" everywhere it's summed). *High · Easy · Credibility.*
4. `DATA_STRICT=1` in any non‑demo deployment. *High · Trivial.*

**Short term (Medium):**
5. Redis/DB‑backed refresh `jti` store; wrap `persistRun` in a transaction. *Reliability.*
6. Tests on auth, `pick`, `persistRun`, and the pipeline shape (jest/vitest/pytest are configured). *Confidence.*
7. Set `SCHEDULER_TOKEN`; stricter `/auth/login` rate limit. *Security.*
8. Delete dead scaffold; fix stale `app/ml/*` doc paths. *DX.*

**Long term (Hard):**
9. Independent Indian‑Ocean scene validation with a published confusion matrix (the biggest science
   lever). *Peer‑review credibility.*
10. Decouple ingest from serving (precomputed tiles in object storage); autoscale the engine.
11. Cloud deployment + IaC + observability + secret manager.
12. Add B02/B03 bands → NDWI/FAI/turbidity features (kills the monsoon false‑positive class);
   Sentinel‑1 SAR ingest for cloud‑independent + oil‑spill; gridded CMEMS/ERA5 drift.

## 17.8 If you had one month

- **Week 1:** security hardening (writes behind auth, secrets, DATA_STRICT, scheduler token) + fix
  the area number. These are cheap and remove the worst credibility/security risks.
- **Week 2:** tests on the money paths + `persistRun` transaction + Redis‑backed refresh store.
- **Week 3–4:** independent‑scene validation (publish a real confusion matrix) and a real cloud
  deployment (managed Postgres + Redis, engine autoscaled behind the queue, object‑storage model
  registry). This turns "impressive pilot" into "defensible system".

## 17.9 If it were mine, redesigned from scratch (same functionality)

Keep: the three‑service split, the typed contract, the graceful‑degradation *and honesty* spine,
FDI/DBSCAN/drift physics, the swappable ONNX model, BullMQ decoupling. Change: (1) **precompute**
detections from a streaming ingest pipeline into object‑storage tiles; the API serves precomputed
results and only AOI scans go live against a warm cache. (2) **One contract source** — generate TS +
pydantic from a single schema (Prisma/OpenAPI) to kill the triple DTO duplication. (3) **Stateless
auth** with Redis‑backed sessions. (4) **Transactions + tests** on all writes. (5) **Config/secrets**
via a manager, `DATA_STRICT` default in prod. The science stays; the *plumbing* becomes horizontally
scalable and independently verifiable.

## Final Expert Verdict

| Rating | Score |
|---|---|
| Overall Architecture | **7.5 / 10** |
| Production Readiness | **6 / 10** |
| Code Quality | **7 / 10** |
| Scalability | **6 / 10** |
| Security | **5 / 10** |
| Maintainability | **7 / 10** |
| Scientific Credibility | **6.5 / 10** |

**1. Would I approve this for production?** *Not yet — but it's unusually close for a final‑year
project.* It runs end‑to‑end on real data with real algorithms and degrades gracefully. Blockers are
operational, not conceptual: public write routes, dev/leaked secrets, an open scheduler, the area
pseudo‑quantity summed into KPIs, near‑zero tests, and no real deployment. Fix the Week‑1/Week‑2
items and it becomes a credible pilot deployment; add independent‑scene validation and it approaches
research grade. **As a *pilot / decision‑support demonstrator* — which is exactly how it markets
itself — it is approvable today.**

**2. Top 10 weaknesses:** (1) public domain write routes; (2) dev JWT secrets + leaked `.env` creds;
(3) area pseudo‑quantity in dashboards; (4) validation is benchmark‑internal only; (5) near‑zero
automated tests; (6) in‑memory refresh store; (7) synchronous per‑request satellite fetch; (8)
non‑transactional persistence; (9) demo fallback can mask real errors; (10) triple DTO duplication +
stale docs.

**3. Top 10 strengths:** (1) genuine end‑to‑end real‑data pipeline (CDSE pixels → FDI → ONNX MLP →
DBSCAN → real drift forcing); (2) **honest labeling of every fallback** (rare and valuable); (3)
typed contract across three services; (4) graceful degradation everywhere → ₹0, no hard deps; (5)
real peer‑reviewed physics (Biermann FDI); (6) swappable ONNX model contract; (7) real auth (JWT +
rotating refresh + bcrypt + TOTP + server‑side RBAC); (8) queue‑decoupled, WS‑pushed real‑time; (9)
clean layered/repository architecture; (10) unusually thorough self‑documentation and self‑audit.

**4. First, second, third in a month:** first, **security + integrity** (auth on writes, secrets,
area fix, DATA_STRICT); second, **reliability** (tests + transaction + Redis refresh store); third,
**credibility + deployment** (independent‑scene validation + real cloud deploy).

**5. Redesign in one line:** keep the science and the honesty; move from on‑demand single‑node
compute to a precompute‑and‑serve, stateless, horizontally‑scalable, single‑contract, tested
platform — and validate the model on an independent scene so the numbers are defensible, not just
reproducible.

---

*Reverse‑engineered from direct source inspection of the `main` branch. This guide pairs with the
project's own [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) (status) and [TECHNICAL_AUDIT.md](TECHNICAL_AUDIT.md)
(what's real vs simulated). Ask to "go deeper on <file>" for true line‑by‑line coverage of any
single file, or "quiz me on <phase>" to drill the checkpoints.*

