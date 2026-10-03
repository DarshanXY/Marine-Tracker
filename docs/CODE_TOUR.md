# Code Tour: where is the code for what we are showing?

**Marine Plastic Tracker.** This page connects everything you can see on screen to the exact lines of code behind it, and explains the logic in words you can say out loud to the panel.

> **How to use it in the viva**
>
> 1. Open **`docs/CODE_TOUR.html`** in the browser. Click any `file:line` link and **VS Code opens on that exact line** (the first time, the browser asks "Open Visual Studio Code?" - tick *always allow*).
> 2. Or open **`docs/CODE_TOUR.md`** in VS Code, press `Ctrl+Shift+V`, and `Ctrl+click` a link.
> 3. If a link ever fails: `Ctrl+P` -> type the file name -> `Ctrl+G` -> line number. Or search the **exact text you see on screen** with `Ctrl+Shift+F` (section 3 lists them).
> 4. After anyone edits code, run `C:\Anaconda\python.exe docs\code-tour\build_code_tour.py` (Anaconda has the `markdown` package the HTML page needs). It recomputes every line number from the real files and **stops with an error if something was renamed**, so no link can silently point at the wrong place. `python docs\code-tour\build_code_tour.py --check` needs nothing extra and only verifies the links.

- [The three questions in 60 seconds](#the-three-questions-in-60-seconds)
- [1. The system in one picture](#1-the-system-in-one-picture)
- [2. One click, end to end: "You draw a box - what runs?"](#2-one-click-end-to-end-you-draw-a-box---what-runs)
- [3. The screenshot, element by element](#3-the-screenshot-element-by-element)
- [4. How plastic is detected: the seven stages](#4-how-plastic-is-detected-the-seven-stages)
  - [Stage 1 - Scan scene (DOWNLOAD): get real pixels](#stage-1---scan-scene-download-get-real-pixels)
  - [Stage 2 - FDI index (FDI): find "something floating"](#stage-2---fdi-index-fdi-find-something-floating)
  - [Stage 3 - Classify (CNN code, card says "MLP"): what is it?](#stage-3---classify-cnn-code-card-says-mlp-what-is-it)
  - [Stage 4 - Cluster (DBSCAN): turn pixels into hotspots](#stage-4---cluster-dbscan-turn-pixels-into-hotspots)
  - [Stage 5 - Clay verify (CLAY): a second, independent opinion](#stage-5---clay-verify-clay-a-second-independent-opinion)
  - [Stage 6 - Drift: where does it go in 72 hours?](#stage-6---drift-where-does-it-go-in-72-hours)
  - [Stage 7 - Alerts](#stage-7---alerts)
  - [The numbers to quote (from the model's own files)](#the-numbers-to-quote-from-the-models-own-files)
- [5. Why the folders are named 10, 20 and 60](#5-why-the-folders-are-named-10-20-and-60)
- [6. Where the training data and the model come from](#6-where-the-training-data-and-the-model-come-from)
- [7. Every other page: route -> code -> data](#7-every-other-page-route---code---data)
- [8. The backend, in order of how a request travels](#8-the-backend-in-order-of-how-a-request-travels)
- [9. The engine, folder by folder](#9-the-engine-folder-by-folder)
- [10. Questions the panel is likely to ask](#10-questions-the-panel-is-likely-to-ask)
- [11. Weak points, and how to say them honestly](#11-weak-points-and-how-to-say-them-honestly)
- [12. Before you present: a 6-point checklist](#12-before-you-present-a-6-point-checklist)
- [13. Files that look important but are not used](#13-files-that-look-important-but-are-not-used)

## The three questions in 60 seconds

**1. How do you detect plastic?**
Plastic floating on the sea reflects **near-infrared light** more than water does (water swallows it). We download a Sentinel-2 satellite image, compute the **Floating Debris Index (FDI)** for every pixel - "how much brighter than water is this pixel in near-infrared" - and keep the pixels above a threshold as *candidates*. FDI cannot tell plastic from seaweed, foam or wood, so a small **neural network (MLP)** looks at 11 spectral numbers per candidate and says Plastic / Algae / Sea-foam / Water with a confidence. Confident plastic pixels that sit close together are grouped by **DBSCAN** into *hotspots*; a second AI (**Clay**) double-checks them; and a **drift model** forecasts where each hotspot travels in 72 hours. Code: [run_aoi() in main_pipeline.py](../python_engine/main_pipeline.py#L217) - it is 80 lines and reads like the list above.

**2. Where is the code of this UI?**
The screen in the screenshot is the **Map Explorer** page: [`MapExplorer.tsx:467`](../frontend/src/pages/MapExplorer.tsx#L467). The seven "Live processing" cards are [`MapExplorer.tsx:1098`](../frontend/src/pages/MapExplorer.tsx#L1098). Every element is mapped to its code in **section 3**, and the full click-to-database chain is in **section 2**.

**3. Why are the MADOS folders called 10, 20 and 60?**
It is the **pixel size in metres**. Sentinel-2 photographs different colours (bands) at different sharpness: 4 bands at 10 m, 6 bands at 20 m, and others at 60 m. The dataset stores each band in the folder for its own resolution. Full answer with our own numbers: **section 5**.

## 1. The system in one picture

```
 Browser   React + Vite  (:5173)                      frontend/src
    |  axios  ->  /api/...   (login token in every request)
    v
 Backend   Node + Express  (:3001)                    backend/src
    |  login + roles, saving results to the database, job queue, live WebSocket, CSV/PDF export
    |  fetch  ->  http://localhost:8000
    v
 Engine    Python + FastAPI  (:8000)                  python_engine
    |  ALL the science: download -> FDI -> classify -> cluster -> Clay -> drift -> alerts
    |  optional  ->  http://localhost:8010   Clay verifier (GPU sidecar)
    v
 Outside data:  Copernicus Data Space (real Sentinel-2 pixels) - AWS Earth Search (scene list, thumbnails)
                Open-Meteo (ocean currents, wind, elevation) - Esri (satellite basemap tiles)
 Storage:       PostgreSQL :5432 (LIVE app database: users + every detection/hotspot/alert)
                Redis :6379 (job queue)
                MySQL :3306 (read-only COPY for browsing/reports: all datasets + a snapshot of the app tables)
```

**Two databases, two jobs - be ready to explain this.** The running app reads and writes **only PostgreSQL** (Prisma, [schema.prisma](../backend/prisma/schema.prisma#L12)). **MySQL** is a separate, read-only copy built by two scripts in `database/mysql`: [load_datasets.py](../database/mysql/load_datasets.py#L634) loads every training dataset (MARIDA, MADOS, RFO, PLP, the 2.1 M labelled pixels, model scores) into `mpt_datasets`, and [sync_app.py](../database/mysql/sync_app.py#L164) copies the live PostgreSQL tables into `mpt_app` (leaving out passwords, secrets and tokens). Nothing in the backend reads MySQL; it exists so the data can be opened in MySQL Workbench, Power BI or the generated `dashboard.html`.

| Layer | Its one job | Entry file |
|---|---|---|
| Frontend | draws the screens, sends the user's requests | [App.tsx (routes)](../frontend/src/App.tsx#L122) |
| Backend | who you are (JWT + roles), what to save, talks to the engine | [index.ts](../backend/src/index.ts#L105) |
| Engine | every calculation about the sea | [app.py](../python_engine/api/app.py#L29) |

Start everything with [start-all.cmd](../start-all.cmd#L9) (database, Redis, engine, Clay, backend, frontend - each in its own window).

## 2. One click, end to end: "You draw a box - what runs?"

1. **You drag a rectangle.** [`MapExplorer.tsx:50`](../frontend/src/pages/MapExplorer.tsx#L50) listens to `mousedown / mousemove / mouseup` on the map and turns the drag into `{north, south, east, west}`. Boxes smaller than 0.01 degrees are ignored (`MIN_DEG`).
2. **The page reacts.** `setBbox(...)` in `MapExplorer` changes state, which makes [useAoiAnalysis](../frontend/src/hooks/useApi.ts#L78) fire automatically (React-Query). A new box always scans fresh (`staleTime: 0`); *Go live* repeats it every 30 seconds.
3. **The API call.** [api.analyzeAoi](../frontend/src/lib/api.ts#L360) sends `POST /api/pipeline/run` with the box. The timeout is 130 s because a real satellite download is slow.
4. **Express checks the login.** [POST /run](../backend/src/routes/pipeline.routes.ts#L115) runs the [authenticate](../backend/src/middleware/auth.ts#L13) middleware (valid JWT?), validates the box with [parseBbox](../backend/src/routes/pipeline.routes.ts#L74), and forwards it with [callEngine](../backend/src/lib/engine.ts#L7) (120 s timeout).
5. **FastAPI receives it.** [pipeline_run](../python_engine/api/predict_route.py#L42) keeps a 20-second cache (so a double click does not download twice) and calls the orchestrator.
6. **The orchestrator runs seven stages.** [run_aoi](../python_engine/main_pipeline.py#L217) - each stage records its own duration and a one-line detail; those become the cards on screen. Section 4 explains each stage.
7. **Back in Express, the result is saved.** [persistRun](../backend/src/services/pipelinePersist.service.ts#L59) writes a `SatelliteImage`, all `Detection` rows, `Hotspot` rows, `Trajectory` rows, deduplicated `Alert` rows and one `PipelineLog` row per stage into PostgreSQL, then announces it on the WebSocket ([publishLive](../backend/src/lib/live.ts#L25)). Saving is *best-effort*: if the database is down, the scan still returns.
8. **The browser draws the answer.** Markers, the cards, the surface bar and the result panel all render from the one `result` object (see section 3).

**What if something is down?** Engine unreachable -> [offlineAoiResult](../backend/src/routes/pipeline.routes.ts#L85) returns an honest "engine offline" result with **no invented detections**. Satellite download fails -> the engine falls back to a *labelled synthetic* scene ([scene_for_bbox](../python_engine/satellite/download.py#L276)) and the UI says so ([SurfaceReadout](../frontend/src/pages/MapExplorer.tsx#L311)).

## 3. The screenshot, element by element

The screen in the panel's screenshot is `localhost:5173/app/map`. Left column = the exact text on screen (search for it with `Ctrl+Shift+F`).

| On screen | Where the code is | What it does |
|---|---|---|
| Left sidebar: *Monitor - Command Center, Map Explorer, Areas, Records; Intelligence - AI Lab; Operate - Field Ops, Analytics & Reports; System - Settings* | [NAV_SECTIONS](../frontend/src/config/nav.ts#L37) drawn by [AppLayout](../frontend/src/components/layout/AppLayout.tsx#L58) | One list feeds the sidebar **and** the search box. `minRole` hides pages you are not cleared for; [RequireRole](../frontend/src/components/layout/RequireRole.tsx#L14) also blocks the URL. |
| *Search... Ctrl+K* | [CommandPalette](../frontend/src/components/layout/CommandPalette.tsx#L37) | Jump to any page by typing; uses the `keywords` in nav.ts. |
| Bell with red badge | [NotificationCenter](../frontend/src/components/layout/NotificationCenter.tsx#L27) | The badge counts **unacknowledged** alerts; the panel lists the latest 8 and Coast Guard and above can acknowledge them. New HIGH alerts also pop up as toasts via [useAlertNotifications](../frontend/src/hooks/useAlertNotifications.ts#L38). |
| Green chip *Live satellite* | [DataBadge](../frontend/src/components/layout/AppLayout.tsx#L18) | Three states from the backend's satellite status: **Live satellite** (real imagery mode is on), **Demo data** (backend up, real imagery off), **Offline - mock** (backend unreachable). |
| Satellite map (Esri, "Leaflet / Imagery (c) Esri") | [MapContainer](../frontend/src/components/map/MapContainer.tsx#L30) | Free real satellite tiles. Leaflet draws the map. |
| Teal rectangle | drawing: `AoiSelector`; committed: [the AOI outline](../frontend/src/pages/MapExplorer.tsx#L756) | The area that was sent to the engine. |
| **Legend** box (Plastic, Algae, High-severity hotspot, ...) | [the Legend](../frontend/src/pages/MapExplorer.tsx#L936) | Colours come from [classColors.ts](../frontend/src/lib/classColors.ts#L8) so every page uses the same palette. |
| **Live processing** - 7 cards: Scan scene, FDI index, Classify (MLP), Cluster, Clay verify, Drift, Alerts | [StageTimeline](../frontend/src/pages/MapExplorer.tsx#L1098) and the card names in [STAGE_META](../frontend/src/pages/MapExplorer.tsx#L39) | One card per engine stage. Green tick = the stage finished. The small grey text is that stage's own `detail` string from the engine. |
| Card time, e.g. *DOWNLOAD - 71.5s*, *FDI - 55ms*, *DBSCAN - <1ms* | measured in [_ms()](../python_engine/main_pipeline.py#L34) around each stage | The download is slow because ~20 MB of satellite pixels come over the internet. All the maths after it takes milliseconds. |
| *500 candidate pixels for AOI via sentinelhub - REAL Sentinel-2 reflectance - surface 76.8% water / 23.0%...* | [_download_detail](../python_engine/main_pipeline.py#L53) | "sentinelhub" = real pixels from Copernicus. 500 is the cap on candidate pixels per scan ([extract_candidates](../python_engine/satellite/threshold_applier.py#L14)). |
| *343 candidate pixels above FDI 0.02 - 157 inland (>3 km from coast) dropped* | [_drop_inland](../python_engine/main_pipeline.py#L75) | 157 candidates were on land more than 3 km from the coast (ponds, wet fields), so they were removed before classification. |
| *0 plastic of N classified via per-pixel model (model_loaded=True)* | [classify_candidates](../python_engine/ml/batch_classifier.py#L32) | Which classifier ran. `model_loaded=True` = the trained ONNX network, not the fallback rules. |
| *Scanning: Open water* + coloured bar *water 76.8% - land 23% - cloud 0.1% - 44% observed* | [SurfaceReadout](../frontend/src/pages/MapExplorer.tsx#L311), numbers from [surface_from_scl](../python_engine/satellite/cloud_masker.py#L58) | Uses the satellite's own land/cloud/water map (SCL). *44% observed* = only 44% of the box had a clear pass; the other 56% was cloud-gapped, so shares are of the observed part only. |
| Amber warning "This tool detects floating debris on water..." | same `SurfaceReadout` (`notWater` branch), and [scanUsable](../frontend/src/pages/MapExplorer.tsx#L587) | If the box is mostly land or cloud, the detections are **not drawn on the map** and the warning explains why, instead of painting a fake debris field over land. |
| **This area, right now** panel + *ON DEMAND / live - 30s* badge | [AoiResultPanel](../frontend/src/pages/MapExplorer.tsx#L1182) | Summary of the last scan. |
| Orange badge **RESTORED - NOT RE-SCANNED** | [the restored logic](../frontend/src/pages/MapExplorer.tsx#L493) with [useMapStore](../frontend/src/stores/mapStore.ts#L45) | If you leave and return, the last result is reloaded from the browser instead of re-downloading. Press **Rescan** for fresh pixels. |
| Four numbers: *Candidate px, Plastic, Hotspots, Avg conf.* | [Metric](../frontend/src/pages/MapExplorer.tsx#L1376) fed by `result.stats`, built at the end of [run_aoi()](../python_engine/main_pipeline.py#L290) | Straight from the engine. |
| *GeoJSON* button | `exportGeojson` inside `AoiResultPanel` | Downloads detections, hotspots, drift lines and the box for QGIS / ArcGIS. |
| Image on the right (satellite thumbnail, scene id, tile, date, cloud %) | [SceneCard](../frontend/src/pages/MapExplorer.tsx#L1299) from [_scene_ref_for_bbox](../python_engine/main_pipeline.py#L364) | Which real Sentinel-2 scene covers the box (looked up through the free AWS STAC catalogue). |
| *Advanced tools*: Min confidence slider, Dedupe, Biofouling | [Advanced tools](../frontend/src/pages/MapExplorer.tsx#L1005) | Options sent with the request. **Min confidence** hides weaker detections, so a high setting can make *"0 plastic of 0 classified"* appear even though 343 candidates were found - check it is 0% before a demo. |
| Buttons *72h forecast, Change vs 6 mo, Export FDI GeoTIFF* | [the tool buttons](../frontend/src/pages/MapExplorer.tsx#L1027) | Drift forecast for the top hotspot, change detection against 6 months ago, and a GeoTIFF of the FDI layer. |
| Save area / Areas page | [onSaveArea](../frontend/src/pages/MapExplorer.tsx#L534) | Stores the box and result on the server so it can be re-scanned later. |
| Click a hotspot -> side drawer | [SimilarSitesDrawer](../frontend/src/components/map/SimilarSitesDrawer.tsx#L62) | Finds visually similar sites using Clay embeddings. |

## 4. How plastic is detected: the seven stages

`run_aoi` in [main_pipeline.py](../python_engine/main_pipeline.py#L226) runs these in order. Every threshold below lives in one file: [config.py](../python_engine/config.py#L44).

### Stage 1 - Scan scene (`DOWNLOAD`): get real pixels
- **What we ask for:** five spectral bands **B04, B06, B08, B8A, B11** plus the **SCL** land/cloud map, for the drawn box - [BANDS](../python_engine/satellite/band_loader.py#L33) and the request script [_EVALSCRIPT](../python_engine/satellite/band_loader.py#L99).
- **From where:** Copernicus Data Space "Sentinel Hub Process API", logged in with free OAuth credentials ([get_token](../python_engine/satellite/band_loader.py#L165)). One request returns all bands already aligned to one grid.
- **Cloud handling:** we ask for a **least-cloud composite** - for every pixel, the clearest recent pass (max 50% scene cloud, last 45 days, widening to 180 days only if coverage is poor): [ingest_max_cloud](../python_engine/config.py#L79), [_real_ingest](../python_engine/satellite/download.py#L220).
- **Which pixels may become candidates:** only SCL classes 6 (water) and 7 (unclassified) - [ingest_keep_scl](../python_engine/config.py#L86), [keep_mask](../python_engine/satellite/cloud_filter.py#L24). Clouds, shadows, vegetation and bare soil are excluded.
- **Reliability grade:** [reliability_for](../python_engine/satellite/cloud_masker.py#L28) calls a scan *reliable / degraded / unusable* from coverage and cloud/land share.

### Stage 2 - FDI index (`FDI`): find "something floating"
The formula (Biermann et al., 2020), in [floating_debris_index](../python_engine/satellite/fdi_calculator.py#L19):

```
FDI = B08 - [ B06 + (B11 - B06) * (842 - 740) / (1610 - 740) * 10 ]
```

*In words:* draw a straight line between the red-edge band (740 nm) and the SWIR band (1610 nm). At the near-infrared wavelength (842 nm) that line tells you what **plain water** would reflect. FDI is how far the real NIR value sits **above** that line. Floating solids (plastic, wood, seaweed, foam) push NIR up; clean water does not.

- **Threshold:** a pixel is a candidate if `FDI > 0.02` ([fdi_threshold](../python_engine/config.py#L66)). Applied to the whole image at once in [extract_candidates](../python_engine/satellite/threshold_applier.py#L14).
- **Inland filter:** candidates more than **3 km inland** are dropped using country outlines from [countries.geojson](../data/coastline/countries.geojson#L1) (Natural Earth): [_COASTLINE](../python_engine/satellite/landmask.py#L73), [deep_inland](../python_engine/satellite/landmask.py#L180).
- **Honest limit:** FDI is a *screen*. It also lights up for seaweed, foam, ships, cloud edges and very turbid water. That is why stage 3 exists.

### Stage 3 - Classify (`CNN` code, card says "MLP"): what is it?
- **Model:** a small neural network, a **multi-layer perceptron (MLP)**, exported as `marinenet.onnx` and run with ONNX Runtime ([get_model](../python_engine/ml/model_loader.py#L61)). The shipped one is a **3-model ensemble** (256-128-64-32 neurons each), trained on about 1.08 million labelled pixels - [metrics.json](../python_engine/models/metrics.json#L4).
- **Input - 11 numbers per pixel:** the 5 bands, FDI, and 5 derived indices: NDVI (vegetation), PI (plastic index), MNDWI, red-edge NDVI, brightness - [_features](../python_engine/ml/inference_engine.py#L27).
- **Output:** one of four classes - **Plastic, Algae, Sea_Foam, Water** - and a confidence from softmax: [predict](../python_engine/ml/inference_engine.py#L45) and [_detection](../python_engine/ml/batch_classifier.py#L22).
- **Two confidence bars, do not mix them up:** `status = CONFIRMED` at confidence >= 0.85 ([AUTO_CONFIRM](../python_engine/ml/confidence_filter.py#L10)) is the analyst-facing label. `high_confidence` at >= 0.648 ([plastic_high_conf](../python_engine/config.py#L63)) was calibrated on held-out data to about **90% precision** and is the bar for creating hotspots.
- **Fallback:** if the ONNX file is missing the engine uses hand-written rules and says `heuristic` on the card. `REQUIRE_MODEL=1` makes a missing model a hard failure instead ([_strict](../python_engine/ml/model_loader.py#L54)); the rules themselves are in [classify](../python_engine/ml/inference_engine.py#L90).
- **Naming to be ready for:** the card is labelled *"Classify (MLP)"* but its code is `CNN`. That is a historical stage name; the shipped model is a per-pixel MLP. A patch-based CNN exists but scored worse (macro-F1 0.55), so it is not shipped ([the code comment](../frontend/src/pages/MapExplorer.tsx#L42)).

### Stage 4 - Cluster (`DBSCAN`): turn pixels into hotspots
- Only **high-confidence Plastic** pixels are clustered - a crew is never sent because of a low-confidence guess: [_make_hotspots](../python_engine/main_pipeline.py#L107).
- **DBSCAN** (written from scratch, no library): pixels within **0.09 degrees (~10 km)** of each other, at least **3** in a group, form a cluster - [dbscan](../python_engine/hotspot/dbscan_clusterer.py#L22), parameters [dbscan_eps_deg](../python_engine/config.py#L67).
- **Severity by size:** 10+ = HIGH, 5+ = MEDIUM, otherwise LOW - [severity_for](../python_engine/hotspot/severity_scorer.py#L12).

### Stage 5 - Clay verify (`CLAY`): a second, independent opinion
- **Clay** is a large pre-trained satellite "foundation model". [enrich_hotspots](../python_engine/ml/clay_live.py#L109) cuts a small image around each hotspot, sends it to the GPU sidecar ([clay_service.py](../python_engine/clay_service.py#L1)), and combines Clay's view with the MLP's ([confidence_fusion.py](../python_engine/ml/confidence_fusion.py#L1)) into **CONFIRMED** or **POSSIBLE**.
- Calibrated so CONFIRMED plastic is about **92% precise (70% recall)** on held-out MARIDA+MADOS: [fusion_thresholds.json](../python_engine/models/fusion_thresholds.json#L9).
- **Best-effort:** if the sidecar is off, the card says *Clay OFFLINE - MLP-only* and the scan still works ([_clay_stage](../python_engine/main_pipeline.py#L191)).

### Stage 6 - Drift: where does it go in 72 hours?
- **Physics:** a floating parcel moves with the **ocean current plus a small fraction of the wind** ("windage", 1.5-3%). [_velocity_deg](../python_engine/trajectory/lagrangian_model.py#L41) adds them; [integrate_members](../python_engine/trajectory/lagrangian_model.py#L63) steps forward one hour at a time with **Runge-Kutta 4**.
- **Ensemble and cone:** one track per windage value (0.015, 0.02, 0.025, 0.03) - [DEFAULT_WINDAGE](../python_engine/trajectory/ensemble_model.py#L10). The average is the path; the min/max envelope is the **uncertainty cone**.
- **Forcing data:** real hourly currents and wind from Open-Meteo ([fetch_forcing](../python_engine/trajectory/data_interpolator.py#L45)); if unreachable, a smooth synthetic field, labelled `synthetic`.
- **Landfall and ETA:** the path is cut where it enters a land polygon ([clamp_path](../python_engine/trajectory/polygon_landfall.py#L50)) and the hour it happens becomes the coast ETA. Orchestrated in [_drift_stage](../python_engine/main_pipeline.py#L140). Only the top 2 hotspots get a full track.
- **How good is it? We measured it** against real NOAA drifter buoys ([validate_drift_gdp.py](../python_engine/ml/validate_drift_gdp.py#L1), results in [drift_gdp_results.json](../python_engine/validation/drift_gdp_results.json#L104)). For the **25 undrogued surface drifters** (the closest stand-in for floating plastic; Indian Ocean, 2024-25), the median position error was about **12 km after 24 h, 22-26 km after 48 h and 29-33 km after 72 h**. Assuming "it does not move" gives 23, 34 and 57 km, so the model roughly **halves the error**.
- **Two honest caveats to volunteer:** (1) it is a *hindcast* (uses analysed currents and winds, not forecasts), so true forecast skill is lower; (2) the **uncertainty cone is too narrow**: it contains the buoy's real position only about **0% of the time at 24 h and 8% at 48-72 h**, because it reflects wind-drag spread only, not the real error. Say "forecast with an uncertainty that is optimistic", never "prediction".

### Stage 7 - Alerts
[_alert_stage](../python_engine/main_pipeline.py#L209) counts HIGH and MEDIUM hotspots. The backend then creates the real alert rows in [persistRun](../backend/src/services/pipelinePersist.service.ts#L173): the same hotspot does not alert twice within 24 hours, and an alert is `COAST_PROXIMITY` if the coast ETA is 48 h or less.

### The numbers to quote (from the model's own files)
Source: [metrics.json](../python_engine/models/metrics.json#L22).

| Measure (held-out MARIDA + MADOS test pixels) | Value |
|---|---|
| Macro-F1 (fair average over 4 classes) | **0.8175** |
| Plastic precision / recall / F1 | 0.776 / 0.824 / 0.799 |
| Accuracy | 0.99 - **but inflated**, because most pixels are water; always lead with macro-F1 |
| HIGH-confidence plastic tier (confidence >= 0.648) | about 90% precision, 57% recall |
| Water share of the 2.1 million labelled pixels we hold | about 98% (plastic is only about 0.5%) |

## 5. Why the folders are named 10, 20 and 60

**Short answer:** the number is the **ground pixel size in metres** of the images inside that folder.

Sentinel-2's camera records 13 colours ("bands"), but not all with the same sharpness. That is a sensor design trade-off (data volume and light available per band):

| Folder | Pixel size | Bands inside (MADOS, wavelength in nm) | Sentinel-2 names |
|---|---|---|---|
| `10` | 10 m | 492, 559, 665, 833 | B02 blue, B03 green, **B04 red**, **B08 NIR** |
| `20` | 20 m | 704, 739, 780, 864, 1610, 2186 | B05, **B06**, B07 red-edge, **B8A**, **B11**, B12 SWIR |
| `60` | 60 m | 442 | B01 coastal aerosol |

*(Checked on `data/MADOS/Scene_0`: 4 + 6 + 1 = 11 bands. The 10 m folder also holds the label masks `cl`, `conf`, `rep` and the RGB previews, because the annotators drew on the 10 m grid.)*

**Every crop covers the same 2.4 km x 2.4 km**, so the images are different sizes: 240 x 240 pixels at 10 m, 120 x 120 at 20 m, 40 x 40 at 60 m.

**Why it matters for us.** Our detector needs five bands: B04 and B08 (10 m folder) and B06, B8A, B11 (20 m folder). To give every pixel all five values, the training loader stretches the coarser images onto the 10 m grid - `factor = folder // 10`, so 20 m is repeated 2x2 and 60 m 6x6 (nearest neighbour): [_crop_bands in mados.py](../python_engine/ml/datasets/mados.py#L72). The general helper is [band_resampler.py](../python_engine/satellite/band_resampler.py#L11), whose docstring says exactly this.

**In the live app** we do not touch these folders. Sentinel Hub delivers all requested bands already resampled to one grid ([_grid_for](../python_engine/satellite/band_loader.py#L82)). One honest consequence: FDI uses B06 and B11 (20 m) with B08 (10 m), so its true detail is closer to 20 m; we count one candidate pixel as a single 10 m cell (0.0001 km2).

## 6. Where the training data and the model come from

| Dataset | What it is | Code that reads it |
|---|---|---|
| **MARIDA** | Hand-labelled Sentinel-2 marine debris benchmark (Kikaki et al. 2022) | [marida.py](../python_engine/ml/datasets/marida.py#L31) |
| **MADOS** | Larger successor: 174 scenes, 15 classes (Kikaki et al. 2024) | [mados.py](../python_engine/ml/datasets/mados.py#L43) |
| **RefinedFloatingObjects (RFO)** | 6 extra coastal scenes, two held out as unseen seas | [rfo.py](../python_engine/ml/datasets/rfo.py#L30) |
| **Plastic Litter Project (PLP)** | Real plastic targets floated off the Greek coast on known dates | [plp.py](../python_engine/ml/datasets/plp.py#L33) |

- **Class mapping:** the datasets have 15 classes; we merge them into our 4 (e.g. all water types -> Water). The exact map is `CLASS_MAP` in each file.
- **Training script:** [PerPixelNet](../python_engine/ml/train_perpixel_gpu.py#L80) with focal loss ([FocalLoss](../python_engine/ml/train_perpixel_gpu.py#L106)) and class-balanced weights ([cb_weights](../python_engine/ml/train_perpixel_gpu.py#L127)) so the rare plastic class is not ignored, then a bias-calibration step ([calibrate_bias](../python_engine/ml/train_perpixel_gpu.py#L136)) and ONNX export ([export_onnx](../python_engine/ml/train_perpixel_gpu.py#L299)).
- **See it in the app:** AI Lab shows these scores live ([ModelHealth](../frontend/src/pages/ModelHealth.tsx#L16)).
- **Browse the datasets as tables (MySQL):** `database/mysql/load_datasets.py` puts all four datasets, the 2.1 M labelled pixels and the model scores into the MySQL database `mpt_datasets`, with ready-made views such as `v_class_balance`, `v_spectral_signature` and `v_confusion_matrix`. Open them in MySQL Workbench, or open the chart page from `build_dashboard.py`. Setup steps are in `database/mysql/README.md`.

## 7. Every other page: route -> code -> data

| Route | Page file | What it shows | Data hooks | Backend endpoint |
|---|---|---|---|---|
| `/app` | [CommandCenter](../frontend/src/pages/CommandCenter.tsx#L58) | Situation score, live alert inbox, coast-bound hotspots, service health, live event feed | [useOverview](../frontend/src/hooks/useApi.ts#L13), `useAlerts`, `useHotspots`, [useLiveFeed](../frontend/src/hooks/useLiveFeed.ts#L21) | [/api/stats/overview](../backend/src/routes/stats.routes.ts#L10), [/api/alerts](../backend/src/routes/alerts.routes.ts#L10) |
| `/app/map` | `MapExplorer.tsx` (this whole tour) | Draw a box, run the pipeline | `useAoiAnalysis`, `useScenesByBbox` | [POST /api/pipeline/run](../backend/src/routes/pipeline.routes.ts#L115) |
| `/app/areas` | [Areas](../frontend/src/pages/Areas.tsx#L122) | Saved areas, 72-hour drift forecasts kept as history | [useAreas](../frontend/src/hooks/useApi.ts#L120), `useForecastArea`, `useRescanArea` | [/api/areas](../backend/src/routes/areas.routes.ts#L264) |
| `/app/records` | [Records](../frontend/src/pages/Records.tsx#L24) | Raw detections **or** clustered hotspots (toggle) + severity-vs-ETA scatter. Embeds `Detections.tsx` and `Hotspots.tsx` as tabs | `useDetections`, `useHotspots` | [/api/detections](../backend/src/routes/detections.routes.ts#L29), [/api/hotspots](../backend/src/routes/hotspots.routes.ts#L9) |
| `/app/ai-lab` | [AILab](../frontend/src/pages/AILab.tsx#L18) | Model report card, confusion matrix, Clay similarity search. Embeds `ModelHealth.tsx` and `Intelligence.tsx` | `usePipelineStatus`, `useSimilarityInfo`, `useModelEval` | [/api/engine/model/evaluate](../backend/src/routes/features.routes.ts#L51) |
| `/app/operations` | [Operations](../frontend/src/pages/Operations.tsx#L21) | Field operations: from "plastic detected" to "crew sent" to "report filed" | `useOperations`, `useUpdateOperationStatus` | [/api/operations](../backend/src/routes/operations.routes.ts#L70) |
| `/app/analytics` | [AnalyticsReports](../frontend/src/pages/AnalyticsReports.tsx#L17) | Trends and exports (CSV, GeoJSON, PDF). Embeds `Analytics.tsx` and `Reports.tsx` | `useTrend`, `useByClass`, `useByRegion` | [/api/export](../backend/src/routes/export.routes.ts#L24) |
| `/app/settings` | [Settings](../frontend/src/pages/Settings.tsx#L10) | Profile and two-factor authentication | auth store | [/api/auth/2fa](../backend/src/routes/auth.routes.ts#L120) |
| `/app/admin` | [AdminPanel](../frontend/src/pages/AdminPanel.tsx#L7) | Users, engine and service status (ADMIN only) | `useAdminUsers`, `useServices` | [/api/system/services](../backend/src/routes/system.routes.ts#L26) |
| `/app/detections/:id`, `/app/hotspots/:id` | [DetectionDetail](../frontend/src/pages/DetectionDetail.tsx#L19), [HotspotDetail](../frontend/src/pages/HotspotDetail.tsx#L13) | One item in depth: evidence, drift forecast, analyst actions | `useDetection`, `useHotspot` | `/api/detections/:id`, `/api/hotspots/:id` |
| `/`, `/about`, `/docs`, `/faq`, `/compliance` ... | [Landing](../frontend/src/pages/Landing.tsx#L41) and siblings | Public marketing and information pages | none | none |

**Cross-cutting pieces:** [route table with role gates](../frontend/src/App.tsx#L134) (which routes need which role), [authStore](../frontend/src/stores/authStore.ts#L66) (login state), and the browser's HTTP client in [api.ts](../frontend/src/lib/api.ts#L173).

## 8. The backend, in order of how a request travels

- **Startup and safety:** [helmet](../backend/src/index.ts#L28) (secure headers), CORS, [rate limiting](../backend/src/index.ts#L52), JSON parser, then all routes under `/api` ([routes/index.ts](../backend/src/routes/index.ts#L67)).
- **Login and roles:** JWT access token (15 minutes) plus a refresh token (7 days) - [env.ts](../backend/src/lib/env.ts#L191). Three roles: FIELD (1), COASTGUARD (2), ADMIN (3) - [ROLE_LEVEL](../backend/src/types/auth.ts#L7). [requireMinLevel](../backend/src/middleware/auth.ts#L26) enforces them on the server, so hiding a button is never the only protection. Passwords are checked with bcrypt in [validateCredentials](../backend/src/services/auth.service.ts#L80), tokens are created in [issueTokens](../backend/src/services/auth.service.ts#L126), and two-factor (TOTP) is set up in [setupTotp](../backend/src/services/auth.service.ts#L175).
- **Engine proxy:** [proxy](../backend/src/routes/features.routes.ts#L21) forwards `/api/engine/*` (forecast, change detection, similarity, model evaluation) to the Python engine.
- **Saving results:** [persistRun](../backend/src/services/pipelinePersist.service.ts#L59) (section 2, step 7). The database tables are defined in [schema.prisma](../backend/prisma/schema.prisma#L164) (also `Hotspot`, `Alert`, `Trajectory`, `Region`, `User`, `Operation`, `SavedArea`, `AreaForecast`). These live in **PostgreSQL**; `python database\mysql\sync_app.py` copies them into the MySQL database `mpt_app` for reporting (section 1).
- **Job queue and schedule:** [startWorker](../backend/src/lib/queue.ts#L99) (BullMQ on Redis) runs scans in the background; [/scheduled-run](../backend/src/routes/pipeline.routes.ts#L251) lets a scheduler trigger scans of every monitored region. Everything falls back to a direct call if Redis is down.
- **Live updates:** [attachLiveSocket](../backend/src/lib/live.ts#L29) pushes events to the browser over a WebSocket; the browser side is `useLiveFeed`.

## 9. The engine, folder by folder

| Folder | Contains | Key files |
|---|---|---|
| `python_engine/api/` | The HTTP routes | [predict_route.py](../python_engine/api/predict_route.py#L42), `forecast_route.py`, `similarity_route.py`, `model_route.py` |
| `python_engine/satellite/` | Get and clean pixels, compute FDI, land/cloud masks | `band_loader.py`, `download.py`, `fdi_calculator.py`, `cloud_masker.py`, `landmask.py` |
| `python_engine/ml/` | Classifier, Clay fusion, training, dataset readers | `inference_engine.py`, `batch_classifier.py`, `clay_live.py`, `train_perpixel_gpu.py`, `datasets/` |
| `python_engine/hotspot/` | Clustering and severity | `dbscan_clusterer.py`, `severity_scorer.py` |
| `python_engine/trajectory/` | Drift, back-tracking, landfall, ocean and wind data | `lagrangian_model.py`, `back_tracker.py`, `polygon_landfall.py`, `data_interpolator.py` |
| `python_engine/models/` | The trained model files and their measured scores | `marinenet.onnx`, [metrics.json](../python_engine/models/metrics.json#L2) |
| `data/` | Datasets and the coastline file | `marida/`, `MADOS/`, `plp/`, `refinedfloatingobjects/`, `coastline/` |

## 10. Questions the panel is likely to ask

| Question | Short answer | Show |
|---|---|---|
| Why FDI and not just a photo? | Plastic is often smaller than a pixel and grey/brown like the sea; in visible light it is invisible, but in near-infrared floating solids stand out. | [floating_debris_index](../python_engine/satellite/fdi_calculator.py#L19) |
| If FDI is enough, why a neural network? | FDI also fires on seaweed, foam and turbid water. The network uses 11 spectral clues learned from thousands of labelled pixels to separate them. | [_features](../python_engine/ml/inference_engine.py#L27) |
| How do you handle clouds and land? | Real cloud/land map (SCL) is fetched with every image; only water pixels can be candidates; coverage and cloud % are shown on screen; inland candidates are removed. | [surface_from_scl](../python_engine/satellite/cloud_masker.py#L58) |
| How accurate is it? | Macro-F1 0.82 on held-out labelled pixels; plastic precision 0.78, recall 0.82; the high-confidence tier is about 90% precise. Accuracy 0.99 is misleading because water dominates. | [metrics.json](../python_engine/models/metrics.json#L22) |
| Is the drift forecast validated? | Yes, against 51 real NOAA drifter tracks: for surface drifters the median error is ~12 km at 24 h and ~30 km at 72 h, about half the error of assuming no movement. It is a hindcast, and the drawn cone is narrower than the real error. | [drift_gdp_results.json](../python_engine/validation/drift_gdp_results.json#L104) |
| What is real and what is simulated? | Pixels, cloud map, currents and wind are real when credentials are set. If a download fails the scan is labelled synthetic; the drift can fall back to a synthetic field, also labelled. **Also: on the Areas page a synthetic "demo plastic" cluster is added when the live scan found none, and it is flagged amber.** | [SurfaceReadout](../frontend/src/pages/MapExplorer.tsx#L311), [withDemoPlastic](../backend/src/routes/areas.routes.ts#L83) |
| What if the engine or internet is down? | The UI shows an honest "engine unreachable" message; nothing is invented. | [offlineAoiResult](../backend/src/routes/pipeline.routes.ts#L85) |
| Who can do what? | Three roles enforced on the server, not just hidden in the UI. | [ROLE_LEVEL](../backend/src/types/auth.ts#L7) |
| Where do results go? | PostgreSQL through Prisma: detections, hotspots, alerts, trajectories, one log row per stage. | [persistRun](../backend/src/services/pipelinePersist.service.ts#L59) |
| Why do you have both PostgreSQL and MySQL? | PostgreSQL is the live app database. MySQL is a read-only copy of the datasets and the app tables, made so they can be browsed and charted in standard tools. The backend never reads MySQL. | [sync_app.py](../database/mysql/sync_app.py#L164) |
| Why 10 / 20 / 60? | Pixel size in metres of the Sentinel-2 bands stored in each folder. | Section 5 |

## 11. Weak points, and how to say them honestly

Panels respect a team that knows its limits. These are all measured, not guessed.

- **Independent test on real deployed plastic (PLP 2021).** A ~28 m HDPE mesh was anchored at a known spot and imaged on 21 Sentinel-2 passes (zero overlap with training data). At the surveyed position, in a 3x3-pixel window: the model called something **Plastic on 33% of passes**; the FDI screen alone fired on **76%**; a **wood** control raft was also called Plastic on **80%** of passes; but **false alarms on all the other water were 0%** (median). Read it as: *few false alarms, but a small target is often missed, and wood cannot be told apart from plastic in these bands.* Why: the target is only 2-3 pixels wide, so each pixel is part plastic, part water; and wood and plastic reflect similarly. Definitions: [validate_plp.py](../python_engine/ml/validate_plp.py#L13); numbers: [plp_validation.json](../python_engine/models/plp_validation.json#L4). The Clay second opinion is our attempt to improve this.
- **Plastic is very rare in the training data (about 0.5%)**, so plastic scores are lower than water scores. This is why we report macro-F1 and a high-confidence tier instead of raw accuracy.
- **A satellite sees aggregated floating matter, not single bottles.** "Plastic" here means *floating debris that spectrally behaves like plastic*.
- **Revisit time is about 5 days, and clouds leave gaps** - the *44% observed* figure on screen is that limitation made visible.
- **New seas may behave differently.** Only two scenes from seas outside the training data (RFO Durban and Marmara) were used as a check; that is thin evidence, so do not claim it works everywhere.
- **Drift error is real and the cone under-states it** (about 12 km at 24 h, ~30 km at 72 h; cone holds the truth only 0-8% of the time; hindcast, not forecast) - see section 4, stage 6.

## 12. Before you present: a 6-point checklist

1. **Start everything** with `start-all.cmd` and wait for all windows (engine :8000, Clay :8010, backend :3001, frontend :5173). Without the Clay window the *Clay verify* card says OFFLINE.
2. **Map Explorer -> Advanced tools -> Min confidence must be 0%.** If it is high, the *Classify* card can read "0 plastic of 0 classified" even though the *FDI* card found hundreds of candidates.
3. **If you see the orange "RESTORED - NOT RE-SCANNED" badge, press Rescan** so the cards show a fresh run (a real scan takes about a minute; the download is the slow part).
4. **Draw over open sea for the demo.** A box on land or cloud is *supposed* to show the amber warning and no markers. **0 plastic on a clean sea is a correct result**, not a fault - say so.
5. **Know the demo plastic.** On the **Areas** page, if a saved scan has no plastic, the backend adds a *synthetic* cluster so the drift forecast has something to release ([withDemoPlastic](../backend/src/routes/areas.routes.ts#L83), switch `DEMO_PLASTIC` in [env.ts](../backend/src/lib/env.ts#L152)). The page labels it with an amber "Demo plastic" banner ([Areas.tsx](../frontend/src/pages/Areas.tsx#L795)). Tell the panel first; set `DEMO_PLASTIC=false` in `.env` and restart the backend if you would rather not show it.
6. **Test one link now.** Open `docs/CODE_TOUR.html`, click a `file:line` link, allow the "Open Visual Studio Code?" prompt. Then run `python docs\code-tour\build_code_tour.py --check` to confirm every link still lands after any last-minute edits (if you changed code, rebuild with `C:\Anaconda\python.exe docs\code-tour\build_code_tour.py`).

## 13. Files that look important but are not used

Inside `frontend/src/pages/` three files are no longer used by any route: `Alerts.tsx`, `Dashboard.tsx` and `OpsBoard.tsx`. Their content was merged into **Command Center**. Do not open them in the viva. The other "old-looking" pages (`Detections`, `Hotspots`, `ModelHealth`, `Intelligence`, `Analytics`, `Reports`) are **still live**: they are the tabs inside Records, AI Lab and Analytics & Reports.
