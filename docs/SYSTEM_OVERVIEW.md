# Marine Plastic Tracker — Complete System Overview

*Architecture · Modules · Workflow · Data flow · Model reality · Change history*

**Generated:** 2026-07-29 · **Branch:** `fix/scan-and-auth-reliability`
**Scope:** the whole repository as it actually exists, verified against source — not against the docs.

---

> ### ⚠️ Read this first
>
> [`README.md`](../README.md) **is stale.** Its phase table claims *"Phase 0 complete, Phases 1–10 pending."*
> That is wrong. The entire stack (Phases 0–10 equivalent) is built and runs end-to-end on real data.
>
> The accurate living records are [`MEMORY.md`](../MEMORY.md), [`PROJECT_SUMMARY.md`](../PROJECT_SUMMARY.md)
> and [`python_engine/models/metrics.json`](../python_engine/models/metrics.json).
> Git history is also misleading (6 squashed commits) — the real change record is in the memory files
> and is reconstructed in [§7](#7-the-actual-update-history) below.

---

## Table of contents

1. [What the system is](#1-what-the-system-is)
2. [System topology — five processes](#2-system-topology--five-processes)
3. [The detection pipeline — 7 stages](#3-the-detection-pipeline--7-stages-end-to-end)
4. [Module-by-module breakdown](#4-module-by-module-breakdown)
5. [Data flow — three walkthroughs](#5-data-flow--three-concrete-walkthroughs)
6. [The model — real numbers and honest limits](#6-the-model--what-is-real-and-what-the-numbers-actually-are)
7. [The actual update history](#7-the-actual-update-history)
8. [Current state and open gaps](#8-current-state-and-open-gaps)

---

## 1. What the system is

An operational console that turns **free Sentinel-2 satellite imagery** into **marine-plastic detections**
and **72-hour drift forecasts** for the Indian Ocean, aimed at INCOIS / NCCR / Indian Coast Guard.
It runs at ₹0 on free tiers, and it is deliberately architected so that every claim on screen is
traceable to something the system actually computed.

The design thesis is **operational and transparency-led, not algorithmic-novelty-led**.
It does not beat state-of-the-art detection papers; it is the only end-to-end agency console in this
space with per-stage live/demo tagging, a closed active-learning loop, and a foundation-model verifier
in the path.

**Honest framing carried throughout the product:** it does not replace boats, drones, or people.
Satellites pass every ~5 days, cannot see through cloud, and each pixel is 10 m wide — so only *large*
patches are visible, never a single bottle. The app is a helper, and says so.

---

## 2. System topology — five processes

| Process | Port | Runtime | Role |
|---|---|---|---|
| **Frontend** | 5173 | React 18 · Vite · TypeScript · Tailwind · Leaflet | Analyst console |
| **Backend** | 3001 | Node 20 · Express · TypeScript · Prisma | Auth, RBAC, persistence, queue, exports |
| **Python engine** | 8000 | Python 3.14 · FastAPI · **numpy + onnxruntime, NO torch** | All the science |
| **Clay GPU sidecar** | 8010 | Python · PyTorch (conda env `mpt-train`) | Foundation-model embeddings on RTX 4050 |
| **PostgreSQL** | 5432 | Portable cluster, [`infra/pgsql/`](../infra/pgsql/) | System of record |
| **Redis** | 6379 | Portable, [`infra/redis/`](../infra/redis/) | BullMQ job queue |

One-click launch: [`start-all.cmd`](../start-all.cmd). Host-owned lifecycle with a watchdog at
[`infra/watchdog.ps1`](../infra/watchdog.ps1).

### The torch-free split — the key architectural decision

The ₹0 engine is **torch-free**. Clay (a 4.8 GB foundation model) cannot live inside it, so it was
split into a stdlib-HTTP sidecar ([`python_engine/clay_service.py`](../python_engine/clay_service.py))
exposing only `/embed` and `/health`. The engine calls it over loopback.

If the sidecar is down, every scan degrades gracefully to MLP-only **and says so** in the stage log
rather than silently dropping capability. Searching the embedding index needs no torch at all — only
*generating* an embedding does.

```
Browser ──HTTP/WS/SSE──> Backend :3001 ──HTTP──> Engine :8000 ──HTTP──> Clay :8010 (GPU)
                            │                        │
                         Postgres                 CDSE / Sentinel Hub (OAuth)
                            │                     AWS Earth Search STAC (keyless)
                         Redis/BullMQ             Open-Meteo Marine + Forecast (keyless)
                                                  CMEMS (copernicusmarine)
```

---

## 3. The detection pipeline — 7 stages, end to end

Orchestrated by [`python_engine/main_pipeline.py`](../python_engine/main_pipeline.py), with two entry
points: `run_aoi(bbox)` for a user-drawn box and `run_pipeline(region)` for a monitored region.
A third, `run_aoi_events()`, is a generator twin that yields the same stages as SSE events for live
progress — it reuses the identical stage helpers, so streamed timings are the genuine per-stage work.

```
DOWNLOAD → FDI → CNN(MLP) → DBSCAN → CLAY → DRIFT → ALERT
```

---

### Stage 1 — DOWNLOAD (ingest)

[`satellite/download.py`](../python_engine/satellite/download.py) →
[`satellite/band_loader.py`](../python_engine/satellite/band_loader.py)

- OAuth2 client-credentials against CDSE, **token cached** until near expiry.
- One Sentinel Hub Process API call returns a float32 GeoTIFF with 6 channels:
  `B04, B06, B08, B8A, B11, SCL`, decoded with `tifffile` (pure Python + numpy — no GDAL/rasterio).
- **Adaptive resolution.** The grid is sized to hit ~20 m/px:
  - small AOI → one native-resolution request
  - medium AOI → **native-resolution tiling** (≤ 9 tiles fetched at target resolution and stitched)
  - huge region → one capped request (coarser but cheap) rather than an explosion of tiles that
    would blow the CDSE Processing-Unit quota

  This replaced a fixed 256×256 over any bbox (~640 m/px), which averaged small rafts away.
- **Cloud gating.** Requests a `leastCC` mosaic under `INGEST_MAX_CLOUD=50` within a 45-day window,
  widening to 180 days **only if coverage is low** — not if land-dominated, because a permanently-land
  AOI is "unusable" forever and would otherwise double-fetch on every scan.
- Transient connection errors are retried with linear backoff; HTTP errors (401 bad creds, 429 quota)
  are **not** retried — they are real answers.
- Falls back to a deterministic synthetic scene when credentials/deps are missing, and labels it
  honestly in the stage detail.

Returns a `SceneData` dataclass carrying **its own** surface/mask — deliberately no module globals,
which fixed a bug where a land scan reported the previous water scan's composition.

---

### Stage 1b — Surface classification & reliability grading

[`satellite/cloud_masker.py`](../python_engine/satellite/cloud_masker.py)

The SCL (Scene Classification Layer) band is split off and used three ways:

1. **Composition readout** — water / land / cloud / other %, computed **over observed pixels only**
   (SCL 0/1 = nodata excluded).
   *Why this matters:* a leastCC composite leaves nodata wherever no clear pass existed. Computing over
   the full grid diluted every real category toward zero, so a half-land box read **"land 0 %"**.
2. **`coverage_pct`** — how much of the AOI had a clear pass at all. Low coverage is itself a
   reliability signal.
3. **Reliability grade** — `reliable` / `degraded` / `unusable`, driven by coverage, cloud share and
   water share.

> **Honesty rule encoded in code:** the SCL composite cloud % is **authoritative**, not the STAC tile
> cloud %. A tile can read 100 % cloud while the leastCC composite actually classified is ~9 %.

When a scan grades unusable (land- or cloud-dominated), the frontend **suppresses map markers
entirely**, so a pure-land box no longer paints 160 fake "algae" dots. Raw detections stay available
in the data tabs and exports.

---

### Stage 2 — FDI (candidate generation)

[`satellite/fdi_calculator.py`](../python_engine/satellite/fdi_calculator.py) +
[`satellite/threshold_applier.py`](../python_engine/satellite/threshold_applier.py)

The **Floating Debris Index** (Biermann et al. 2020):

```
FDI = B08 − [ B06 + (B11 − B06) × ((λ₈ − λ₆) / (λ₁₁ − λ₆)) × 10 ]
```

with λ = 740 / 842 / 1610 nm → slope ≈ 0.1172. The baseline is a linear interpolation between the
red-edge and SWIR bands evaluated at the NIR wavelength; FDI is how far the observed NIR sits above it.

Computed vectorised over the whole array. A pixel is a **candidate** iff:

```
FDI > 0.02   AND   SCL class ∈ keep-mask
```

The keep-mask ([`satellite/cloud_filter.py`](../python_engine/satellite/cloud_filter.py)) defaults to
`{6 = water, 7 = unclassified}` — floating debris often falls in *unclassified* at SCL's 20 m
resolution. **Class 2 (dark area) was dropped**: it is mostly terrain/cloud shadow and was the single
largest land/haze false-positive leak. Revertible via `INGEST_KEEP_SCL="2,6,7"`.

Output: candidate pixel list (lat/lon/row/col/bands) plus `arr6` = `(H, W, 6)` =
`[B04, B06, B08, B8A, B11, FDI]`, used later for chip/patch extraction. Candidates are sub-sampled to
≤ 500 via even striding.

---

### Stage 3 — Classification (labelled `CNN`, actually an MLP ensemble)

[`ml/batch_classifier.py`](../python_engine/ml/batch_classifier.py) →
[`ml/inference_engine.py`](../python_engine/ml/inference_engine.py) →
[`ml/model_loader.py`](../python_engine/ml/model_loader.py)

> **The stage name `CNN` is a legacy misnomer**, kept for API and DB-enum compatibility.
> The shipped model is a per-pixel MLP ensemble. The interactive UI has been corrected to
> "Classify (MLP)".

Each candidate becomes an **11-feature vector**:

```
[ B04, B06, B08, B8A, B11, FDI, NDVI, PI, MNDWI, NDVI_RE, BRIGHT ]
```

The last four are engineered spectral indices — Plastic Index (Biermann 2020), NIR-SWIR water /
floating-matter index, red-edge NDVI (algae), broadband brightness (foam/glint). All derive from the
same five bands the pipeline already fetches, so they cost **zero extra data**.

The feature order is a hard runtime contract mirroring `train_perpixel_gpu.augment11` exactly.

ONNX inference via onnxruntime; the CUDA execution provider is auto-selected when available, with a
robust CPU fallback. Four classes: **Plastic / Algae / Sea_Foam / Water**.

A thread-safe **load lock** prevents a second concurrent scan from observing `_TRIED=True` mid-load and
silently falling back to the heuristic.

#### Two-tier plastic confidence

Applied at this stage:

| Tier | Rule | Meaning |
|---|---|---|
| **HIGH** | `P(plastic) ≥ 0.648` | Calibrated to **~90 % precision** (57 % recall) on held-out |
| **CANDIDATE** | below that | Shown, but never dispatched against |

Raising the bar to 0.79 gives ~95 % precision at 16 % recall. The threshold is env-tunable via
`PLASTIC_HIGH_CONF`.

If no model is loadable, an interpretable spectral heuristic runs — and `REQUIRE_MODEL=1` makes that
**fail loudly** instead of degrading silently.

---

### Stage 4 — DBSCAN (hotspot clustering)

[`hotspot/dbscan_clusterer.py`](../python_engine/hotspot/dbscan_clusterer.py) +
[`hotspot/severity_scorer.py`](../python_engine/hotspot/severity_scorer.py)

DBSCAN implemented from scratch (no scikit-learn dependency), `eps = 0.09°`, `min_samples = 3`.

| Severity | Members |
|---|---|
| HIGH | ≥ 10 |
| MEDIUM | ≥ 5 |
| LOW | ≥ 3 |

> **Critical operational rule:** hotspots cluster **HIGH-CONFIDENCE plastic only**. Hotspots are what
> dispatch acts on, so a crew is never sent to a low-confidence maybe. If nothing clears the bar the
> result is *no hotspot* — it deliberately does **not** fall back to clustering all plastic.

---

### Stage 4b — CLAY verification (second-stage foundation model)

[`ml/clay_live.py`](../python_engine/ml/clay_live.py) →
[`clay_service.py`](../python_engine/clay_service.py) →
[`ml/confidence_fusion.py`](../python_engine/ml/confidence_fusion.py)

For each hotspot, a 64×64×5 chip is cut around the nearest candidate pixel and POSTed to the GPU
sidecar, which returns a **1024-d Clay v1.5 embedding** (~36 ms/chip warm). The engine then:

1. Runs k-NN against a prebuilt reference index
   ([`ml/clay_index.py`](../python_engine/ml/clay_index.py) — numpy-only, no torch needed to *search*).
2. Computes **plastic affinity** = similarity-weighted share of the 10 nearest reference sites that are
   Plastic. Deliberately **not** raw k-NN argmax, which the water-heavy library biases.
3. Computes an **anomaly / novelty score** — is this site unlike anything known?
4. Fuses MLP confidence + plastic affinity + novelty into a calibrated verdict:

| Verdict | Precision | Recall |
|---|---|---|
| **CONFIRMED** | **0.9219** | 0.7037 |
| POSSIBLE | — (the wider net) | — |

Thresholds live in
[`python_engine/models/fusion_thresholds.json`](../python_engine/models/fusion_thresholds.json) and are
re-read live, so a re-calibration takes effect without a code change.

**Clay is the precision gate:** 0.776 MLP plastic precision → 0.92 at the CONFIRMED tier.
It does **not** detect plastic on its own (its own plastic F1 is 0.37).

`_clay_stage()` **always emits a stage entry** — *"verified N → M CONFIRMED"*, *"Clay ON, no hotspots"*,
or *"Clay OFFLINE — MLP-only"*. This exists because Clay was once silently off for every scan with no
indicator, which this project treats as a bug class of its own:

> **A component that is present but silently off is a bug — surface it, auto-start it, self-heal it.**

The sidecar health probe uses a **negative-only cache** (30 s TTL). A ping to a live sidecar costs
~1 ms; a ping to a dead loopback port whose SYN is *dropped* (rather than refused) costs the full 1 s
timeout — and `/capabilities` is polled. This took that endpoint from **1035 ms → 3.6 ms**.

---

### Stage 5 — DRIFT (72-hour Lagrangian forecast)

[`trajectory/`](../python_engine/trajectory/)

**Forcing** is resolved best-first in
[`trajectory/forecast.py`](../python_engine/trajectory/forecast.py):

| Priority | Source | Notes |
|---|---|---|
| 1 | **Gridded CMEMS** ([`gridded_forcing.py`](../python_engine/trajectory/gridded_forcing.py)) | `cmems_mod_glo_phy_anfc_0.083deg_PT1H-m` hourly surface currents, sampled **along the moving track** at (lat, lon, t) — the correct multi-day physics. Cached 1 h per coarse area. |
| 2 | **Point Open-Meteo** ([`data_interpolator.py`](../python_engine/trajectory/data_interpolator.py)) | Keyless hourly currents + 10 m winds at the release point. Currents flow *toward* their direction; wind blows *from* it, so wind is negated. Cached 1 h; failures negative-cached 5 min. |
| 3 | **Synthetic** | Smooth deterministic field, clearly labelled. |

**Integration** ([`lagrangian_model.py`](../python_engine/trajectory/lagrangian_model.py)) is
**4th-order Runge–Kutta at a 1-hour step** (upgraded from forward Euler, which accumulated truncation
error on curved current paths), with one track per **windage member** — the fraction of wind speed
imparted to a floating object:

```
DEFAULT_WINDAGE = (0.015, 0.02, 0.025, 0.03)      # 1.5 – 3 %
new_velocity   = current + windage × wind
```

[`ensemble_model.py`](../python_engine/trajectory/ensemble_model.py) collapses the members into a
**mean path + per-hour min/max uncertainty cone** — never a single deceptive line.

Then:

- [`eta_calculator.py`](../python_engine/trajectory/eta_calculator.py) — direction-aware coast crossing
  → landfall ETA. `None` for open ocean.
- [`landfall.py`](../python_engine/trajectory/landfall.py) — **landfall probability** = fraction of
  members that beach within the horizon, plus earliest/latest member ETA.
- [`path_clamp.py`](../python_engine/trajectory/path_clamp.py) — **halts the drawn path at the coast**.
  A beached parcel does not drift inland. Crucially it clamps the *aggregated mean + cone*, **never the
  ensemble members** (ragged members would silently drop hours or IndexError in `mean_and_cone`), and
  ETA/landfall are computed on the raw path **before** clamping, so both keep their values by
  construction. The payload gains self-describing `pathEndHours`, `pathEndReason`, `coastLon`,
  `coastModel: "meridian"`.
- [`back_tracker.py`](../python_engine/trajectory/back_tracker.py) — reverse-time integration for
  **source attribution** ("where did this come from?"). Deliberately **not** clamped: reaching the coast
  backwards means the parcel *was* there — a source, not a sink.

#### Two guards against nonsense forecasts

| Guard | Where | Behaviour |
|---|---|---|
| **No plastic → no drift** | [`backend/src/routes/areas.routes.ts`](../backend/src/routes/areas.routes.ts) | Release point = strongest plastic hotspot → highest-confidence plastic detection → else **422**. Never the AOI centroid. |
| **Inland → no ocean drift** | [`api/forecast_route.py`](../python_engine/api/forecast_route.py) | Keyless Open-Meteo terrain elevation; > 10 m ⇒ landlocked reservoir ⇒ `{marine: false, reason}` with no track. Best-effort — an unknown lookup never blocks a forecast. |

AOI runs pass `clamp=False`, because their "coast" is the drawn box's eastern edge, not a real
coastline — clamping there would make trajectory length a function of where the user dragged the box.

---

### Stage 6 — ALERT

[`hotspot/alert_trigger.py`](../python_engine/hotspot/alert_trigger.py)

HIGH/MEDIUM hotspots become alerts. Type is `COAST_PROXIMITY` when landfall ETA ≤ 48 h, else `HOTSPOT`.
The engine only *produces* candidate alerts; the backend owns delivery, dedupe (per label per 24 h) and
WebSocket push.

---

## 4. Module-by-module breakdown

### 4.1 Python engine — `satellite/` (ingest & spectral)

| Module | Contribution to detecting plastic |
|---|---|
| [`download.py`](../python_engine/satellite/download.py) | Scene discovery (STAC), ingest orchestration, region registry (MUM/GOA/KCH/CHN/AND), synthetic fallback |
| [`band_loader.py`](../python_engine/satellite/band_loader.py) | The real pixel source: OAuth, evalscript, adaptive grid, native-res tiling, retry |
| [`cloud_masker.py`](../python_engine/satellite/cloud_masker.py) | SCL → surface composition + coverage + reliability grade |
| [`cloud_filter.py`](../python_engine/satellite/cloud_filter.py) | The candidacy keep-mask — which SCL classes may host a detection |
| [`fdi_calculator.py`](../python_engine/satellite/fdi_calculator.py) | The core physics: FDI, scalar and vectorised |
| [`threshold_applier.py`](../python_engine/satellite/threshold_applier.py) | Array → candidate pixels + `arr6` |
| [`spectral_indices.py`](../python_engine/satellite/spectral_indices.py) | NDVI / NDWI / FAI / Plastic-Index for the analyst indices endpoint |
| [`patch_extractor.py`](../python_engine/satellite/patch_extractor.py) | Cuts 64×64 windows for Clay chips and patch models |
| [`landmask.py`](../python_engine/satellite/landmask.py) | Keyless terrain-elevation land/water estimate — surface readout works even when the real fetch fails; also the marine/inland gate |
| [`geotiff_exporter.py`](../python_engine/satellite/geotiff_exporter.py) | Georeferenced raster export of an index layer |
| [`band_normalizer.py`](../python_engine/satellite/band_normalizer.py) · [`band_resampler.py`](../python_engine/satellite/band_resampler.py) | Reflectance normalisation; pure-numpy nearest/bilinear resampling |

### 4.2 Python engine — `ml/` (models & intelligence)

#### Inference path

```
model_loader.py    ONNX registry, model card, GPU/CPU provider, strict mode, load lock
      ↓
inference_engine.py  11-feature engineering, softmax, patch path, heuristic fallback
      ↓
batch_classifier.py  the CNN stage; tags high_confidence; applies biofouling
```

#### Detection post-processing — all opt-in, default off, so the base result is unchanged

| Module | Purpose |
|---|---|
| [`confidence_filter.py`](../python_engine/ml/confidence_filter.py) | Auto-CONFIRMED at ≥ 0.85 else PENDING; optional min-confidence drop |
| [`detection_merger.py`](../python_engine/ml/detection_merger.py) | Collapse near-duplicate detections |
| [`biofouling_corrector.py`](../python_engine/ml/biofouling_corrector.py) | Floating plastic accrues biofilm within days, raising NDVI and dampening FDI — pushing weathered plastic toward "Algae". Nudges it back at reduced confidence. **Explicitly a heuristic**, off by default so it never silently perturbs held-out metrics. |
| [`area_estimator.py`](../python_engine/ml/area_estimator.py) | One detection = one 10 m pixel = **0.0001 km²**. A prior `area_from_fdi()` returned 0.08–0.9 km² *per pixel* — a **~1000× over-report** that flowed into dashboards, CSV and PDF exports. Removed at source. |

#### The Clay intelligence layer — the differentiator

| Module | Role |
|---|---|
| [`clay_embed.py`](../python_engine/ml/clay_embed.py) | GPU-side Clay v1.5 load + chip embedding |
| [`clay_index.py`](../python_engine/ml/clay_index.py) | Numpy-only cosine index over 1024-d embeddings: `find_similar`, `knn_predict`, `anomaly_score`. **Engine-safe** |
| [`embedding_spool.py`](../python_engine/ml/embedding_spool.py) | Write half of the batch-embed / serve-online split: queues hotspot chips to `models/embed_queue/*.npz` |
| [`embed_hotspots.py`](../python_engine/ml/embed_hotspots.py) | Drains that queue **through the running sidecar's `/embed`** — no second 4.8 GB Clay load (would OOM the 6 GB card), no torch in the engine env |
| [`hotspot_embeddings.py`](../python_engine/ml/hotspot_embeddings.py) | Per-site store keyed by stable `site_key(region, lat, lon)`; append-only and **deduped**, so a place accumulates dated observations |
| [`similarity_service.py`](../python_engine/ml/similarity_service.py) | Serves find-similar, per-hotspot neighbours, retrieval classification, novelty, site listing. Hot-reloads the store on mtime change |
| [`site_change.py`](../python_engine/ml/site_change.py) | **Temporal change without re-downloading anything** — compares a site's fingerprints across dates → intensifying / clearing / shifted / stable |
| [`confidence_fusion.py`](../python_engine/ml/confidence_fusion.py) | Two-model fusion → High / Medium / Low + CONFIRMED flag, with a one-line human explanation every time |

A daemon thread registered in [`api/app.py`](../python_engine/api/app.py) drains the spool every 60 s
whenever the sidecar is up — tied to the engine lifecycle so the capability is never silently off.
Opt-out: `EMBED_DRAIN=0`.

**What the embeddings power, at ₹0:**

- *"Find sites like this"* — nearest known ocean sites in fingerprint space
- *Guess-by-similarity* — retrieval classification with **no extra training** (~73 % accurate at k=10)
- *"This looks unusual"* — novelty flagging for unfamiliar water
- *Few-shot* — teach a new category from a handful of labelled spots
- *Change over time* — same place, different dates

#### Training & validation (offline, GPU env)

| Module | What it does |
|---|---|
| [`train_perpixel_gpu.py`](../python_engine/ml/train_perpixel_gpu.py) | The **live model's trainer**: focal loss, class-balanced (effective-number) weights, 256-128-64-32 net, folded per-class bias calibration, ONNX export with parity check |
| [`train_patch_cnn.py`](../python_engine/ml/train_patch_cnn.py) | The ResNet patch CNN that **lost** and was honestly not shipped |
| [`train_clay_head.py`](../python_engine/ml/train_clay_head.py) · [`tune_clay_threshold.py`](../python_engine/ml/tune_clay_threshold.py) · [`tune_fusion.py`](../python_engine/ml/tune_fusion.py) | Clay head training and threshold calibration |
| [`validate_plp.py`](../python_engine/ml/validate_plp.py) · [`validate_plp_clay.py`](../python_engine/ml/validate_plp_clay.py) | In-situ validation against real deployed plastic targets |
| [`validate_drift.py`](../python_engine/ml/validate_drift.py) | Liu–Weisberg skill score against a reference track |
| [`datasets/`](../python_engine/ml/datasets/) | Adapters for MARIDA, MADOS, RefinedFloatingObjects, PLP, and 64×64 patches |

### 4.3 Python engine — `api/` and support

| Route file | Endpoints |
|---|---|
| [`health_route.py`](../python_engine/api/health_route.py) | `/health` (model card + Clay status), `/` |
| [`predict_route.py`](../python_engine/api/predict_route.py) | `/pipeline/run`, `/pipeline/batch`, `/pipeline/last`, `/compute/fdi`, `/compute/drift`, `/satellite/scenes` |
| [`stream_route.py`](../python_engine/api/stream_route.py) | `/pipeline/stream` — SSE, one event per real stage |
| [`forecast_route.py`](../python_engine/api/forecast_route.py) | `/forecast/trajectory`, `/forecast/backtrack` |
| [`analysis_route.py`](../python_engine/api/analysis_route.py) | `/compute/indices`, `/compute/change` |
| [`similarity_route.py`](../python_engine/api/similarity_route.py) | `/similarity/info`, `/search`, `/demo`, `/hotspot`, `/change`, `/sites` |
| [`model_route.py`](../python_engine/api/model_route.py) | `/model/info`, `/model/evaluate` (live held-out eval), `/model/validation` |
| [`export_route.py`](../python_engine/api/export_route.py) | `/export/geotiff` |
| [`system_route.py`](../python_engine/api/system_route.py) | `/capabilities` (self-describing feature list), `/metrics` |

> **A hard-won rule encoded here:** every route whose body blocks (satellite fetch, STAC, ONNX, DBSCAN)
> is declared plain `def`, **not** `async def`.
>
> Previously *every* route was `async def` and *none* used `await`, so a single scan froze the whole
> single-worker uvicorn: `/health` blipped to **2703 ms** and the watchdog thought the engine was dead —
> it was never dying, it was *blocked*. As plain `def`, FastAPI runs them in its threadpool.
> Measured after: worst `/health` **72 ms across 34 probes during a real 29 s scan**.

**Support modules:** [`config.py`](../python_engine/config.py) (zero-dependency `.env` loader + all
scientific knobs), [`schemas.py`](../python_engine/schemas.py) (Pydantic contract with camelCase
aliasing), [`cache.py`](../python_engine/cache.py) (locked TTL cache),
[`metrics.py`](../python_engine/metrics.py) (in-process counters, no Prometheus dep),
[`db_connector.py`](../python_engine/db_connector.py) (optional Postgres),
[`hotspot/hotspot_storage.py`](../python_engine/hotspot/hotspot_storage.py) and
[`trajectory/trajectory_storage.py`](../python_engine/trajectory/trajectory_storage.py) (optional
persistence), [`analysis/change_detection.py`](../python_engine/analysis/change_detection.py) (raw-pixel
recent-vs-older AOI comparison), [`analysis/calibration.py`](../python_engine/analysis/calibration.py).

### 4.4 Backend (Node / Express)

**Routes** ([`backend/src/routes/`](../backend/src/routes/)) — 13 routers under `/api`:

`auth` (JWT + bcrypt + TOTP 2FA) · `stats` · `detections` · `hotspots` · `regions` · `alerts` ·
`satellite` · `pipeline` · `engine` (advanced-feature proxies) · `operations` · `areas` · `export` ·
`system`

**Services:**

| Service | Role |
|---|---|
| [`pipelinePersist.service.ts`](../backend/src/services/pipelinePersist.service.ts) | **What makes it real-time.** Every run lands as SatelliteImage + Detections + Hotspots + Trajectory + Alerts + PipelineLog rows. Region hotspots update in place by stable label; AOI hotspots get a run suffix so different drawn boxes never collide. Alerts dedupe per label per 24 h. Strictly best-effort — a broken DB never breaks a run. |
| [`auth.service.ts`](../backend/src/services/auth.service.ts) | Refresh tokens use a **denylist, not an allowlist** — see the box below |
| [`report.service.ts`](../backend/src/services/report.service.ts) | CSV (hand-built, RFC-4180 escaped) and PDF (pdfkit) deliverables |
| [`satellite.service.ts`](../backend/src/services/satellite.service.ts) | Provider status + newest scene |

> **The refresh-token bug worth remembering.** An in-memory *allowlist* of valid refresh JTIs was wiped
> on every backend restart — and dev runs `tsx watch`, so *every code edit* restarted it. All outstanding
> refresh tokens became "reused/revoked" → refresh 401'd → the app silently lost **write** access
> (scans, acks, dispatch) while public **reads** kept working, so everything looked healthy.
>
> Fix: **allowlist → denylist.** A fresh token is valid by signature + 7-day expiry; rotation denylists
> the old jti (one-time use preserved); logout denylists (revocation preserved). Restart clears the
> denylist ⇒ fails **open**, not closed.

**Lib:**

| Module | Role |
|---|---|
| [`queue.ts`](../backend/src/lib/queue.ts) | BullMQ. Requests enqueue and return immediately; a worker executes engine-call + persist with 3 attempts and exponential backoff. Redis probed with a 30 s cached throwaway connection; when down, routes fall back to the direct path. **The queue is an upgrade, never a requirement.** Also hosts the repeatable region sweep. |
| [`live.ts`](../backend/src/lib/live.ts) | WebSocket `/ws/live` broadcasting run / alert / job / schedule events. Push-only and best-effort — the UI keeps polling as fallback, so a dropped socket loses immediacy, never data |
| [`dataMode.ts`](../backend/src/lib/dataMode.ts) | Live-DB vs bundled-demo, with 30 s health polling that self-heals mock → db. Every response carries an `X-Data-Source` header |
| [`serviceControl.ts`](../backend/src/lib/serviceControl.ts) | **Read-only by design** — see the box below |
| [`engine.ts`](../backend/src/lib/engine.ts) · [`env.ts`](../backend/src/lib/env.ts) · [`prisma.ts`](../backend/src/lib/prisma.ts) · [`logger.ts`](../backend/src/lib/logger.ts) | Engine HTTP client, zero-dep env loader, Prisma singleton, tiny logger |

> **Service lifecycle is host-owned.** `serviceControl.ts` used to start and stop processes for the UI;
> that was removed entirely. The services are owned by `start-all.cmd` and the watchdog, which outlive
> any browser session — a dashboard click must not kill the engine mid-scan.
>
> It now **HTTP-probes `/health`** for the engine and Clay (a bare TCP connect reported a hung-but-bound
> port as "up" while real scans failed with "engine unreachable") and TCP-probes db/redis.

**Data layer** ([`backend/src/data/`](../backend/src/data/)) — `repo.ts`, `operations.repo.ts`,
`areas.repo.ts`, `mock.ts`, `users.ts`. Every function tries Prisma first and transparently falls back
to an in-memory demo store, so the entire API works with **no database at all**.

### 4.5 Database (PostgreSQL + Prisma)

[`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma) — 18 models:

| Group | Models |
|---|---|
| **Core science** | `Region`, `SatelliteImage`, `Detection`, `Hotspot`, `Trajectory`, `Alert`, `PipelineLog`, `ModelVersion` |
| **Identity** | `User`, `UserRegion`, `RefreshToken`, `ApiKey`, `AuditLog` (append-only) |
| **Operations** | `Operation`, `OperationEvent`, `MissionReport` |
| **Study areas** | `SavedArea`, `AreaForecast` |

Two schema decisions worth calling out:

- `Operation.hotspotId` / `detectionId` are **soft references** (plain strings, not FK relations).
  Hotspots are recomputed and replaced on every pipeline run, so a hard FK with cascade would silently
  delete completed operations. `targetLat` / `targetLon` snapshot the location.
- `AreaForecast` is **append-only history**, not overwritten, so successive forecasts over the same
  water stay comparable — which is what makes the drift model auditable rather than a one-shot number.

PostGIS is intentionally *not* enabled yet: geometry is stored as plain lat/lon floats, and the portable
dev cluster doesn't bundle it. It re-enters with the first real geometry column.

### 4.6 Frontend (React)

**Public / marketing** (under [`MarketingLayout`](../frontend/src/components/layout/MarketingLayout.tsx)):
Landing, About, Contact, Documentation, FAQ, Terms, Privacy, Compliance.

**App — IA v2, consolidated 14 → 10 pages.** Defined once in
[`config/nav.ts`](../frontend/src/config/nav.ts), shared by the sidebar and the ⌘K command palette so
they can never drift apart.

| Group | Page | What it does | Min role |
|---|---|---|---|
| Monitor | [`CommandCenter`](../frontend/src/pages/CommandCenter.tsx) | Merges Dashboard + Live Ops + Alerts. Live status rail (engine / model / queue / satellite / Clay / embedding store), alert inbox with in-place ack, run-all-regions | FIELD |
| | [`MapExplorer`](../frontend/src/pages/MapExplorer.tsx) | Draw an AOI → live SSE stage progress → detections, heatmap, hotspots, drift, similar-sites drawer | FIELD |
| | [`Areas`](../frontend/src/pages/Areas.tsx) | Saved AOIs + the 72 h drift surface. Full-screen detail with landfall-risk verdict hero, multi-horizon selector (24–240 h), ensemble-agreement card, activity + cleanup-impact ledger, printable brief, GeoJSON export, `?area=` deep links | FIELD |
| | [`Records`](../frontend/src/pages/Records.tsx) | One catalog, Raw ↔ Clustered toggle; brushable severity × landfall-ETA scatter | FIELD |
| Intelligence | [`AILab`](../frontend/src/pages/AILab.tsx) | Model report card, confusion heatmap, live evaluation, embedding/fusion explorer | COASTGUARD |
| | [`ActiveLearning`](../frontend/src/pages/ActiveLearning.tsx) | Human-in-the-loop review queue, retrain-readiness bar, CSV export | ADMIN |
| | [`Pipeline`](../frontend/src/pages/Pipeline.tsx) | Stage-by-stage run view | FIELD |
| Operate | [`Operations`](../frontend/src/pages/Operations.tsx) | Dispatch board, status timeline, mission reports | FIELD |
| | [`AnalyticsReports`](../frontend/src/pages/AnalyticsReports.tsx) | Trends + exports together | COASTGUARD |
| System | [`Settings`](../frontend/src/pages/Settings.tsx) | Profile, 2FA, preferences | FIELD |
| | [`AdminPanel`](../frontend/src/pages/AdminPanel.tsx) | Users, roles, services | ADMIN |

Retired routes (`/app/ops`, `/app/alerts`, `/app/detections`, `/app/hotspots`, `/app/model`,
`/app/intelligence`, `/app/reports`) permanently redirect, so old bookmarks never 404.

**Role gating is enforced in three places** — the sidebar, the command palette, and
[`RequireRole`](../frontend/src/components/layout/RequireRole.tsx) on the route itself — so a hidden page
can't be reached by typing its URL either.

**State & data:**

- TanStack Query via [`hooks/useApi.ts`](../frontend/src/hooks/useApi.ts) (~45 hooks)
- Zustand: [`authStore`](../frontend/src/stores/authStore.ts),
  [`mapStore`](../frontend/src/stores/mapStore.ts)
- Axios client with transparent token refresh: [`lib/api.ts`](../frontend/src/lib/api.ts) (~60 methods)
- WebSocket: [`useLiveFeed`](../frontend/src/hooks/useLiveFeed.ts)
- Class colours unified in [`lib/classColors.ts`](../frontend/src/lib/classColors.ts) — Algae recoloured
  from `#10B981` (visually ≈ plastic teal) to lime `#84CC16`, because the collision made algae look
  like plastic
- Shared motion system: [`lib/motion.ts`](../frontend/src/lib/motion.ts) +
  [`PageTransition.tsx`](../frontend/src/components/layout/PageTransition.tsx), with
  `<MotionConfig reducedMotion="user">` at the app root for accessibility

> **A credibility fix in [`mapStore.ts`](../frontend/src/stores/mapStore.ts):** a session-restore
> snapshot was seeded onto the *wrong* AOI because its guard re-derived the key from mutable current
> state — the new box was compared against itself, always matched, and painted the previous area's
> detections before scanning.
>
> Snapshots now carry a `snapshotKey` provenance field; persist bumped to v2 with a migration that drops
> key-less rows (fails closed); and a genuinely restored scan shows a **"restored — not re-scanned"**
> badge instead of reading as live. Regression tests in
> [`mapStore.test.ts`](../frontend/src/stores/mapStore.test.ts).
>
> **Rule:** any cache or snapshot restored into a UI must store the key it was computed for — never
> re-derive that key from mutable current state.

---

## 5. Data flow — three concrete walkthroughs

### A. Analyst draws a box on the map

```
MapExplorer: drag rectangle
  → useAoiAnalysis → POST /api/pipeline/run { bbox, sceneSize, opts }      (auth required)
     └─ (optional) GET /api/pipeline/stream → proxies engine SSE → live stage strip

  → Backend: queued? enqueue BullMQ + 202  :  direct call, 120 s timeout

  → Engine POST /pipeline/run → run_aoi(bbox)
       DOWNLOAD  CDSE OAuth → Process API → tifffile → SceneData(+SCL surface, reliability)
       FDI       vectorised FDI + SCL keep-mask → ≤500 candidates + arr6
       CNN       11-feature MLP ensemble → 4 classes + high_confidence tier
       DBSCAN    HIGH-confidence plastic only → clusters → severity
       (spool)   64×64×5 chips → models/embed_queue/
       CLAY      sidecar /embed → k-NN affinity + novelty → CONFIRMED / POSSIBLE
       DRIFT     forcing → RK4 windage ensemble → mean + cone + ETA   (clamp=False for AOI)
       ALERT     HIGH/MEDIUM → alert candidates

  → Backend persistRun() → Postgres rows;  publishLive() → WebSocket broadcast

  → Frontend renders markers (suppressed if the scan grades unusable), legend counts
    "N high-confidence (~90 % precise) · M candidate", reliability banner
```

### B. Saving an area and forecasting drift

```
Map Explorer "Save area" → POST /api/areas (FIELD+) → SavedArea row with the full result JSON

Areas page → "Run 72 h forecast" → POST /api/areas/:id/forecast (FIELD+)

  Release point:  body coords → strongest plastic hotspot → highest-conf plastic detection
                  NEVER the AOI centroid → 422 if no plastic

  → Engine /forecast/trajectory
       _is_marine() elevation gate  → 422 if inland
       gridded CMEMS → point Open-Meteo → synthetic
       RK4 members → mean + cone → ETA + landfall probability (raw) → clamp → backtrack

  → Backend stores what the ENGINE returned (never a client-supplied path — otherwise a
    stored "prediction" would carry no more authority than whatever the browser POSTed)

  → AreaForecast row APPENDED (history preserved, never overwritten)
```

### C. Continuous scanning (opt-in)

```
SCHEDULER_ENABLED=1 → startScheduler() registers a BullMQ repeatable sweep
  → sweep job fans out one 'region' job per DB region
  → worker: runOnEngine → persistRun → publishLive

External alternative:  GET/POST /api/pipeline/scheduled-run
  (GitHub Actions cron / cron-job.org / Task Scheduler)
  guarded by SCHEDULER_TOKEN or a signed-in user — no default-open expensive-scan trigger
```

---

## 6. The model — what is real, and what the numbers actually are

### Shipped classifier

`marinenet.onnx` — a **3-seed ensemble** of 256-128-64-32 MLPs (averaged logits), trained with focal
loss + class-balanced (effective-number) weights + folded per-class bias calibration, on **real
MARIDA + MADOS** (Kikaki et al. 2022/2024) official train/val/test splits plus a refined
FloatingObjects subset. GPU-trained on an RTX 4050. ONNX ↔ torch agreement = **1.0**.

**Held-out results (499,907 real test pixels the model never saw):**

| Metric | Value |
|---|---|
| **macro-F1** | **0.8175** ← *always lead with this* |
| Accuracy | 0.9899 ← **Water-inflated**; Water is ~98 % of pixels |
| Balanced macro-F1 | 0.8776 |
| **Plastic** | P 0.776 · R 0.824 · **F1 0.799** |
| Algae | P 0.648 · R 0.822 · F1 0.725 |
| Sea_Foam | P 0.681 · R 0.835 · F1 0.750 |
| Water | P 0.998 · R 0.993 · F1 0.995 |
| Per-dataset | MARIDA macro-F1 0.905 · MADOS 0.784 |
| New-seas water false-positive | 0.7 % |

**Plastic recall on every labelled benchmark** (live ensemble through the real inference path):
MARIDA 90.6 % · MADOS 89.9 % · RFO 25.3 % · PLP 0.0 %.

**Two-tier plastic confidence:** `P(plastic) ≥ 0.648` → HIGH (~90 % precision / 57 % recall).
Raising to 0.79 gives ~95 % precision at 16 % recall. Hotspots and dispatch use HIGH only.

### Clay v1.5 (frozen encoder + 1024-256-4 head)

| Comparison | Clay | Per-pixel MLP on same chips | From-scratch patch CNN |
|---|---|---|---|
| macro-F1 (identical held-out chips) | **0.711** | 0.690 | 0.555 |
| Debris recall, brand-new seas (Durban, Marmara) | **0.542** | 0.222 | — |
| Water FP on those seas | 7.6 % | 0.4 % | — |

The frozen pretrained backbone fixes the scene-overfitting that killed the from-scratch CNN. Clay
catches **2.4× the debris** on seas it has never seen — the cross-domain generalisation win.
It is used as a **frozen verifier**, not a detector (its own plastic F1 is 0.37).

### Honest limitations — surfaced in-app, not buried

- **PLP in-situ is the weak point.** Against real deployed HDPE targets (Plastic Litter Project 2021),
  the live model detects **0 / 33**. Targets are 3.5–14 m in a 10 m pixel — the pixel is ~90 % water.
  This is a **resolution limit, not a data limit**, and it was tested empirically: retraining *with*
  PLP dropped plastic precision **0.776 → 0.660** while lifting deployed-target recall only 0/33 → 2/33.
  Teaching water-like spectra as "plastic" just buys false positives. The model was not promoted.
- **The patch CNN honestly lost.** ResNet on 64×64×6: macro-F1 **0.555** vs 0.818 per-pixel. With only
  a few hundred distinct scenes it memorised scenes rather than learning plastic. Kept opt-in via
  `CNN_MODEL_PATH`, **not shipped** — a reported negative result rather than a hidden one.
- **Drift is not validated against real drifter tracks.** The harness exists
  ([`validate_drift.py`](../python_engine/ml/validate_drift.py), Liu–Weisberg skill score) but no
  reference tracks have been run through it.
- **Biofouling correction is a labelled heuristic**, off by default.
- **`nearest_coast_lon` has no distance guard** — an Andaman point (its own `coast_lon` is `None`)
  borrows Chennai's meridian ~1300 km away.
- **`DEMO_MODE` defaults to `True`** when the env var is unset
  ([`config.py:47`](../python_engine/config.py#L47)), so forecasts silently use synthetic forcing unless
  `DEMO_MODE=false` is exported in the serving shell.
- **Plastic F1 cannot be pushed to 0.9x with Sentinel-2 spectral data** — plastic overlaps algae, foam
  and wood spectrally, and targets are frequently sub-pixel. **Sell precision, not F1.**
  The real levers are higher-resolution imagery (PlanetScope 3 m, drones) or SAR / multi-temporal
  fusion — architectural projects, not dataset downloads.

### Positioning

**Upper-level and unique** on operations + deployment transparency: the only end-to-end agency console
in the field, per-stage live/demo tagging, a closed active-learning loop, one of two foundation-model-
adjacent systems.
**Lagging** on detection science — which is fine *only* because the thesis is architectural and
operational, not algorithmic, and because nothing is overclaimed.

---

## 7. The actual update history

Reconstructed from the memory changelog and verified against source. Git history is squashed into
6 commits, so this is the real record.

### Foundation — through 2026-07-13
Monorepo scaffold, design system and component library, PostGIS-ready schema + migrations + seed,
JWT/RBAC/TOTP auth + audit log, REST API + BullMQ, the FDI → CNN → DBSCAN → drift engine, frontend
routing + map + dashboards, alerts, PDF/CSV exports, compliance page.

### 2026-07-14 — real end-to-end
Real CDSE pixels, trained MLP, live Clay on GPU, gridded CMEMS drift. Adaptive-resolution + native-res
tiling ingest. RK4 integrator. Drift validation harness. Opt-in flags (`SCHEDULER_ENABLED`,
`DATA_STRICT`, `REQUIRE_MODEL`).
**Credibility fixes:** the ~1000× area bug fixed at source; auth enforced on all write routes; AI Lab
leads with macro-F1 + the Water-inflation note; heuristic-mode banner; stale "synthetic spectra"
descriptor removed from metrics.

### 2026-07-17 — three engine-integrity fixes
1. The engine was silently running the **heuristic, not the trained model** — `onnxruntime` was missing
   from the interpreter actually serving uvicorn, so the lazy import failed and it degraded quietly
   while metrics.json still advertised real numbers.
2. **Fake-async was freezing the whole engine** — every route `async def`, zero `await`.
3. The Clay probe cost 1 s per call on a dead port → negative-only cache, **1035 ms → 3.6 ms**.

Also: **service start/stop buttons removed from the UI entirely** (user directive; lifecycle is
host-owned).

### 2026-07-20 — landfall clamp + snapshot provenance
Drift paths ran the full horizon past landfall (a Mumbai release with 15 h ETA ended ~19.33 / 73.22,
inland). Clamp the aggregated mean + cone, never the members; ETA and landfall computed before clamping.
Also fixed a snake_case / camelCase cone mismatch that meant the on-demand forecast cone had **never
rendered**.
Separately: Map Explorer was painting the *previous* area's detections before scanning — snapshots now
carry provenance keys.

### 2026-07-22 — cloud-aware ingest + the macro-F1 retrain
- **Ingest:** `max_cloud` 100 → 50; SCL class 2 dropped; reliability grading added; SCL cloud % made
  authoritative over STAC tile %.
- **Model:** macro-F1 **0.787 → 0.824** via focal loss + class-balanced weights + wider net +
  calibration + RFO data. Then a deliberate trade — the **3-seed ensemble** promoted live:
  full macro-F1 0.824 → 0.8175 (flat) but **Plastic F1 0.742 → 0.799, precision 0.652 → 0.776,
  new-seas water-FP 3 % → 0.7 %**.
- **Two-tier confidence system** wired end to end (engine → schema → backend → map rendering + legend).
- **"LAND 0 %" bug** fixed (surface diluted by nodata); land/cloud scans now suppress map markers.
- **Areas detail redesign** — full-screen modal with sticky command bar, landfall-risk verdict hero, and
  10 new features: dispatch-from-hotspot, activity + cleanup-impact ledger, multi-horizon 24–240 h,
  ensemble-agreement card, narrated verdict caption, gallery triage toolbar, deep links, printable
  brief, data-quality panel, animations.

### 2026-07-23 — "always run at highest capability"
Clay had been **silently off for every scan** — the sidecar was never launched. Now in `start-all.cmd`
and the watchdog; the CLAY stage is always emitted; a Clay tile appears in the live status rail.
An audit found Redis hung (port listening but PING failing) and **32 undrained embedding chips**; both
fixed — the drainer was rewritten to go through the sidecar and made always-on.
Also killed **senseless drift** (no plastic → 422; inland → elevation gate) and unified algae colour.
Empirically tested and rejected "more data" as a fix for sub-pixel plastic.

### 2026-07-24 — display-layer honesty
Stale forecasts were still *rendering* even though creation was guarded → `areaHasPlasticToForecast()`
now gates every forecast surface. Health chips switched from **TCP to HTTP probes** — a bound-but-not-
serving port read "up" while real scans failed.
Also: the permanent fix for AOI scans 401-ing after every backend restart (allowlist → denylist).

### 2026-07-27 — current branch `fix/scan-and-auth-reliability`
- Refresh-token allowlist → denylist (committed)
- Health chips HTTP-probe `/health` (committed)
- No drift render for areas with no plastic (committed)
- **Public-page refresh for credibility** (uncommitted): "CNN" → 3-seed per-pixel MLP ensemble
  everywhere; Clay verifier stage documented (the pipeline is **7 stages**, was mislabelled 6);
  macro-F1 corrected to ~0.82 (from "0.79" / a "98.9 % accuracy" hero);
  **a false claim removed from `Compliance.tsx`** that called the shipped classifier
  *"a clearly-labelled synthetic-spectra baseline"* — the model is real MARIDA+MADOS-trained
- Shared motion system + `reducedMotion="user"` at the app root

---

## 8. Current state and open gaps

### Working

All six processes; real CDSE ingest; live trained ensemble; live Clay verification on GPU; real
CMEMS / Open-Meteo drift; Postgres persistence; BullMQ queue; WebSocket + SSE live feeds; 3-role RBAC;
field-operations workflow; CSV / PDF / GeoTIFF / GeoJSON exports; active-learning loop.

### Known gaps — none hidden

| Gap | Notes |
|---|---|
| [`README.md`](../README.md) phase table | Badly stale; should be rewritten to match reality |
| Watchdog Redis check | Checks **port**, not PING — a hung Redis still slips past |
| No delete-forecast route | Stale forecast rows stay dormant (display is gated, but the row remains) |
| No delete route for operations | They can be CANCELLED via the ops board |
| `nearest_coast_lon` distance guard | Missing — borrows a far-away meridian for regions with no coast |
| `DEMO_MODE` defaults `True` when unset | Silently synthetic forcing unless explicitly `false` |
| Scheduled **AOI-level** monitoring | Deliberately deferred. Needs a `scan_snapshot` table (scans currently overwrite), an AOI scheduler, and a create-alert path — plus real risk of burning CDSE quota on a timer. `SCHEDULER_ENABLED` today does **region**-level sweeps only |
| "CNN" in some doc prose | Interactive UI corrected; a few static doc pages may lag |

### Roadmap direction

Reuse the fingerprint + fusion + change + active-learning spine to detect **oil spills, harmful algal
blooms, and coastal flooding** from the same free imagery. Each is a new head on top of Clay
embeddings — mostly a new labelled set plus a small head, not a rebuild.

---

## Appendix — quick reference

### Scientific constants

| Parameter | Value | Env var |
|---|---|---|
| FDI threshold | 0.02 | `FDI_THRESHOLD` |
| DBSCAN eps | 0.09° | `DBSCAN_EPS_DEG` |
| DBSCAN min_samples | 3 | `DBSCAN_MIN_SAMPLES` |
| Drift horizon | 72 h | `DRIFT_HORIZON_HOURS` |
| Windage coefficients | 1.5 – 3 % | — |
| High-confidence plastic | 0.648 | `PLASTIC_HIGH_CONF` |
| Ingest max cloud | 50 % | `INGEST_MAX_CLOUD` |
| Ingest window | 45 d, widening to 180 d | `INGEST_DAYS_BACK`, `INGEST_DAYS_BACK_MAX` |
| SCL keep-mask | `6,7` | `INGEST_KEEP_SCL` |
| Auto-confirm confidence | 0.85 | — |
| Coast-proximity alert | ETA ≤ 48 h | — |
| Pixel footprint | 0.0001 km² (10 m) | — |

### Monitored regions

| Code | Name | Centre | Coast lon |
|---|---|---|---|
| MUM | Mumbai Coast | 19.076, 72.877 | 72.95 |
| GOA | Goa Coastline | 15.299, 74.124 | 74.20 |
| KCH | Kochi – Arabian Sea | 9.931, 76.267 | 76.35 |
| CHN | Chennai – Bay of Bengal | 13.082, 80.270 | 80.35 |
| AND | Andaman & Nicobar Sea | 11.740, 92.658 | *open ocean* |

### RBAC

| Role | Level | Can |
|---|---|---|
| ADMIN | 3 | Everything, incl. Active Learning (retrains the model) and Admin panel |
| COASTGUARD | 2 | + AI Lab, Analytics & Reports, label detections |
| FIELD | 1 | Monitor, Map, Areas, Records, Pipeline, Field Ops, Settings |

Reads are largely public so the demo renders without a login; **writes are privileged and
backend-enforced**.

### Opt-in flags

| Flag | Effect |
|---|---|
| `SCHEDULER_ENABLED=1` | Internal BullMQ repeatable region sweep (+ `SCAN_INTERVAL_MINUTES`, default 360) |
| `DATA_STRICT=1` | Backend fails fast if the DB is down — no silent mock fallback |
| `REQUIRE_MODEL=1` | Engine refuses to start in un-benchmarked heuristic mode |
| `CLAY_LIVE=0` | Disable live Clay tier-2 |
| `EMBED_DRAIN=0` / `EMBED_SPOOL=0` | Disable the embedding drainer / spool |
| `BIOFOULING_CORRECTION=on` | Enable the biofouling heuristic globally |
| `DEMO_MODE=false` | **Required** for real drift forcing |
