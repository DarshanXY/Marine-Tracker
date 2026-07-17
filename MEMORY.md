# Project Memory — In Simple Words

*A plain-language diary of what this project is and everything that has been built and done so far.
No jargon. If you read only one file to understand the project, read this one.*

---

## What is this project?

**Marine Plastic Tracker** takes **free satellite photos** of the ocean and tries to **spot floating
plastic**, then **predicts where it will drift** over the next 3 days. It's built for Indian ocean
agencies (INCOIS, NCCR, Indian Coast Guard) and it runs for **₹0** using only free tools.

**Honest promise:** it does **not** replace boats, drones, or people. Satellites only pass over every
~5 days, can't see through clouds, and each pixel is 10 metres wide — so we can only see **big** patches
of plastic, not a single bottle. The app is a **helper**, not a magic eye. We always say this clearly.

---

## The main pieces (the "machine")

Think of it as three programs that talk to each other:

1. **The website** (what people see) — a map where you draw a box on the ocean, and it shows detected
   plastic, danger zones, and drift arrows. Also dashboards, charts, alerts, login, etc.
2. **The middle server** — handles logins, saves results in a database, and passes messages around.
3. **The "brain" (Python engine)** — does the actual science: downloads the satellite photo, runs the
   maths to find plastic, groups nearby detections into "hotspots", and forecasts drift.

All three already work end-to-end. The database, a task queue, real satellite data, and real
ocean-current data are all wired up and tested.

---

## How we find plastic (the science, simply)

1. **Get the satellite photo** of the area (real Sentinel-2 images, free).
2. **Run a formula (FDI)** that makes floating stuff stand out from water. This gives "maybe plastic"
   spots.
3. **Ask an AI model** "is this spot really plastic, or algae, foam, or just water?"
4. **Group** nearby plastic spots into hotspots (small/medium/big).
5. **Forecast drift** for 3 days using real wind and ocean currents.
6. **Raise alerts** for the serious hotspots.

---

## What I did recently (the AI upgrade) — the important part

The project already worked, but the "AI that decides plastic vs not" was trained on a slow computer and
wasn't very accurate. The goal this round: **make it much more accurate using the computer's graphics
card (GPU)**, and add a **modern AI model**.

### 1. Turned on the GPU
The laptop has an **NVIDIA RTX 4050** graphics card. Regular Python couldn't use it, so I set up a
separate, clean Python environment with the right GPU version of PyTorch (an AI library). Confirmed the
GPU works.

### 2. Retrained the main model — big accuracy jump
I retrained the plastic-detector on the GPU, added 4 extra "clues" (spectral indices) computed from the
same satellite bands (so **no extra data cost**), and used better training techniques.

**Result — measured on 499,907 real test pixels the model had never seen:**

| | Old model | New model |
|---|---|---|
| Overall accuracy | 89.5% | **98.9%** |
| Balance score (macro-F1) | 0.50 | **0.79** |
| "Foam" false alarms | terrible (1.6% correct) | **fixed (61% correct)** |

So the new model is the default now. The old one is kept as a backup, just in case.

### 3. Tried a "picture" AI — and it honestly lost
I also tried a fancier AI that looks at a **square patch of the image** (not just one pixel). Surprisingly,
it did **worse** (0.55 vs 0.79). Reason: with only a few hundred real satellite scenes to learn from, it
"memorised" those specific scenes instead of learning what plastic actually looks like. **I did not ship
it** — being honest about a negative result is better than pretending. It stays as an optional extra.

### 4. Added a powerful "foundation model" — Clay
**Clay** is a big AI trained by others on **millions** of satellite images. Instead of learning from our
tiny dataset from scratch, we reuse Clay's knowledge and just teach a small final layer.

- It **runs fine** on our 6 GB graphics card (fast, ~36 milliseconds per image patch).
- On the same test, Clay scored **0.71**, beating our own model's **0.69** on those patches.
- **The real win:** on **brand-new seas it had never seen** (Durban, Sea of Marmara), Clay caught
  **2.4× more plastic** than our model. That's exactly the "works in new places" ability we wanted.

**How it fits:** we **keep both**. Our fast model is the first check; Clay is a smart "second opinion"
and powers new features. Clay runs in the background (it's big), so the live website stays fast.

### 5. Downloaded real datasets (all into the `data/` folder)
- **RefinedFloatingObjects** (11 GB) — real photos of floating debris around the world. (The download
  was slow, so I split it into 12 parallel streams to speed it up ~15×.)
- **PLP 2021 & 2022** — a project where scientists put **known plastic targets** in the sea and
  photographed them. Perfect for checking if our detector actually works.
- **Durban** — a real plastic-spill event scene.

### 6. Checked it against known real plastic (PLP)
Using the PLP known-target data, I tested our detector on a real ~28-metre plastic target across 21 dates:
- It **flagged the target on 76% of the dates** (the misses were dates when the log said the target had
  sunk underwater — so not the model's fault).
- **Almost zero false alarms** over clean water.

This is a strong thing to show an examiner: *"validated against real, deliberately-placed plastic —
not just our own test."*

### 7. Tuned the sensitivity (precise vs wide-net)
Clay can be set to either **catch more plastic** (but with more false alarms) or **be very sure** (fewer
alarms). I measured the full trade-off and picked settings that map onto the app's alert levels:
- **"Confirmed plastic"** → our precise model.
- **"Possible plastic"** → Clay's wider net.

---

## What state everything is in right now

- ✅ Website, server, and engine all run together.
- ✅ Real satellite images, real ocean/wind data, live database — all working.
- ✅ New GPU-trained detector is **live and much more accurate**.
- ✅ Clay foundation model installed, tested, and trained as a smart second stage.
- ✅ Real datasets downloaded and the detector validated on known plastic.
- ✅ Login with 3 roles (Admin, Coast Guard, Field), field-operations workflow, PDF/CSV reports.

## Just added — smart features from Clay's "fingerprints"

Clay turns any ocean patch into a 1024-number "fingerprint". I built a fast search over these
fingerprints (it runs on the ₹0 server — no big AI needed just to *search*). It powers:

- **"Find sites like this"** — give it a spot, it returns the most similar known ocean sites.
- **Guess-by-similarity** — label a spot just by looking at its nearest neighbours. With **no extra
  training at all**, this alone gets ~73% right — proof the fingerprints are meaningful.
- **"This looks unusual"** — flags spots that don't resemble anything we've seen (useful for new areas).
  It correctly rates brand-new seas as more unusual than familiar ones.
- **Learn from a few examples** — teach a new category from just a handful of labelled spots.

These are live as server endpoints (`/similarity/info`, `/similarity/demo`, `/similarity/search`).

## Just added — the "Similar sites" screen

On the **Map Explorer**, click any plastic hotspot → a panel slides in from the right showing the
nearest known ocean sites in the foundation model's fingerprint space (with a class switcher and
similarity bars). It's honest about what it shows and works even on the free setup. Everything was
type-checked, tested through the whole website→server→brain chain, and put through an automated
"try to break it" review — the few small issues it found were fixed (bad inputs now rejected cleanly,
the index is picked up even if built after startup, etc.).

## Just added — the "Coastal Intelligence" upgrades (four features)

These turn the tool from "detect plastic" into a small intelligence platform. All four were built,
tested, and checked end-to-end (website → server → brain), and both code sides type-check clean.

1. **"Find sites like THIS exact hotspot"** (not just by class).
   When you click a hotspot, the tool cuts a little image chip around it and saves it to a queue. A
   background step on the graphics card turns that chip into Clay's 1024-number "fingerprint" and files
   it in a store, tagged by place and date. After that, clicking the hotspot shows the *actual* nearest
   known sites to that specific spot — its own fingerprint, not a stand-in. Until the fingerprint is
   ready it honestly says "queued" and shows the by-class view. (The searching runs at ₹0; only the
   fingerprint-making needs the graphics card.)

2. **One trust score from both AIs (High / Medium / Low).**
   Instead of showing two separate opinions, we now combine the fast per-pixel model and Clay into a
   single confidence badge. **Both agree + confident → High. They disagree, or the place looks unlike
   anything we've seen → Low.** It always explains *why* in one line. This is honest about uncertainty
   exactly where the model is weakest (unfamiliar water).

3. **Change over time at the same place.**
   Because each site's fingerprint is saved with its date, we can compare the same spot across dates —
   *without re-downloading anything*. It reports whether a hotspot is **intensifying** (looking more
   plastic-like), **clearing**, **shifted**, or **stable**, with the numbers behind it. Complements the
   older raw-pixel change check.

4. **Analysts can label detections → the model learns from it (active learning).**
   Coast Guard / Admin users get **"Confirm plastic"** and **"False alarm"** buttons on each detection.
   Those human verdicts are saved and can be **exported as a CSV training set** to retrain the model on
   real corrections. Field users can't label (locked by role). Verified: wrong role is blocked,
   bad input is rejected, labels save and read back.

New server endpoints: `/similarity/hotspot` (this-hotspot neighbours + fused confidence),
`/similarity/change` (change over time), `/detections/:id/label` (validate), `/detections/labels/export`
(active-learning CSV).

## Just added — the frontend command center (the UI caught up to the engine)

The backend/engine had grown far past what the old UI exposed, so the frontend was rebuilt into a
real command center — **keeping the exact ocean/teal theme**, only adding:

- **Grouped navigation** — the sidebar is now organised into **Monitor / Intelligence / Operate /
  System**, so the smart features finally have a home.
- **Similarity & Fusion page** — explore the AI "fingerprint" space, see any embedded site's true
  nearest neighbours, its High/Medium/Low confidence, and how it's changed over time.
- **Active Learning page** — a review queue where Coast Guard/Admin confirm plastic or flag false
  alarms at speed, with a "retrain readiness" bar and one-click CSV export of the labelled set.
- **Model Health page** — the AI's report card: accuracy, per-class recall, a confusion-matrix
  heatmap, live evaluation, and the engine's own capability list.
- **Live everything** — the dashboard now has a live status rail (engine, model, scan queue,
  satellite, embedding store), and running a scan shows **real stage-by-stage progress streaming
  live** (Ingest → FDI → Classify → Cluster → Drift → Alerts) with genuine timings.
- **Detail pages** for any detection or hotspot (shareable links) with drift forecast, "trace the
  likely source" back-tracking, and actions.
- **Command palette (⌘K)** to jump anywhere (remembers recent), and a **notification bell** with
  unread alerts you can acknowledge in place.

Everything was type-checked and production-built clean after each step; nothing about the look or
colours changed.

## What's being built next (toward a full "Coastal Intelligence Platform")

The bigger roadmap is to detect **more than plastic** from the same free satellites, reusing this
fingerprint + fusion + change + active-learning machinery:

- **Oil spills**, **harmful algal blooms**, and **coastal flooding** — each is a new "what am I looking
  at?" head on top of the Clay fingerprints we already compute.
- The four features above are the reusable spine; adding a new hazard is mostly a new labelled set +
  a small head, not a rebuild.

---

*Files that hold the detailed technical record: `PROJECT_SUMMARY.md` (full status), `TECHNICAL_AUDIT.md`
(what's real vs simulated), `README.md`, and `python_engine/models/metrics.json` (all the exact model
scores).*
