# Code Tour in Simple Words

**Marine Plastic Tracker, explained in plain words.**

This is the easy version of [CODE_TOUR.md](CODE_TOUR.md). It covers the same topics, but every idea is explained as if to someone who has never seen the project. Each idea also has **one sentence you can say out loud** in the viva.

> **Tip:** In VS Code press `Ctrl+Shift+V` to preview this file, then `Ctrl+click` a link to jump to the code.
> The line numbers were copied from `CODE_TOUR.md` on 2026-10-02. If a link lands on the wrong line after a code edit, use `CODE_TOUR.md`, because its build script keeps its links correct.

---

## 0. The whole project in one paragraph

A satellite called **Sentinel-2** photographs the sea. Plastic floating on the water reflects a kind of invisible light (**near-infrared**) more strongly than water does, because water absorbs it. Our system:

1. downloads the satellite picture for the area you draw,
2. finds pixels that look like "something is floating here",
3. asks a small AI model "is this plastic, seaweed, foam or just water?",
4. groups nearby plastic pixels into **hotspots**,
5. asks a second, bigger AI (**Clay**) to double-check,
6. predicts where each hotspot will **drift** in the next 72 hours,
7. raises **alerts** if it is big or heading for the coast.

> 🗣️ **Say:** "We use the near-infrared light that plastic reflects, screen with a physics index, confirm with a neural network, then group, verify, and forecast the drift."

The main code that runs all seven steps is one function: [run_aoi() in main_pipeline.py](../python_engine/main_pipeline.py#L217). It is about 80 lines and reads like the list above.

---

## 1. The three parts of the system

Think of it like a restaurant:

| Part | Restaurant version | What it really is | Port | Folder |
|---|---|---|---|---|
| **Frontend** | The dining room and menu | The website you click on (React) | 5173 | `frontend/src` |
| **Backend** | The waiter | Checks who you are, passes your request on, saves results (Node + Express) | 3001 | `backend/src` |
| **Engine** | The kitchen | Does all the science and maths (Python + FastAPI) | 8000 | `python_engine` |
| **Clay** | A second chef who tastes the dish | Big AI model running on the GPU | 8010 | `python_engine/clay_service.py` |

Where things are stored:
- **PostgreSQL** (port 5432) is the **live** filing cabinet. The app saves and reads users, detections, hotspots and alerts here.
- **Redis** (port 6379) is the order queue. It holds jobs that run in the background.
- **MySQL** (port 3306) is a **photocopy for showing people**. It holds all the training datasets and a snapshot of the app's tables, so you can browse them in MySQL Workbench or as charts. The app itself **never reads MySQL**. ([load_datasets.py](../database/mysql/load_datasets.py), [sync_app.py](../database/mysql/sync_app.py))

> 🗣️ **Say:** "PostgreSQL is the live database; MySQL is a read-only copy we built for browsing and reporting the data."

Where the outside data comes from:
- **Copernicus**: the real satellite pixels.
- **AWS Earth Search**: the list of satellite pictures and their thumbnails.
- **Open-Meteo**: ocean currents and wind.
- **Esri**: the background satellite map.

One file starts everything: [start-all.cmd](../start-all.cmd#L9). It opens one window per service.

> 🗣️ **Say:** "The frontend shows things, the backend handles login and saving, and the Python engine does all the science."

---

## 2. What happens when you draw a box (step by step)

This is the most important flow to understand.

| Step | What happens | Where in code |
|---|---|---|
| 1 | You drag a rectangle on the map. The page turns it into 4 numbers: north, south, east, west. Very tiny boxes are ignored. | [MapExplorer.tsx:50](../frontend/src/pages/MapExplorer.tsx#L50) |
| 2 | The page notices the new box and starts a scan automatically. | [useAoiAnalysis](../frontend/src/hooks/useApi.ts#L78) |
| 3 | The browser sends the box to the backend (`POST /api/pipeline/run`). It waits up to 130 seconds because downloading satellite data is slow. | [api.analyzeAoi](../frontend/src/lib/api.ts#L360) |
| 4 | The backend checks you are logged in, checks the box is valid, and forwards it to the engine. | [POST /run](../backend/src/routes/pipeline.routes.ts#L115) |
| 5 | The engine receives it. If you double-click, it reuses the last answer for 20 seconds instead of downloading twice. | [pipeline_run](../python_engine/api/predict_route.py#L42) |
| 6 | The engine runs the **7 stages** (section 4). Each stage records how long it took and a short note. Those become the cards on screen. | [run_aoi](../python_engine/main_pipeline.py#L217) |
| 7 | The backend saves everything into the database and tells open browsers about it live. If the database is down, you still get your answer. | [persistRun](../backend/src/services/pipelinePersist.service.ts#L59) |
| 8 | The browser draws markers, cards and the results panel. | `MapExplorer.tsx` |

**What if something breaks?**
- **Engine is off:** you see "engine offline". **No fake detections are invented.** ([offlineAoiResult](../backend/src/routes/pipeline.routes.ts#L85))
- **Satellite download fails:** the engine uses a pretend scene, and the screen **clearly says it is synthetic**. ([scene_for_bbox](../python_engine/satellite/download.py#L276))

> 🗣️ **Say:** "Browser to backend to engine, seven stages, saved to Postgres, drawn on the map. If anything fails we say so honestly; we never fake results."

---

## 3. What each thing on the Map screen is

Page address: `localhost:5173/app/map`. Main file: [MapExplorer.tsx](../frontend/src/pages/MapExplorer.tsx#L467).

| What you see | What it means in plain words | Code |
|---|---|---|
| Left menu | The list of pages. One list feeds both the menu and the search box. Pages you are not allowed to see are hidden **and** blocked. | [nav.ts](../frontend/src/config/nav.ts#L37), [RequireRole](../frontend/src/components/layout/RequireRole.tsx#L14) |
| *Search... Ctrl+K* | Type a page name to jump to it. | [CommandPalette](../frontend/src/components/layout/CommandPalette.tsx#L37) |
| Bell with red number | The number of alerts nobody has acknowledged yet. | [NotificationCenter](../frontend/src/components/layout/NotificationCenter.tsx#L27) |
| Green *Live satellite* chip | Shows whether data is real (**Live satellite**), demo (**Demo data**), or the backend is down (**Offline - mock**). | [DataBadge](../frontend/src/components/layout/AppLayout.tsx#L18) |
| The map | Free satellite background from Esri, drawn by Leaflet. | [MapContainer](../frontend/src/components/map/MapContainer.tsx#L30) |
| Teal rectangle | The area you asked to scan. | [AOI outline](../frontend/src/pages/MapExplorer.tsx#L756) |
| Legend | What each colour means. All pages share the same colours. | [classColors.ts](../frontend/src/lib/classColors.ts#L8) |
| **7 "Live processing" cards** | One card per stage. A green tick means it finished. The grey text is that stage's own note. | [StageTimeline](../frontend/src/pages/MapExplorer.tsx#L1098) |
| Times like *DOWNLOAD 71.5s, FDI 55ms* | The download is slow (about 20 MB over the internet). All the maths after it takes milliseconds. | [_ms()](../python_engine/main_pipeline.py#L34) |
| *"500 candidate pixels ... REAL Sentinel-2"* | "Real" means real satellite pixels. 500 is the maximum number of candidate pixels per scan. | [_download_detail](../python_engine/main_pipeline.py#L53) |
| *"157 inland dropped"* | 157 candidates were more than 3 km inland (ponds, wet fields), so we threw them away. | [_drop_inland](../python_engine/main_pipeline.py#L75) |
| *"model_loaded=True"* | The real trained AI ran, not the backup rules. | [classify_candidates](../python_engine/ml/batch_classifier.py#L32) |
| Coloured bar *water 76.8% / land 23% / 44% observed* | The satellite's own map of water, land and cloud. "44% observed" means only 44% of your box had a clear view. The rest was hidden by cloud. | [SurfaceReadout](../frontend/src/pages/MapExplorer.tsx#L311) |
| Amber warning on land or cloud | If your box is mostly land or cloud, we **don't draw markers**, so we never paint fake plastic on land. | [scanUsable](../frontend/src/pages/MapExplorer.tsx#L587) |
| Orange *RESTORED - NOT RE-SCANNED* | You came back to the page and are seeing the old result. Press **Rescan** for fresh data. | [restore logic](../frontend/src/pages/MapExplorer.tsx#L493) |
| 4 numbers (Candidates, Plastic, Hotspots, Avg conf.) | A summary that comes straight from the engine. | [Metric](../frontend/src/pages/MapExplorer.tsx#L1376) |
| Satellite thumbnail on the right | Which real satellite picture covers your box, with its date and cloud %. | [SceneCard](../frontend/src/pages/MapExplorer.tsx#L1299) |
| *Advanced tools* (Min confidence etc.) | Extra options. **Keep Min confidence at 0% for a demo**, or the screen may say "0 plastic" by mistake. | [Advanced tools](../frontend/src/pages/MapExplorer.tsx#L1005) |
| *72h forecast / Change vs 6 mo / Export GeoTIFF* | Drift forecast, comparison with 6 months ago, and a download of the FDI layer. | [tool buttons](../frontend/src/pages/MapExplorer.tsx#L1027) |
| *GeoJSON* button | Downloads the results for GIS software (QGIS, ArcGIS). | inside `AoiResultPanel` |
| Click a hotspot | Opens a drawer that finds similar-looking places using Clay. | [SimilarSitesDrawer](../frontend/src/components/map/SimilarSitesDrawer.tsx#L62) |

---

## 4. How plastic is detected: the 7 stages, simply

All the threshold numbers live in one settings file: [config.py](../python_engine/config.py#L44).

### Stage 1: Download the picture
- We ask Copernicus for **5 colour bands** (B04, B06, B08, B8A, B11) plus a **land/cloud/water map** called **SCL**. ([band_loader.py](../python_engine/satellite/band_loader.py#L33))
- For each pixel we take the **clearest recent photo** from the last 45 days. We skip photos that are more than 50% cloud, and look back up to 180 days only if needed. ([_real_ingest](../python_engine/satellite/download.py#L220))
- Only pixels marked as **water** can go forward. Land, cloud and shadow are removed. ([keep_mask](../python_engine/satellite/cloud_filter.py#L24))
- Each scan gets a grade: **reliable / degraded / unusable**. ([reliability_for](../python_engine/satellite/cloud_masker.py#L28))

### Stage 2: FDI, the "is something floating?" test
**FDI = Floating Debris Index** (Biermann et al., 2020). [fdi_calculator.py](../python_engine/satellite/fdi_calculator.py#L19)

**Simple idea:** from two other colours we can **guess how bright plain water should be** in near-infrared. If the pixel is **brighter than that guess**, something is floating on it.

```
FDI = B08 - [ B06 + (B11 - B06) * (842 - 740) / (1610 - 740) * 10 ]
        ^ real NIR    ^ what plain water "should" be at NIR
```

- If FDI is **above 0.02**, the pixel becomes a **candidate**.
- Candidates more than **3 km inland** are removed using a world map of country outlines. ([landmask.py](../python_engine/satellite/landmask.py#L180))
- **Limitation:** FDI also lights up for seaweed, foam, boats and muddy water. It is only a **first filter**, which is why stage 3 exists.

> 🗣️ **Say:** "FDI tells us *something* is floating; the neural network tells us *what* it is."

### Stage 3: Classify, "what is it?"
- **The model:** a small neural network called an **MLP** (multi-layer perceptron). We actually run **3 of them together** (an ensemble) and combine their answers. It was trained on about **1.08 million labelled pixels**. ([model_loader.py](../python_engine/ml/model_loader.py#L61))
- **Input: 11 numbers per pixel**, made of the 5 bands, FDI, and 5 extra indices (vegetation, plastic index, water index, red-edge vegetation, brightness). ([_features](../python_engine/ml/inference_engine.py#L27))
- **Output:** one of **Plastic / Algae / Sea_Foam / Water**, plus how confident it is.
- **Two confidence levels (don't mix them up):**
  - **≥ 0.648 = "high confidence"**: about **90% of these are truly plastic**. Only these pixels make hotspots.
  - **≥ 0.85 = "CONFIRMED"**: the label analysts see.
- **Backup:** if the model file is missing, simple hand-written rules run instead, and the card says `heuristic`.
- **Naming trap:** the card says **"MLP"**, but in the code the stage is called `CNN`. That is just an old name. We did try a CNN, but it scored worse (0.55), so we didn't ship it.

### Stage 4: Cluster, turning pixels into hotspots
- Only **high-confidence plastic** pixels are used, so a crew is never sent because of a weak guess.
- **DBSCAN** (written by us, no library) groups pixels that are **within about 10 km** of each other, with **at least 3** in a group. ([dbscan_clusterer.py](../python_engine/hotspot/dbscan_clusterer.py#L22))
- **Severity by size:** 10+ pixels = **HIGH**, 5+ = **MEDIUM**, fewer = **LOW**. ([severity_scorer.py](../python_engine/hotspot/severity_scorer.py#L12))

### Stage 5: Clay, a second opinion
- **Clay** is a big AI model that was pre-trained on huge amounts of satellite imagery. It looks at a small picture around each hotspot. ([clay_live.py](../python_engine/ml/clay_live.py#L109))
- Its opinion is combined with the MLP's to give **CONFIRMED** or **POSSIBLE**. CONFIRMED is about **92% correct** and finds about **70%** of the real plastic. ([confidence_fusion.py](../python_engine/ml/confidence_fusion.py#L1))
- If Clay is switched off, the card says *Clay OFFLINE - MLP-only* and the scan still works.

### Stage 6: Drift, "where will it go in 72 hours?"
- **Physics:** floating stuff moves with the **ocean current**, plus a **little push from the wind** (1.5–3% of wind speed, called "windage"). ([lagrangian_model.py](../python_engine/trajectory/lagrangian_model.py#L41))
- We step forward **one hour at a time** using a standard maths method called **Runge-Kutta 4**.
- We run **4 versions** with different wind pushes. The middle one is the path, and the spread between them is the **uncertainty cone**.
- Currents and wind come from **Open-Meteo**. If it is unreachable, we use a pretend field that is **labelled synthetic**.
- If the path hits land, we stop it there. That time becomes the **"reaches coast in X hours"** number. Only the top 2 hotspots get a full track.
- **We tested it** against **real NOAA ocean buoys** ([drift_gdp_results.json](../python_engine/validation/drift_gdp_results.json#L104)):

  | After | Our error | "Assume it doesn't move" error |
  |---|---|---|
  | 24 h | ~12 km | 23 km |
  | 48 h | ~22–26 km | 34 km |
  | 72 h | ~29–33 km | 57 km |

  So our model **roughly halves the error**.
- **Be honest about two things:**
  1. The test used past ocean data (a **hindcast**), so real future forecasts will be a bit worse.
  2. The **cone is too narrow**. The real buoy was inside it only 0–8% of the time.

> 🗣️ **Say:** "It's a forecast with an optimistic uncertainty, not a guaranteed prediction."

### Stage 7: Alerts
- The engine counts HIGH and MEDIUM hotspots. ([_alert_stage](../python_engine/main_pipeline.py#L209))
- The backend creates the alert. The **same hotspot won't alert twice within 24 hours**. If it will **reach the coast within 48 hours**, the alert is marked **COAST_PROXIMITY**. ([persistRun](../backend/src/services/pipelinePersist.service.ts#L173))

### The scores to quote
From [metrics.json](../python_engine/models/metrics.json#L22), tested on pixels the model never saw during training:

| Score | Value | Simple meaning |
|---|---|---|
| **Macro-F1** | **0.8175** | A fair average over all 4 classes. **Always say this one first.** |
| Plastic precision | 0.776 | When it says plastic, it is right about 78% of the time. |
| Plastic recall | 0.824 | It finds about 82% of the real plastic. |
| Plastic F1 | 0.799 | A balance of the two numbers above. |
| High-confidence tier | ~90% precision, 57% recall | Very trustworthy, but it misses some. |
| Accuracy | 0.99 | **Misleading.** About 98% of pixels are water, so a model that always says "water" would also score about 98%. |

---

## 5. Why are the folders called 10, 20 and 60?

**It is the size of one pixel on the ground, in metres.**

The satellite takes some colours sharply and some blurrily. That is a design trade-off in the camera.

| Folder | One pixel = | Bands inside | Image size for the same 2.4 km area |
|---|---|---|---|
| `10` | 10 m × 10 m | Blue, Green, **Red (B04)**, **NIR (B08)** | 240 × 240 |
| `20` | 20 m × 20 m | Red-edge (**B06**), **B8A**, **SWIR (B11)**, and others | 120 × 120 |
| `60` | 60 m × 60 m | Coastal aerosol (B01) | 40 × 40 |

- Our model needs bands from **both** the 10 m and 20 m folders. During training we **stretch the blurrier images** onto the 10 m grid by copying each 20 m pixel into 2×2 and each 60 m pixel into 6×6. ([mados.py](../python_engine/ml/datasets/mados.py#L72))
- In the live app we don't use these folders. Copernicus sends all bands already lined up. ([_grid_for](../python_engine/satellite/band_loader.py#L82))
- **Honest note:** FDI mixes 10 m and 20 m bands, so its true sharpness is closer to 20 m.

> 🗣️ **Say:** "10, 20 and 60 are pixel sizes in metres. Sentinel-2 records different bands at different resolutions."

---

## 6. Where the training data comes from

| Dataset | In plain words | Code |
|---|---|---|
| **MARIDA** | Satellite pixels that experts labelled by hand as debris, water, seaweed and so on (2022). | [marida.py](../python_engine/ml/datasets/marida.py#L31) |
| **MADOS** | A bigger version: 174 scenes, 15 classes (2024). | [mados.py](../python_engine/ml/datasets/mados.py#L43) |
| **RFO** | 6 extra coastal scenes. 2 are kept aside to test on "new seas". | [rfo.py](../python_engine/ml/datasets/rfo.py#L30) |
| **PLP** | Real plastic targets floated off Greece on known dates. Used as a real-world test. | [plp.py](../python_engine/ml/datasets/plp.py#L33) |

- The datasets have **15 classes**, which we **merge into our 4** (for example, all water types become "Water").
- **Training tricks**, because plastic is very rare (about 0.5% of pixels):
  - **Focal loss:** makes the model pay more attention to hard examples.
  - **Class-balanced weights:** gives rare classes like plastic more importance.
  - **Bias calibration:** adjusts the confidence numbers so they are honest.
  - The finished model is exported as **ONNX**, so it runs fast anywhere.
  - Training code: [train_perpixel_gpu.py](../python_engine/ml/train_perpixel_gpu.py#L80)
- **See the data as tables:** all four datasets are loaded into the MySQL database `mpt_datasets`, with ready views like `v_class_balance` and `v_confusion_matrix`. Setup steps are in [database/mysql/README.md](../database/mysql/README.md).
- **Live demo:** [live_training_demo.py](code-tour/live_training_demo.py) trains a small model in about 20 seconds using the real training code. It never touches the shipped model.

---

## 7. The other pages

| Page | What it shows | Page file |
|---|---|---|
| `/app` Command Center | Overall situation, live alerts, hotspots heading for the coast, service health | [CommandCenter.tsx](../frontend/src/pages/CommandCenter.tsx#L58) |
| `/app/map` Map Explorer | Draw a box and scan it (this whole tour) | [MapExplorer.tsx](../frontend/src/pages/MapExplorer.tsx#L467) |
| `/app/areas` Areas | Saved areas and their 72-hour drift forecasts over time | [Areas.tsx](../frontend/src/pages/Areas.tsx#L122) |
| `/app/records` Records | Every detection or hotspot in a table | [Records.tsx](../frontend/src/pages/Records.tsx#L24) |
| `/app/ai-lab` AI Lab | The model's report card and confusion matrix, plus similarity search | [AILab.tsx](../frontend/src/pages/AILab.tsx#L18) |
| `/app/operations` Field Ops | From "plastic found" to "crew sent" to "report filed" | [Operations.tsx](../frontend/src/pages/Operations.tsx#L21) |
| `/app/analytics` Analytics & Reports | Trends and downloads (CSV, GeoJSON, PDF) | [AnalyticsReports.tsx](../frontend/src/pages/AnalyticsReports.tsx#L17) |
| `/app/settings` Settings | Your profile and two-factor login | [Settings.tsx](../frontend/src/pages/Settings.tsx#L10) |
| `/app/admin` Admin | Users and service status (admins only) | [AdminPanel.tsx](../frontend/src/pages/AdminPanel.tsx#L7) |
| `/`, `/about`, `/faq` ... | Public information pages | [Landing.tsx](../frontend/src/pages/Landing.tsx#L41) |

All routes, and which role each one needs, are listed in [App.tsx](../frontend/src/App.tsx#L134).

---

## 8. The backend, simply

- **Safety first:** secure headers (helmet), a limit on requests per user (rate limiting), then the routes. ([index.ts](../backend/src/index.ts#L28))
- **Login:**
  - Passwords are stored scrambled with **bcrypt**.
  - After login you get a short **pass (JWT, 15 minutes)** and a **renewal ticket (7 days)**.
  - Optional **two-factor** with an authenticator app.
  - Code: [auth.service.ts](../backend/src/services/auth.service.ts#L80)
- **3 roles:** **FIELD** (1) < **COASTGUARD** (2) < **ADMIN** (3). The **server checks the role**, so hiding a button is never the only protection. ([ROLE_LEVEL](../backend/src/types/auth.ts#L7), [requireMinLevel](../backend/src/middleware/auth.ts#L26))
- **Passing requests to the engine:** [features.routes.ts](../backend/src/routes/features.routes.ts#L21)
- **Saving:** everything goes into PostgreSQL. The tables are defined in [schema.prisma](../backend/prisma/schema.prisma). Running `python database\mysql\sync_app.py` copies them into MySQL for reports. Passwords and secrets are left out of the copy.
- **Background jobs:** a queue on Redis (BullMQ). If Redis is down, jobs just run directly. ([queue.ts](../backend/src/lib/queue.ts#L99))
- **Live updates:** a WebSocket pushes new events to the browser instantly. ([live.ts](../backend/src/lib/live.ts#L29))

---

## 9. The engine folders, simply

| Folder | What's inside |
|---|---|
| `python_engine/api/` | The "doors": the URLs the backend calls |
| `python_engine/satellite/` | Download pixels, remove cloud and land, calculate FDI |
| `python_engine/ml/` | The AI model, Clay, the training code and the dataset readers |
| `python_engine/hotspot/` | Grouping pixels (DBSCAN) and severity |
| `python_engine/trajectory/` | Drift physics, landfall, currents and wind |
| `python_engine/models/` | The trained model file (`marinenet.onnx`) and its scores |
| `data/` | The datasets and the coastline map |

---

## 10. Likely viva questions, with short answers

| Question | Simple answer |
|---|---|
| Why not just look at a normal photo? | Plastic is small and greyish like the sea. In normal light it is invisible, but in near-infrared floating things stand out. |
| If FDI works, why the AI? | FDI also catches seaweed and foam. The AI uses 11 clues to tell them apart. |
| Clouds and land? | The satellite's own cloud and land map comes with every image. Only water pixels count, and cloud % is shown on screen. |
| How accurate? | Macro-F1 0.82. Plastic precision 0.78 and recall 0.82. The high-confidence tier is about 90% precise. We ignore the 0.99 accuracy because it is inflated by water. |
| Is drift tested? | Yes, against real NOAA buoys: about 12 km error at 24 h and about 30 km at 72 h, roughly half the error of "no movement". The cone is too narrow. |
| What's real vs fake? | Pixels, cloud map, currents and wind are real. Any fallback is **clearly labelled synthetic**. **On the Areas page a "demo plastic" cluster is added when none was found, and it has an amber label.** |
| Engine down? | You get an honest "engine unreachable" message. Nothing is invented. |
| Who can do what? | 3 roles, checked on the server. |
| Where are results stored? | PostgreSQL, via Prisma. |
| Why both PostgreSQL and MySQL? | PostgreSQL is the live app database. MySQL is a read-only copy of the datasets and app tables, made for browsing and charts. |
| Why 10/20/60? | Pixel size in metres. |

---

## 11. Weak points: say them before the panel does

Being honest earns respect. All of these were measured.

- **Real-world plastic test (PLP, Greece):** a real ~28 m plastic mesh was photographed on 21 satellite passes.
  - The model called it plastic on only **33%** of passes. FDI alone flagged it on **76%**.
  - A **wooden** raft was also called plastic on **80%** of passes. Wood and plastic look alike in these colours.
  - **False alarms elsewhere: 0%.**
  - In short: **few false alarms, but small targets are often missed, and wood can't be told apart from plastic.**
- **Plastic is rare in the training data (about 0.5%)**, so plastic scores are lower than water scores.
- **The satellite sees patches, not single bottles.** "Plastic" here means "floating debris that looks like plastic in the light it reflects".
- **The satellite returns about every 5 days, and clouds leave gaps.** That is what "44% observed" means.
- **New seas are only lightly tested** (2 scenes). Don't claim it works everywhere.
- **Drift error is real, and the cone understates it.**

---

## 12. Checklist before you present

1. Run `start-all.cmd` and wait until all windows are up (8000, 8010, 3001, 5173).
2. In Map Explorer, set **Advanced tools -> Min confidence to 0%**.
3. If you see **RESTORED - NOT RE-SCANNED**, press **Rescan**. A real scan takes about a minute.
4. **Draw over open sea.** On land you'll get the amber warning, which is correct. **0 plastic on a clean sea is a correct answer.**
5. **Mention the demo plastic** on the Areas page before the panel notices it. To turn it off, set `DEMO_PLASTIC=false` in `.env` and restart the backend.
6. Test one link in `docs/CODE_TOUR.html`, and run `python docs\code-tour\build_code_tour.py --check`.

---

## 13. Files to ignore

`Alerts.tsx`, `Dashboard.tsx` and `OpsBoard.tsx` in `frontend/src/pages/` are **old and unused**; their content moved into Command Center. Don't open them in the viva.

The other old-looking pages (`Detections`, `Hotspots`, `ModelHealth`, `Intelligence`, `Analytics`, `Reports`) **are still used**. They are tabs inside Records, AI Lab and Analytics & Reports.

---

## Mini glossary

| Word | Meaning |
|---|---|
| **Band** | One colour (wavelength) that the satellite records |
| **NIR** | Near-infrared, invisible light that floating things reflect |
| **SWIR** | Short-wave infrared, another invisible band |
| **Pixel** | One square of the image (10 m × 10 m here) |
| **AOI** | Area of Interest, the box you draw |
| **SCL** | The satellite's own map saying "water / land / cloud" for each pixel |
| **FDI** | Floating Debris Index, the "is something floating?" score |
| **Candidate** | A pixel that passed the FDI test |
| **MLP** | A simple kind of neural network |
| **Ensemble** | Several models voting together |
| **ONNX** | A file format that lets a trained model run fast anywhere |
| **Confidence** | How sure the model is (0 to 1) |
| **Precision** | When it says plastic, how often it is right |
| **Recall** | Of all the real plastic, how much it finds |
| **F1 / Macro-F1** | A balance of precision and recall / the average over all classes |
| **DBSCAN** | A method that groups nearby points into clusters |
| **Hotspot** | A cluster of plastic pixels |
| **Clay** | A large pre-trained satellite AI used as a second opinion |
| **Windage** | The small push that wind gives to floating objects |
| **Runge-Kutta 4** | A standard, accurate way to step a movement forward in time |
| **Hindcast** | Testing a forecast using past data |
| **JWT** | A login pass the browser sends with every request |
| **Role** | Your permission level (FIELD, COASTGUARD, ADMIN) |
