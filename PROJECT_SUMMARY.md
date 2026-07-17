# Marine Plastic Tracker
### Complete Project Summary & Status

> A full‑stack Final Year Project that turns **free Sentinel‑2 satellite imagery** into
> **marine‑plastic detections** and **72‑hour drift forecasts** for the Indian Ocean —
> designed for INCOIS, NCCR, and the Indian Coast Guard, and engineered to run at **₹0**
> on free tiers.

**Honest positioning:** this is a decision‑support **pilot**. It *complements* — and never
claims to replace — patrols, drones, and field verification. Optical satellites revisit every
~5 days at 10 m resolution and cannot see through cloud or at night. Every number is traceable
to its source pixel and model score.

---

## Table of Contents
1. [System Architecture](#1-system-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Design System](#3-design-system)
4. [Phase Status](#4-phase-status)
5. [Backend API (Node/Express)](#5-backend-api-nodeexpress)
6. [Python Detection Engine (FastAPI)](#6-python-detection-engine-fastapi)
7. [Satellite Data & Pixel Ingest](#7-satellite-data--pixel-ingest)
8. [Machine Learning (CNN)](#8-machine-learning-cnn)
9. [Frontend (React)](#9-frontend-react)
10. [Authentication, RBAC & 2FA](#10-authentication-rbac--2fa)
11. [Data Model (Prisma)](#11-data-model-prisma)
12. [Demo Mode & Graceful Fallbacks](#12-demo-mode--graceful-fallbacks)
13. [Scientific Specification](#13-scientific-specification)
14. [How to Run](#14-how-to-run)
15. [Environment Variables](#15-environment-variables)
16. [Live‑Readiness Matrix](#16-live-readiness-matrix)
17. [Verification Status](#17-verification-status)
18. [Roadmap / Remaining Work](#18-roadmap--remaining-work)

---

## 1. System Architecture

Three cooperating services, each independently runnable, with a queue and external scheduler
for production. **The architecture is fixed** (no MySQL, no MongoDB, no in‑process scheduler).

```
                         ┌────────────────────────┐
                         │  Frontend (React/Vite) │  :5173
                         │  routed SPA + Leaflet  │
                         └───────────┬────────────┘
                                     │ /api  (Vite proxy)
                         ┌───────────▼────────────┐
                         │  Backend (Node/Express)│  :3001
                         │  REST API + JWT + RBAC │
                         └─────┬──────────────┬───┘
                    Prisma     │              │  HTTP (fetch)
                  ┌────────────▼───┐   ┌──────▼───────────────┐
                  │ PostgreSQL 15  │   │ Python Engine        │  :8000
                  │ + PostGIS 3.3  │   │ FastAPI: FDI→CNN→    │
                  └────────────────┘   │ DBSCAN→drift        │
                                       └──────┬───────────────┘
                         BullMQ/Redis (queue) │  STAC / Sentinel Hub
                                       ┌──────▼───────────────┐
                                       │ Sentinel‑2 (free)     │
                                       │ AWS Open Data / CDSE  │
                                       └──────────────────────┘
```

| Concern | Decision |
|---|---|
| Database | **PostgreSQL 15 + PostGIS 3.3** (single DB), Prisma ORM |
| Queue | **BullMQ + Redis 7** (Node → Python decoupled; no blocking HTTP) |
| Scheduler | **External** (GitHub Actions cron / cron‑job.org) — no in‑process APScheduler |
| Storage | **Local disk** (pilot) with an S3‑compatible interface for later swap |
| Backend | Node.js 20 + Express + TypeScript, **:3001**, CommonJS, relative imports |
| Python engine | FastAPI + uvicorn, **:8000** |
| Frontend | React 18 + Vite 5 + TypeScript, **:5173**, `@/*` path alias |

---

## 2. Technology Stack

**Backend** — Express 4, Prisma 5, `jsonwebtoken`, `bcrypt`, `otplib`, `qrcode`, `helmet`,
`express-rate-limit`, `zod`, Node global `fetch`. Zero‑dependency `.env` loader (no `dotenv`).

**Python engine** — FastAPI, uvicorn, pydantic 2. **Algorithms are pure Python** (stdlib) so
the engine runs with no heavy deps. Optional add‑ons:
- `requirements-ingest.txt` → `numpy`, `tifffile` (real pixel ingest, no GDAL/rasterio)
- `requirements-ml.txt` → `onnxruntime`, `numpy`, `onnx` (CNN inference + training/export)

**Frontend** — React 18, Vite 5, TailwindCSS 3, React Router 6, `@tanstack/react-query`,
`axios`, `zustand`, `framer-motion`, `recharts`, `leaflet` + `react-leaflet`,
`react-hot-toast`, `lucide-react`.

---

## 3. Design System

Light **"pisces turquoise" ocean** theme (retheme from an earlier cyan palette).

**Typography** (changed from the earlier Orbitron/Inter for a less generic look):
- **Space Grotesk** — display / headings (`font-display`)
- **IBM Plex Sans** — body (default)
- **IBM Plex Mono** — data / metrics (`font-mono`)

**Ocean color scale (turquoise):**

| Token | Hex | Use |
|---|---|---|
| ocean‑950 | `#134E4A` | deep sea teal |
| ocean‑800 | `#115E59` | darkest turquoise |
| ocean‑700 | `#0F766E` | dark turquoise |
| **ocean‑600** | **`#0D9488`** | **primary** |
| ocean‑500 | `#14B8A6` | vivid teal |
| ocean‑400 | `#2DD4BF` | bright Tiffany turquoise |
| ocean‑300 | `#5EEAD4` | light aqua |
| ocean‑100 | `#CCFBF1` | mint foam |
| ocean‑50 | `#F0FDFA` | pale foam |

Status: success `#10B981`, danger `#EF4444`, warn `#F59E0B`, purple `#8B5CF6`. A `sky` family
(`#0891B2`/`#22D3EE`) is kept as a cyan "sparkle" accent.

**Component library (~17 UI components)** in `frontend/src/components/ui/`: Button, Card, Badge,
Modal, Table, StatCard, ChartCard, Tabs, Input, Select, Skeleton, EmptyState, PageHeader,
RoleBadge, SeverityPill, Toast. Plus effects (`WaveBackground`, `ParticleField`) and a Leaflet
`MapContainer`. Utilities: glassmorphism (`.glass`), 3px accent bar (`.card-accent`),
`.text-gradient`, `.section-dark`.

---

## 4. Phase Status

| Phase | Status | Summary |
|---|---|---|
| **0 — Scaffold** | ✅ | Monorepo, docker‑compose, design system, full component library |
| **1 — Data model** | ✅ | Prisma schema (12 models) + seed (5 regions, 7 users, detections, hotspots, trajectory, alerts, model version) |
| **3 — Domain API + routed frontend** | ✅ | REST API + connected multi‑page SPA (built before Phase 2). Runs with **no database** via demo fallback |
| **2 — Auth** | ✅ | Real JWT + RBAC + TOTP 2FA (works in demo & DB modes) |
| **4 — Detection engine** | ✅ | FDI → CNN → DBSCAN → drift; real STAC scene discovery; real pixel ingest; ONNX CNN (per‑pixel + patch) with trained baselines |

*(Phases 3 and 2 were intentionally built out of numeric order.)*

---

## 4a. Recent Advances — GPU Training, Foundation Model & Field Ops (July 2026)

This block supersedes the older figures further down where they conflict; those sections
are kept for architectural context but the numbers here are current.

### RBAC reduced to 3 operational roles
Trimmed from 7 roles to the three that matter for the mission: **ADMIN (L3), COASTGUARD (L2),
FIELD (L1)**. Ministry / Researcher / NGO / Public were removed everywhere (Prisma enum, backend
types, seed, frontend). Registration now defaults to FIELD. (§10's 7‑role table is historical.)

### Field Operations + Report Export (the "detected → acted" bridge)
- **Field Operations** (`/app/operations`) — dispatch → track → mission‑report workflow.
  New Prisma models `Operation` / `OperationEvent` (append‑only timeline) / `MissionReport`;
  `hotspotId`/`detectionId` are **soft string refs** (not FKs — hotspots are recomputed each
  run, so a cascade FK would delete completed ops). REST `/api/operations` (public reads;
  create/status/report require auth ≥ FIELD). Sequential codes `OP‑YYYY‑NNNN`.
- **Report Export** — server‑side real PDFs (`pdfkit`) + RFC‑4180 CSV: `/api/export/detections.csv`,
  `/hotspots.pdf`, `/operations/:id.pdf` (hotspot report + operation dossier with an honest
  advisory footer).

### Codebase cleanup + engine consolidation
- Deleted **166 dead scaffold files** (an abandoned plain‑JS/MySQL/Mongo MVC that shadowed the
  real TS/Prisma + `.tsx` stack).
- Merged the two Python engines into a single **`python_engine/`** (flat‑package domain layout:
  `api/ satellite/ ml/ hotspot/ trajectory/ scheduler/`). Run: `python -m uvicorn api.app:app --port 8000`.
  All ML paths below are now `python_engine/ml/…` (older sections may say `app/ml/…`).

### GPU training rig
`Python 3.14` has no PyTorch wheels, so training runs in a dedicated **conda env `mpt-train`
(Python 3.12 + PyTorch 2.6.0+cu124)** on an **NVIDIA RTX 4050 Laptop (6 GB, Ada)**. Pattern:
**train on GPU → export ONNX → the engine runs it via onnxruntime** (no torch at runtime).

### ⭐ The default per‑pixel model was retrained on GPU — a big, honest jump
The shipped `marinenet.onnx` is now a **GPU‑trained 11‑feature MLP** (adds 4 engineered spectral
indices — PI, MNDWI, red‑edge NDVI, brightness — derived from the *same 5 bands*, so **zero extra
data**). Trained with mini‑batch AdamW, dropout, calibrated (sqrt‑inverse‑freq) class weights,
label smoothing, and validation‑based early stopping. Head‑to‑head on the **identical 499,907‑pixel
held‑out MARIDA+MADOS test**:

| Model | Accuracy | Macro‑F1 | Plastic F1 | Sea‑Foam precision |
|---|---|---|---|---|
| old CPU MLP (previous default) | 0.895 | 0.500 | 0.508 | **0.016** |
| **GPU MLP (current default)** | **0.989** | **0.787** | **0.749** | **0.609** |

Macro‑F1 **+0.287**, and the old model's catastrophic false‑Sea‑Foam flood (1.6% precision →
61%) is fixed. The deployed engine feed was verified to reproduce **exactly 0.9886 / 0.7871** on
real pixels (training and inference feed byte‑identical features). Previous model kept as
`marinenet_prev.onnx`; a pure‑7‑feature drop‑in alternative as `marinenet_pp7.onnx`.

### Patch CNN — an honest negative result (kept opt‑in)
A from‑scratch GPU ResNet on 64×64 patches was trained and **loses** to the per‑pixel model on
identical held‑out data (macro‑F1 **0.555 vs 0.787**): spatial texture overfits the few hundred
distinct Sentinel‑2 scenes, while the per‑pixel spectral signature generalizes. It stays opt‑in
via `CNN_MODEL_PATH`, never the default. (This is a legitimate, defensible finding, not a failure.)

### ⭐ Clay foundation model — the genuine next tier (opt‑in second stage)
Integrated the **Clay v1.5** geospatial foundation model (632M‑param ViT, pretrained self‑supervised
on millions of scenes; Apache‑2.0). Strategy is **additive, not a replacement**: the fast 11‑feature
MLP stays the first‑pass detector; Clay is a **second‑stage re‑scorer + embedding layer**. Clay runs
only on candidate chips and embeddings are cached, so the live UX is unaffected (backbone runs
offline in the GPU env, not in the ₹0 engine). GPU‑verified on the 4050: **1024‑d embedding,
~36 ms/chip, 2.74 GB VRAM**.

A small head (frozen Clay + `1024→256→4`) was trained on cached embeddings. On **identical held‑out
chips** it demonstrates the hierarchy cleanly:

```
from‑scratch CNN     0.555   (overfits scenes)
deployed MLP         0.690   (on the same chip centres)
Clay head            0.711   ← WINS (+0.020)
```

And the payoff it was chosen for — **generalization to seas it never saw** (Durban + Marmara holdout):
Clay debris **recall 0.542 vs the MLP's 0.222 (2.4×)**. A threshold sweep (selected on validation)
gives tiered operating points that map onto the platform's alert severities:

| Operating point | Debris recall (new seas) | Water false alarms |
|---|---|---|
| Clay τ=0.35 — *wide net* | 0.609 | 8.9% |
| Clay τ=0.55 — *precise* | 0.422 | 4.6% |
| deployed MLP (reference) | 0.222 | 0.4% |

Clay owns the mid‑recall regime; the MLP owns the ultra‑low‑false‑alarm regime → they compose as a
**tiered detector** ("CONFIRMED" from the MLP, "POSSIBLE" from Clay).

### Real training datasets downloaded (into `data/`, gitignored)
- **RefinedFloatingObjects** (11.1 GB, Rußwurm et al. 2023) — 6 global scenes of floating debris,
  added scene diversity for the Clay head + an MLP experiment.
- **PLP 2021/2022** (Plastic Litter Project, Aegean) — Sentinel‑2 + **target shapefiles** giving
  the exact locations of *deployed known plastic targets*.
- **Durban** — an annotated real plastic‑event scene.

### Independent validation on known plastic targets (PLP 2021)
Validated the deployed model against PLP's surveyed ~28 m HDPE target across 21 dates (zero training
overlap): the **FDI gate flags the target on 76% of dates** (misses are dates the log marks the target
"underwater"), with an **~0.0% false‑alarm rate over clean open water**. The examiner‑grade headline:
*validated against ground‑truth deployed plastic, not just an internal test split.*

### Embedding‑powered features (new engine endpoints)
Clay's 1024‑d fingerprints power four features via a **pure‑numpy** similarity index
(`ml/clay_index.py`, `models/clay_index.npz`, 27,231 labelled sites) — so the ₹0 engine *searches*
without torch (only *generating* an embedding needs the GPU):

| Feature | What it does | Measured result |
|---|---|---|
| **Find sites like this** | nearest known sites to a hotspot's fingerprint | live (`/similarity/demo`, `/similarity/search`) |
| **Retrieval classifier** | label by neighbour vote, **no trained head** | **0.73 acc / 0.66 macro‑F1** |
| **Few‑shot** | learn a class from N examples (nearest‑centroid) | 0.47 → 0.56 macro‑F1 (5 → 100 shots) |
| **Novelty / anomaly** | flag out‑of‑distribution sites | new seas 0.150 > in‑distribution 0.123 |

New engine endpoints: `GET /similarity/info`, `GET /similarity/demo`, `POST /similarity/search`.
Embeddings are **mean‑centred** before cosine search (Clay's raw tokens are anisotropic).

### ⭐ Coastal‑Intelligence upgrades (Jul 2026) — per‑hotspot similarity, fusion, change, active learning

Four additive features built on the embedding + fusion + change + active‑learning spine. All verified
end‑to‑end (engine unit checks + live backend RBAC smoke; frontend & backend `tsc` clean):

| Feature | What it does | Where |
|---|---|---|
| **Per‑hotspot similarity** (true) | pipeline spools a 64×64×5 chip per hotspot → GPU node (`ml/embed_hotspots.py`) embeds it → engine serves the site's *own* nearest neighbours; falls back to by‑class while "pending" | `ml/embedding_spool.py`, `ml/hotspot_embeddings.py`, `GET /similarity/hotspot?key=` |
| **MLP + Clay confidence fusion** | collapses both models into **High/Medium/Low** (agree+confident→High; disagree or novel→Low), with reasons | `ml/confidence_fusion.py`, folded into `/similarity/hotspot` |
| **Temporal change** | compares a site's fingerprints across dates (centred‑cosine drift + Plastic‑affinity trend) → intensifying / clearing / shifted / stable, no re‑download | `ml/site_change.py`, `GET /similarity/change?key=` |
| **Analyst labeling → active learning** | Coast Guard/Admin **Confirm plastic / False alarm** buttons; verdicts stamp `validatedBy/At` and export as a CSV training set | `POST /api/detections/:id/label` (auth, level ≥ COASTGUARD), `GET /api/detections/labels/export?format=csv` |

Architecture: the engine stays **torch‑free** — chips are embedded in a batch step on the GPU node and
served online over a prebuilt store (`models/hotspot_embeddings.npz`), keyed by a stable `region:lat,lon`
site key so re‑scans resolve and time‑series accumulate. Each hotspot now carries an `embedKey`. Backend
proxies: `/api/engine/similarity/{hotspot,change}`. Frontend: the Map "Similar sites" drawer shows true
neighbours + fusion badge + change trend; the Detections page gains validation buttons + a labeled‑set
export (both role‑gated).

**Next frontier → full Coastal Intelligence Platform:** reuse this spine to add **oil‑spill**, **algal‑
bloom**, and **coastal‑flood** heads (new labelled set + small head per hazard, not a rebuild).

---

## 5. Backend API (Node/Express)

Base URL `http://localhost:3001`. All responses use `{ data, meta? }`; errors use
`{ error: { status, message, details? } }`. Every response carries an `X-Data-Source: db|demo`
header. Rate‑limited (300 req / 15 min), `helmet`, CORS.

### Auth (`/api/auth`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/register` | create account → JWT pair |
| POST | `/login` | credentials → JWT pair (handles `needsTotp`) |
| POST | `/refresh` | rotating refresh (one‑time; reuse → 401) |
| POST | `/logout` | revoke refresh token |
| GET | `/me` | current user (Bearer) |
| GET | `/users` | **RBAC demo** — admin only (level 7) |
| POST | `/2fa/setup · /enable · /disable` | TOTP setup (QR + secret) / verify / disable |

### Domain
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/stats/overview` | headline KPIs |
| GET | `/api/stats/trend?days=30` | daily detection time series |
| GET | `/api/stats/by-region` · `/by-class` | grouped counts |
| GET | `/api/detections?region=&status=&classification=&minConfidence=&limit=&offset=` | filtered list |
| GET | `/api/detections/:id` | one detection |
| GET | `/api/hotspots?region=&severity=&active=` · `/:id` | clusters (+ trajectory) |
| GET | `/api/regions` · `/:code` | monitored zones |
| GET | `/api/alerts?acked=&severity=&type=` | alerts |
| PATCH | `/api/alerts/:id/ack` | acknowledge |
| GET | `/api/satellite/status` | provider config + latest scene (real STAC when live) |
| GET | `/api/satellite/scenes?region=` or `?bbox=w,s,e,n` | recent Sentinel‑2 scenes (proxies engine → real STAC; bbox = user‑drawn AOI) |
| POST | `/api/pipeline/run` | run the pipeline; body `{region}` or `{bbox}` for a live AOI run. **Results persist to PostgreSQL** (detections, hotspots, trajectories, alerts, pipeline log) — `meta.persisted` reports counts |
| GET/POST | `/api/pipeline/scheduled-run` | external‑scheduler entry point (cron‑job.org / GitHub Actions / Task Scheduler): one engine run **per region**, all persisted with region tags. Optional `SCHEDULER_TOKEN` guard |
| GET | `/api/pipeline/status` | engine reachability + model status |

**Key backend design**
- `lib/env.ts` — zero‑dependency `.env` parser (reads `backend/.env` + repo root `.env`).
- `lib/prisma.ts` — Prisma singleton; `lib/dataMode.ts` — DB health probe + `isDemo()`.
- `data/repo.ts` — every query runs `pick(live, demo)`: tries Prisma, **falls back to the bundled
  demo dataset** on failure or when `DEMO_MODE=true`.
- `middleware/auth.ts` — `authenticate`, `requireMinLevel`, `requireRole`.
- `middleware/errorHandler.ts` — `ApiError`, `asyncHandler`, `notFoundHandler`, `errorHandler`.

---

## 6. Python Detection Engine (FastAPI)

Base URL `http://localhost:8000`. Six timed pipeline stages, each stage inspectable.

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness + config (demo_mode, model_loaded, provider) + model card |
| `GET /model/info` | active classifier + held‑out evaluation metrics (`metrics.json`) |
| `POST /pipeline/run` | full pipeline → detections / hotspots / trajectories / stats. Body `{region}` **or `{bbox}`** — a bbox runs a **live AOI** (`run_aoi`) with a real Sentinel‑2 `scene` attached |
| `GET /pipeline/last` | cached last result |
| `POST /compute/fdi` | FDI for one pixel's bands |
| `POST /compute/drift` | 72‑h drift forecast from a start point |
| `GET /satellite/scenes?region=&days=` or `?bbox=w,s,e,n` | real STAC scene discovery (region cached 10 min; bbox = user‑drawn AOI, keyless) |

### Pipeline stages (`app/pipeline/`)
1. **DOWNLOAD** — real Sentinel Hub pixels when configured, else synthetic scene (`scene.py`, `ingest.py`)
2. **FDI** — `fdi.py`, Biermann Floating Debris Index
3. **CNN** — `classifier.py`, ONNX model (patch or per‑pixel) or heuristic fallback
4. **DBSCAN** — `clustering.py`, from‑scratch DBSCAN (eps 0.09°, min 3) → hotspots
5. **DRIFT** — `drift.py`, Lagrangian ensemble → mean path + uncertainty cone + coast ETA
6. **ALERT** — HIGH/MEDIUM hotspots → alert count

`runner.py` orchestrates and returns a fully‑typed `PipelineResult` (pydantic, serialized as
**camelCase** to match the frontend). Algorithms are **pure Python** — the engine runs at ₹0
with only `fastapi`/`uvicorn`/`pydantic`.

---

## 7. Satellite Data & Pixel Ingest

**Correction baked in:** the old "Copernicus Open Access Hub / SciHub" was **retired in 2023**.
The current free source is the **Copernicus Data Space Ecosystem (CDSE)**.

**Two real data paths (both wired, with fallbacks):**

1. **Scene discovery — `app/satellite/stac.py`** (Element84 Earth Search, AWS Open Data).
   - **No API key, stdlib `urllib` only.** Returns real Sentinel‑2 L2A scene metadata (ID, date,
     cloud %, MGRS tile) over a region's bounding box.
   - **Verified live** — e.g. real S2C/S2B scenes + tiles (43QCA over Mumbai, 43PCS over Goa).
   - Enable with `SATELLITE_PROVIDER=aws-stac`.

2. **Pixel ingest — `app/satellite/sentinelhub.py`** (Sentinel Hub Process API, CDSE).
   - OAuth2 client‑credentials token → one request returns bands `[B04,B06,B08,B8A,B11]` as a
     float32 GeoTIFF, decoded with **`tifffile` + `numpy` (no GDAL/rasterio)**.
   - `ingest.py` runs vectorized FDI, extracts candidate pixels (with grid row/col) and a
     `(H,W,6)` [5 bands + FDI] array for patch extraction.
   - Enable with `SATELLITE_PROVIDER=sentinelhub|cdse` + `SENTINEL_HUB_CLIENT_ID/SECRET`
     (free, no card, at dataspace.copernicus.eu → Sentinel Hub → OAuth clients).

**Honest note:** scene discovery is fully live now; pixel ingest is code‑complete and unit‑verified
against a mocked band array — only the credentialed network call is untested (needs free SH keys).

---

## 8. Machine Learning (CNN)

> **⚠️ Current numbers live in [§4a](#4a-recent-advances--gpu-training-foundation-model--field-ops-july-2026).**
> The default per‑pixel model was retrained on GPU (macro‑F1 **0.500 → 0.787**, Sea‑Foam precision
> **0.016 → 0.61**) and a **Clay foundation‑model** second stage was added. The figures in this
> section describe the earlier CPU‑trained baseline and are kept for context.

`python_engine/ml/` — a pluggable ONNX classifier with an interpretable heuristic fallback. The
engine **auto‑detects** the model type from the ONNX input shape.

| File | Role |
|---|---|
| `dataset.py` | **Shared synthetic spectral library** — 9 endmembers across 4 classes, within‑class mixing, sun‑glint, coastal turbidity, sensor noise; per‑pixel + patch generators + eval helpers (confusion, P/R/F1) + `metrics.json` writer |
| `marida.py` | **REAL MARIDA loader** (Kikaki et al. 2022) — reads 11‑band Sentinel‑2 patches + pixel masks, maps MARIDA's 15 classes → the engine's 4, builds the exact `[B04,B06,B08,B8A,B11,FDI,NDVI]` contract; caches per split |
| `model.py` | Lazy ONNX Runtime loader; `input_kind()` (patch/pixel/none), `predict()`, `predict_patches()`, `model_info()` (model card from `metrics.json`) |
| `patches.py` | `extract_patch(arr,row,col,size)` — 64×64 window, edge‑clamped/padded |
| `classifier.py` | `classify()` → model first, else heuristic; routes patch vs per‑pixel |
| `train_combined.py` | **Per‑pixel MLP** (7→32→16→4 ReLU, Adam, inverse‑frequency class weights) on **real MARIDA + MADOS combined** (1.08M pixels: 347k MARIDA + 734k MADOS) → `models/marinenet.onnx` (the model shipped by default) |
| `train_marida.py` | (legacy) Per‑pixel MLP on **real MARIDA alone**; still works for baseline comparison |
| `train.py` | Legacy per‑pixel MLP on the *synthetic* library (baseline, superseded by `train_marida.py`) |
| `train_patch.py` | **Patch** classifier (64×64×6, GAP+linear) on fractional‑coverage synthetic patches → `models/marinenet_patch.onnx` |

**The default model is now trained on real labelled data, with a persisted held‑out evaluation in `models/metrics.json`:**
- `marinenet.onnx` — per‑pixel **MLP 7→32→16→4**, **loaded by default** (`model_loaded: True`),
  **trained on combined real MARIDA + MADOS benchmarks** (`trainedOn: "marida+mados"`, 1.08M pixels: 347k MARIDA + 734k MADOS).
  **Held‑out combined test split: overall accuracy 0.895, macro‑F1 0.500, ONNX↔numpy 1.000.**
  Per‑dataset breakdown: MARIDA test acc 0.871 (macro-F1 0.657), MADOS test acc 0.905 (macro-F1 0.469).
  Per‑class F1: Water 0.944, Algae 0.515, **Marine‑Debris/Plastic 0.508 (recall 0.887, precision 0.356)**, Sea‑Foam 0.032.
  Trade‑off: macro metrics lower than MARIDA‑only (0.976 / 0.679) due to MADOS's brighter water and generalization cost, but validates
  on a second benchmark. Sea‑Foam precision collapsed (0.016 vs 0.099 MARIDA‑only) — priority refinement.
- `marinenet_patch.onnx` — patch (`[N,6,64,64]` NCHW), **opt‑in** via `CNN_MODEL_PATH`. **88.1%** held‑out
  on *synthetic* fractional‑coverage patches (lower by design: GAP dilutes partly‑filled targets).

Combined class imbalance (Water >> Foam across both benchmarks) is handled with **inverse‑frequency class weights**;
both MARIDA and MADOS Sediment‑Laden / Turbid Water classes are deliberately trained as **Water** (not debris)
— the direct fix for the monsoon FDI false‑positive.

**Model card, surfaced end‑to‑end:** training writes `models/metrics.json`; `model.model_info()` reads it
and the engine exposes it at **`GET /model/info`** and inside **`GET /health`** → the Node backend
**`/api/pipeline/status`** passes it straight through → the frontend Pipeline page renders a **model card**
that badges **"REAL data · MARIDA"** with macro‑F1, per‑class recall bars, dataset, and ONNX↔numpy agreement.

**Honest framing:** the per‑pixel head is now **real‑data‑trained and held‑out‑validated on MARIDA** —
but validation is *MARIDA‑internal* (no independent Indian‑Ocean scene scored yet), and a GAP/spatial
patch model still lacks true spatial features (precisely why the spec calls for **ResNet‑50**). A real
trained ResNet‑50 exported to the same `[N,6,64,64]` ONNX contract **drops in with no code change** — the
engine detects the 4‑D input and routes every candidate through real patch classification.

Retrain anytime: `python -m app.ml.train_combined` (real MARIDA+MADOS, current default), `python -m app.ml.train_marida` (MARIDA only),
or `python -m app.ml.train` / `python -m app.ml.train_patch` (synthetic baselines) — each prints a confusion matrix + per‑class
P/R/F1 and refreshes `metrics.json`.

---

## 9. Frontend (React)

Routed SPA (React Router 6) with **code‑splitting** — every page is lazy‑loaded; the main bundle
is **~86 kB** (down from a 1,096 kB monolith); heavy libs (recharts 422 kB, leaflet 154 kB) load
on demand.

### Routes / Pages (20)
**Public / marketing** (`MarketingLayout`: nav + footer)
- `/` **Landing** — animated hero, live stats (from the API), 6‑stage pipeline, features, CTA
- `/about` — method + honest‑pilot disclaimer + live data‑source status
- `/contact` · `/docs` · `/faq` · `/terms` · `/privacy` — request‑access form, API docs, FAQ accordion, legal

**Auth**
- `/login` — real JWT login, **quick‑login** as any demo role, conditional 2FA code field
- `/signup` — registration (password strength) → routes to Settings to set up 2FA

**Protected app** (`/app/*`, `ProtectedRoute` → `AppLayout` sidebar)
- **Dashboard** — KPI StatCards, trend/class/region charts (Recharts), active alerts (ack), recent detections
- **Map Explorer** — **live AOI analysis** on a **real satellite basemap** (Esri World Imagery, no key). Draw a bounding box (or pick a quick area) → the full FDI → CNN → DBSCAN → drift pipeline runs **live for that area**; detections/hotspots/drift render dynamically, pinned to the newest **real Sentinel‑2 scene** (STAC, with thumbnail). **"Go live"** auto‑refreshes every 30 s. Nothing static — every result is computed for the selection
- **Detections** — filterable table (region/status/class/min‑confidence), FDI + confidence bars
- **Hotspots** — severity‑filtered cards (detections, confidence, coast ETA)
- **Pipeline** — run the engine, animated 6 stages, results, **"Recent Sentinel‑2 imagery"** panel (live/demo badge), **CNN model badge** (trained/heuristic), and a **model card** (held‑out accuracy, per‑class recall bars, dataset, ONNX↔numpy agreement)
- **Alerts** — severity + open/acked filters, type icons, acknowledge (per‑row spinner)
- **Analytics** — 60‑day trend, classification mix, regional breakdown, model card
- **Reports** — CSV export (detections/hotspots), JSON snapshot, printable situation report
- **Settings** — profile + **working 2FA setup** (QR → verify → enable/disable)
- `*` **NotFound**

### Data layer (`src/lib`, `src/hooks`, `src/stores`)
- `api.ts` — axios client; **unwraps `{ data }`; on any network failure falls back to a bundled
  mock dataset** so the UI never breaks. Auth token attached via request interceptor.
- `queryClient.ts` + `hooks/useApi.ts` — React Query hooks for every endpoint.
- `stores/authStore.ts` — zustand (persisted); async login/register calling the backend, with an
  **offline demo fallback**; mirrors tokens to `lib/authToken.ts`.

---

## 10. Authentication, RBAC & 2FA

**Real JWT auth** (not mocked): access token 15 min, **rotating** refresh 7 days (one‑time use;
reuse → 401), `bcrypt` password hashing, **TOTP 2FA** (`otplib` + `qrcode`). Works both against
**Postgres** and, in demo mode, an **in‑memory user store** (real bcrypt + real JWTs).

**RBAC — 3 operational roles / clearance levels** (reduced from 7 in July 2026 to focus the
product on the mission; see §4a)

| Role | Level | Meaning |
|---|---|---|
| **ADMIN** | 3 | full system + user management |
| **COASTGUARD** | 2 | operations, dispatch, alerts |
| **FIELD** | 1 | any authenticated user; registration default |

Middleware: `authenticate`, `requireMinLevel(n)`, `requireRole(...)`. `requireMinLevel(FIELD)` =
any signed‑in user; `requireMinLevel(ADMIN)` = admin only. Verified end‑to‑end (lower level blocked
from an admin route → 403; admin allowed; refresh rotation; TOTP verify).

**Demo accounts** — 3 users, one per role, password **`Demo@1234!`** (e.g. `cg_officer`, `admin`).
*Caveat:* demo users + enabled 2FA live in memory, so a backend restart resets them (that's the demo
escape hatch if you lose an authenticator).

---

## 11. Data Model (Prisma)

PostgreSQL + PostGIS, **12 models**:

`User` · `Region` · `UserRegion` · `SatelliteImage` · `Detection` · `Hotspot` · `Trajectory` ·
`Alert` · `RefreshToken` · `AuditLog` · `PipelineLog` · `ModelVersion` · `ApiKey`

Key entities:
- **Detection** — lat/lon, classification (Plastic/Algae/Sea_Foam/Water), confidence, `fdiScore`,
  `areaSqKm`, status (PENDING/CONFIRMED/FALSE_ALARM).
- **Hotspot** — centroid, `detectionCount`, severity (HIGH/MEDIUM/LOW), `etaHours` (null = open ocean).
- **Trajectory** — 72‑h Lagrangian path: `{ points[], cone[] }`, windage coefficients.
- **ModelVersion** — model registry (F1/precision/recall, confusion matrix).

Seed: 5 regions (**MUM** Mumbai, **GOA** Goa, **KCH** Kochi, **CHN** Chennai, **AND** Andaman),
7 users, a Sentinel‑2 scene, detections, 4 hotspots, a 72‑h trajectory, 3 alerts, a model version,
pipeline logs.

---

## 12. Demo Mode & Graceful Fallbacks

A core design principle: **every layer degrades gracefully so the whole stack runs at ₹0 with
nothing else installed.**

| Layer | Live | Fallback (default) |
|---|---|---|
| Backend data | PostgreSQL via Prisma | **bundled demo dataset** (no DB needed) |
| Backend ↔ engine | HTTP to `:8000` | **demo pipeline** built from mock data |
| Frontend ↔ backend | axios to `/api` | **bundled mock dataset** (site never breaks) |
| Auth | Postgres users | **in‑memory demo users** (real bcrypt + JWT) |
| Scene discovery | live STAC | synthetic scene metadata |
| Pixel ingest | Sentinel Hub | synthetic pixels |
| CNN | ONNX model | interpretable heuristic |

`DEMO_MODE=true` is the default. Responses tag their source (`X-Data-Source`, `meta.source`,
`meta.engine`) so the UI shows truthful "live / demo / offline" badges.

---

## 13. Scientific Specification

- **FDI (Floating Debris Index)** — `FDI = B08 − [ B06 + (B11 − B06) · ((λ8−λ6)/(λ11−λ6)) · 10 ]`
  (Biermann et al. 2020). Candidate if `FDI > 0.02` and part of a spatial cluster.
- **Classifier** — the shipped per‑pixel MLP (7‑feature `[B04,B06,B08,B8A,B11,FDI,NDVI]`) is
  **trained on real combined MARIDA + MADOS benchmarks** (Kikaki et al. 2022/2024, 1.08M training pixels);
  held‑out combined test acc 0.895, macro‑F1 0.500, with per‑dataset breakdown (MARIDA test 0.871 / MADOS test 0.905).
  Marine‑Debris F1 0.508, but Sea‑Foam precision weak (0.016). Next upgrade: ResNet‑50 patch head (64×64×6,
  MARIDA + MADOS) that drops into the ready `[N,6,64,64]` ONNX contract.
- **Drift** — Lagrangian ensemble, windage **1.5–3%**, produces an **uncertainty cone** (not a
  single line), 72‑hour horizon.
- **Hotspots** — DBSCAN `eps=0.09°`, `min_samples=3` → **HIGH ≥10 / MEDIUM ≥5 / LOW ≥3** detections.

---

## 14. How to Run

```bash
# 0) Database (:5432) + queue Redis (:6379) — portable, no install/admin.
#    Run both after every reboot:
infra\start-db.cmd
infra\start-redis.cmd

# 1) Python detection engine (:8000)  — ₹0, no heavy deps
cd python_engine
python -m pip install -r requirements-demo.txt        # fastapi/uvicorn/pydantic
python -m uvicorn api.app:app --port 8000

# 2) Backend API (:3001)  — live DB when Postgres is up, demo fallback otherwise
cd backend
npm install
npm run dev

# 3) Frontend (:5173)
cd frontend
npm install
npm run dev            # open http://localhost:5173
```

Sign in with **`cg_officer` / `Demo@1234!`** (or one‑click any role).

**Live status on this machine:** `DEMO_MODE=false`, CDSE keys configured (real pixel ingest +
SCL mask), real drift forcing (Open‑Meteo), live PostgreSQL seeded (`X-Data-Source: db`),
**pipeline runs persist to the DB** — dashboards show real accumulated detections. For
continuous real‑time operation, point any external cron (cron‑job.org free tier, GitHub
Actions, Windows Task Scheduler) at `GET /api/pipeline/scheduled-run` (e.g. every 6 h —
Sentinel‑2 revisit is ~5 days, so hourly adds nothing).

**Optional — (re)provision pieces:**
```bash
# real pixel ingest deps (numpy + tifffile)
cd python_engine && python -m pip install -r requirements-ingest.txt
# real CNN inference / retrain baselines
python -m pip install -r requirements-ml.txt
python -m app.ml.train          # per-pixel baseline
python -m app.ml.train_patch    # patch baseline
# recreate / reseed the database
cd backend && npm run db:push && npm run db:seed
```

---

## 15. Environment Variables

Root `.env` (loaded by both Node and Python). Demo‑ready defaults; nothing required to start.

| Variable | Purpose |
|---|---|
| `DEMO_MODE` | `true` → serve demo data, skip DB/keys. **`false` on this machine (live)** |
| `DATABASE_URL` | PostgreSQL connection — **live local cluster** (`infra/start-db.cmd`, user `mpt_user`) |
| `PORT`, `CORS_ORIGIN`, `LOG_LEVEL` | backend runtime |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES`, `JWT_REFRESH_EXPIRES`, `BCRYPT_ROUNDS`, `TOTP_ISSUER` | auth |
| `SATELLITE_PROVIDER` | `demo` \| `aws-stac` \| `sentinelhub` \| `cdse` |
| `SENTINEL_HUB_CLIENT_ID` / `_SECRET` / `_BASE_URL` / `_TOKEN_URL` | Sentinel Hub OAuth (pixel ingest) |
| `AWS_STAC_URL` | Earth Search STAC (scene discovery, no key) |
| `PYTHON_ENGINE_URL` | backend → engine (default `http://localhost:8000`) |
| `CNN_MODEL_PATH` | ONNX model file (default per‑pixel baseline) |
| `VITE_API_URL` | frontend → backend base URL |

---

## 16. Live‑Readiness Matrix

Every stage has a **real path** (drop‑in) and an **honest fallback** that works today at ₹0.

| Stage | Real path | Default today | Status |
|---|---|---|---|
| Scene discovery | Earth Search STAC (AWS, no key) | real | ✅ **live** |
| Pixel ingest | Sentinel Hub Process API + **SCL cloud/land mask** | **real reflectance** (CDSE keys configured) | ✅ **live, verified** |
| FDI | vectorized formula | ✅ real | ✅ always real |
| CNN classify | ONNX (patch or per‑pixel) | **per‑pixel trained on real MARIDA+MADOS combined** | ✅ real inference (real‑data weights, combined test acc 0.895, per-dataset breakdown available) |
| DBSCAN clustering | from‑scratch algorithm | ✅ real | ✅ always real |
| Drift forecast | Lagrangian ensemble + **real currents/winds (Open‑Meteo, no key)** | **real forcing** when `DEMO_MODE=false` | ✅ **live, verified** |

The SCL mask keeps only water/dark/unclassified pixels (drops clouds, cirrus, shadows, land,
snow) — verified live: a monsoon Mumbai scene had 63% masked; a clear Persian‑Gulf box kept 98.5%
water with a plausible 0.08% candidate rate. **Monsoon sediment turbidity** (which inflates FDI on
coastal water) is now **partially mitigated**: the combined MARIDA+MADOS‑trained classifier learns turbid/sediment
water as *Water*, not debris (both benchmarks contribute turbid/sediment examples). Trade‑off: generalization cost
(macro metrics 0.895/0.500 vs MARIDA‑only 0.976/0.679) but multi‑benchmark validation. Remaining upgrade for research grade:
a **ResNet‑50 patch head** (MARIDA + MADOS, 64×64×6 ONNX export drops into the ready `[N,6,64,64]` contract),
independent‑scene validation, **Sea_Foam F1 refinement** (currently 0.032 vs priority 0.5+), plus CMEMS/ERA5 gridded
fields for drift (credentials already in `.env`) — **no code changes required** for any upgrade.

---

## 17. Verification Status

Everything below was checked by execution during development:

- **Backend** — `tsc` type‑check ✓; every endpoint curl‑tested (stats, detections, hotspots,
  regions, alerts ack, satellite, pipeline) ✓; auth flow (JWT issue, RBAC 403/allow, refresh
  rotation, TOTP verify with real codes) ✓.
- **Python engine** — pipeline unit‑tested + HTTP‑tested ✓; live STAC returns real scenes ✓;
  pixel ingest verified against a mocked band array ✓; the default per‑pixel ONNX is **trained on
  real combined MARIDA+MADOS** and loads/classifies live (held‑out combined test acc 0.895, per-dataset breakdown, ONNX↔numpy 1.000) ✓;
  opt‑in synthetic patch model loads and classifies ✓; graceful fallbacks (no crash) ✓.
- **Frontend** — `tsc` type‑check ✓; production build ✓ (code‑split, main ~86 kB); all pages
  compile and render.

---

## 18. Roadmap / Remaining Work

**Done:** everything in §4–§16 above.

**Done since (2026‑07‑03/04):** live DB (portable PostgreSQL 17.5, `infra/start-db.cmd`), users/auth
on Postgres, run persistence + `scheduled-run`, **BullMQ + portable Redis 8.8 queue**
(`infra/start-redis.cmd`) — queued runs return a job id instantly, a worker executes with
retries (3×, exponential backoff), `GET /api/pipeline/jobs/:id` polls status, and everything
falls back to the direct path when Redis is down. Verified: cron ack 0.106 s vs ~60 s blocking;
5 region jobs drained in background; Redis kill → direct fallback → recovery on restart.

**Done 2026‑07‑04 (phase‑plan gap fill):** 72‑h **drift uncertainty cone** rendered on the map,
**GeoJSON export** (GIS‑ready FeatureCollection), **browser + toast notifications** on new HIGH
alerts (baselined seen‑set, no replay), **role‑aware dashboard** (per‑role greeting + quick actions).

**Done 2026‑07‑04 (real‑data model — MARIDA baseline):** the per‑pixel classifier was first **trained on the real
MARIDA benchmark** (`app/ml/marida.py` + `train_marida.py`) — held‑out MARIDA test acc 0.976, macro‑F1
0.679, Marine‑Debris F1 0.717, ONNX↔numpy 1.000.

**Done 2026‑07‑04 (real‑data model — MARIDA+MADOS combined):** the default per‑pixel classifier is now **trained on combined
real MARIDA + MADOS benchmarks** (`app/ml/mados.py` + `train_combined.py`, 1.08M train pixels) — held‑out combined test
acc 0.895, macro‑F1 0.500, per‑dataset breakdown (MARIDA 0.871/0.657, MADOS 0.905/0.469), ONNX↔numpy 1.000;
live in `models/marinenet.onnx`, the Pipeline model card badges "REAL data · MARIDA+MADOS".

**Not yet built (nice‑to‑haves / production hardening):**
- MARIDA + MADOS **ResNet‑50** *patch* head (per‑pixel MLP multi‑benchmark training is ✓ done);
  + ONNX export (the pluggable `[N,6,64,64]` path is ready). **Priority:** improve Sea‑Foam F1 (currently 0.032, target 0.5+).
  **Independent (non‑MARIDA/MADOS) scene validation** with a published confusion matrix.
- Move domain **write** routes behind `authenticate` (currently public for the demo UX).
- Alert delivery via Twilio/email (deps present; in‑app + browser notifications are live).
- **Gridded** CMEMS + ERA5 fields sampled along the drift path (point forcing via Open‑Meteo is live; credentials for the gridded upgrade are in `.env`).
- PostGIS geometry columns (schema ready; portable dev cluster lacks the extension).
- ~~Phase 8 leftovers~~ ✅ **done 2026‑07‑04**: time‑window slider on Detections (`?days=`),
  **Operations Board** (`/app/ops` — health tiles incl. queue depth, open alerts with ack,
  ETA‑sorted coast‑bound hotspots, verification queue, pipeline activity feed from the new
  `GET /api/pipeline/logs`, one‑click "Run all regions"), and **Admin Panel** (`/app/admin`,
  ADMIN‑only in sidebar + backend‑enforced 403 — users/roles/2FA table, system config, regions).
- ~~Phase 9 core~~ ✅ **done 2026‑07‑04**: **live‑ops WebSocket** (`/ws/live` — run/alert/job events
  pushed the moment persistence completes; Ops Board LIVE badge + event feed; push‑invalidates the
  dashboards, polling stays the fallback), **explain‑detection drawer** (per‑row "why?" — FDI vs
  threshold visual, model card + per‑class recall, honest caveats), **onboarding tour** (5‑step
  first‑login walkthrough, shown once), **compliance page** (`/compliance` — licences, security,
  honest limits, standards). *Deliberately deferred:* report builder (situation report + CSV/GeoJSON/
  print already cover it) and a separate impact dashboard (no defensible area→tonnage conversion —
  we refuse to fabricate one; the real KPIs already show impact).
- Phase 10: tests, accessibility pass, i18n, deployment docs, final README (SAR fusion / active learning / 3D globe are stretch).

---

*Marine Plastic Tracker · Final Year Project · targets INCOIS · NCCR · Indian Coast Guard.
An honest, ₹0 pilot that complements — never replaces — patrols and field teams.*
