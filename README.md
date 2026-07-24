# 🌊 Marine Plastic Tracker

> An open, validated AI layer that turns free Sentinel-2 satellite data into marine-plastic  
> detections and 72-hour drift forecasts for the Indian Ocean — built for ocean agencies  
> (INCOIS / NCCR / Coast Guard). Runs at ₹0 on free tiers; architected for production migration.

---

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| **0** | ✅ **Complete** | Monorepo scaffold, docker-compose, design system, component library |
| 1 | 🔲 Next | PostgreSQL+PostGIS schema, migrations, seed data |
| 2 | 🔲 | Backend auth, RBAC, JWT, audit log |
| 3 | 🔲 | Core REST APIs, BullMQ queue |
| 4 | 🔲 | Python engine — FDI, CNN, drift cone, DBSCAN |
| 5 | 🔲 | Frontend routing, auth pages, layout |
| 6 | 🔲 | Map + dashboards |
| 7–10 | 🔲 | Alerts, PDF, analytics, Live Ops, 3D globe, public API |

---

## Architecture

```
marine-plastic-tracker/
├── frontend/          # React 18 + Vite + TypeScript + TailwindCSS + Leaflet
├── backend/           # Node.js + Express + TypeScript (auth, RBAC, REST, BullMQ)
├── python_engine/     # Python + FastAPI, domain-structured (satellite/ml/hotspot/trajectory/api)
├── infra/
│   └── postgres/      # PostGIS init SQL
├── data/              # Seed imagery + demo scenes (gitignored for large files)
├── models/            # ML model weights (gitignored — download separately)
├── docker-compose.yml # Local dev: Postgres+PostGIS + Redis + all services
└── .env.example       # Environment variable template
```

**One database rule:** PostgreSQL + PostGIS only. No MySQL, no MongoDB.

**Decoupled compute:** Node → Python via BullMQ (Redis-backed). No blocking HTTP calls.

**External scheduler:** Pipeline triggered via a documented endpoint (GitHub Actions cron /  
cron-job.org). No in-process scheduler.

---

## Quick Start (Docker)

```bash
# 1. Clone and enter
git clone <repo-url>
cd marine-plastic-tracker

# 2. Copy env template (demo mode works without real API keys)
cp .env.example .env

# 3. Spin up everything
docker-compose up --build

# Services:
#   Frontend   →  http://localhost:5173
#   Backend    →  http://localhost:3001
#   API health →  http://localhost:3001/health
#   Python API →  http://localhost:8000
#   API docs   →  http://localhost:8000/docs
#   PgAdmin    →  connect to localhost:5432  db=marine_plastic
```

---

## Quick Start (Local without Docker)

### Prerequisites
- Node.js ≥ 20, npm ≥ 10
- Python ≥ 3.11, pip
- PostgreSQL 15 with PostGIS extension
- Redis 7+

### Backend
```bash
cd backend
npm install
cp ../.env.example ../.env        # edit DATABASE_URL and REDIS_URL
npx prisma migrate dev            # runs migrations + seeds
npm run dev                       # http://localhost:3001
```

### Python Engine
```bash
cd python_engine
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn api.app:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

---

## Design System

Fonts: **Orbitron** (display) · **Inter** (body) · **JetBrains Mono** (data)

| Token | Hex | Use |
|-------|-----|-----|
| `ocean-600` | `#0891B2` | Primary actions |
| `ocean-500` | `#06B6D4` | Highlights |
| `green-500` | `#10B981` | Success / Field |
| `danger` | `#EF4444` | Alerts / Admin |
| `warn` | `#F59E0B` | Warnings |
| `purple` | `#8B5CF6` | Researcher |

Glass cards: `rgba(255,255,255,0.90)` · `backdrop-blur(20px)` · 1px teal border · 3px gradient top bar.

---

## RBAC (7 roles — MVP ships 3)

| Role | Level | Color | Access |
|------|-------|-------|--------|
| Admin | L7 | `#EF4444` | Full system |
| Ministry | L6 | `#3B82F6` | All regions, reports |
| CoastGuard | L5 | `#0891B2` | Assigned regions, ops |
| Field | L4 | `#10B981` | Assigned regions, upload |
| Researcher | L3 | `#8B5CF6` | All regions (read), model metrics |
| NGO | L2 | `#F97316` | Assigned regions (limited) |
| Public | L1 | `#64748B` | Aggregated stats only |

MVP ships CoastGuard + Researcher + Public. Others behind a feature flag.

---

## Scientific Approach

- **FDI:** `B08 − [B06 + (B11−B06) × ((λ8−λ6)/(λ11−λ6)) × 10]` — candidate if FDI > 0.02 AND part of a spatial cluster.
- **Classifier:** the shipped per-pixel MLP (7-feature `[B04,B06,B08,B8A,B11,FDI,NDVI]`, 4 classes: Plastic / Algae / Sea-Foam / Water) is **trained on the real MARIDA benchmark** (Kikaki et al. 2022) — held-out MARIDA test accuracy 0.976, macro-F1 0.679, Marine-Debris F1 0.717 (precision 0.584 / recall 0.926); full confusion matrix + per-class P/R/F1 in `models/metrics.json`. The spec's ResNet-50 patch head (64×64×6, MARIDA + MADOS) is the next upgrade and drops into the ready `[N,6,64,64]` ONNX contract with no code change.
- **Drift:** Lagrangian ensemble `new_pos = old_pos + (current + k·wind)·Δt` over 72h, windage k=1.5–3% → **uncertainty cone** (not a single line).
- **Hotspots:** DBSCAN eps=0.09°, min_samples=3 → HIGH(≥10) / MEDIUM(≥5) / LOW(≥3).

**Honest limitations:** biofouling term is a heuristic only (clearly labeled). No "replaces patrols" claims. Metrics reported with cross-region hold-out.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 · Vite 5 · TypeScript 5 · TailwindCSS 3 · Leaflet · Recharts · Framer Motion |
| Backend | Node.js 20 · Express · TypeScript · Prisma ORM · BullMQ · JWT + TOTP |
| Compute | Python 3.11 · FastAPI · rasterio · TensorFlow/Keras · scikit-learn · numpy |
| Database | PostgreSQL 15 + PostGIS 3.3 |
| Queue | Redis 7 + BullMQ |
| Storage | Local disk (pilot) → S3-compatible interface |
| CI | GitHub Actions (lint + type-check + test) |

---

## Free-Tier Deployment (₹0)

| Service | Provider | Notes |
|---------|----------|-------|
| Database | Neon.tech free tier (PostgreSQL) | Enable PostGIS extension |
| Redis | Upstash free tier | BullMQ compatible |
| Backend | Render / Railway free tier | Node.js |
| Python engine | Render / Railway free tier | FastAPI |
| Frontend | Vercel free tier | Vite build |
| Scheduler | GitHub Actions cron or cron-job.org | Free |
| Imagery | Copernicus Open Access Hub | Free registration |

See `docs/deployment.md` for full guide (added in Phase 10).

---



## License

MIT — see [LICENSE](LICENSE).

*Built for academic Final Year Project demonstration. Not for operational use without agency validation.*
