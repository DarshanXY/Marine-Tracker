# Marine Plastic Tracker — Complete Viva Preparation Guide

**Project:** Satellite-Based Detection and 72-Hour Drift Forecasting of Marine Plastic Pollution
**Team (4):** Nimisha Nair · Darshan Gadekar · Krushna Taiwade · Nalaksh Randhawa
**Branch verified against:** `fix/scan-and-auth-reliability` · **Generated:** 2026-07-30

> **Scope rule followed in this document:** every page, module, number, formula, API and file name below was read from the actual source code and the project's own docs (`docs/SYSTEM_OVERVIEW.md`, `PROJECT_SUMMARY.md`, `python_engine/models/metrics.json`). Nothing here is invented. Where a capability is *off by default* or *not validated*, this document says so — because that honesty is itself a marking point for this project.

---

## How to use this document

| If you have… | Read this |
|---|---|
| 5 minutes before you walk in | [Final Viva Cheat Sheet](#part-h--final-viva-cheat-sheet) |
| 1 hour | Cheat sheet + [Complete Project Workflow](#part-e--complete-project-workflow-end-to-end) + your own pages |
| A full evening | Everything, page by page |
| Panic mid-answer | [The 10 golden sentences](#the-10-golden-sentences) |

Every page section has the same shape:

1. **Purpose** (2–3 lines)
2. **Modules on this page** — each with *What / Why / Input / Processing / Output / Tech / Why-this-not-that / Example / Called-by / Feeds-into*
3. **Viva questions + model answers** (minimum 10)
4. **Technical terms in simple language**
5. **60-second explanation**
6. **Detailed explanation**
7. **What the examiner can challenge, and your best response**

---

## Table of contents

**Part A — Public / Marketing pages**
1. [Landing page `/`](#page-1--landing-)
2. [About & Method `/about`](#page-2--about--method-about)
3. [Documentation `/docs`](#page-3--documentation-docs)
4. [FAQ `/faq`](#page-4--faq-faq)
5. [Contact `/contact`](#page-5--contact-contact)
6. [Compliance `/compliance`](#page-6--compliance-compliance)
7. [Terms `/terms`](#page-7--terms-terms)
8. [Privacy `/privacy`](#page-8--privacy-privacy)

**Part B — Authentication**
9. [Login `/login`](#page-9--login-login)
10. [Sign Up `/signup`](#page-10--sign-up-signup)

**Part C — The application shell**
11. [App Shell / AppLayout](#page-11--the-application-shell-applayout)

**Part D — Application pages**
12. [Command Center `/app`](#page-12--command-center-app)
13. [Map Explorer `/app/map`](#page-13--map-explorer-appmap)
14. [Areas `/app/areas`](#page-14--areas-appareas)
15. [Records `/app/records`](#page-15--records-apprecords)
16. [Detection Detail `/app/detections/:id`](#page-16--detection-detail-appdetectionsid)
17. [Hotspot Detail `/app/hotspots/:id`](#page-17--hotspot-detail-apphotspotsid)
18. [AI Lab `/app/ai-lab`](#page-18--ai-lab-appai-lab)
19. [Active Learning `/app/active-learning`](#page-19--active-learning-appactive-learning)
20. [Pipeline `/app/pipeline`](#page-20--pipeline-apppipeline)
21. [Field Operations `/app/operations`](#page-21--field-operations-appoperations)
22. [Analytics & Reports `/app/analytics`](#page-22--analytics--reports-appanalytics)
23. [Settings `/app/settings`](#page-23--settings-appsettings)
24. [Admin Panel `/app/admin`](#page-24--admin-panel-appadmin)
25. [404 / Not Found](#page-25--404--not-found)

**Part E–H — Synthesis**
- [Behind-the-screens modules (backend · engine · DB)](#part-d2--behind-the-screens-modules-no-ui-of-their-own)
- [Complete Project Workflow](#part-e--complete-project-workflow-end-to-end)
- [4-Member Presentation Plan](#part-f--4-member-presentation-plan)
- [Individual Contribution Preparation](#part-g--individual-contribution-preparation)
- [Final Viva Cheat Sheet + 50 Q&A](#part-h--final-viva-cheat-sheet)

---

## The system at a glance (read this before Page 1)

The product is **one browser app talking to four backing services**. Nothing else.

```
   BROWSER (React, port 5173)
        │  HTTP (REST)  ·  WebSocket /ws/live  ·  SSE /api/pipeline/stream
        ▼
   BACKEND  (Node 20 + Express + Prisma, port 3001)
        │            │                 │
        │            │                 └──► REDIS 6379  (BullMQ job queue — optional)
        │            └──────────────────►  POSTGRESQL 5432 (system of record, 18 tables)
        ▼
   PYTHON ENGINE (FastAPI, port 8000)   ← "all the science", torch-free
        │            │
        │            └──────────────────►  CLAY GPU SIDECAR (PyTorch, port 8010, RTX 4050)
        ▼
   EXTERNAL FREE DATA
     · CDSE / Sentinel Hub  (Sentinel-2 pixels, OAuth2)
     · AWS Earth Search STAC (scene discovery, keyless)
     · Open-Meteo Marine + Forecast (currents/wind, keyless)
     · CMEMS / Copernicus Marine (gridded ocean currents)
```

**The 7-stage detection pipeline** (this is the spine of every answer you will give):

```
DOWNLOAD → FDI → CNN(MLP) → DBSCAN → CLAY → DRIFT → ALERT
 ingest    index   classify   cluster  verify forecast raise
```

**Three roles** — FIELD (level 1) → COASTGUARD (level 2) → ADMIN (level 3). Reads are mostly public so the demo renders without login; **all writes are privileged and enforced in the backend**, not just hidden in the UI.

---
---

# PART A — PUBLIC / MARKETING PAGES

These eight pages sit inside `MarketingLayout` (`frontend/src/components/layout/MarketingLayout.tsx`) — a public header + footer wrapper, no sidebar, no login required.

---

## Page 1 — Landing (`/`)

**File:** `frontend/src/pages/Landing.tsx`

### Purpose
The first screen anyone sees. It states in one line what the system does ("see marine plastic from space — and where it drifts next"), proves it is alive by pulling **real counts from the live backend**, and walks the visitor through the 7-stage pipeline and the honest performance numbers before sending them into the dashboard.

### Modules on this page

#### 1.1 Hero block

| | |
|---|---|
| **What it is** | The headline, sub-headline, two call-to-action buttons ("Open the dashboard", "How it works") and an audience line ("Designed for INCOIS · NCCR · Indian Coast Guard"). |
| **Why we need it** | A viva/agency visitor must understand the product in under 10 seconds. It also fixes the *honest framing* immediately: "built to support patrols and field teams, not replace them." |
| **Input** | Nothing — static content plus Framer-Motion animation variants from `lib/motion.ts`. |
| **Processing** | `staggerContainer(0.12)` + `fadeUp` variants animate each child in sequence. `<MotionConfig reducedMotion="user">` at the app root flattens all of it for users with OS-level reduced-motion. |
| **Output** | Rendered hero DOM + two `<Link>` routes (`/app`, `/about`). |
| **Technologies** | React 18, React Router v6 `Link`, Framer Motion, Tailwind CSS, lucide-react icons. |
| **Why this approach** | A static hero (no images, no video) keeps the first paint fast and the bundle small. Route pages are `lazy()`-loaded in `App.tsx`, so heavy libraries (Leaflet, Recharts) never ship with the landing page. |
| **Example** | Visitor lands on `/`, reads the headline, clicks "Open the dashboard" → router navigates to `/app` → `ProtectedRoute` redirects to `/login` if not signed in. |
| **Called by** | `App.tsx` route `<Route path="/" element={<Landing />} />` inside `MarketingLayout`. |
| **Feeds into** | The router — `/app` (Command Center) or `/about`. |

#### 1.2 Live stats band

| | |
|---|---|
| **What it is** | Four `StatCard`s — Detections, Confirmed plastic, Active hotspots, Regions — under the label "Live from the pilot". |
| **Why we need it** | It proves the marketing page is wired to a running system, not a mockup. This is the single strongest credibility signal on the public site. |
| **Input** | `useOverview()` → `GET /api/stats/overview`. |
| **Processing** | TanStack Query fetches and caches; `StatCard` runs a `requestAnimationFrame` count-up animation to the value. |
| **Output** | Four animated numbers. If the backend is down, TanStack returns `undefined` and each card shows `0` rather than crashing. |
| **Technologies** | TanStack Query v5, Axios client (`lib/api.ts`), `components/ui/StatCard.tsx`. |
| **Why this approach** | Reading the *same* aggregate endpoint the dashboard uses means the public number can never disagree with the internal number. Hardcoding would have been easier and would have been a lie. |
| **Example** | Backend returns `{ totalDetections: 1284, plasticDetections: 391, activeHotspots: 7, regionsMonitored: 5 }` → the four tiles count up to those figures. |
| **Called by** | `Landing.tsx` body. |
| **Feeds into** | Nothing downstream — it is a read-only display. |

#### 1.3 Pipeline explainer (7 cards)

| | |
|---|---|
| **What it is** | Seven cards: Ingest → FDI → Classify → Cluster → Verify → Forecast → Alert, each with a one-line description. |
| **Why we need it** | It is the project's core intellectual content, told once in plain English. The panel will almost certainly ask you to recite these seven stages. |
| **Input** | The `PIPELINE` constant array declared at the top of `Landing.tsx`. |
| **Processing** | `.map()` renders each with a staggered reveal on scroll (`whileInView`, `once: true`). |
| **Output** | Seven glass cards labelled STEP 1…STEP 7. |
| **Technologies** | React, Framer Motion `whileInView`, Tailwind. |
| **Why this approach** | The stage names and order are copied from `python_engine/main_pipeline.py` so the marketing page cannot drift from the engine. The page says **seven** stages, because Clay verification is a real stage — an earlier version said six and under-sold the system. |
| **Example** | Card 5 "Verify" reads: *"A Clay v1.5 foundation model gives each hotspot a 2nd opinion (~0.92 precision)."* |
| **Called by** | `Landing.tsx`. |
| **Feeds into** | Conceptually, the `/docs` page expands each of these into a full paragraph. |

#### 1.4 Features grid (6 cards)

| | |
|---|---|
| **What it is** | Six product capabilities: live interactive map, two-tier confident detections, Clay verifier, 72-hour drift forecasts, saved areas & change tracking, active-learning loop. |
| **Why we need it** | Maps each engineering feature to a user benefit — the "so what?" answer. |
| **Input** | The `FEATURES` constant array. |
| **Processing** | Staggered `.map()` render with hover lift. |
| **Output** | Six feature cards. |
| **Technologies** | React + Framer Motion + Tailwind. |
| **Why this approach** | Each card names the actual page that delivers it, so a demo can go feature → page in one click. |
| **Example** | "Two-tier confident detections" → demo goes to Map Explorer and points at the HIGH vs CANDIDATE legend. |
| **Called by** | `Landing.tsx`. |
| **Feeds into** | Demo narrative. |

#### 1.5 Honest metrics band ("Measured, not marketed")

| | |
|---|---|
| **What it is** | Three numbers: **0.82** macro-F1 (held-out MARIDA+MADOS), **~90 %** precision at the HIGH-confidence tier, **₹0** running cost — plus a caveat paragraph. |
| **Why we need it** | This is the project's ethical spine. Accuracy is 0.9899 but ~98 % of ocean pixels are water, so accuracy is *Water-inflated*. We deliberately lead with macro-F1 instead. |
| **Input** | The `METRICS` constant (hard-coded to match `python_engine/models/metrics.json`). |
| **Processing** | Staggered reveal. |
| **Output** | Three big gradient numbers + the caveat: *"Sentinel-2 detects aggregate optical signatures, not individual items."* |
| **Technologies** | React + Framer Motion. |
| **Why this approach** | Most similar projects lead with "98.9 % accuracy". We consider that misleading on a 98 %-water dataset, so we publish the class-balanced number. |
| **Example** | An examiner asks "how accurate?" — you answer **0.82 macro-F1**, then explain why you do *not* quote 99 %. |
| **Called by** | `Landing.tsx`. |
| **Feeds into** | AI Lab shows the live version of these same numbers from the engine. |

#### 1.6 Background effects (`WaveBackground`, `ParticleField`)

| | |
|---|---|
| **What it is** | A fixed animated ocean gradient + 40 drifting particles rendered behind every page (mounted once in `App.tsx`). |
| **Why we need it** | Visual identity — the "sunlit tropical ocean" light theme used across the whole product. |
| **Input** | `count={40}` prop. |
| **Processing** | CSS/SVG animation; no per-frame JS layout work. |
| **Output** | A `position: fixed` backdrop with `pointer-events: none`. |
| **Technologies** | React, CSS animations, Tailwind. |
| **Why this approach** | Mounted **once at the app root**, not per page, so navigating between routes does not restart or stack the animation. |
| **Example** | Present on `/`, `/about` and inside `/app` identically. |
| **Called by** | `App.tsx`. |
| **Feeds into** | Nothing. |

### Viva questions — Page 1

**Q1. Why does the landing page fetch live data instead of using static numbers?**
Because it is the same `GET /api/stats/overview` endpoint the internal dashboard uses. If we hardcoded numbers, the public page could claim something the system had not actually computed. Reading the live endpoint makes the claim self-verifying.

**Q2. What happens to this page if the backend is offline?**
The page still renders. TanStack Query returns `undefined`, and every StatCard falls back to `0` via `o?.totalDetections ?? 0`. We never show a crash or a blank page for a data failure.

**Q3. Why does the page say seven pipeline stages when many papers describe four or five?**
Because our pipeline genuinely has seven: ingest, FDI, MLP classify, DBSCAN cluster, Clay verify, drift forecast, alert. An earlier version of our own site said six — it had forgotten to count the Clay verification stage, which is one of our main contributions. We corrected it.

**Q4. Your accuracy is 98.99 %. Why does the landing page show 0.82?**
Because accuracy is inflated by class imbalance. Water is roughly 98 % of all pixels, and water is trivially easy, so a model that only predicted "water" would already score ~98 %. Macro-F1 averages the F1 score of all four classes equally, so rare classes like plastic count as much as water. 0.82 macro-F1 is the honest headline; 0.9899 accuracy is the flattering one.

**Q5. What is "₹0 running cost" — is that real?**
Yes. Sentinel-2 imagery via Copernicus Data Space is free, AWS Earth Search STAC needs no key, Open-Meteo is keyless, Clay v1.5 is an open foundation model running on our own GPU, and the whole stack runs on free/self-hosted tiers. The only real cost is electricity and the developer laptop.

**Q6. Why lazy-load the page components?**
`App.tsx` wraps every route in `React.lazy()`. Leaflet and Recharts are heavy; a visitor who only reads the landing page should never download the mapping library. It keeps first paint fast.

**Q7. What is `MotionConfig reducedMotion="user"` for?**
Accessibility. If the operating system reports `prefers-reduced-motion`, Framer Motion automatically flattens all opacity/transform animations app-wide. We set it once at the app root rather than guarding every animation individually.

**Q8. Why "designed for INCOIS · NCCR · Indian Coast Guard"?**
Those are the real Indian agencies that own this problem — INCOIS for ocean information services, NCCR for coastal research, and the Coast Guard for response. Naming the user forces every design decision to answer "would a duty officer use this?".

**Q9. What is the `ErrorBoundary` in `App.tsx` doing?**
It catches render errors and, specifically, the "Failed to fetch dynamically imported module" error that happens when the dev server restarts while a tab is open. Instead of a white screen, the user gets a message and a "Reload the app" button.

**Q10. Where do the seven stage descriptions come from — did you write them for marketing?**
They are written from the engine source. Every claim on a card is traceable: "FDI flags candidate pixels" is `satellite/fdi_calculator.py`, "DBSCAN groups high-confidence plastic" is `hotspot/dbscan_clusterer.py`, "~0.92 precision" is the CONFIRMED-tier precision in `models/fusion_thresholds.json`.

**Q11. Why is the background animation mounted in `App.tsx` and not in each page?**
So it does not remount and restart on every route change, and so the same visual identity carries into the authenticated app. Mounting it per-page would also stack multiple canvases.

**Q12. Is this page responsive?**
Yes — Tailwind breakpoints (`sm:`, `lg:`, `xl:`) collapse the 7-card pipeline grid to 4, then 2, then 1 column, and the stat band from 4 columns to 2.

### Technical terms in simple language

- **macro-F1** — Score each class separately, then average. Rare classes count as much as common ones. Range 0–1, higher is better.
- **Held-out data** — Test data the model has never seen during training. The only honest way to report a score.
- **Lazy loading** — Only download a page's JavaScript when someone actually visits that page.
- **Hydration / first paint** — How quickly the browser shows something useful.
- **Framer Motion variants** — Named animation states (`hidden`, `show`) that a parent can trigger for all children in sequence.
- **Sentinel-2** — A pair of free European Space Agency satellites that photograph the whole Earth in 13 colour bands every ~5 days.

### Explain this page in under 1 minute
"This is the public front door. In one line it says what the product does: turn free satellite images into plastic detections and 72-hour drift forecasts for the Indian Ocean. Below the headline, four counters pull real numbers straight from our live backend, so a visitor can see the system is actually running. Then we show the seven pipeline stages in order — ingest, FDI, classify, cluster, Clay verify, drift, alert — and six features. At the bottom we publish honest numbers: 0.82 macro-F1, about 90 % precision at the high-confidence tier, ₹0 running cost. We deliberately do not lead with our 98.9 % accuracy, because the ocean is 98 % water and that number flatters the model."

### Explain this page in detail
Start with the routing: `App.tsx` mounts a `BrowserRouter`; public routes render inside `MarketingLayout`. Landing is `React.lazy()`-loaded so its chunk (which includes no Leaflet/Recharts) is small. The page has five sections. The hero uses Framer Motion `staggerContainer`. The live stats band uses the `useOverview` hook, which wraps `api.overview()` (Axios `GET /api/stats/overview`) in TanStack Query — the same hook Command Center and Records use, so the numbers cannot disagree. The pipeline section maps a constant array whose seven entries mirror `main_pipeline.py` stage-for-stage. The features section maps six capability cards, each of which corresponds to a real page in the app. The metrics band is the honesty statement — macro-F1, HIGH-tier precision, and cost — with a caption explaining that Sentinel-2 sees aggregate optical signatures, not individual bottles. Finally a CTA band links to `/app`. Behind all of it, `WaveBackground` and `ParticleField` are mounted once at the app root, and `MotionConfig reducedMotion="user"` disables all motion for users who ask for that at OS level.

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"This is just a marketing page, no engineering."* | The four counters are live API reads from the same endpoint the operations dashboard uses, so the page is a functional integration test of the backend. The stage list is kept in sync with the engine deliberately — we corrected it from six to seven stages when we found it was out of date. |
| *"0.82 is low. Other papers report 95 %+."* | Those numbers are usually accuracy on water-dominated data or binary plastic-vs-water on curated patches. On the same four-class, class-balanced measure our 0.82 macro-F1 is competitive, and our **plastic precision at the HIGH tier is ~90 %**, which is the number that matters operationally — you do not want to dispatch a boat on a false alarm. |
| *"Why advertise your limitations on the front page?"* | Because the user is a government agency. Overclaiming to an agency is worse than under-claiming. Every limitation we publish is one we have tested empirically, and we can show the experiment. |
| *"The animations are just decoration."* | They are, and we gate them behind `prefers-reduced-motion` so they never harm accessibility. The engineering claim of this page is the live data binding, not the animation. |

---

## Page 2 — About & Method (`/about`)

**File:** `frontend/src/pages/About.tsx`

### Purpose
The scientific method page. It explains the four technical pillars of the system in plain paragraphs — FDI, MLP ensemble classification, Clay verification, and Lagrangian drift — and shows the **live satellite-provider status** so a reader can see whether the system is currently running on real imagery or demo pixels.

### Modules on this page

#### 2.1 Honesty callout ("What this is — and isn't")

| | |
|---|---|
| **What it is** | A bordered card stating that this is a decision-support pilot: Sentinel-2 revisits every ~5 days at 10 m and cannot see through cloud or at night. |
| **Why we need it** | It sets expectations before any capability is described. It is also the answer to the single most common examiner challenge. |
| **Input** | Static text. |
| **Processing** | `whileInView` reveal. |
| **Output** | A warning-toned card. |
| **Technologies** | React, Framer Motion, lucide `ShieldAlert`. |
| **Why this approach** | Putting the caveat *before* the method, not in a footnote, is a deliberate credibility choice. |
| **Example** | "Why didn't you detect the plastic in this photo?" → because it was cloudy that pass, and the caveat already said so. |
| **Called by** | `About.tsx`. |
| **Feeds into** | The Compliance page expands on this legally. |

#### 2.2 Method cards (4)

| | |
|---|---|
| **What it is** | Four cards: (1) Floating Debris Index, (2) MLP ensemble classification, (3) Clay foundation-model verification, (4) Lagrangian drift forecast. |
| **Why we need it** | This is the academic content of the project written for a non-specialist. |
| **Input** | The `METHOD` constant array. |
| **Processing** | `.map()` with staggered reveal. |
| **Output** | Four cards, each with an icon, title and paragraph. |
| **Technologies** | React + Framer Motion + Tailwind. |
| **Why this approach** | Each card carries its real number: FDI narrows millions of pixels to a handful; the MLP is a **3-seed ensemble** at **~0.82 macro-F1** with a **~90 %-precision HIGH tier**; Clay lifts plastic precision toward **~0.92**; drift uses **windage 1.5–3 %** and outputs a **cone, not a line**. |
| **Example** | Card 4 explains that we advect plastic forward 72 h over an ensemble and publish an uncertainty cone. |
| **Called by** | `About.tsx`. |
| **Feeds into** | The Documentation page's pipeline section. |

#### 2.3 Satellite data-source status

| | |
|---|---|
| **What it is** | A card showing the current provider mode (`live` / `demo`), the provider message, and two source cards: Copernicus Data Space (active) and Element84 Earth Search. |
| **Why we need it** | It tells the reader whether what they are about to see is real or demo — the "provenance" principle repeated throughout the app. |
| **Input** | `useSatelliteStatus()` → `GET /api/satellite/status`. |
| **Processing** | The backend's `satellite.service.ts` reports provider status and the newest scene; the badge turns green only when `mode === 'live'`. |
| **Output** | A `Badge` (live/demo) plus a status sentence. |
| **Technologies** | TanStack Query, Axios, Express service. |
| **Why this approach** | Two providers with different trade-offs: CDSE gives actual **pixel values** (OAuth2, needs a free account); Earth Search STAC gives **scene metadata** with no key at all. We use CDSE for pixels and STAC for discovery. |
| **Example** | With credentials configured, this reads "live"; without, "demo", and every scan is labelled synthetic downstream. |
| **Called by** | `About.tsx`. |
| **Feeds into** | The same status drives the header `DataBadge` inside the app. |

#### 2.4 Tech-stack chips
Seven pills: PostgreSQL + PostGIS, Prisma, Node + Express, FastAPI, React + Vite, Leaflet, BullMQ + Redis. Static list; a one-glance answer to "what did you build it with?".

> **Honest note you should volunteer:** the chip says *PostGIS*, but PostGIS is **not enabled yet** — geometry is currently stored as plain lat/lon float columns because the portable dev Postgres cluster does not bundle the extension. The schema is PostGIS-*ready*. Say this before the examiner finds it.

### Viva questions — Page 2

**Q1. Explain the Floating Debris Index in one sentence.**
FDI measures how much the near-infrared reflectance of a pixel sits **above** a baseline interpolated between the red-edge and shortwave-infrared bands — floating material reflects more NIR than the water underneath it would.

**Q2. Give me the actual FDI formula.**
`FDI = B08 − [ B06 + (B11 − B06) × ((λ8 − λ6)/(λ11 − λ6)) × 10 ]`, with wavelengths λ6 = 740 nm, λ8 = 842 nm, λ11 = 1610 nm, giving a slope of ≈ 0.1172. It is from Biermann et al., 2020.

**Q3. Why is FDI not enough on its own?**
Because algae, sea foam, wood and sun-glint also raise NIR above the water baseline. FDI is a cheap **candidate generator** — it takes millions of pixels down to at most 500 candidates. A trained classifier then decides *what* the candidate actually is.

**Q4. Why a per-pixel MLP and not a CNN?**
We tried both. A ResNet patch CNN on 64×64×6 chips scored macro-F1 **0.555** against the per-pixel MLP's **0.818** on the same held-out split. With only a few hundred distinct labelled scenes the CNN memorised scenes instead of learning plastic. We report that as a negative result and ship the MLP. The CNN path is still available behind the `CNN_MODEL_PATH` environment variable.

**Q5. What is a 3-seed ensemble and why use it?**
We train the same architecture three times with different random seeds and average the logits. It cost us ~0.007 of macro-F1 (0.824 → 0.8175) but lifted **plastic F1 from 0.742 to 0.799 and plastic precision from 0.652 to 0.776**, and dropped water false positives on unseen seas from 3 % to 0.7 %. For an operational system, precision is what matters, so we promoted the ensemble.

**Q6. What exactly does Clay do — does it detect plastic?**
No. Clay v1.5 is a **frozen** Earth-observation foundation model used as a *verifier*. It turns a 64×64×5 chip into a 1024-dimension embedding, we run k-NN against a reference index, compute a plastic-affinity score, and fuse that with the MLP confidence. Clay's own plastic F1 is only 0.37 — it is a precision gate, not a detector. It lifts CONFIRMED-tier precision to 0.9219.

**Q7. What is Lagrangian drift?**
Lagrangian means you follow the *parcel*, not the grid: you place a virtual particle at the hotspot and step it forward through the current and wind field. The alternative (Eulerian) tracks concentration at fixed grid points — much heavier, and not what a responder needs.

**Q8. What is windage?**
The fraction of wind speed transferred to a floating object. We run four members at 1.5 %, 2 %, 2.5 % and 3 %. `new_velocity = current + windage × wind`. Different windage values give different tracks, and the spread between them becomes the uncertainty cone.

**Q9. Why show a cone instead of a single line?**
Because a single line implies a precision we do not have. The cone is the per-hour min/max envelope of the four windage members. Showing one line to a Coast Guard officer would be dishonest.

**Q10. Why two satellite providers?**
CDSE (Sentinel Hub Process API) is the only one that returns **actual reflectance arrays** for an arbitrary bounding box, and it needs an OAuth2 account. Element84 Earth Search on AWS Open Data is **keyless** and great for discovering which scenes exist and their cloud cover. We use each for what it is best at.

**Q11. What does "L2A" mean?**
Level-2A — bottom-of-atmosphere surface reflectance, already atmospherically corrected by ESA, and it ships with the Scene Classification Layer (SCL). L1C would be top-of-atmosphere and would need us to do atmospheric correction ourselves.

**Q12. The chips say PostGIS. Is PostGIS actually used?**
Not yet — and we say so. The Prisma schema is designed to be PostGIS-ready, but geometry is currently plain lat/lon floats because the portable dev cluster doesn't bundle the extension. It re-enters the moment we need a real geometry column and spatial index.

### Technical terms in simple language

- **Reflectance** — What fraction of sunlight a surface bounces back, per colour band. Values roughly 0–1.
- **NIR / SWIR / red-edge** — Invisible colour bands. Near-infrared (B08, 842 nm), shortwave-infrared (B11, 1610 nm), red-edge (B06, 740 nm). Water absorbs NIR strongly, so anything floating stands out.
- **Baseline interpolation** — Draw a straight line between two known band values and ask how far the third sits above it.
- **Ensemble** — Several models voting; averaging cancels each one's individual quirks.
- **Foundation model** — A very large model pre-trained on huge unlabelled data, reused for many tasks without retraining.
- **Frozen model** — Its weights are never updated by us; we only read its output.
- **Advection** — Being carried along by a flow.

### Explain this page in under 1 minute
"This is our method page. It opens with what the system is *not*: Sentinel-2 passes every five days, at ten metres per pixel, and can't see through cloud — so we are decision support, not a replacement for patrols. Then four cards explain the science: FDI is a spectral index that flags anything floating; a three-seed per-pixel MLP ensemble trained on the real MARIDA and MADOS benchmarks decides whether the candidate is plastic, algae, foam or water; a frozen Clay v1.5 foundation model gives every plastic hotspot a second opinion and lifts precision toward 0.92; and a Lagrangian ensemble drifts the plastic forward 72 hours and publishes a cone, not a line. At the bottom we show live provider status so you can tell whether the app is on real Sentinel-2 pixels or demo pixels right now."

### Explain this page in detail
Walk the four method cards in order, giving the formula for FDI, the 11-feature vector for the MLP (`B04, B06, B08, B8A, B11, FDI, NDVI, PI, MNDWI, NDVI_RE, BRIGHT`), the Clay chip size (64×64×5 → 1024-d embedding) and fusion rule (MLP confidence + plastic affinity + novelty → CONFIRMED/POSSIBLE), and the drift integrator (4th-order Runge–Kutta at a one-hour step, four windage members, mean path + min/max cone, landfall probability = fraction of members that beach inside the horizon). Then explain the provider card: `useSatelliteStatus` hits the backend, which asks the engine, which reports whether CDSE credentials resolved. Finish with the tech-stack chips and volunteer the PostGIS caveat.

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"FDI is a 2020 index — nothing new."* | Correct, and we cite Biermann et al. FDI is not our contribution; it is the cheap candidate generator. Our contribution is the operational chain around it — two-tier confidence, foundation-model verification, drift with an uncertainty cone, and a closed active-learning loop. |
| *"Your classifier is just an MLP — that's trivial."* | It is deliberately small because the input is a per-pixel spectral vector, not an image. We empirically tested the "obvious" upgrade — a ResNet patch CNN — and it scored 0.555 macro-F1 against 0.818. We publish that negative result rather than hide it. |
| *"You say PostGIS but you're not using it."* | Right — and we state that on this page and in our docs. The schema is PostGIS-ready; the portable dev cluster doesn't bundle the extension. Turning it on is a migration, not a redesign. |
| *"Clay sounds like buzzword-dropping."* | It earns its place with a measured number: on brand-new seas (Durban, Marmara) Clay recalls 54.2 % of debris where the per-pixel MLP on the same chips recalls 22.2 % — 2.4× the cross-domain generalisation. That is exactly what a frozen pre-trained backbone is supposed to buy, and it is why we use it as a verifier. |

---

## Page 3 — Documentation (`/docs`)

**File:** `frontend/src/pages/Documentation.tsx`

### Purpose
The technical reference for a developer or an evaluating officer: a five-section, anchor-linked page covering the system overview, the 7-stage pipeline in detail, the data sources, a REST API reference table, and a "getting started" service/port table.

### Modules on this page

#### 3.1 Section navigator
Five anchor links — Overview, The 7-stage pipeline, Data sources, REST API reference, Getting started — from the `SECTIONS` constant. Pure in-page `#id` navigation, no router involvement, so it works even offline.

#### 3.2 Pipeline reference (7 blocks)

| | |
|---|---|
| **What it is** | A long-form version of the 7 stages with real parameters in the prose. |
| **Why we need it** | Landing gives one line per stage; this gives the paragraph an implementer needs. |
| **Input** | The `PIPELINE` constant. |
| **Processing** | `.map()` render. |
| **Output** | Seven titled blocks. |
| **Technologies** | React + Framer Motion. |
| **Why this approach** | Keeping the copy in a constant array (not scattered JSX) means one edit updates the page when the engine changes. |
| **Example** | The DBSCAN block explains that **high-confidence detections** are clustered into ranked hotspots with density and confidence scores. |
| **Called by** | `Documentation.tsx`. |
| **Feeds into** | Reader's understanding before they hit `/app/pipeline`. |

#### 3.3 Data-sources block (3)
Copernicus Data Space Ecosystem (primary, marked active), AWS STAC fallback (Element84 Earth Search, keyless), and Demo mode (deterministic sample scenes when no credentials exist, so the whole UI stays explorable offline at ₹0).

#### 3.4 REST API reference table

| Method | Path | What it does |
|---|---|---|
| GET | `/api/stats/overview` | Aggregate counts — detections, hotspots, active alerts, scenes processed |
| GET | `/api/detections` | Paginated detections with class scores, geometry, scene metadata |
| GET | `/api/hotspots` | Ranked DBSCAN clusters with density, confidence, drift cones |
| GET | `/api/regions` | Monitored regions + latest processing status |
| GET | `/api/alerts` | Open and historical alerts |
| POST | `/api/pipeline/run` | Run the full pipeline for a region or drawn AOI (**auth required**) |
| GET | `/api/pipeline/stream` | Server-sent events — one event per pipeline stage |
| GET | `/api/areas` | Saved study areas with latest scan + forecast history |
| POST | `/api/auth/login` | Exchange credentials for a role-scoped JWT |

This is the subset published publicly; the full surface is 13 routers (see [Part D2](#part-d2--behind-the-screens-modules-no-ui-of-their-own)).

#### 3.5 Services & ports table

| Service | Tech | Port | Command |
|---|---|---|---|
| Backend API | Node + Express + Prisma | 3001 | `cd backend && npm run dev` |
| Detection engine | Python + FastAPI | 8000 | `cd python_engine && uvicorn api.app:app --port 8000` |
| Clay GPU verifier | Python + Clay v1.5 (optional) | 8010 | `cd python_engine && python clay_service.py --port 8010` |
| Frontend | React + Vite | 5173 | `cd frontend && npm run dev` |

One-click alternative: `start-all.cmd` at the repo root, with a watchdog at `infra/watchdog.ps1`.

### Viva questions — Page 3

**Q1. Why publish an API reference on a public page?**
Because the design goal is an *agency console*. An agency will want to pull our data into their own systems. Documenting the REST surface is part of being integrable rather than a closed demo.

**Q2. Which endpoints require authentication?**
All writes. `POST /api/pipeline/run`, area create/update/delete/forecast, detection labelling, alert acknowledgement, operation create/advance/report. Reads are largely public so the demo renders without login. This is enforced in the Express middleware, not the UI.

**Q3. What is SSE and why use it for `/api/pipeline/stream` instead of WebSocket?**
Server-Sent Events is a one-way, HTTP-based stream from server to browser. A scan is strictly server→client and short-lived, so SSE is the right size of tool — it auto-reconnects, needs no handshake protocol, and works through proxies. We do use a WebSocket (`/ws/live`) for the *bidirectional-capable, long-lived* event feed.

**Q4. Why is the Clay verifier marked "optional"?**
Because the engine is deliberately **torch-free**. Clay is a 4.8 GB PyTorch model; putting it in the engine would break the ₹0/no-GPU deployment story. It runs as a separate sidecar, and if the sidecar is down every scan degrades gracefully to MLP-only **and says so** in the stage log.

**Q5. What is "demo mode"?**
When no satellite credentials are configured, the engine generates a deterministic synthetic scene so the entire pipeline and UI remain explorable offline. Crucially, every such result is **labelled synthetic** in the stage detail and in the UI — it never masquerades as real.

**Q6. Why does the engine run on 8000 and the backend on 3001?**
Separation of concerns. Node owns auth, RBAC, persistence, queueing and exports; Python owns the science (numpy, ONNX, remote sensing). Each is written in the language with the right ecosystem, and each can be scaled or restarted independently.

**Q7. What does `start-all.cmd` do, and why does the UI not start services?**
It launches Postgres, Redis, the engine, the Clay sidecar, the backend and the frontend, and a watchdog keeps them up. We deliberately **removed** service start/stop from the UI: services are host-owned and outlive any browser session, and a dashboard click must never kill the engine mid-scan.

**Q8. What is STAC?**
SpatioTemporal Asset Catalog — a standard JSON API for searching satellite scenes by bounding box, date and cloud cover. Element84's Earth Search is a public STAC over the AWS Sentinel-2 Open Data bucket, and it needs no key.

**Q9. What is Prisma?**
A TypeScript ORM. `schema.prisma` defines our 18 models; Prisma generates a fully typed client and handles migrations. It gives us compile-time safety on database queries.

**Q10. If I only had 5 minutes on one machine, how would I run this?**
`start-all.cmd`, then open `http://localhost:5173`. Without credentials it runs in demo mode; with a free Copernicus account in `.env` it runs on real pixels. The frontend also works with **no database at all**, because every data function falls back to an in-memory store.

**Q11. What is a watchdog here?**
`infra/watchdog.ps1` — a PowerShell loop that HTTP-probes each service's `/health` and restarts it if it stops answering. We moved from a TCP connect to an HTTP probe because a bound-but-hung port read as "up" while real scans failed.

**Q12. Is the documentation kept in sync with the code?**
Partly automatically and partly by discipline. The stage list, ports and endpoint paths are constants in this file, and `docs/SYSTEM_OVERVIEW.md` is regenerated against the source. We openly note in that document that `README.md` is stale — we would rather flag it than pretend.

### Technical terms in simple language
- **REST endpoint** — A named URL you call to get or change data.
- **SSE (Server-Sent Events)** — A one-way live text stream from server to browser over ordinary HTTP.
- **WebSocket** — A permanently open two-way channel.
- **Sidecar** — A small separate process running beside the main one, doing a job the main one cannot.
- **STAC** — A standard catalogue for searching satellite scenes.
- **ORM** — Software that lets you work with database rows as typed objects.
- **Watchdog** — A background process that checks other processes are alive and restarts them.

### Explain this page in under 1 minute
"This is the developer documentation. Five sections: an overview, the seven pipeline stages written out properly, the three data sources — Copernicus for pixels, AWS Earth Search for scene discovery with no key, and demo mode if you have no credentials — then a REST API reference table, and finally a services table with the four processes and their ports: frontend 5173, backend 3001, engine 8000, Clay GPU sidecar 8010. It exists because the target user is an agency that will want to integrate, not just look."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"Your README says Phase 0 complete, phases 1–10 pending."* | The README is stale and we say so explicitly at the top of `docs/SYSTEM_OVERVIEW.md`. The accurate living records are that document, `PROJECT_SUMMARY.md` and `models/metrics.json`. We would rather label a stale file than quietly leave it looking authoritative. |
| *"Public API docs with no authentication section is a security hole."* | Reads are intentionally public for the demo; writes are authenticated and role-gated in Express middleware. There is also a `SCHEDULER_TOKEN` guard on the external scan trigger so nobody can burn our satellite quota anonymously. |
| *"Documenting ports is not documentation."* | Agreed — that section is the quick-start. The substance is the seven-stage description and the API table, both of which are kept in constants so a code change forces a doc change in the same file. |

---

## Page 4 — FAQ (`/faq`)

**File:** `frontend/src/pages/FAQ.tsx`

### Purpose
Twelve honest questions and answers for a non-technical visitor — what the system is, how accurate it is, its real limitations, whether it replaces patrols, which satellites, how hotspots are defined, what the 72-hour forecast means, what the Clay verifier is, whether it improves over time, whether it is free, API access and data privacy.

### Modules on this page

#### 4.1 Accordion FAQ list

| | |
|---|---|
| **What it is** | An expand/collapse list built from a typed `FAQItem[]` (`{ q, a }`). |
| **Why we need it** | Anticipates the panel's questions in the panel's own language. The limitations answer is the most important text on the public site. |
| **Input** | The `FAQS` constant array (12 items). |
| **Processing** | Local `useState` tracks the open index; `AnimatePresence` animates height. |
| **Output** | An accessible accordion. |
| **Technologies** | React, Framer Motion, Tailwind. |
| **Why this approach** | An accordion over a wall of text: a visitor scans the questions and opens only what they need. |
| **Example** | *"How accurate is satellite plastic detection?"* opens to the macro-F1/precision explanation. |
| **Called by** | `FAQ.tsx`. |
| **Feeds into** | The Contact page ("still have a question?"). |

#### 4.2 "Still have a question?" CTA
A closing card linking to `/contact`.

### The 12 questions on the page (know these — they are literally the viva)
1. What exactly is Marine Plastic Tracker?
2. How accurate is satellite plastic detection?
3. What are the real limitations I should know about?
4. Does this replace patrols or field teams?
5. What satellites and data does it use?
6. How are hotspots defined?
7. What is the 72-hour drift forecast?
8. What is the Clay verifier, and why a second model?
9. Does the model get better over time?
10. Is it genuinely free?
11. Can I get API access?
12. Is my data private?

### Viva questions — Page 4

**Q1. What are the real limitations, stated fully?**
Six of them: (a) one pixel is 10 m, so a single bottle is invisible — we detect patches; (b) optical satellites cannot see through cloud or at night; (c) revisit is ~5 days, so this is not continuous surveillance; (d) plastic overlaps algae, foam and wood spectrally, so false positives exist and that is why we have a two-tier confidence system; (e) drift ETAs are **not yet validated against real drifter tracks** — the harness exists but no reference tracks have been run; (f) against real deployed plastic targets (PLP 2021) the model detects **0 of 33**, because those targets are 3.5–14 m inside a 10 m pixel.

**Q2. How do you define a hotspot?**
DBSCAN with `eps = 0.09°` and `min_samples = 3`, run over **HIGH-confidence plastic detections only**. Severity is by member count: ≥10 HIGH, ≥5 MEDIUM, ≥3 LOW.

**Q3. Why cluster only high-confidence plastic?**
Because hotspots are what dispatch acts on. A crew must never be sent to a low-confidence maybe. If nothing clears the 0.648 bar, the honest result is **no hotspot** — we deliberately do *not* fall back to clustering all plastic.

**Q4. Does the model actually get better over time?**
Yes, through a closed loop: analysts label PENDING detections as CONFIRMED or FALSE_ALARM on the Active Learning page, the labelled set is exportable as CSV, and the trainer (`ml/train_perpixel_gpu.py`) consumes it. The retrain-readiness bar targets 50 labels per round. The loop is real and wired; the retrain itself is a manual, offline GPU step.

**Q5. Is it genuinely free?**
Yes. Sentinel-2 via Copernicus is free with a free account; Earth Search STAC and Open-Meteo need no key; Clay v1.5 is open-weights; Postgres and Redis are self-hosted portable clusters. Running cost is ₹0 plus our own electricity.

**Q6. What does "0 out of 33" mean, and why did you publish it?**
The Plastic Litter Project deployed real HDPE targets in the sea. Our shipped model detects none of them. The targets are 3.5–14 m across in a 10 m pixel — the pixel is ~90 % water, so the spectral signature is diluted below threshold. We publish it because it is a **resolution limit, not a model failure**, and we proved it empirically: retraining *with* PLP data dropped plastic precision from 0.776 to 0.660 while only lifting deployed-target recall from 0/33 to 2/33. We did not promote that model.

**Q7. Is my data private?**
The app stores accounts (username, email, hashed password), audit logs, and the operational records users create. Satellite imagery is public open data. There is no third-party tracking.

**Q8. Can I get API access?**
The schema includes an `ApiKey` model and the REST surface is documented. In the current pilot, access is via authenticated session; issuing external keys is a deployment decision, not a code gap.

**Q9. Why does the FAQ answer that it does *not* replace patrols?**
Because it genuinely cannot: cloud, revisit gap, and 10 m resolution. It narrows where to look, from an entire coastline to a handful of ranked, coordinate-tagged hotspots with a landfall ETA. That is a real force multiplier, and claiming more would be false.

**Q10. What satellites — could you use others?**
We use Sentinel-2 L2A (10 m, free, ~5-day revisit). The natural upgrades are PlanetScope at 3 m (commercial), drones, or SAR/multi-temporal fusion. Those are architectural projects, not dataset downloads — that is why they are roadmap and not claimed.

**Q11. Why an accordion instead of a plain list?**
Twelve full answers is a wall of text. An accordion lets a visitor scan the questions and open only what they need, and it animates height with `AnimatePresence` so nothing jumps.

**Q12. Who wrote these answers — are they marketing copy?**
Each is the plain-English version of a measured fact in `models/metrics.json` or a documented design decision. The limitations answer in particular maps one-to-one onto the "Known gaps" table in `docs/SYSTEM_OVERVIEW.md`.

### Technical terms in simple language
- **Revisit time** — How often the satellite flies over the same place again (~5 days for Sentinel-2 with both satellites).
- **Spectral overlap** — Two different materials reflecting light in a very similar pattern, so they are hard to tell apart.
- **Sub-pixel target** — Something smaller than one pixel, so it can never fill a pixel on its own.
- **HDPE** — High-density polyethylene, the plastic used in the deployed test targets.
- **Precision vs recall** — Precision: of the things we flagged, how many were right. Recall: of the things that were really there, how many we caught.

### Explain this page in under 1 minute
"The FAQ is twelve honest answers for a non-technical reader. The important ones are: accuracy is 0.82 macro-F1 with about 90 % precision on our high-confidence tier; the limitations are the 10-metre pixel, cloud, the five-day revisit, and spectral overlap with algae and foam; it does not replace patrols; hotspots are DBSCAN clusters of high-confidence plastic only; the 72-hour forecast is an ensemble cone, not a promise; Clay is a second AI opinion for precision; and the model improves through analyst labelling. We also state that we detect zero of thirty-three deployed plastic targets, and explain why — that is a resolution limit, and we tested it."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"Publishing 0/33 destroys your project."* | It would if we had no explanation. We do: the targets are 3.5–14 m in a 10 m pixel, so the pixel is ~90 % water. We tested the obvious fix — retrain including PLP — and it made the product worse (plastic precision 0.776 → 0.660) for 2/33 recall. Reporting a tested negative result is stronger science than hiding it. |
| *"If it can't see a bottle, what use is it?"* | It is not meant to see bottles. It finds accumulation patches — the things that are worth sending a boat to — and tells you where they will be in three days. That is the actionable unit for a Coast Guard, not an individual item. |
| *"Your drift isn't validated. So the forecast is meaningless."* | It is not validated **against real drifter tracks** — we say so on the page and in the popup on the map. The physics is real (CMEMS gridded currents sampled along the track, RK4 integration, windage ensemble) and the harness for validation (`ml/validate_drift.py`, Liu–Weisberg skill score) exists. What is missing is reference tracks, which is a data-access task, and we do not claim otherwise. |

---

## Page 5 — Contact (`/contact`)

**File:** `frontend/src/pages/Contact.tsx`

### Purpose
The "request access" page: three contact-channel cards plus a validated enquiry form for agencies, researchers and press.

### Modules on this page

#### 5.1 Contact-channel cards
Three cards for different audiences (e.g. agency partnership, research collaboration, general enquiry), each with an icon, title and description.

#### 5.2 Request-access form

| | |
|---|---|
| **What it is** | A form with `Field`-wrapped labelled inputs (name, organisation, email, purpose/message) and a submit button that switches to a success panel. |
| **Why we need it** | Converts an interested agency into a lead, and demonstrates controlled-form handling in React. |
| **Input** | User keystrokes into controlled `useState` values. |
| **Processing** | Local validation (required fields, email shape), then a submit handler that flips to a thank-you state. In this pilot the submission is handled client-side — **there is no mail server wired in**, and you should say so if asked. |
| **Output** | A success confirmation panel replacing the form. |
| **Technologies** | React controlled components, Tailwind, lucide icons. |
| **Why this approach** | Controlled inputs keep the single source of truth in React state, which makes validation and reset trivial. |
| **Example** | A researcher fills the form and sees "we'll be in touch" without a page reload. |
| **Called by** | `Contact.tsx`. |
| **Feeds into** | Nothing server-side in the current pilot. |

### Viva questions — Page 5

**Q1. Does the contact form actually send an email?**
No — in the current pilot the submission is handled in the browser and shows a confirmation. Wiring it to a mail service (or a `POST /api/contact` route persisting to the DB) is a small, well-understood addition; we did not fake it with a fake success against a real-looking backend.

**Q2. What is a controlled component?**
An input whose displayed value comes from React state and whose `onChange` writes back to that state. React holds the single source of truth, so validation, formatting and reset all work from one place.

**Q3. How do you validate the form?**
Required-field checks and an email-shape check before submit; the button is disabled or the error is surfaced inline until they pass.

**Q4. Why not use a form library like React Hook Form?**
For four fields, a library is more dependency than benefit. Our heavier forms (Operation create, Mission report) are also hand-rolled with the shared `Input`/`Select` components, which keeps the design system consistent.

**Q5. Is there any XSS risk in the form?**
No. React escapes all interpolated text by default, and we never use `dangerouslySetInnerHTML` for user input. The one place we build raw HTML — the printable area brief in `Areas.tsx` — goes through an explicit `htmlEscape()` helper.

**Q6. Where would this data go in production?**
A `POST /api/contact` route into a `ContactRequest` table, with the same rate-limiting and audit-log treatment as other writes. The `AuditLog` model already exists and is append-only.

**Q7. Why does this page exist at all in a college project?**
Because the deliverable is positioned as an agency console. "How do I get access?" is the first question a real evaluator asks, and having no answer would break the framing.

**Q8. What is the `Field` component?**
A small local wrapper that renders a label plus its input with consistent spacing and typography, so every field on the page looks identical without repeating classes.

**Q9. How is the page kept accessible?**
Labels are associated with their inputs, the submit button has a visible focus state, and the success state is a rendered region rather than an alert.

**Q10. What happens on a slow network?**
There is no network call, so nothing hangs. When we wire the backend, the pattern will match the rest of the app: a TanStack `useMutation` with pending/success/error states and a toast.

### Technical terms in simple language
- **Controlled input** — React remembers what you typed; the box just displays it.
- **Client-side validation** — Checking the form in the browser before sending it anywhere.
- **XSS (cross-site scripting)** — An attack where user text is executed as code. React blocks it by default.

### Explain this page in under 1 minute
"Contact is the request-access page: three cards for different audiences and a short validated form. It is deliberately honest — the form currently confirms in the browser rather than pretending to email someone, because we would rather ship a truthful stub than a fake success. Technically it demonstrates controlled React inputs, inline validation, and our shared field components."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"The form doesn't do anything."* | Correct, and we say so rather than faking it. The backend pattern is already established elsewhere in the app — a `useMutation` to an authenticated Express route with an audit-log entry. It is one route away, and we chose not to ship a dishonest success. |
| *"Why no CAPTCHA?"* | Because there is no public write endpoint behind it yet. The moment there is, the same `SCHEDULER_TOKEN`-style guard plus rate-limiting applies, which is the pattern we already use on the expensive scan trigger. |

---

## Page 6 — Compliance (`/compliance`)

**File:** `frontend/src/pages/Compliance.tsx`

### Purpose
The legal-and-limits page: what data licences the system relies on, what security controls exist, an explicit "honest limits" section, and the operational-use disclaimer.

### Modules on this page

#### 6.1 Data licences section
Copernicus/Sentinel-2 open-data licence, AWS Open Data (Earth Search), Open-Meteo, CMEMS/Copernicus Marine, and the MARIDA / MADOS research datasets used for training — each with what it permits.

#### 6.2 Security section
JWT access + refresh tokens, bcrypt password hashing, TOTP two-factor authentication, three-tier RBAC enforced server-side, and an append-only `AuditLog` table.

#### 6.3 Honest-limits section (amber-headed)
The same six limitations as the FAQ, stated in compliance language: resolution, cloud, revisit, spectral ambiguity, unvalidated drift ETAs, and the sub-pixel in-situ result.

#### 6.4 Operational-use disclaimer
This is decision support. It complements patrols and field verification; it does not replace them, and it must not be the sole basis for an enforcement action.

> **Change worth knowing (an examiner may have seen an older build):** this page previously contained a **false claim** describing the shipped classifier as *"a clearly-labelled synthetic-spectra baseline"*. That was wrong — the model is trained on real MARIDA + MADOS labels. We found it during a credibility audit and removed it. Volunteering this shows you audit your own claims.

### Viva questions — Page 6

**Q1. What licence is Sentinel-2 data under?**
The Copernicus open-data licence — free, full and open access, including commercial use, with attribution. That is why the running cost can be ₹0.

**Q2. What are MARIDA and MADOS?**
Hand-labelled Sentinel-2 benchmark datasets for marine debris (Kikaki et al., 2022 and 2024). They provide per-pixel labels for plastic, algae, foam, water and related classes, with official train/val/test splits. We train on the official splits and report on the held-out test split.

**Q3. How are passwords stored?**
bcrypt hashes, never plaintext, in the `User` table. Login compares the hash; nothing reversible is stored.

**Q4. Explain your JWT scheme.**
A short-lived access token plus a 7-day refresh token. The Axios client attaches the access token and transparently refreshes on a 401. Refresh tokens are one-time-use: rotating one **denylists** the old JTI.

**Q5. Why a denylist and not an allowlist for refresh tokens? That sounds less secure.**
It is the fix for a real bug we hit. We originally kept an in-memory *allowlist* of valid refresh JTIs. Dev runs `tsx watch`, so every code edit restarted the backend and wiped the allowlist — every outstanding refresh token instantly read as "reused/revoked", refresh 401'd, and the app silently lost **write** access while public reads kept working, so everything *looked* healthy. Switching to a denylist means a fresh token is valid by signature and expiry, rotation still denylists the old JTI (one-time use preserved), and logout still denylists (revocation preserved). A restart now fails **open** instead of closed. In production the denylist belongs in Redis so it survives restarts.

**Q6. What is TOTP?**
Time-based One-Time Password — the 6-digit code from Google Authenticator or Authy. We generate a secret, show it as a QR code, and verify the code before enabling 2FA on the account.

**Q7. What is in the audit log?**
An append-only record of privileged actions — who did what and when. Append-only matters: an audit trail you can edit is not an audit trail.

**Q8. How is RBAC enforced?**
In three places for the UI (sidebar visibility, command palette, and `RequireRole` on the route) **and independently in the backend middleware**. The frontend checks are convenience; the server check is the security boundary. Typing a hidden URL still gets a 403.

**Q9. Why does a college project need a compliance page?**
Because the stated user is a government agency. Data licensing, security posture and stated limits are the first three things a government evaluator checks.

**Q10. You said a false claim was removed. What was it?**
The page described our shipped classifier as a "clearly-labelled synthetic-spectra baseline". That was a leftover from an early phase when the model *was* trained on synthetic spectra. By then it was trained on real MARIDA + MADOS data, so the sentence was actively understating and misdescribing our own work. We caught it in an audit and deleted it.

**Q11. Is CMEMS free?**
Copernicus Marine Service data is free with a free registration; we access it through the `copernicusmarine` client for gridded hourly surface currents.

**Q12. What is the legal risk of a wrong detection?**
That is exactly why the disclaimer exists. The output is a lead for human verification, with an explicit confidence tier attached. Nothing in the system takes an automated enforcement action.

### Technical terms in simple language
- **Open data licence** — You may use, redistribute and build on the data for free, with attribution.
- **bcrypt** — A deliberately slow one-way password hash, so brute-forcing stolen hashes is expensive.
- **JWT** — A signed token that proves who you are without the server storing a session.
- **Refresh token** — A longer-lived token used only to get a new short access token.
- **Denylist** — A list of things explicitly blocked (everything else is allowed). Opposite of an allowlist.
- **TOTP** — The rotating 6-digit code in an authenticator app.
- **Append-only** — Rows can be added but never modified or deleted.

### Explain this page in under 1 minute
"Compliance covers three things: the licences that make the data free and legal to use — Copernicus, AWS Open Data, Open-Meteo, CMEMS, and the MARIDA/MADOS research benchmarks; the security posture — bcrypt passwords, JWT access plus refresh tokens, optional TOTP two-factor, three-tier role-based access enforced on the server, and an append-only audit log; and an explicit honest-limits section that repeats the resolution, cloud, revisit and validation caveats in compliance language. It ends with the operational disclaimer: this is decision support for humans, never an automated enforcement decision."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"An in-memory denylist is lost on restart — that's a security regression."* | It fails **open**, and we made that trade knowingly. A wiped allowlist locked out every legitimate user silently; a wiped denylist means a small window where an already-rotated token could be reused before it expires. Signature and 7-day expiry still hold. The production fix is one line of Redis, and we state that. |
| *"You claim compliance but there's no formal certification."* | Correct — this is a pilot, not a certified deployment. What the page documents is the licence basis, the implemented controls, and the stated limits. We do not claim any certification we do not hold. |
| *"You had a false claim on your own compliance page."* | We did, it was a leftover from an earlier phase, and we found and removed it in our own audit. Being the ones who caught it is the point — we re-verify our claims against source rather than trusting our own older documents. |

---

## Page 7 — Terms (`/terms`)

**File:** `frontend/src/pages/Terms.tsx`

### Purpose
Standard terms of use, adapted to the actual nature of the product: acceptable use, the decision-support disclaimer, data attribution requirements, and limitation of liability.

### Modules on this page

#### 7.1 Summary cards
Short plain-language cards summarising the key terms before the formal text — the "you don't have to read 2,000 words to know the deal" pattern.

#### 7.2 Numbered clause sections
Formal numbered sections rendered from a constant array: acceptable use, accuracy and no-warranty, attribution obligations for Copernicus/AWS data, account responsibilities, and liability limits.

### Viva questions — Page 7

**Q1. Why does a student project need terms of use?**
Because it is presented as a console an agency could adopt, and it redistributes third-party open data with attribution obligations. Terms make the redistribution basis explicit.

**Q2. What attribution do you owe?**
Copernicus/Sentinel-2 requires attribution; Esri World Imagery (our basemap) is attributed in the Leaflet control; Element84/AWS Open Data and Open-Meteo are credited in the docs and UI.

**Q3. What is the "no warranty" clause protecting against?**
A wrong or missed detection driving an operational decision. The terms restate what the product says everywhere else: the output is a confidence-tagged lead for human verification.

**Q4. Where is the Esri attribution actually rendered?**
In `components/map/MapContainer.tsx` — the `TileLayer` carries `attribution='Imagery © Esri, Maxar, Earthstar Geographics'`, which Leaflet renders in the map corner. It is not a claim on the page; it is in the map control itself.

**Q5. Why is this page part of `MarketingLayout` rather than the app?**
Because it must be readable **before** anyone signs in or accepts anything.

**Q6. How do the terms interact with the audit log?**
The terms cover account responsibility; the append-only `AuditLog` is the technical mechanism that makes account-level accountability real.

**Q7. Do the terms restrict commercial use?**
The underlying Copernicus data permits commercial use. The pilot itself is a project deliverable; the terms describe it as a decision-support tool provided without warranty.

**Q8. Is any of this legally reviewed?**
No, and we do not claim it is. It is a good-faith, honest statement of the same limits we publish everywhere else, written in the register a terms page uses.

**Q9. Why summary cards before the formal text?**
Because nobody reads terms. Putting the four things that actually matter in plain language above the clauses is a usability decision, and it matches the honesty theme.

**Q10. What is the single most important clause?**
The decision-support clause: outputs are leads for human verification, not automated determinations. Every technical safeguard in the system — the HIGH tier, the CONFIRMED tier, the marker suppression on unusable scans — exists to make that clause true in practice rather than only on paper.

### Technical terms in simple language
- **Attribution** — Crediting where the data came from, as the licence requires.
- **Warranty** — A promise that something will work. "No warranty" means we make no such promise.
- **Liability** — Legal responsibility for consequences.

### Explain this page in under 1 minute
"Terms of use, adapted to what this actually is. Summary cards first in plain language, then numbered clauses: acceptable use, no warranty on accuracy, attribution obligations for Copernicus and the Esri basemap, account responsibility, and liability limits. The clause that matters is the decision-support one — our outputs are leads for human verification, and every confidence gate in the product exists to make that clause true in practice."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"These are boilerplate terms."* | The structure is standard because it should be; the content is specific — attribution for Copernicus and Esri, and a decision-support clause that our engineering actually enforces via the two-tier confidence system and marker suppression. |
| *"Not legally reviewed, so worthless."* | We say that. Its purpose is to state the licence basis and the limits honestly, in one place, before anyone signs in. |

---

## Page 8 — Privacy (`/privacy`)

**File:** `frontend/src/pages/Privacy.tsx`

### Purpose
What personal data the system holds, why, how long, and what rights a user has over it.

### Modules on this page

#### 8.1 "The short version"
A single card summarising: we store your account and the operational records you create; the satellite imagery is public open data; there is no third-party tracking.

#### 8.2 Detailed sections
Rendered from a constant array — what we collect, why, retention, sharing, security measures.

#### 8.3 User-rights cards
Rendered from the `RIGHTS` constant — access, correction, deletion, and how to exercise them.

### Viva questions — Page 8

**Q1. What personal data does the system actually hold?**
Per user: username, email, display name, bcrypt password hash, role, TOTP secret if 2FA is enabled, refresh-token records, and audit-log entries. Operationally: the areas, operations and mission reports a user creates, each attributable to them.

**Q2. Is any satellite data personal?**
No. Sentinel-2 at 10 m per pixel cannot resolve a person or a vehicle. It is public open data of the sea surface.

**Q3. Do you use analytics or third-party trackers?**
No. There is no analytics script, no ad network, no external font or CDN call from the app.

**Q4. How is the password protected?**
bcrypt hash only. The plaintext never leaves the request handler.

**Q5. What about the TOTP secret?**
Stored per user to verify codes. It is what makes 2FA work; it is sensitive and lives in the same protected `User` row.

**Q6. Can a user delete their data?**
The rights section describes access, correction and deletion. Technically, user rows and their owned records are deletable; note that we intentionally use **soft references** from `Operation` to hotspots/detections, so deleting a recomputed hotspot cannot cascade-delete a completed operation record.

**Q7. What is a soft reference and why does it matter for privacy/retention?**
`Operation.hotspotId` and `detectionId` are plain strings, not foreign-key relations, and `targetLat`/`targetLon` snapshot the location. Hotspots are recomputed and replaced on every pipeline run — a hard FK with cascade would silently delete completed operations. It keeps the operational record intact and independently auditable.

**Q8. Where does data live?**
A self-hosted PostgreSQL cluster (`infra/pgsql/`). Nothing is sent to a third-party database.

**Q9. What if the database is down — does data leak to a mock store?**
The backend can fall back to an in-memory demo store so the API keeps working, and it stamps every response with an `X-Data-Source` header so the client knows. `DATA_STRICT=1` disables the fallback and makes the backend fail fast instead.

**Q10. Is the app GDPR/DPDP compliant?**
We do not claim certification. The page states what is collected, why, and what rights exist, which is the substance those frameworks ask for. Formal compliance is a deployment activity.

### Technical terms in simple language
- **Personal data** — Anything that identifies a specific person.
- **Retention** — How long data is kept before deletion.
- **Soft reference** — Storing another record's ID as plain text, so deleting that record does not destroy this one.
- **Cascade delete** — Deleting a parent row automatically deletes its children. Dangerous when the "parent" is recomputed every run.

### Explain this page in under 1 minute
"Privacy in three layers. The short version: we hold your account and the records you create, the satellite imagery is public open data, and there is no third-party tracking. Then detail on what we collect and why, retention, and security. Then your rights — access, correction, deletion. Technically the notable choice is that operations reference hotspots by a soft string ID with a location snapshot, so recomputing hotspots on the next scan can never cascade-delete a completed mission record."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"You store a TOTP secret — that's a liability."* | It is required for TOTP to work at all, and it lives in the same protected user row as the password hash, in a self-hosted database with no third-party access. The alternative is not offering 2FA. |
| *"No formal DPDP/GDPR compliance."* | We do not claim it. The page states the substance — collection, purpose, retention, rights — and formal compliance is a deployment step, not a code change. |

---
---

# PART B — AUTHENTICATION

---

## Page 9 — Login (`/login`)

**File:** `frontend/src/pages/Login.tsx` · **Store:** `frontend/src/stores/authStore.ts`

### Purpose
Sign in to the operations console. It supports a normal username/password login, a second step for a 6-digit 2FA code when the account has TOTP enabled, and three one-click demo role buttons so an evaluator can jump straight into any permission level.

### Modules on this page

#### 9.1 Credential form

| | |
|---|---|
| **What it is** | Two controlled inputs (username-or-email, password) plus a submit button. |
| **Why we need it** | The entry point to every authenticated feature. |
| **Input** | `identifier` and `password` state (pre-filled with `cg_officer` / `Demo@1234!` for demo convenience). |
| **Processing** | `submit()` calls `useAuthStore().login()` → `api.authLogin()` → `POST /api/auth/login`. The backend verifies the bcrypt hash and issues an access + refresh JWT pair. |
| **Output** | On success: the store sets `user`, `accessToken`, `refreshToken`, `isAuthenticated`, and the router navigates to the page the user originally wanted (`location.state.from`, default `/app`). |
| **Technologies** | React controlled components, Zustand + `persist` middleware, Axios, JWT, bcrypt (server side). |
| **Why this approach** | Zustand over Redux: ~150 lines, no boilerplate, and the `persist` middleware gives us session restore across reloads for free. |
| **Example** | `cg_officer` / `Demo@1234!` → COASTGUARD session (level 2) → sidebar now shows AI Lab and Analytics. |
| **Called by** | Route `/login`; also reached by `ProtectedRoute` redirect. |
| **Feeds into** | `authToken` (the Axios client's token holder), `AppLayout`, `RequireRole`, and every authenticated API call. |

#### 9.2 Two-factor (TOTP) step

| | |
|---|---|
| **What it is** | A conditionally-rendered 6-digit code field, shown only after the server replies `needsTotp`. |
| **Why we need it** | Privileged roles (especially ADMIN, who can retrain the model) should not be protected by a password alone. |
| **Input** | The `totp` state string. |
| **Processing** | The login call is repeated with the code; the server verifies it against the stored TOTP secret with a time window. |
| **Output** | Either a full session or an "invalid code" error. |
| **Technologies** | TOTP (RFC 6238) on the server, `autoComplete="one-time-code"` on the input for OS autofill. |
| **Why this approach** | Two-step rather than always-show: most accounts have no 2FA, so asking everyone for a code would be noise. The server decides. |
| **Example** | Admin signs in → server returns `needsTotp` → the field appears → user types the Authenticator code → session issued. |
| **Called by** | `Login.tsx` `submit()`. |
| **Feeds into** | Same session flow as 9.1. |

#### 9.3 One-click demo role buttons

| | |
|---|---|
| **What it is** | Three `RoleBadge` buttons — ADMIN, COASTGUARD, FIELD — that sign in as the corresponding seeded account. |
| **Why we need it** | An examiner must be able to see all three permission levels in seconds without knowing three passwords. |
| **Input** | `DEMO_ACCOUNTS` from `authStore.ts` (`admin`, `cg_officer`, `field_analyst`, all password `Demo@1234!`). |
| **Processing** | `loginAs(role)` looks up the account and calls the normal `login()` path — **it is not a bypass**; it goes through the same server authentication. If that account has 2FA enabled, it hands off to the form with the username pre-filled and prompts for the code. |
| **Output** | A real session at the chosen role. |
| **Technologies** | Zustand action, same Axios call. |
| **Why this approach** | Reusing the real login path means the demo buttons can never diverge from real behaviour or accidentally grant a role the server would not. |
| **Example** | Click the ADMIN badge → signed in as `admin` → Active Learning and Admin appear in the sidebar. |
| **Called by** | `Login.tsx`. |
| **Feeds into** | The session, exactly as a manual login. |

#### 9.4 Offline demo fallback (in `authStore`)

| | |
|---|---|
| **What it is** | If the backend is unreachable (`OFFLINE` error), login falls back to a local demo session matching the seeded users. |
| **Why we need it** | So the routed app is still explorable with no server at all — useful for an offline demo or a laptop-only presentation. |
| **Input** | The same identifier/password. |
| **Processing** | `findAccount(identifier)` matches a demo account, the password must still equal `Demo@1234!`, and the store sets a user with **`accessToken: null`**. |
| **Output** | A local-only session. Because there is no token, every privileged write will fail server-side — which is correct. |
| **Technologies** | Zustand, local constants. |
| **Why this approach** | It degrades honestly: you can browse, but you cannot pretend to have server authority you do not have. |
| **Example** | Backend down → sign in as `field_analyst` → the app renders with mock data and the header shows "Offline · mock". |
| **Called by** | `authStore.login()` catch branch. |
| **Feeds into** | `AppLayout`'s `DataBadge`, which surfaces the offline state. |

#### 9.5 `ProtectedRoute` and `authToken`
`ProtectedRoute` wraps `/app/*` and redirects unauthenticated visitors to `/login`, remembering the intended destination in `location.state.from`. `lib/authToken.ts` is a tiny module the Axios client reads; `authStore` subscribes to itself and mirrors the tokens into it on every change **and after rehydrate**, so a page reload never leaves the API client tokenless.

### Viva questions — Page 9

**Q1. Walk me through the login flow end to end.**
The form calls `authStore.login()` → `api.authLogin()` → `POST /api/auth/login`. The backend finds the user, compares the bcrypt hash, and (if 2FA is on) either asks for a TOTP code or issues a signed access JWT plus a refresh JWT. The store persists both to localStorage via Zustand `persist`, mirrors them into `authToken`, and the router navigates to the originally requested page.

**Q2. Why Zustand and not Redux or Context?**
The auth state is small (user + two tokens + four actions). Zustand gives it in ~150 lines with no providers, no reducers and no action types, and its `persist` middleware handles localStorage and rehydration. Redux would be more ceremony than state.

**Q3. Where is the access token stored, and isn't localStorage insecure?**
localStorage, via Zustand persist. It is vulnerable to XSS in principle; our mitigations are that React escapes all interpolated content by default, we never use `dangerouslySetInnerHTML` on user input, and the access token is short-lived with rotation on refresh. HttpOnly cookies would be stronger and are the production upgrade — we can state the trade-off rather than pretend there isn't one.

**Q4. How does the app handle an expired access token?**
The Axios client in `lib/api.ts` intercepts a 401, calls the refresh endpoint with the refresh token, updates `authToken`, and retries the original request transparently. The user sees nothing.

**Q5. What happens if the refresh also fails?**
The session clears and the user is redirected to login. This is exactly the path that broke before the denylist fix — every backend restart invalidated refresh tokens, so writes silently 401'd while public reads kept working and the app *looked* fine.

**Q6. Are the demo buttons a security hole?**
No. They call the same authenticated endpoint with the same seeded credentials; they do not mint tokens client-side. The seeded accounts are development fixtures and would not exist in a real deployment.

**Q7. Explain the offline fallback — doesn't that let anyone in?**
It only triggers when the backend is genuinely unreachable, only matches the three seeded demo usernames, still requires the demo password, and produces a session with **no access token**. So every privileged server operation still fails. It buys browsing, not authority.

**Q8. How does `ProtectedRoute` remember where I was going?**
It passes `{ from: location.pathname }` in the navigation state when it redirects; `Login` reads `location.state.from` and navigates back there after a successful sign-in.

**Q9. What is `authToken.ts` and why is it separate from the store?**
It is a plain module holding the current tokens. Keeping it separate avoids a circular import — the Axios client cannot import the Zustand store (which imports the Axios client), so the store pushes tokens into this neutral module and the client reads them.

**Q10. What are the three roles and their levels?**
FIELD = 1, COASTGUARD = 2, ADMIN = 3. `ROLE_LEVEL` in `types/index.ts` is the single source, and comparisons are numeric (`ROLE_LEVEL[user] >= ROLE_LEVEL[required]`) so adding a role later does not require touching every check.

**Q11. What is bcrypt and why not SHA-256?**
bcrypt is deliberately slow and salted per password. A fast hash like SHA-256 can be brute-forced billions of times per second on a GPU; bcrypt's work factor makes that economically painful.

**Q12. Why is the password field pre-filled in the demo?**
Purely for evaluation convenience — it is the seeded demo password, printed openly on the page. It would be removed for any real deployment.

### Technical terms in simple language
- **JWT** — A signed ticket that proves who you are. The server can verify it without storing a session.
- **Access token** — Short-lived ticket sent with every request.
- **Refresh token** — Longer-lived ticket used only to get a new access token.
- **bcrypt** — Slow, salted password hashing.
- **TOTP** — The rotating 6-digit code in an authenticator app.
- **Zustand persist** — Automatically saves the store to localStorage and reloads it on refresh.
- **Interceptor** — Code that runs on every HTTP request/response, e.g. to attach a token or handle a 401.

### Explain this page in under 1 minute
"Login. You enter a username and password; the store calls the backend, which checks a bcrypt hash and returns a short access JWT plus a seven-day refresh JWT. If the account has two-factor enabled, the server replies 'needs TOTP' and a six-digit field appears. Tokens go into a Zustand store with localStorage persistence and are mirrored into the Axios client, which transparently refreshes on any 401. For evaluation there are three one-click role buttons — admin, coast guard, field — and they use the real login path, not a bypass. If the backend is completely unreachable, we fall back to a local demo session with no token, so you can browse but you cannot perform privileged writes."

### Explain this page in detail
Add: `ProtectedRoute` guards `/app/*` and preserves the intended destination; `RequireRole` additionally guards COASTGUARD+ and ADMIN routes so a hidden page cannot be reached by typing the URL; and the server enforces the same rules independently, returning 403. Then explain the refresh-token denylist story (see Page 6, Q5) as the concrete bug that shaped this design.

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"Tokens in localStorage is a known anti-pattern."* | Accepted. Our mitigations are React's default escaping, no `dangerouslySetInnerHTML` on user input, short access-token lifetime and rotation. HttpOnly, SameSite cookies plus a CSRF token is the production upgrade, and it is a backend + client change, not a redesign. |
| *"Hardcoded demo credentials on the login page."* | Deliberate, for evaluation, and clearly labelled "Demo". They are seed-script fixtures; a real deployment seeds no demo users. The important part is that the buttons authenticate for real rather than faking a session. |
| *"Your offline fallback lets someone in without a server."* | It lets them *look*. There is no access token, so every write is rejected the moment a server exists. And it only accepts three known fixture usernames with the printed demo password. |

---

## Page 10 — Sign Up (`/signup`)

**File:** `frontend/src/pages/SignUp.tsx`

### Purpose
Create a new account, with live password-strength feedback, and hand the new user straight into two-factor setup.

### Modules on this page

#### 10.1 Registration form
Username, email and password as controlled inputs wrapped in a local `Field` component (icon + label + input) so every row is visually identical.

#### 10.2 Password-strength meter

| | |
|---|---|
| **What it is** | A `strength(pw)` function returning `{ score, label, color }`, rendered as a coloured bar plus a word (e.g. weak / fair / strong). |
| **Why we need it** | Immediate feedback beats a rejection after submit. |
| **Input** | The password string on every keystroke. |
| **Processing** | Scores length and character-class variety (lower, upper, digit, symbol) into a 0–4 score, mapped to a label and colour. |
| **Output** | A live bar + label. |
| **Technologies** | Plain TypeScript + Tailwind. Deliberately no `zxcvbn` dependency. |
| **Why this approach** | A real strength library is ~400 kB; for a four-rule heuristic with a visual hint, that is a poor trade. The **server** still enforces the actual policy. |
| **Example** | `abc` → weak/red; `Demo@1234!` → strong/green. |
| **Called by** | `SignUp.tsx`. |
| **Feeds into** | Nothing — it is advisory. The authority is the backend validator. |

#### 10.3 Register → 2FA handoff

| | |
|---|---|
| **What it is** | On success, the app navigates to `/app/settings` with router state `{ promptTotp: true }`. |
| **Why we need it** | The best moment to get someone to enable 2FA is immediately after they create the account. |
| **Input** | `authStore.register()` result. |
| **Processing** | `Settings.tsx` reads `location.state.promptTotp`; a `useRef` guard (`autoStarted`) ensures the 2FA setup call fires **exactly once**, and only for a real backend session (`accessToken` present) on an account that does not already have TOTP. |
| **Output** | Settings opens with a welcome banner and the QR code already generated. |
| **Technologies** | React Router navigation state, `useRef` idempotence guard, TanStack-free direct `api` call. |
| **Why this approach** | Router state rather than a query parameter keeps the URL clean and the flag non-shareable. The `useRef` guard prevents React 18 StrictMode's double-effect from calling the setup endpoint twice. |
| **Example** | New user registers → lands on Settings → QR code is on screen → scans it → enters 6 digits → 2FA on. |
| **Called by** | `SignUp.tsx` after `register()`. |
| **Feeds into** | Page 23 (Settings) §23.2. |

### Viva questions — Page 10

**Q1. Does sign-up work offline?**
No, and it says so: "Backend offline — sign-up needs the API running on :3001." Creating a real account requires a real database write; faking it would be dishonest.

**Q2. Why write your own strength meter instead of using zxcvbn?**
Bundle size versus benefit. zxcvbn is hundreds of kilobytes for what is, in our UI, a hint. The real policy is enforced server-side where it cannot be bypassed.

**Q3. Isn't a client-side strength meter security theatre?**
It is UX, not security, and we treat it as such. Security is the bcrypt hash and the server-side policy. The meter just stops a user from discovering the rule by rejection.

**Q4. What role does a new user get?**
The default lowest privilege — FIELD (level 1). Elevation is an administrative action, never self-service.

**Q5. Why push the user into 2FA setup right after sign-up?**
Adoption. If you ask later, nobody does it. The banner explains why, and it is skippable — we prompt, we do not force.

**Q6. What is the `useRef` guard for?**
React 18 StrictMode runs effects twice in development. Without `autoStarted.current`, the app would call `POST /api/auth/2fa/setup` twice and generate two secrets. The ref makes the effect idempotent.

**Q7. Why router state instead of `?promptTotp=1`?**
A query parameter is shareable and bookmarkable; this flag is a one-time transition signal. Router state disappears on reload, which is exactly the semantics we want.

**Q8. How is the email validated?**
Shape validation in the browser for immediate feedback, and uniqueness plus format enforced by the backend on insert. The database has the uniqueness constraint.

**Q9. What is stored when I register?**
A `User` row: username, email, display name, bcrypt password hash, role (FIELD), and 2FA disabled. No plaintext password at any point.

**Q10. How would you add email verification?**
A `verified` boolean on `User`, a signed one-time token emailed on registration, and a `GET /api/auth/verify?token=` route flipping the flag. We have not built it, and we do not claim to have.

### Technical terms in simple language
- **Controlled form** — React holds the value of every field.
- **Idempotent** — Running it twice has the same effect as running it once.
- **StrictMode** — A React development mode that intentionally double-runs effects to expose bugs like this one.
- **Router state** — Data passed between pages during navigation without putting it in the URL.
- **Uniqueness constraint** — A database rule that stops two rows sharing the same value.

### Explain this page in under 1 minute
"Sign-up: username, email, password, with a live strength meter that we wrote in a few lines rather than pulling in a 400-kilobyte library — the real policy is enforced on the server anyway. A new account always gets the lowest role, FIELD; elevation is an admin action. On success we navigate straight to Settings with a one-shot router-state flag that auto-opens two-factor setup, guarded by a `useRef` so React StrictMode's double effect can't generate two TOTP secrets. If the backend is down we refuse rather than fake an account."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"Anyone can self-register into your agency console."* | They can register, but only at FIELD level, and FIELD cannot touch AI Lab, Analytics, Active Learning or Admin. Role elevation is admin-only and server-enforced. In a real deployment, registration would be invite-only — a config decision, not an architecture change. |
| *"No email verification."* | Correct, and we state it rather than implying it exists. It is a token + one route + one boolean column. |
| *"Your strength meter is naive."* | It is, deliberately — it is a hint. The authoritative check is server-side, where it cannot be bypassed by anyone editing JavaScript. |

---
---

# PART C — THE APPLICATION SHELL

---

## Page 11 — The application shell (`AppLayout`)

**File:** `frontend/src/components/layout/AppLayout.tsx` · **Nav config:** `frontend/src/config/nav.ts`

### Purpose
Not a page, but the frame every authenticated page renders inside: a role-filtered sidebar, a sticky header with the command-palette trigger, notification bell and data-source badge, plus the onboarding tour and animated page transitions.

### Modules in the shell

#### 11.1 `nav.ts` — the single source of navigation truth

| | |
|---|---|
| **What it is** | `NAV_SECTIONS` — four groups (Monitor, Intelligence, Operate, System) containing ten items, each with `to`, `label`, `icon`, optional `minRole`, and search `keywords`. Plus `navItemAllowed(item, role)`. |
| **Why we need it** | The sidebar and the ⌘K command palette must never disagree about what exists or who may see it. One array, two consumers. |
| **Input** | The current user's role. |
| **Processing** | `navItemAllowed` returns `true` when the item has no `minRole`, else compares `ROLE_LEVEL[role] >= ROLE_LEVEL[item.minRole]`. |
| **Output** | A filtered section list. |
| **Technologies** | TypeScript, lucide-react icon types. |
| **Why this approach** | The information architecture was consolidated from **14 pages to 10**. Doing that in one config file (rather than in JSX in two components) is what made the consolidation safe. |
| **Example** | A FIELD user's sidebar has no AI Lab, no Analytics, no Active Learning and no Admin — and neither does their command palette. |
| **Called by** | `AppLayout` and `CommandPalette`. |
| **Feeds into** | `RequireRole` mirrors the same `minRole` values on the routes themselves. |

#### 11.2 Sidebar

| | |
|---|---|
| **What it is** | A 256 px fixed sidebar on desktop; a slide-in drawer with a backdrop on mobile. Logo on top, grouped `NavLink`s in the middle, the signed-in user card and sign-out at the bottom. |
| **Why we need it** | Primary navigation, and it visibly communicates the user's role via `RoleBadge`. |
| **Input** | Filtered `NAV_SECTIONS`, current user. |
| **Processing** | `NavLink` supplies `isActive`, which drives the teal active pill. Mobile drawer animates with Framer Motion and closes on item click or backdrop click. |
| **Output** | Navigation DOM. |
| **Technologies** | React Router `NavLink`, Framer Motion `AnimatePresence`, Tailwind. |
| **Why this approach** | `NavLink` gives active-state matching for free (with `end` on the index route so `/app` does not stay highlighted on `/app/map`). |
| **Example** | ADMIN sees 10 items in 4 groups; FIELD sees 6. |
| **Called by** | `AppLayout`. |
| **Feeds into** | The router. |

#### 11.3 Command palette (⌘K)

| | |
|---|---|
| **What it is** | A keyboard-driven fuzzy search over every allowed page, opened with ⌘K/Ctrl-K or the header button. |
| **Why we need it** | A duty officer should reach any screen in two keystrokes without hunting a sidebar. |
| **Input** | The same `NAV_SECTIONS`, filtered by the same `navItemAllowed`, matched against `label` **and** `keywords`. |
| **Processing** | Listens for a custom `open-command-palette` window event (dispatched by the header button) and for the keyboard shortcut; filters as you type; Enter navigates. |
| **Output** | An overlay list; navigation on select. |
| **Technologies** | React, `window` CustomEvent, Framer Motion. |
| **Why this approach** | The `keywords` field means typing "drift", "aoi" or "confusion matrix" finds the right page even though none of those words is the page's title. Using a window event to open it avoids threading a callback prop through the layout. |
| **Example** | Type "drift" → Areas (keywords include *trajectory forecast drift 72h prediction landfall*). |
| **Called by** | `AppLayout` (always mounted). |
| **Feeds into** | The router. |

#### 11.4 Notification centre

| | |
|---|---|
| **What it is** | A header bell with an unread count and a dropdown listing recent alerts, each acknowledgeable inline. |
| **Why we need it** | Alerts used to only flash past as toasts. A duty officer needs a persistent inbox. |
| **Input** | `useAlerts()` → `GET /api/alerts`. |
| **Processing** | Counts unacknowledged alerts for the badge; `useAckAlert()` mutation acknowledges and invalidates the alerts + overview queries. |
| **Output** | Bell badge + panel; a link through to the full inbox on Command Center. |
| **Technologies** | TanStack Query, Framer Motion, click-outside via a `ref`. |
| **Why this approach** | Same query key as Command Center's inbox, so acknowledging in either place instantly updates both. |
| **Example** | New HIGH alert arrives over the WebSocket → the query is invalidated → the bell count increments. |
| **Called by** | `AppLayout` header. |
| **Feeds into** | `/app` alert inbox. |

#### 11.5 `useAlertNotifications` hook
Watches for new HIGH alerts and raises a toast plus (with permission) a browser notification, so an officer with the tab in the background still gets told.

#### 11.6 `DataBadge`

| | |
|---|---|
| **What it is** | A header chip reading **Live satellite**, **Demo data**, or **Offline · mock**. |
| **Why we need it** | The provenance principle: the user must always know whether what they see is real. |
| **Input** | `useSatelliteStatus()` and `api.source()`. |
| **Processing** | `offline` if the API client is in mock mode; `live` if the provider reports live; otherwise demo. |
| **Output** | A coloured chip with a tooltip carrying the provider message. |
| **Technologies** | TanStack Query; the backend stamps every response with an `X-Data-Source` header that `api.source()` reads. |
| **Why this approach** | Deriving it from a response header means the badge reflects what the server actually served, not what the client hoped for. |
| **Example** | Stop Postgres → within 30 s `dataMode.ts` flips to mock → the badge turns amber. |
| **Called by** | `AppLayout` header. |
| **Feeds into** | User trust; also mirrored per-stage by the Command Center provenance strip. |

#### 11.7 Onboarding tour
A five-step, centred walkthrough shown once (`localStorage` key `mpt-tour-v1`): welcome → Map Explorer → Pipeline → Command Center → Reports. Deliberately **not** an element-anchored spotlight, so it cannot break when the layout changes and needs no third-party dependency.

#### 11.8 `PageTransition` + `RequireRole`
`PageTransition.tsx` wraps the `<Outlet/>` in an `AnimatePresence` keyed by pathname, giving every route change a consistent fade/slide from the shared `lib/motion.ts` system. `RequireRole.tsx` is a route-level guard: it compares `ROLE_LEVEL` and renders a refusal (or redirects) if the user is under the bar — the third and final place role gating is applied on the client.

### Viva questions — Page 11

**Q1. How is role-based access enforced in the UI?**
In three places, all reading the same `minRole` values: the sidebar filter, the command-palette filter, and `RequireRole` on the route itself. So hiding a link is not the security mechanism — typing the URL still hits `RequireRole`. And the **server** enforces it a fourth time, independently.

**Q2. Why three client-side checks instead of one?**
They serve different purposes: the sidebar is discovery, the palette is search, and `RequireRole` is the actual client gate. Without the third, `/app/admin` typed into the address bar would render.

**Q3. If the UI already hides it, why does the server check too?**
Because client checks are cosmetic — anyone can edit JavaScript. The server is the security boundary; the UI simply avoids showing people doors they cannot open.

**Q4. What is the ⌘K palette and how does it find pages?**
It filters the same `NAV_SECTIONS` array by label *and* by a `keywords` string on each item, so searching "confusion matrix" finds AI Lab and "landfall" finds Areas. It is opened by a keyboard shortcut or by a window CustomEvent dispatched from the header button.

**Q5. Why did you consolidate 14 pages into 10?**
Overlap. Dashboard, Live Ops and Alerts were three views of one duty-officer job → Command Center. Detections and Hotspots were one dataset at two zoom levels → Records. Model Health and Similarity & Fusion were one model story → AI Lab. Analytics and Reports were analyse-then-export → one page. The old routes still exist as permanent redirects so no bookmark 404s.

**Q6. How do the retired routes behave?**
`/app/ops`, `/app/alerts`, `/app/detections`, `/app/hotspots`, `/app/model`, `/app/intelligence` and `/app/reports` are `<Navigate replace>` redirects to their new homes.

**Q7. What does the DataBadge actually read?**
The backend sets an `X-Data-Source` header on every response (live DB vs bundled demo), and `dataMode.ts` polls health every 30 s and self-heals mock → db. The badge reflects the served reality.

**Q8. Why is the onboarding tour not anchored to elements?**
Anchored spotlights break whenever the layout changes and usually need a library. A centred step-through works on every viewport, has no dependency, and cannot point at an element that has moved.

**Q9. What is `AnimatePresence` doing in `PageTransition`?**
It keeps the outgoing route mounted long enough to play its exit animation before the incoming route mounts, keyed by pathname.

**Q10. How does the mobile experience work?**
Below `lg`, the sidebar becomes a drawer opened by a hamburger, with an animated backdrop; it closes on navigation or backdrop click. All grids collapse via Tailwind breakpoints.

**Q11. Where does the browser notification come from?**
`useAlertNotifications` — on a new HIGH alert it fires a toast and, if the user granted permission, a native browser notification, so a backgrounded tab still surfaces the alert.

**Q12. Is the shell re-rendered on every navigation?**
No. `AppLayout` is a parent route element, so the sidebar, header, palette and tour stay mounted; only the `<Outlet/>` content swaps. That is why the WebSocket and polling queries survive navigation.

### Technical terms in simple language
- **Layout route** — A parent route that renders shared chrome and an `<Outlet/>` hole for child pages.
- **Outlet** — The slot where the current child page renders.
- **RBAC** — Role-Based Access Control: what you can do depends on your role.
- **Command palette** — The ⌘K search-everything box.
- **CustomEvent** — A browser event you invent and dispatch yourself.
- **Query invalidation** — Telling the cache "this data changed, refetch it".

### Explain the shell in under 1 minute
"Everything inside `/app` renders in one shell. The sidebar, the ⌘K command palette and the route guards all read a single navigation config file, so what you can see, what you can search and what you can open can never disagree — and the server enforces the same rules again independently. The header carries a command-palette trigger, a notification bell with an unread alert count, and a data-source badge that reads a header the backend stamps on every response, so you always know whether you are looking at live or demo data. First-time users get a five-step tour, and every route change animates through one shared motion system."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"Hiding menu items is not security."* | Agreed, and we never rely on it. There are three client checks and one server check. The client checks exist so users are not shown doors they cannot open; the Express middleware is the actual boundary and returns 403 regardless of what the browser does. |
| *"A command palette is over-engineering for 10 pages."* | It costs ~170 lines and shares the navigation config, so there is nothing to keep in sync. For the target user — a duty officer under time pressure — two keystrokes to any screen is a real usability win. |
| *"Consolidating pages just hides functionality."* | Nothing was removed. Detections and Hotspots are both still fully present inside Records as a Raw ↔ Clustered toggle; Model Health and Similarity are both inside AI Lab as tabs. The old URLs permanently redirect. |

---
---

# PART D — APPLICATION PAGES

---

## Page 12 — Command Center (`/app`)

**File:** `frontend/src/pages/CommandCenter.tsx` · **Min role:** FIELD

### Purpose
The duty officer's home screen. It fuses everything that used to be three separate pages — Dashboard, Live Ops and Alerts — into one situation view: a live 0–100 threat gauge, per-stage data provenance, KPI tiles, an actionable alert inbox, coast-bound hotspots ranked by landfall ETA, a live WebSocket event feed, the verification queue, and the "run all regions" trigger.

### Modules on this page

#### 12.1 Situation Gauge — the signature widget

| | |
|---|---|
| **What it is** | A semicircular SVG risk meter with a graduated green→amber→red arc, a spring-driven needle, a count-up 0–100 score, a CALM/ELEVATED/CRITICAL badge, a pulsing halo when critical, and a click-to-expand contributor breakdown. |
| **Why we need it** | A duty officer needs one number that answers "how bad is it right now?" before reading any table. |
| **Input** | All unacknowledged alerts (`useAlerts({acked:false})`) and all active hotspots (`useHotspots({active:true})`). |
| **Processing** | `raw = openHigh×26 + imminent×22 + openMed×8 + soon×6`, clamped to 0–100, where *imminent* = hotspots with landfall ETA ≤ 24 h and *soon* = ETA 24–72 h. Thresholds: ≥67 CRITICAL, ≥34 ELEVATED, else CALM. |
| **Output** | The score, the level, and a breakdown list showing each contributor's count and weight. |
| **Technologies** | Hand-written SVG arc maths (`strokeDasharray`/`strokeDashoffset` on a semicircle of radius 92), Framer Motion springs, a local `useCountUp` hook with `requestAnimationFrame` and exponential easing, `useReducedMotion` for accessibility. |
| **Why this approach** | A **transparent weighted sum**, not a model. Anyone can click "What drives this?" and see exactly why the number is what it is. A learned risk score would be unexplainable and untrainable — we have no labelled "situation severity" data. Drawing the arc by hand avoids a charting dependency for one bespoke shape. |
| **Example** | 2 open HIGH alerts + 1 imminent hotspot → 2×26 + 1×22 = 74 → **CRITICAL**, with a red pulse halo. |
| **Called by** | `CommandCenter.tsx` hero. |
| **Feeds into** | The greeting line ("Multiple situations need attention right now") and the officer's next action. |

#### 12.2 Live vitals (3 clickable tiles)

| | |
|---|---|
| **What it is** | Open HIGH alerts · Reaches coast ≤ 24 h · Awaiting verify — each an animated count-up that is also a shortcut. |
| **Why we need it** | The three numbers that decide what an officer does next, each one click from the work. |
| **Input** | Derived from the same alert/hotspot queries plus `useDetections({status:'PENDING'})`. |
| **Processing** | Counting + `useCountUp`. The HIGH-alerts tile calls `focusInbox('HIGH')` (filters the inbox in place); the other two are `<Link>`s to Records. |
| **Output** | Three tiles. |
| **Technologies** | React, Framer Motion, React Router `Link`. |
| **Why this approach** | A metric you cannot act on is decoration. Making each tile the entry point to its own queue is what turns a dashboard into a console. |
| **Example** | Click "Open HIGH alerts: 2" → the inbox below filters to open HIGH alerts without leaving the page. |
| **Called by** | The hero. |
| **Feeds into** | The alert inbox / Records. |

#### 12.3 Provenance strip

| | |
|---|---|
| **What it is** | Five live chips: **Satellite** · **Detector** · **Clay tier-2** · **Drift** · **Scanning**, each green (real) or amber (fallback), each with an explanatory tooltip. |
| **Why we need it** | This is the project's transparency thesis rendered as UI. At a glance you know which parts of the pipeline are currently running for real. |
| **Input** | `useCapabilities()` → the engine's self-describing `GET /capabilities`, plus scheduler state from `usePipelineStatus()`. |
| **Processing** | Reads `config.realIngest`, `config.modelLoaded`, `config.clayLive`, `config.griddedForcing` and `scheduler.enabled`, and renders each with a real/fallback value string. |
| **Output** | Five chips, e.g. *"Satellite · Sentinel-2 · CDSE"* (green) or *"Detector · heuristic (un-benchmarked)"* (amber). |
| **Technologies** | TanStack Query with `retry:false` (the endpoint 503s when the engine is down), FastAPI self-description. |
| **Why this approach** | **Nothing is hardcoded.** The engine reports its own capabilities, so the strip cannot lie about the engine. This exists because of a real bug class: Clay was silently off for every scan for weeks with no indicator. Our rule now is *"a component that is present but silently off is a bug — surface it, auto-start it, self-heal it."* |
| **Example** | Kill the Clay sidecar → within one poll the chip turns amber and reads "offline · MLP-only". |
| **Called by** | `CommandCenter.tsx`. |
| **Feeds into** | User trust; the same facts appear per-stage in the pipeline stage log. |

#### 12.4 KPI row
Four `StatCard`s from `useOverview()` — total detections, confirmed plastic, active hotspots (with a high-severity trend badge), regions monitored.

#### 12.5 Alert inbox (folds in the old Alerts page)

| | |
|---|---|
| **What it is** | A filterable list — status (open / all / acked) and severity (All / High / Medium / Low) — with in-place acknowledge and a hover-revealed "dispatch" shortcut. |
| **Why we need it** | Acknowledging an alert is the officer's most frequent action; it should not require a page change. |
| **Input** | `useAlerts({severity, acked})`. |
| **Processing** | Server-side filtering by query params; **Focus mode** additionally narrows client-side to unacknowledged HIGH/MEDIUM only. `useAckAlert()` mutates `PATCH /api/alerts/:id/ack` and invalidates alerts + overview. |
| **Output** | Animated rows (`layout` + `AnimatePresence`, so an acknowledged row collapses smoothly). |
| **Technologies** | TanStack Query mutation, Framer Motion layout animation. |
| **Why this approach** | Alerts were a whole page that existed only to list and acknowledge — merging it here removed a navigation hop from the most common task. The dispatch link on hover is the one-hop bridge from *alert* to *field response*. |
| **Example** | Filter to open HIGH → click the tick on "Hotspot MUM-3 approaching coast" → the row fades out and the gauge drops by 26. |
| **Called by** | `CommandCenter.tsx`. |
| **Feeds into** | Field Operations (`/app/operations`) and the situation gauge. |

#### 12.6 Priority hotspots

| | |
|---|---|
| **What it is** | Active hotspots sorted by **soonest landfall ETA first**, with a pulsing red marker for anything under 24 h. |
| **Why we need it** | Triage order for a responder is *time to coast*, not size. |
| **Input** | `useHotspots({active:true})`. |
| **Processing** | `useMemo` sort: hotspots with an ETA first (ascending); `etaHours == null` (open ocean) sinks to the bottom and ties break on detection count. |
| **Output** | Up to 9 rows, each linking to the hotspot detail page. |
| **Technologies** | React `useMemo`, React Router. |
| **Why this approach** | Sorting by severity would put a huge mid-ocean patch above a small one about to beach. ETA is the operational priority. |
| **Example** | "MUM-2 · HIGH · reaches coast in ~11 h" pulses red at the top. |
| **Called by** | `CommandCenter.tsx`. |
| **Feeds into** | Hotspot Detail; Records. |

#### 12.7 Live event feed (WebSocket)

| | |
|---|---|
| **What it is** | A rolling list of `run` / `alert` / `job` / `schedule` events with timestamps, headed by a green pulsing dot when connected. |
| **Why we need it** | Proof, on screen, that the system is event-driven rather than only poll-driven. |
| **Input** | `useLiveFeed()` — a native WebSocket to `/ws/live`. |
| **Processing** | Keeps a capped rolling buffer of 50 events, reconnects with exponential backoff from a 2 s base, and **invalidates the affected TanStack queries** on `run` and `alert` events so dashboards update the moment a run persists. |
| **Output** | Event rows + a connection badge. |
| **Technologies** | Native `WebSocket` (no socket.io), TanStack Query invalidation. |
| **Why this approach** | Push improves **latency, never correctness** — polling stays as the fallback, so a dropped socket loses immediacy but never data. That is why the header badge reads "reconnecting · checking on a timer" instead of showing an error. Native WebSocket avoids a client library for a one-way broadcast. |
| **Example** | Press "Run all regions" → within seconds a `job` event, then a `run` event per region with detection/hotspot/alert counts. |
| **Called by** | `CommandCenter.tsx`. |
| **Feeds into** | Query invalidation → every KPI and list on the page. |

#### 12.8 "Run all regions" trigger

| | |
|---|---|
| **What it is** | The primary button. Disabled when the engine is offline. |
| **Why we need it** | One action to sweep every monitored region. |
| **Input** | Click. |
| **Processing** | `api.scheduledRun()` → `POST /api/pipeline/scheduled-run`. If Redis/BullMQ is up the backend **enqueues** and returns 202 immediately (`mode: 'queued'`); if not, it runs directly. |
| **Output** | A toast stating which mode ran; the run then flows through persistence and the WebSocket. |
| **Technologies** | BullMQ + Redis, Express, react-hot-toast. |
| **Why this approach** | **The queue is an upgrade, never a requirement.** Redis is probed with a 30 s cached throwaway connection; if it is down, routes silently fall back to the direct path. The endpoint is guarded by `SCHEDULER_TOKEN` *or* a signed-in user, so an expensive satellite scan is never a default-open public trigger. |
| **Example** | Click → toast "All-region run enqueued" → five `run` events appear in the feed. |
| **Called by** | The hero. |
| **Feeds into** | The engine, `pipelinePersist.service.ts`, the WebSocket, and every list on the page. |

#### 12.9 Focus mode ("Needs me now")
A toggle that narrows both the inbox (unacknowledged HIGH/MEDIUM only) and the hotspot list (coast-bound only), so the screen shows only actionable items. Empty state: *"Nothing needs you right now — you're clear."*

#### 12.10 Verification queue + pipeline activity
Two side-by-side cards: the newest PENDING detections (each linking to its detail page, with confidence and FDI shown inline) and the last 16 `PipelineLog` rows with stage, detail, duration and relative time — colour-coded by COMPLETED / FAILED / running.

#### 12.11 Health chips + role-aware quick actions
Read-only chips for engine, queue (Redis), Clay GPU and satellite mode. **Starting or stopping services is deliberately not a UI action** — services are host-owned by `start-all.cmd` and the watchdog, because a dashboard click must not kill the engine mid-scan. Below them, a row of quick links that changes per role (ADMIN → Pipeline health / Analytics / AI Lab; COASTGUARD → Priority hotspots / Live AOI scan / Field Ops; FIELD → Map / Verification queue / Field Ops).

### Viva questions — Page 12

**Q1. How exactly is the situation score computed?**
`score = min(100, openHIGHalerts×26 + hotspotsWithETA≤24h×22 + openMEDIUMalerts×8 + hotspotsWithETA24–72h×6)`. Above 67 is CRITICAL, above 34 ELEVATED, else CALM.

**Q2. Where did those weights come from? Are they learned?**
They are hand-chosen and deliberately not learned. Two open HIGH alerts (52) or a HIGH plus an imminent hotspot (48) should visibly move the needle, while a couple of distant MEDIUMs should not. They are transparent — the user can expand "What drives this?" and see every contributor and its multiplier. We have no labelled ground truth for "situation severity", so a learned score would be unexplainable *and* untrainable.

**Q3. Why is that acceptable in a project judged on ML?**
Because the ML is in the pipeline, where we have labels and can measure. Using a model where there is no ground truth would be the worse engineering decision. Knowing where **not** to put a model is part of the argument.

**Q4. How does the page update in real time?**
Two mechanisms. A native WebSocket at `/ws/live` pushes run/alert/job events and invalidates the relevant TanStack queries so the UI refetches immediately. Independently, queries poll (pipeline status every 15 s, services every 8 s, operations every 20 s). Push improves latency; polling guarantees correctness if the socket drops.

**Q5. Why not socket.io?**
We only need one-way server→client broadcast. Native `WebSocket` is built into every browser, needs no client library, and our reconnect logic is about fifteen lines with exponential backoff.

**Q6. What is the provenance strip and why do you consider it important?**
Five live chips saying whether the satellite feed, detector, Clay verifier, drift forcing and scheduler are real or degraded right now, driven by the engine's own `/capabilities` endpoint. It exists because Clay was once silently off for every scan with no indicator on screen. We treat "present but silently off" as a bug class, and this strip is the fix.

**Q7. Why are hotspots sorted by ETA rather than severity?**
Because dispatch is time-critical. A HIGH-severity patch 200 km offshore with no landfall is less urgent than a MEDIUM one beaching in 9 hours. Open-ocean hotspots (`etaHours == null`) sort last.

**Q8. Why can't I start or stop services from this dashboard?**
We removed that deliberately. Services are owned by the host (`start-all.cmd` plus a watchdog) and outlive any browser session; a dashboard click must never kill the engine mid-scan. The chips are read-only status.

**Q9. How does the health chip know a service is really up?**
It HTTP-probes `/health` for the engine and Clay, and TCP-probes Postgres and Redis. We moved from a bare TCP connect to an HTTP probe because a bound-but-hung port reported "up" while real scans failed with "engine unreachable".

**Q10. What does "Run all regions" actually do?**
Calls `POST /api/pipeline/scheduled-run`. If Redis is up, the backend enqueues a BullMQ sweep job that fans out one job per region and returns 202 immediately; otherwise it runs the engine directly in-request. Each region's run is persisted and broadcast.

**Q11. What is Focus mode for?**
It answers "what needs me now" by filtering the inbox to unacknowledged HIGH/MEDIUM and the hotspot list to coast-bound only. It is a client-side filter over already-fetched data, so it is instant.

**Q12. Three separate pages became this one. What was gained?**
Fewer navigation hops on the highest-frequency task. Acknowledging an alert and checking system health used to be two page loads apart; now they are on one screen with a single fused priority number on top.

**Q13. What is the `useCountUp` hook?**
A local `requestAnimationFrame` animation with exponential easing (`1 - 2^(-10p)`) that counts a number from 0 to its target, and it respects `useReducedMotion` — if the OS asks for reduced motion, it snaps to the value instantly.

**Q14. What happens to this page if the engine is down but the backend is up?**
The provenance strip shows "engine unreachable — provenance unknown", the Run button disables, the health chip turns amber, but all database-backed content (KPIs, alerts, hotspots, logs) still renders. Degradation is partial and labelled, never a blank page.

### Technical terms in simple language
- **WebSocket** — A permanently open two-way pipe between browser and server for instant push.
- **Polling** — Asking the server for fresh data on a timer.
- **Query invalidation** — Marking cached data stale so it refetches.
- **BullMQ** — A Redis-backed job queue: work is put on a list and a worker picks it up later.
- **202 Accepted** — "I've taken your request and will do it; I'm not waiting."
- **Exponential backoff** — Retry after 2 s, then 4 s, then 8 s… so a dead server is not hammered.
- **ETA (landfall)** — Estimated hours until the drifting plastic reaches the coast.
- **Provenance** — Where a piece of data came from and whether it is real.

### Explain this page in under 1 minute
"Command Center is the duty officer's home. Top-left is a semicircular gauge showing one fused zero-to-hundred situation score — a transparent weighted sum of open HIGH alerts, hotspots reaching the coast within 24 hours, open MEDIUMs, and hotspots within 72 hours — and you can expand it to see exactly which term contributed what. Next to it, three clickable vitals and a 'Run all regions' button that enqueues a sweep through BullMQ. Under that, a provenance strip driven by the engine's own capabilities endpoint that tells you, right now, whether the satellite feed, detector, Clay verifier, drift forcing and scheduler are real or degraded. Then KPIs, an alert inbox you can acknowledge in place, coast-bound hotspots sorted by soonest landfall, a live WebSocket event feed, the verification queue and recent pipeline stages. It merges three older pages into the one screen an officer actually works from."

### Explain this page in detail
Cover, in order: the gauge maths and why the weights are hand-set and transparent; the vitals as shortcuts; the provenance strip and the "silently off is a bug" rule that produced it; the KPI row from `/api/stats/overview`; the inbox with server-side filters, in-place acknowledge and the Focus-mode client filter; the ETA-ordered hotspot list; the WebSocket feed with capped buffer, backoff and query invalidation, and the push-improves-latency-not-correctness principle; the run trigger with its queue-optional design and `SCHEDULER_TOKEN` guard; the read-only health chips and why service lifecycle is host-owned; and the role-aware quick-action row.

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"The situation score is arbitrary."* | The weights are hand-chosen, and we surface that rather than hide it — one click shows every contributor and its multiplier. There is no labelled ground truth for "situation severity", so a learned score would be both untrainable and unexplainable. For a decision aid an officer must trust, an auditable weighted sum is the correct engineering choice. |
| *"Too much on one screen."* | That is why Focus mode exists — one toggle reduces it to only unacknowledged HIGH/MEDIUM alerts and coast-bound hotspots. The dense view is the situational overview; the focused view is the worklist. |
| *"WebSockets are unnecessary — just poll."* | Polling is still there and is the correctness guarantee. The socket only improves latency, which matters when an alert says a patch beaches in nine hours. The design principle is explicit: push improves immediacy, never correctness. |
| *"Your health check could be lying."* | It was, and we fixed it. A bare TCP connect reported a hung-but-bound port as "up" while scans failed. It now HTTP-probes `/health`, and the Clay probe uses a negative-only 30 s cache — a ping to a live sidecar costs ~1 ms, but a ping to a dead loopback port whose SYN is dropped costs a full 1 s timeout. That change took the endpoint from 1035 ms to 3.6 ms. |

---

## Page 13 — Map Explorer (`/app/map`)

**File:** `frontend/src/pages/MapExplorer.tsx` (1,183 lines) · **Min role:** FIELD

### Purpose
The flagship interactive page. Drag a rectangle over any stretch of ocean and the **entire 7-stage pipeline runs live for that exact box** — real Sentinel-2 pixels, FDI, MLP classification, DBSCAN clustering, Clay verification and a drift forecast — with the stages lighting up as they complete, results plotted on a real satellite basemap, and every claim labelled with its provenance.

### Modules on this page

#### 13.1 `AoiSelector` — draw the area of interest

| | |
|---|---|
| **What it is** | A Leaflet event component that turns a mouse drag into a bounding box. |
| **Why we need it** | The AOI is the input to the whole pipeline. |
| **Input** | `mousedown` / `mousemove` / `mouseup` on the map while drawing mode is active. |
| **Processing** | Disables map dragging on mousedown, tracks a live preview rectangle, and on mouseup normalises the corners into `{north, south, east, west}` using min/max so a drag in any direction is valid. Drags smaller than `MIN_DEG = 0.01°` are discarded as accidental. |
| **Output** | An `AoiBBox` handed to `onComplete`. |
| **Technologies** | `react-leaflet` `useMapEvents`, Leaflet `Rectangle`. |
| **Why this approach** | Native Leaflet events rather than `leaflet-draw`: one less dependency, and full control over the micro-drag guard and the crosshair cursor state. |
| **Example** | Drag from (13.3, 80.1) to (12.9, 80.5) → `{north: 13.3, south: 12.9, east: 80.5, west: 80.1}`. |
| **Called by** | `MapExplorer` when "Draw area" is toggled on. |
| **Feeds into** | `setBbox()` → `useAoiAnalysis` → `POST /api/pipeline/run`. |

#### 13.2 `useAoiAnalysis` — the scan itself

| | |
|---|---|
| **What it is** | The TanStack Query hook that runs the pipeline for the current box. |
| **Why we need it** | It is the single call that produces every result on the page. |
| **Input** | `bbox`, `live` flag, `runOpts` (`minConfidence`, `dedupe`, `biofouling`), and an optional restored snapshot. |
| **Processing** | Query key = box coordinates **plus** the three run options, so changing any option is a genuinely different scan. `enabled` only when a box exists; `refetchInterval: 30_000` when live mode is on; `retry: 1` only. Calls `api.analyzeAoi()` → `POST /api/pipeline/run`. |
| **Output** | `{ result, engine }` where `result` carries stages, detections, hotspots, trajectories, stats, scene. |
| **Technologies** | TanStack Query v5, Axios. |
| **Why this approach** | **`retry: 1` deliberately.** A real scan takes tens of seconds; three silent retries made a failure look like "nothing happened" for four minutes. One retry, then surface the error loudly. Similarly `staleTime`/`gcTime` are **0** for a fresh box so every new selection genuinely re-runs the pipeline instead of serving a cached lie. |
| **Example** | New box → 20–60 s scan → 137 detections, 3 hotspots, 1 trajectory. |
| **Called by** | `MapExplorer`. |
| **Feeds into** | Every panel on the page, and `mapStore` persistence. |

#### 13.3 Session restore with provenance (`mapStore`)

| | |
|---|---|
| **What it is** | A Zustand + localStorage store remembering the last box, run options, live flag, the full result snapshot, **and the `snapshotKey` that snapshot was computed for**. |
| **Why we need it** | The AOI query is zero-cache by design, so leaving the page would otherwise discard the box and its results and force a wasteful CDSE re-scan. |
| **Input** | `setSelection(bbox, runOpts, live)` and `setSnapshot(snapshot, key)`. |
| **Processing** | On mount, the page computes `currentKey = scanKey(bbox, runOpts)` and only seeds the query when `mapStore.snapshotKey === currentKey`. Persist is at **version 2** with a migration that **drops key-less v1 rows** (fails closed). |
| **Output** | Either an instantly-restored result carrying a **"restored — not re-scanned"** badge, or nothing (so the box scans fresh). |
| **Technologies** | Zustand `persist` with `version` + `migrate`, regression tests in `stores/mapStore.test.ts`. |
| **Why this approach** | This fixes a real credibility bug. The guard originally compared against `mapStore.bbox`, but the persist effect rewrote that to the *new* box the moment you selected one — long before the new result arrived. So the comparison always matched, and **a fresh AOI was seeded with the previous area's detections**, with `staleTime` then suppressing the refetch. Predictions appeared before the scan ran. The rule we now enforce: *any cache or snapshot restored into a UI must store the key it was computed for — never re-derive that key from mutable current state.* |
| **Example** | Scan Chennai → go to Records → come back → results appear instantly with a "restored — not re-scanned" badge. Draw a new box → no restore, full scan. |
| **Called by** | `MapExplorer` effects. |
| **Feeds into** | `useAoiAnalysis`'s `initialData`, and the honesty badge in the result panel. |

#### 13.4 `StageTimeline` — the 7 stages

| | |
|---|---|
| **What it is** | Seven tiles — Scan scene, FDI index, **Classify (MLP)**, Cluster, **Clay verify**, Drift, Alerts — each showing a spinner while pending, a green tick when done, its genuine duration and its detail string. |
| **Why we need it** | It makes the pipeline visible instead of a black box, and every timing is real work, not an animation. |
| **Input** | `result.stages` (a `StageLog[]` from the engine) plus the `isFetching` flag. |
| **Processing** | Builds a map from stage code to log, then renders `STAGE_ORDER` so missing stages still show as pending/awaiting. |
| **Output** | A 7-tile grid. |
| **Technologies** | React `useMemo`, Framer Motion. |
| **Why this approach** | The `CNN` code is kept for API/DB enum compatibility but the **label was corrected to "Classify (MLP)"**, because the shipped model is a per-pixel MLP ensemble, not a CNN. Renaming the UI while keeping the wire code is the honest, non-breaking fix. |
| **Example** | `DOWNLOAD · 18.4s`, `FDI · 210ms`, `CNN · 96ms`, `DBSCAN · 12ms`, `CLAY · 340ms`, `DRIFT · 1.2s`, `ALERT · 3ms`. |
| **Called by** | `MapExplorer` below the map. |
| **Feeds into** | User understanding; the same stage logs persist into `PipelineLog`. |

#### 13.5 `SurfaceReadout` — "what am I actually scanning?"

| | |
|---|---|
| **What it is** | A card reading `Scanning: Open water / Land / Cloud-covered / Mixed / No clear observation`, with a water/land/cloud/other percentage bar and a coverage figure. |
| **Why we need it** | FDI is only meaningful over water. Firing it over land produces guaranteed false positives, so the user must be told. |
| **Input** | `result.stats.surface` — from the engine's `satellite/cloud_masker.py` reading the Sentinel-2 **SCL** band. |
| **Processing** | Percentages are computed **over observed pixels only** (SCL 0/1 = nodata excluded), plus a separate `coveragePct` for how much of the box had a clear pass at all, plus a reliability grade. |
| **Output** | The label, the segmented bar, and — when the scene is not water-valid — a loud amber warning that the candidates below are **not real marine plastic**. |
| **Technologies** | Sentinel-2 SCL, numpy in the engine, React. |
| **Why this approach** | This fixes the **"LAND 0 %" bug**. A `leastCC` composite leaves nodata wherever no clear pass existed; computing shares over the *full* grid diluted every real category toward zero, so a half-land box reported "land 0 %". Computing over observed pixels only fixed it. We also made the **SCL composite cloud % authoritative over the STAC tile cloud %** — a tile can read 100 % cloud while the composite actually classified is ~9 %. |
| **Example** | A box over Chennai city reads "Scanning: Land — water 12 %, land 81 %, cloud 7 %" with the warning banner. |
| **Called by** | `MapExplorer`. |
| **Feeds into** | Marker suppression (§13.6) and the reliability banner in Areas. |

#### 13.6 Marker suppression on unusable scans

| | |
|---|---|
| **What it is** | When the scan is not water-valid, **map markers and the heatmap are suppressed entirely**. |
| **Why we need it** | A pure-land box used to paint ~160 fake "algae" dots over a city. That is a credibility disaster in a demo. |
| **Input** | `result.stats.surface.waterValid`. |
| **Processing** | `scanUsable = !surface || surface.waterValid`; when false, `visibleDetections` and `heatPoints` are both empty arrays. |
| **Output** | A clean map plus the explanatory banner. **Raw detections remain available in the data tabs and exports** — we suppress the *misleading visualisation*, not the data. |
| **Technologies** | React derived state. |
| **Why this approach** | Coastal "degraded" scans keep their markers because they contain real water; only land/cloud-dominated ("unusable") scans are suppressed. |
| **Example** | Draw over Mumbai city → banner explains, map stays clean; draw 30 km offshore → markers appear. |
| **Called by** | `MapExplorer` render. |
| **Feeds into** | The Areas detail map applies the identical rule. |

#### 13.7 Detection markers + class filter

| | |
|---|---|
| **What it is** | One `CircleMarker` per detection, radius `3 + confidence×4`, opacity `0.3 + confidence×0.55`, coloured by class, with a popup showing class, coordinates, confidence, FDI and footprint. |
| **Why we need it** | The primary result visualisation. |
| **Input** | `result.detections` filtered by the active class set. |
| **Processing** | Size and opacity encode confidence so a confident detection is visually louder. Four toggle chips (with per-class counts) filter which classes render. |
| **Output** | Coloured markers + popups. |
| **Technologies** | react-leaflet `CircleMarker`/`Popup`, `lib/classColors.ts`. |
| **Why this approach** | Colours come from **one shared module**. Algae was recoloured from `#10B981` (visually almost identical to plastic teal) to lime `#84CC16` because the collision made an algae-dominated scan read as plastic at a glance. Plastic keeps the salient brand teal `#0D9488`. |
| **Example** | Toggle off Algae and Water → only plastic and foam remain, and the heatmap refocuses too. |
| **Called by** | `MapExplorer` map. |
| **Feeds into** | The GeoJSON export and the heatmap. |

#### 13.8 Debris-intensity heatmap

| | |
|---|---|
| **What it is** | A toggleable canvas heat layer with a cyan→teal→amber→red→dark-red gradient. |
| **Why we need it** | Discrete dots cannot show *concentration*; overlapping detections should visibly ramp up. |
| **Input** | Filtered detections → `[lat, lon, weight]` triples. |
| **Processing** | `weight = max(0.15, base × (0.4 + 0.6 × confidence))` where `base = 1` for plastic and `0.5` otherwise, so plastic dominates the surface and even low-confidence hits register faintly. |
| **Output** | A `leaflet.heat` canvas layer, cleanly removed on unmount. |
| **Technologies** | `leaflet.heat` (augments `L` — typed by our own `types/leaflet.heat.d.ts`). |
| **Why this approach** | One canvas stays smooth with thousands of points where that many `CircleMarker` DOM/SVG elements would stutter. It respects the class filter, so toggling classes refocuses the heat surface too. |
| **Example** | 400 detections → dots look uniform; heatmap on → two clear red cores. |
| **Called by** | `HeatLayer` inside the map. |
| **Feeds into** | Visual triage. |

#### 13.9 Hotspot circles + drift overlays

| | |
|---|---|
| **What it is** | Severity-coloured circles (radius scales with member count) and, for every trajectory, a teal dashed **mean path** inside a translucent **uncertainty-cone polygon**. |
| **Why we need it** | The hotspot is the dispatch unit; the cone is the honest forecast. |
| **Input** | `result.hotspots`, `result.trajectories`. |
| **Processing** | The cone polygon is built by walking `cone[].{latMin,lonMin}` forward and `{latMax,lonMax}` backward to close the ring. Clicking a hotspot opens the Clay similar-sites drawer. The popup shows the **two-tier verdict**: CONFIRMED vs POSSIBLE plastic, with the MLP+Clay fusion tier and plastic-affinity percentage. |
| **Output** | Circles, polylines, polygons and popups. |
| **Technologies** | react-leaflet `CircleMarker`, `Polyline`, `Polygon`. |
| **Why this approach** | Drawing the cone as a closed polygon rather than two lines makes the uncertainty *area* immediately legible. AOI runs pass `clamp=False` to the engine, because the AOI's "coast" is the drawn box's eastern edge, not a real coastline — clamping there would make trajectory length depend on where the user dragged the box. |
| **Example** | Click a HIGH hotspot → popup: "MUM-1 · HIGH · 14 detections · 81 % conf · CONFIRMED plastic · MLP + Clay High · plastic-affinity 78 % · Coast ETA 15 h". |
| **Called by** | The map. |
| **Feeds into** | `SimilarSitesDrawer`; GeoJSON export. |

#### 13.10 Advanced tools panel

| | |
|---|---|
| **What it is** | Run options (min-confidence slider, Dedupe toggle, Biofouling toggle) plus three tool buttons: **72 h forecast**, **Change vs 6 mo**, **Export FDI GeoTIFF**. |
| **Why we need it** | Surfaces the engine's optional post-processing and analysis endpoints to the analyst. |
| **Input** | Slider/toggle state; the current bbox; the top hotspot's centroid for the forecast. |
| **Processing** | Changing any run option changes the query key and re-scans. The forecast calls `POST /forecast/trajectory` (via the backend `engine` proxy); change detection calls `POST /compute/change`; export calls `POST /export/geotiff`. |
| **Output** | An emerald forecast summary card (landfall probability, earliest ETA, mean coast ETA) plus the green forward path and amber back-track drawn on the map; a change-trend card; a downloaded GeoTIFF. |
| **Technologies** | TanStack mutations, FastAPI routes, `tifffile` on the engine side. |
| **Why this approach** | **All detection post-processing is opt-in and default-off**, so the base result is never silently perturbed. Biofouling correction in particular is an explicitly-labelled heuristic — floating plastic accrues biofilm within days, raising NDVI and dampening FDI, which pushes weathered plastic toward "Algae"; the corrector nudges it back at reduced confidence. It is off by default so it can never contaminate held-out metrics. |
| **Example** | Enable Biofouling → re-scan → a few Algae detections become low-confidence Plastic, clearly at reduced confidence. |
| **Called by** | `MapExplorer`. |
| **Feeds into** | The map overlays and file downloads. |

#### 13.11 Save area

| | |
|---|---|
| **What it is** | A button (FIELD+) that names the AOI and persists the box, the run options and the **entire result payload** to `POST /api/areas`, then navigates to the Areas page. |
| **Why we need it** | A Map Explorer scan is throwaway by design; saving is how a selection becomes a durable, re-scannable, forecastable record. |
| **Input** | A prompt for the name, plus `bbox`, `runOpts`, nearest region code and `result`. |
| **Processing** | `nearestRegion()` finds the closest monitored region centre within ~2° by Euclidean distance and returns `null` beyond that — *better unlabelled than wrong*. |
| **Output** | A `SavedArea` row; redirect to `/app/areas`. |
| **Technologies** | TanStack mutation, Express + Prisma. |
| **Why this approach** | Storing the whole result JSON means the saved area is self-contained and comparable over time, and can serve as the release point for the drift forecast without re-scanning. |
| **Example** | Save "Chennai outer roads" → appears as a tile in Areas with a real satellite thumbnail. |
| **Called by** | `MapExplorer` header. |
| **Feeds into** | Page 14 (Areas) entirely. |

#### 13.12 Supporting pieces
**Live mode** re-scans every 30 s with a visible countdown. **Quick areas** are one-click AOIs derived from the five monitored region centres (±0.3°/±0.35°). **Scene panels** list recent Sentinel-2 scenes over the box from Earth Search STAC with cloud percentages, and can overlay the real scene thumbnail at its **true STAC footprint bounds** (never a guessed rectangle). **GeoJSON export** builds a `FeatureCollection` of detections (points), hotspots (points), drift paths (LineStrings) and the AOI (Polygon), ready for QGIS/ArcGIS. **`MapResize`** forces `invalidateSize()` on mount and on window resize, because Leaflet computes tile layout at init and inside a flex card the box is often measured afterwards, leaving grey half-rendered tiles. A **scanning overlay** sweeps a scan line across the AOI while `isFetching`. An **error card** appears if the scan fails, with a retry button and an honest note that a cold satellite fetch can take up to two minutes. A **zero-result card** explains that no candidates is itself a real result and quotes the surface composition.

### Viva questions — Page 13

**Q1. Walk me through what happens from drag to markers.**
`AoiSelector` converts the drag into a normalised bbox → `setBbox` → the TanStack query key changes → `POST /api/pipeline/run` with `{bbox, sceneSize, opts}` → the backend either enqueues via BullMQ or calls the engine directly with a 120 s timeout → the engine's `run_aoi()` executes DOWNLOAD (CDSE OAuth → Sentinel Hub Process API → `tifffile` → `SceneData` with its own SCL surface), FDI (vectorised + SCL keep-mask → ≤500 candidates), CNN (11-feature MLP ensemble → 4 classes + HIGH tier), DBSCAN (HIGH-confidence plastic only), CLAY (chips → sidecar `/embed` → k-NN affinity + novelty → CONFIRMED/POSSIBLE), DRIFT (forcing → RK4 windage ensemble → mean + cone + ETA), ALERT → the backend persists every row and broadcasts on the WebSocket → the frontend renders stages, markers, hotspots, cone and legend counts.

**Q2. Why is one scan limited to 500 candidate pixels?**
Cost control. Every candidate becomes a model inference, and a large box can produce hundreds of thousands. We sub-sample by **even striding**, not by taking the top-500, so the spatial distribution across the box is preserved rather than biased toward one corner.

**Q3. Why does a new area sometimes take a minute?**
Because the CDSE fetch is genuinely cold: OAuth token, a Process API call returning a float32 GeoTIFF with six channels, and for a medium AOI up to nine native-resolution tiles stitched together. We say so on screen rather than letting the user think it hung.

**Q4. Explain adaptive resolution and native-res tiling.**
The grid is sized to hit ~20 m/px. A small AOI is one native-resolution request; a medium AOI is native-resolution **tiling** — up to nine tiles fetched at target resolution and stitched; a huge region is one capped, coarser request rather than an explosion of tiles that would blow the CDSE Processing-Unit quota. This replaced a fixed 256×256 over any bbox (~640 m/px), which averaged small rafts away entirely.

**Q5. What was the "predictions before the scan" bug?**
The session-restore guard re-derived its comparison key from mutable current state, so a new box was effectively compared against itself, always matched, and seeded the query with the **previous** area's detections — then `staleTime` suppressed the refetch. The fix: snapshots carry a `snapshotKey` provenance field, persist bumped to v2 with a migration that drops key-less rows, and a genuinely restored scan shows a "restored — not re-scanned" badge. There are regression tests in `mapStore.test.ts`.

**Q6. Why suppress markers on a land scan instead of just warning?**
Because a warning plus 160 dots still *looks* like a debris field, and screenshots travel. FDI over land fires on vegetation and cloud shadow — those are known false positives, not weak detections. We suppress the misleading picture and keep the raw rows in the data tabs and exports.

**Q7. What is SCL and which classes do you keep?**
The Scene Classification Layer that ships with Sentinel-2 L2A. Our keep-mask defaults to `{6 = water, 7 = unclassified}` — floating debris often falls into *unclassified* at SCL's 20 m resolution. We **dropped class 2 (dark area)**: it is mostly terrain and cloud shadow and was the single largest land/haze false-positive leak. It is revertible with `INGEST_KEEP_SCL="2,6,7"`.

**Q8. Why is the stage still called CNN in the code?**
Legacy naming, kept for API and database-enum compatibility. The shipped model is a per-pixel MLP ensemble, so we corrected the **user-facing label** to "Classify (MLP)" while leaving the wire code alone. Renaming the enum would have been a breaking migration for no functional gain.

**Q9. What do the two marker tiers mean?**
HIGH-confidence plastic is `P(plastic) ≥ 0.648`, calibrated to about 90 % precision at 57 % recall; anything below is CANDIDATE — shown, but never dispatched against, and never clustered into a hotspot.

**Q10. Why is the heatmap a canvas layer?**
`leaflet.heat` draws all points on a single canvas. With hundreds or thousands of detections, that many individual SVG markers would stutter on pan/zoom. It also reveals concentration, which discrete dots cannot.

**Q11. What does `clamp=False` mean for AOI drift?**
The path-clamp feature halts a drawn drift path at the coast, because a beached parcel does not drift inland. But for an AOI the nearest "coast" is the eastern edge of the box the user dragged — clamping there would make trajectory length a function of where they dragged, which is meaningless. So AOI runs disable clamping; region runs, which have a real coast meridian, keep it.

**Q12. What is the back-track (amber line)?**
Reverse-time integration of the same physics — where did this parcel probably come from? It is deliberately **not** clamped at the coast, because reaching land going backwards means the parcel *was* there: a source, not a sink.

**Q13. Why `retry: 1` and not the default 3?**
Because a scan takes tens of seconds. Three silent retries meant a genuine failure took minutes to surface and looked like the app doing nothing. One retry, then a visible error card with a retry button.

**Q14. How does the scene preview avoid lying about position?**
It only renders when STAC supplies real footprint bounds (`scene.bbox` of length 4). If we do not have true bounds, we do not draw an overlay at all rather than guessing a rectangle.

**Q15. What is `invalidateSize()` for?**
Leaflet computes tile layout at initialisation. Inside a flex + rounded card the container is frequently measured *after* that, leaving grey or half-rendered tiles. `MapResize` calls `invalidateSize()` on the next animation frame, again after 300 ms, and on every window resize.

### Technical terms in simple language
- **AOI** — Area of Interest: the box you draw.
- **Bounding box** — Four numbers (north, south, east, west) defining a rectangle on Earth.
- **SCL** — The satellite's own per-pixel label: water, cloud, land, shadow, etc.
- **Nodata** — Pixels where no clear observation existed.
- **Composite (leastCC)** — Combining several passes and keeping the least-cloudy pixel at each location.
- **Heatmap** — A smooth colour surface showing where things concentrate.
- **Uncertainty cone** — The area the plastic could plausibly be in, given model spread.
- **Back-track** — Running the drift backwards to guess the source.
- **GeoJSON** — A standard JSON format for map features that QGIS/ArcGIS can open.
- **GeoTIFF** — An image file with geographic coordinates baked in.

### Explain this page in under 1 minute
"Map Explorer is where the project actually happens. You drag a rectangle over any ocean anywhere and the full seven-stage pipeline runs live for that exact box: it fetches real Sentinel-2 pixels from Copernicus, computes the Floating Debris Index, classifies each candidate with our MLP ensemble, clusters high-confidence plastic with DBSCAN, sends each hotspot's image chip to a Clay foundation model on the GPU for a second opinion, forecasts 72 hours of drift with an uncertainty cone, and raises alerts. Seven tiles below the map light up with genuine per-stage timings. Above all of it there's a surface readout from the satellite's own classification band telling you whether you're actually looking at water — and if you drew over land, we suppress the markers entirely rather than paint a fake debris field. You can save the area, export GeoJSON, or run change detection."

### Explain this page in detail
Add the mechanics: the query key includes the run options so any option change is a new scan; `retry:1` and zero cache for correctness; the `snapshotKey` provenance rule and the bug it fixed; the SCL keep-mask `{6,7}` and why class 2 was dropped; observed-pixel surface percentages and the LAND-0 % bug; two-tier confidence and why hotspots use HIGH only; the heat weighting formula; the cone polygon construction; `clamp=False` for AOI; the unclamped back-track; adaptive resolution and native-res tiling; and the four export paths (GeoJSON, GeoTIFF, save-area, and the persisted DB rows).

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"You're only classifying 500 pixels — that's not a real scan."* | It is a deliberate, documented sub-sample by even striding, so spatial coverage is preserved. FDI has already reduced millions of pixels to candidates; 500 is the inference budget per scan for a ₹0 system. It is a configurable ceiling, not an architectural limit. |
| *"You suppress markers — so you're hiding results."* | We suppress the *map visualisation* on a scan the system itself grades unusable, and we say why on screen. The raw detections are still in the data tabs and every export. Painting 160 "algae" dots over a city is the dishonest option, not the honest one. |
| *"Your drift line is fiction."* | The physics is real: CMEMS gridded hourly currents sampled **along the moving track**, fourth-order Runge–Kutta at a one-hour step, four windage members from 1.5 % to 3 %. What is *not* validated is the ETA against real drifter tracks — the popup on the map says exactly that, and the validation harness exists. |
| *"Everything is recomputed every time — that's wasteful."* | For a fresh box, yes, and that is the point: a cached result under a new box is a lie, and we shipped that bug once. Returning to an *identical* box with identical options does restore instantly from the snapshot — and it is badged "restored — not re-scanned" so nobody mistakes it for live. |
| *"Leaflet is a mapping toy."* | It is the standard open-source web mapping library, it needs no API key, and we use a free Esri World Imagery basemap. The engineering here is not the tile rendering — it is the AOI capture, the canvas heat layer, the cone polygon construction, and the true-footprint overlay guard. |

---

## Page 14 — Areas (`/app/areas`)

**File:** `frontend/src/pages/Areas.tsx` (1,855 lines — the largest page) · **Min role:** FIELD

### Purpose
Where a throwaway Map Explorer scan becomes a durable record. Saved AOIs are shown as a searchable gallery of real satellite thumbnails; opening one gives a full-screen operational dossier with a landfall-risk verdict, a drift map with every stored forecast, forecast history, scan detail, field-activity ledger and export tools. The headline capability is the **72-hour plastic trajectory forecast**, computed server-side and kept as **append-only history** so successive runs stay comparable.

### Modules on this page

#### 14.1 Triage toolbar + gallery

| | |
|---|---|
| **What it is** | Search box, region filter chips, and a sort selector (priority / most recent / most plastic / name) above a responsive tile grid. |
| **Why we need it** | Five areas or five hundred should look the same. |
| **Input** | `useAreas()` → `GET /api/areas`. |
| **Processing** | `useMemo` chain: text filter on name/region → region filter → sort. The default sort is `areaPriority()`, which weights plastic count up and factors hotspots and confidence. |
| **Output** | An ordered tile grid with a staggered entry animation. |
| **Technologies** | React `useMemo`, Framer Motion stagger. |
| **Why this approach** | Client-side filtering because the list is small and instant response matters more than pagination here. |
| **Example** | Type "chen" → only Chennai areas; sort by "most plastic" → the worst area first. |
| **Called by** | `Areas.tsx`. |
| **Feeds into** | `AreaTile` → the detail modal. |

#### 14.2 `AreaTile` + `satelliteThumbUrl` / `AreaMiniMap`

| | |
|---|---|
| **What it is** | A compact card with a **real satellite image of the AOI**, the name, region, plastic count and last-scan time. |
| **Why we need it** | Recognising an area visually is faster than reading coordinates. |
| **Input** | The area's bbox. |
| **Processing** | `satelliteThumbUrl(bbox, 440, 300)` builds an Esri World Imagery static-export URL for exactly that box. If the fetch fails (offline / Esri unreachable), `AreaMiniMap` renders a deterministic on-brand fallback using a seeded PRNG (`hashSeed` + `mulberry32`) so the same area always draws the same fallback. |
| **Output** | A tile. |
| **Technologies** | Esri static export, a hand-written seeded PRNG. |
| **Why this approach** | A seeded PRNG rather than `Math.random()` means the fallback is stable across renders — a fallback that flickered differently every re-render would look broken. |
| **Example** | Offline demo → tiles still show a consistent stylised map instead of broken images. |
| **Called by** | The gallery. |
| **Feeds into** | `openArea(id)` → the detail modal + `?area=<id>` deep link. |

#### 14.3 `ScanReliabilityBanner`

| | |
|---|---|
| **What it is** | An honesty gate at the top of the detail: grades the stored scan and, if it is cloud- or land-dominated, says so before any detection is read, with a re-scan button. |
| **Why we need it** | A stored scan can be months old and taken through cloud. Reading its detections without that context is misleading. |
| **Input** | `result.stats.surface` and `result.scene`. |
| **Processing** | Uses the engine's reliability grade (`reliable` / `degraded` / `unusable`). |
| **Output** | A banner; and when not water-valid, `scanUsable = false` suppresses the map markers exactly as in Map Explorer. |
| **Technologies** | React. |
| **Why this approach** | Same rule, same code path, same wording as Map Explorer — one honesty policy, applied everywhere. |
| **Example** | An 80 %-cloud stored scan shows an amber banner suggesting a re-scan. |
| **Called by** | `AreaDetail`. |
| **Feeds into** | Marker suppression and the user's decision to re-scan. |

#### 14.4 `VerdictRail` — the landfall-risk hero

| | |
|---|---|
| **What it is** | A large decision aid: landfall probability as a big animated percentage, a teal→amber→red `RiskMeter` with a spring-driven marker, ETA facts, a narrated caption, and the forcing-provenance badge. When no forecast exists, it becomes a call-to-action instead. |
| **Why we need it** | The officer's question is "will this reach my coast, and when?" — that should be the first thing on screen, not buried in a table. |
| **Input** | The latest stored `AreaForecast`. |
| **Processing** | A `useMotionValue` + `animate` count-up drives the percentage; `RiskMeter` positions its marker with a spring. |
| **Output** | The verdict hero. |
| **Technologies** | Framer Motion motion values, React. |
| **Why this approach** | One number, one sentence, one meter — a duty officer should get the answer without interpreting a chart. |
| **Example** | "68 % landfall probability · earliest ETA 19 h · mean coast ETA 27 h · real CMEMS currents". |
| **Called by** | `AreaDetail` hero. |
| **Feeds into** | The dispatch decision. |

#### 14.5 The forecast action (multi-horizon)

| | |
|---|---|
| **What it is** | A horizon selector (24 / 48 / 72 / 120 / 240 h) plus a primary "Run forecast" button in a sticky command bar. |
| **Why we need it** | Different decisions need different horizons — a same-day dispatch versus a week-ahead watch. |
| **Input** | Area id + chosen horizon. |
| **Processing** | `POST /api/areas/:id/forecast`. The **backend** chooses the release point: body coordinates → strongest plastic hotspot → highest-confidence plastic detection → else **HTTP 422**. It is **never** the AOI centroid. The engine then applies an elevation gate (`_is_marine()` via keyless Open-Meteo terrain elevation; > 10 m ⇒ landlocked ⇒ `{marine:false}` with no track), resolves forcing (gridded CMEMS → point Open-Meteo → synthetic), integrates RK4 windage members, aggregates mean + cone, computes ETA and landfall probability on the **raw** path *before* clamping, then clamps the aggregate and back-tracks. |
| **Output** | An `AreaForecast` row **appended** to history; the map redraws. |
| **Technologies** | Express + Prisma, FastAPI, CMEMS `copernicusmarine`, numpy. |
| **Why this approach** | Two guards exist because we shipped senseless drift once: a drift from an empty AOI centroid over an algae-only or inland area. Now **no plastic → no drift (422)** and **inland → no ocean drift**. And the backend stores **what the engine returned**, never a client-supplied path — otherwise a stored "prediction" would carry no more authority than whatever the browser POSTed. |
| **Example** | An algae-only area: the forecast button does not even render, because `areaHasPlasticToForecast()` is false. |
| **Called by** | `AreaDetail` command bar. |
| **Feeds into** | `ForecastPath` on the map, `ForecastRunsPanel`, `EnsembleAgreement`, GeoJSON export, the printable brief. |

#### 14.6 `areaHasPlasticToForecast()` — the display gate

| | |
|---|---|
| **What it is** | A pure predicate: does this area have a water-valid scan **and** at least one plastic detection? |
| **Why we need it** | Guarding *creation* was not enough — stale forecast rows from before the guard were still **rendering** on algae-only areas. |
| **Input** | The `SavedArea`. |
| **Processing** | Checks `surface.waterValid` and plastic presence. |
| **Output** | `boolean`. When false, `forecasts` is forced to `[]`, so **every** forecast surface disappears at once: map path, verdict hero, badge, history, ensemble card and export. |
| **Technologies** | Plain TypeScript. |
| **Why this approach** | A single gate feeding one gated list, rather than five separate conditionals that could drift apart. |
| **Example** | An old inland area with a stored forecast now shows no drift anywhere. |
| **Called by** | `AreaDetail`. |
| **Feeds into** | Every forecast-dependent component. |

#### 14.7 Drift map (`ForecastPath`, `MapLegend`)

| | |
|---|---|
| **What it is** | A 52vh satellite map showing the AOI rectangle, detections in **three visual tiers**, hotspots, and **every stored forecast** — the newest solid, older ones faded. |
| **Why we need it** | Comparing successive forecasts over the same water visually is what makes the model auditable. |
| **Input** | `area.result` + the gated `forecasts` array. |
| **Processing** | Detection tiers: HIGH-confidence plastic = bold, ringed, solid; CANDIDATE plastic = dashed and hollow; non-plastic = faint context. `ForecastPath` draws the cone polygon, the forward path and the back-track, with a **guard for legacy rows** whose cone still carries snake_case keys. |
| **Output** | The map + an honest legend that counts detections **per class**, so 108 algae never reads as plastic. |
| **Technologies** | react-leaflet, `lib/classColors.ts`. |
| **Why this approach** | Three tiers make dispatch-grade plastic instantly distinguishable from review-queue maybes at a glance. |
| **Example** | Three forecast runs over a week draw three paths, the newest bold — you can see whether the model is consistent. |
| **Called by** | `AreaDetail` hero. |
| **Feeds into** | The dispatch decision; the GeoJSON export. |

#### 14.8 The four tabs

| Tab | Contents |
|---|---|
| **Forecast runs** | `ForecastRunsPanel` (every stored run with its horizon, landfall probability, ETA and forcing source), `EnsembleAgreement` (spatial spread of every run's path-end — turns kept history into a measure of model agreement) and `CompareRunsChart` (a Recharts line comparison across runs). |
| **Scan & detections** | `ScanPanel` — stats, `SurfaceBar`, a `SpectralScatter` of detections in spectral space, the hotspot list with "find similar sites" and "dispatch crew" actions. |
| **Activity** | `ActivityPanel` — operations linked to this area (via `useOperations`), their statuses, and the **cleanup-impact ledger** (plastic collected, area cleared). |
| **Tools & export** | `ToolsPanel` — GeoJSON export, `ChangeTool` (recent-vs-older candidate density, real imagery only) and `GeotiffTool` (FDI / NDVI / FAI raster download). |

#### 14.9 Command-bar utilities
Sticky, full-bleed so the primary forecast action never scrolls away. Includes rename/notes editing, re-scan (re-runs the pipeline with the area's *saved* run options so successive scans stay comparable), delete with confirmation, a **shareable deep link** (`/app/areas?area=<id>` — the page reads `?area` on mount and opens straight into the detail), and `printAreaBrief()`, which opens a self-contained, print-ready one-page situational brief in a new window with all interpolated values passed through an explicit `htmlEscape()`.

#### 14.10 `DetailErrorBoundary`
A class component wrapping the detail modal. If any panel throws, the user gets a recoverable fallback with a retry and close rather than a blank modal over a working page.

### Viva questions — Page 14

**Q1. Why is the forecast computed server-side and not in the browser?**
Because the stored path must be the **engine's own output**. If the browser POSTed a path, the "prediction" in the database would carry no more authority than whatever the client chose to send. The backend calls the engine and stores what the engine returned.

**Q2. Why is forecast history append-only?**
So successive forecasts over the same water stay comparable. Overwriting gives you one number with no way to check whether the model is consistent; appending gives you an auditable series, which is what `EnsembleAgreement` and `CompareRunsChart` are built on.

**Q3. What is the release point for a drift forecast?**
Resolved in order: explicit body coordinates → the strongest plastic hotspot → the highest-confidence plastic detection → otherwise **422 Unprocessable Entity**. It is never the AOI centroid.

**Q4. Why did you add that rule?**
Because we shipped senseless drift. An algae-only or empty AOI still produced a confident-looking 72-hour trajectory from the box's centre. A drift model advects **plastic parcels** — with no plastic there is nothing to advect, so the honest answer is a 422, not a pretty line.

**Q5. What is the inland gate?**
The engine calls `_is_marine()` using keyless Open-Meteo terrain elevation. Above 10 m the point is a landlocked reservoir, so it returns `{marine: false, reason}` with no track. It is best-effort: an unknown lookup never blocks a forecast.

**Q6. Guarding creation wasn't enough — what else broke?**
Stale rows created *before* the guard were still rendering. So we added `areaHasPlasticToForecast()` as a **display** gate: when it is false the forecasts array is forced empty, and the map path, verdict hero, badge, history, ensemble card and export all go quiet together.

**Q7. What is path clamping and what is the subtlety?**
A beached parcel does not drift inland, so we halt the drawn path at the coast. The subtlety is that we clamp the **aggregated mean + cone**, never the individual ensemble members — ragged members would silently drop hours or throw an IndexError in `mean_and_cone`. And ETA and landfall probability are computed on the **raw** path *before* clamping, so both keep their values by construction. The payload carries self-describing `pathEndHours`, `pathEndReason`, `coastLon` and `coastModel: "meridian"`.

**Q8. What is landfall probability, exactly?**
The fraction of windage ensemble members that beach within the horizon, plus the earliest and latest member ETA. With four members it is quantised to 0/25/50/75/100 % — and we would say that openly if asked; more members would refine it at linear cost.

**Q9. What does the ensemble-agreement card tell you?**
It measures the spatial spread of every stored run's path-end. Tight clustering across independent runs means the forcing and integration are consistent for that water; a wide scatter is a warning that the forecast is unstable there. It is a self-check the kept history makes possible.

**Q10. Why store the whole scan payload in the area row?**
So the area is self-contained: it can be re-opened, re-drawn, exported and used as a forecast release point without re-scanning, and successive re-scans can be compared against it.

**Q11. What is the re-scan button doing differently from Map Explorer?**
It reuses the area's **saved run options**, so scan N+1 is directly comparable with scan N. Changing options mid-series would make the comparison meaningless.

**Q12. Why a full-screen modal instead of a route?**
Because the gallery stays the home view — an officer scanning ten areas should not lose their place. The modal is still deep-linkable via `?area=<id>`, so it behaves like a route where it matters.

**Q13. Why does the similar-sites drawer and the dispatch form live at the page root?**
Because the modal panel is transformed by Framer Motion, and a CSS transform creates a new containing block that traps `position: fixed` children. Lifting them to the page root is what lets them render above the modal.

**Q14. What does the printable brief do about injection?**
It builds raw HTML for a new window, so every interpolated value goes through an explicit `htmlEscape()` helper. It is the one place in the app where React's automatic escaping does not protect us, and we handled it explicitly.

**Q15. What is the three-tier detection rendering?**
HIGH-confidence plastic is bold, ringed and solid; CANDIDATE plastic is dashed and hollow; non-plastic is faint context. At a glance you can see which plastic is dispatch-grade — which is exactly the distinction the two-tier confidence system encodes.

### Technical terms in simple language
- **AOI centroid** — The geometric centre of the drawn box. Using it as a drift start is meaningless if there is no plastic there.
- **422 Unprocessable Entity** — "Your request was well-formed, but it doesn't make sense to do it."
- **Append-only history** — Every new forecast is added; nothing is overwritten.
- **Clamping** — Stopping a path at a boundary (here, the coast).
- **Ensemble spread** — How far apart several model runs end up. Tight = confident.
- **Deep link** — A URL that opens directly to a specific item.
- **Error boundary** — A React component that catches a crash in its children and shows a fallback.
- **Seeded PRNG** — A random-number generator that gives the same sequence for the same seed, so "random" output is reproducible.

### Explain this page in under 1 minute
"Areas is where a scan becomes a record. Every AOI you save from Map Explorer appears as a tile with a real satellite thumbnail; opening one gives a full-screen dossier. The hero is the landfall verdict — a big probability, a risk meter, the ETA and where the ocean-current data came from — beside a map showing detections in three confidence tiers, hotspots, and every drift forecast ever run for that area, newest solid, older faded. The forecast is computed by the engine server-side, never by the browser, and every run is appended to history rather than overwritten, so runs stay comparable and we can measure ensemble agreement. Two guards matter: no plastic means no forecast at all — the backend returns 422 rather than drift from the box centre — and an inland point is rejected by an elevation check. Four tabs hold forecast runs, scan detail, field activity with a cleanup ledger, and export tools."

### Explain this page in detail
Walk the release-point resolution chain and the two guards; then the engine side (elevation gate, forcing priority CMEMS → Open-Meteo → synthetic, RK4 with four windage members, mean + cone, ETA and landfall computed pre-clamp, clamp applied to the aggregate only, back-track unclamped); then persistence as an appended `AreaForecast` row; then the display gate and why it was needed separately from the creation guard; then the four tabs; then the utilities — deep link, printable brief with explicit escaping, re-scan with saved options, and the error boundary.

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"Landfall probability from four members is meaningless — it's just 0/25/50/75/100."* | Correct, and we would rather state that than dress it up. The four windage members span the physically-motivated 1.5–3 % range. Adding members is linear cost and refines the quantisation; it does not change the physics. What the number honestly conveys today is "none / some / most / all of the plausible windage scenarios beach within the horizon". |
| *"Your ETAs aren't validated."* | They are not validated against real drifter tracks, and we say so in the popup, the FAQ and our docs. The harness exists — `ml/validate_drift.py` with the Liu–Weisberg skill score — and what is missing is reference tracks, which is data access, not code. |
| *"Storing the whole result JSON in a row is bad database design."* | It is a deliberate document-in-a-column choice. The scan payload is read as a unit, never queried field-by-field, and the queryable facts (plastic count, area, region, last scan) are promoted to real columns. Normalising a nested stage/detection/trajectory payload would buy nothing and cost joins. |
| *"1,855 lines in one file."* | Fair. It is one cohesive feature — gallery, detail, forecast, tabs, tools — and the sub-components are cleanly separated inside it with clear boundaries. Splitting it into files is refactoring, not redesign, and we would prioritise it above cosmetic work. |
| *"You suppress stale forecasts but leave the rows."* | Yes — there is no delete-forecast route yet, and it is listed in our own known-gaps table. Display is fully gated, so nothing misleading renders; the row remaining is a housekeeping gap, not a correctness one. |

---

## Page 15 — Records (`/app/records`)

**File:** `frontend/src/pages/Records.tsx` · **Embeds:** `Detections.tsx`, `Hotspots.tsx` · **Min role:** FIELD

### Purpose
One catalogue of everything the model has found, viewable at two zoom levels: **Raw** (per-detection table) and **Clustered** (DBSCAN hotspot cards). The clustered view adds a signature interactive: a severity × landfall-ETA triage scatter.

### Modules on this page

#### 15.1 Granularity toggle (Raw ↔ Clustered)

| | |
|---|---|
| **What it is** | A two-option segmented control with a spring-animated sliding pill (`layoutId="records-toggle"`). |
| **Why we need it** | Detections and hotspots are *the same dataset at two granularities*, not two datasets. Two separate pages implied otherwise. |
| **Input** | Local `view` state. |
| **Processing** | Lazy-renders `<Detections embedded />` or `<Hotspots embedded />` inside an `AnimatePresence` transition. |
| **Output** | The chosen view. |
| **Technologies** | React `lazy`/`Suspense`, Framer Motion shared-layout animation. |
| **Why this approach** | The `embedded` prop suppresses each child's own `PageHeader` so there is one header, not two. Nothing was deleted in the 14→10 consolidation — both surfaces are fully present. |
| **Example** | Raw shows 1,284 rows; Clustered shows 7 cluster cards + the scatter. |
| **Called by** | `Records.tsx`. |
| **Feeds into** | Detection Detail / Hotspot Detail. |

#### 15.2 `SeverityEtaScatter` — the triage plot

| | |
|---|---|
| **What it is** | A hand-drawn SVG bubble chart: **x = hours to coast** (imminent on the left), **y = cluster size**, **colour = severity**, **radius ∝ size**, with the "imminent" ≤24 h corner tinted red and a separate right-hand lane for open-ocean clusters. |
| **Why we need it** | It answers "what should I deal with first?" in one glance — big *and* imminent is the top-left danger corner. |
| **Input** | `useHotspots({active:true})`. |
| **Processing** | ETA is clamped to a 72 h axis; `etaHours == null` or > 72 is parked in the "open" lane rather than dropped. Radius is `5 + (count/maxCount)×10`. Hover shows a tooltip card; the tooltip is itself a `<Link>` to the hotspot. |
| **Output** | An SVG scatter with gridlines at 0/12/24/48/72 h, axis titles, a severity legend, and click-through. |
| **Technologies** | Hand-written SVG + Framer Motion (`motion.circle` with staggered spring entry), React `useMemo`. |
| **Why this approach** | Two decision variables plus severity plus size is exactly four dimensions — a scatter is the correct form. We hand-rolled it rather than using Recharts because we needed a custom "open ocean" lane and a tinted danger region, and because Recharts is already lazy-loaded only on Analytics; adding it here would inflate this page's chunk. Parking open-ocean clusters in a lane rather than dropping them keeps the data complete. |
| **Example** | A big bubble at x≈9 h in the tinted corner is your first dispatch. |
| **Called by** | `Records.tsx` (clustered view only). |
| **Feeds into** | Hotspot Detail. |

#### 15.3 Detections table (`Detections.tsx`, embedded)

| | |
|---|---|
| **What it is** | A sortable, filterable table: region, class, location, confidence bar, FDI, area, status and detection date, plus "why?" and "open detail" actions per row. |
| **Why we need it** | The auditable record — every claim traceable to a row. |
| **Input** | `useDetections({region, status, classification, minConfidence, days, limit: 200})`. |
| **Processing** | Filters are query parameters, so filtering happens **server-side** in Prisma, not by shipping everything to the browser. The shared `Table` component handles sorting. |
| **Output** | A table + an "Export labeled set" button for COASTGUARD+. |
| **Technologies** | TanStack Query, a shared generic `Table` with `ColumnDef<T>`, Prisma. |
| **Why this approach** | The generic table is used on three pages; the `ColumnDef` pattern (key, header, accessor, sortable) keeps each page's column definitions declarative. |
| **Example** | Filter: region CHN, class Plastic, confidence ≥ 80 % → 23 rows. |
| **Called by** | `Records.tsx` raw view. |
| **Feeds into** | Detection Detail; the active-learning CSV export. |

#### 15.4 Hotspot cards (`Hotspots.tsx`, embedded)
Cluster cards with severity pill, region, three metrics (detections, confidence, time to coast) and a link to detail, plus a severity filter. `InfoTip` components explain "grouped into clusters (DBSCAN, eps 0.09°, min 3)" and "time to coast" inline.

#### 15.5 Summary band + granularity rail
Four `StatCard`s (total detections, confirmed plastic, active clusters, high-severity) and a small visual rail explaining that the two views are the same data grouped differently.

### Viva questions — Page 15

**Q1. Why merge Detections and Hotspots into one page?**
Because they are one dataset at two granularities. A hotspot *is* a group of detections. Two pages made users navigate between them to answer one question; a toggle keeps the mental model intact.

**Q2. Was any functionality lost?**
No. Both original pages render in full, just with their own headers suppressed via an `embedded` prop, and `/app/detections` and `/app/hotspots` permanently redirect here.

**Q3. Explain the scatter's axes and why you chose them.**
X is hours to coast — the operational deadline — with imminent on the left. Y is cluster size — the magnitude. Colour is severity and radius is size, reinforcing Y. The top-left is "big and imminent", which is exactly the dispatch priority, and it is tinted red so the eye goes there first.

**Q4. Why not use Recharts for the scatter?**
Two reasons. We needed a custom "open ocean" lane for clusters with no ETA and a tinted danger region, both of which fight a charting library's grammar. And Recharts is lazy-loaded only for Analytics; pulling it into Records would inflate this route's bundle for one chart.

**Q5. What happens to hotspots with no landfall ETA?**
They are parked in a dashed "open" lane at the right edge rather than dropped. Dropping them would silently hide real clusters; parking them keeps the dataset complete and visibly separates "no deadline" from "far deadline".

**Q6. Is filtering client-side or server-side?**
Server-side. The filters are query parameters that become Prisma `where` conditions, so we never ship 10,000 rows to filter three in the browser.

**Q7. How are detections and hotspots related in the database?**
`Detection` rows are per-pixel results; `Hotspot` rows are DBSCAN clusters with a centroid, a member count, a severity and an ETA. Hotspots are **recomputed and replaced on every run** — which is exactly why `Operation` references them by a soft string ID with a location snapshot rather than a cascading foreign key.

**Q8. What is the FDI column for?**
Traceability. Every detection carries the actual FDI value that made it a candidate, so an analyst can see how far above the 0.02 threshold it sat.

**Q9. What is the "Export labeled set" button?**
It downloads the human-checked detections — CONFIRMED plus FALSE_ALARM — as CSV. That file is the ground truth for the next training round, and it is the export half of the active-learning loop.

**Q10. Why does the toggle use `layoutId`?**
Framer Motion's shared-layout animation: the teal pill physically slides between the two options instead of disappearing and reappearing, which makes the state change legible.

**Q11. Why lazy-load the two child views?**
Only one is on screen at a time. Lazy-loading means the table code and the card-grid code are separate chunks, and a user who never switches never downloads the other.

**Q12. What is `ColumnDef<T>`?**
Our generic column descriptor — `{ key, header, accessor, sortable }` — where `accessor` is a function returning the cell's React node. It lets one `Table` component serve every table in the app with full type safety on the row type.

### Technical terms in simple language
- **Granularity** — How zoomed-in your view of the data is: individual pixels or grouped clusters.
- **DBSCAN** — A clustering algorithm that groups points that are densely packed together and labels lonely points as noise.
- **eps (epsilon)** — The neighbourhood radius: here 0.09 degrees, roughly 10 km.
- **min_samples** — The minimum number of nearby points needed to form a cluster: 3.
- **Scatter plot** — Each item is a dot positioned by two numbers.
- **Server-side filtering** — The database does the filtering, not the browser.

### Explain this page in under 1 minute
"Records is the single catalogue of model output, with one toggle between two zoom levels. Raw gives you a filterable, sortable table of every detection with its class, confidence, FDI value, area and validation status — filtered server-side in the database. Clustered gives you the DBSCAN hotspot cards plus our triage scatter: each bubble is a cluster, horizontal position is hours until it reaches the coast, height is cluster size, colour is severity, and the top-left corner — big and imminent — is tinted red because that is your first dispatch. Clusters with no coast ETA are parked in a separate open-ocean lane rather than dropped."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"A table with filters is not sophisticated."* | The table is the auditable record — every headline number on every dashboard resolves to rows here, with the FDI value and confidence that produced them. The engineering interest is the shared generic `Table` with typed `ColumnDef<T>` and the fully server-side filtering. |
| *"Your scatter reinvents a charting library."* | For this chart, yes, deliberately. We needed a non-numeric "open ocean" lane and a tinted decision region, and this page should not pull in Recharts for one plot. It is ~120 lines of SVG with real interaction. |
| *"eps = 0.09° isn't a distance — degrees vary with latitude."* | True, and worth stating. At our latitudes (roughly 9–19° N) 0.09° is about 10 km in latitude and about 9.5 km in longitude, so the distortion is a few percent and does not change cluster membership meaningfully. A proper haversine metric is the correct upgrade and is a drop-in change to the distance function in `dbscan_clusterer.py`. |

---

## Page 16 — Detection Detail (`/app/detections/:id`)

**File:** `frontend/src/pages/DetectionDetail.tsx` · **Min role:** FIELD

### Purpose
The "why was this classified this way?" page for a single detection: its spectral anomaly against the FDI threshold, the classification and confidence, its drift outlook, and the analyst validation control.

### Modules on this page

#### 16.1 Spectral-anomaly bar

| | |
|---|---|
| **What it is** | A horizontal bar showing this detection's FDI value on a 0–0.08 scale, with a red vertical line at the `THRESHOLD = 0.02` candidacy cut-off. |
| **Why we need it** | It turns "confidence 0.83" into a physical statement: *this pixel's near-infrared sat this far above the water baseline*. |
| **Input** | `d.fdiScore`. |
| **Processing** | Position = `fdi / 0.08`; the threshold marker sits at `0.02 / 0.08 = 25 %`. |
| **Output** | A visual bar. |
| **Technologies** | React + Tailwind, no chart library. |
| **Why this approach** | Explainability at the level a domain expert can check. A remote-sensing reviewer can look at the FDI value and immediately judge whether it is marginal or strong. |
| **Example** | FDI 0.031 sits just right of the threshold → a marginal candidate. |
| **Called by** | `DetectionDetail`. |
| **Feeds into** | The analyst's confirm/reject decision. |

#### 16.2 Classification card
Class, confidence, area footprint (**0.0001 km² for one 10 m pixel**) and status.

#### 16.3 Drift forecast card
72-hour outlook for this detection where available — direction, coast ETA, and forcing provenance.

#### 16.4 Analyst validation

| | |
|---|---|
| **What it is** | Confirm / False alarm / Reset controls, visible to COASTGUARD+ only. |
| **Why we need it** | This is where a human label enters the system — the input to active learning. |
| **Input** | The chosen status. |
| **Processing** | `useLabelDetection()` → `POST /api/detections/:id/label`, then invalidates `detections`, `detection`, `overview`, `by-class`, `trend` and `training-labels` so every dependent surface updates. |
| **Output** | An updated `Detection.status`. |
| **Technologies** | TanStack mutation, Express + Prisma, RBAC middleware. |
| **Why this approach** | Labelling is a write, so it is role-gated **in the backend**; the UI hiding the buttons is convenience only. |
| **Example** | Mark a detection FALSE_ALARM → the Active Learning counters and the retrain-readiness bar move immediately. |
| **Called by** | `DetectionDetail` and the Active Learning queue. |
| **Feeds into** | `GET /api/detections/training-labels` → the CSV → `train_perpixel_gpu.py`. |

### Viva questions — Page 16

**Q1. What makes a detection explainable here?**
Three concrete things: the FDI value plotted against the actual 0.02 threshold, the model confidence, and the class. An analyst can see *why* the pixel was a candidate and *how sure* the model was — not just a label.

**Q2. Why is one detection 0.0001 km²?**
Because it is one Sentinel-2 pixel: 10 m × 10 m = 100 m² = 0.0001 km².

**Q3. Was that always the value?**
No, and this is a bug we are proud of catching. An earlier `area_from_fdi()` returned 0.08–0.9 km² **per pixel** — roughly a 1000× over-report — and it flowed into dashboards, CSV and PDF exports. We removed it at source and replaced it with the physical pixel footprint.

**Q4. Who can label a detection?**
COASTGUARD (level 2) and above, enforced by backend middleware. FIELD users see the queue read-only.

**Q5. What happens after I label something?**
The status is persisted, six query caches are invalidated so every dependent view updates, and the label joins the exportable training set that feeds the next retraining round.

**Q6. What are the three statuses?**
PENDING (awaiting review), CONFIRMED (real plastic) and FALSE_ALARM (not plastic). There is also an optional auto-confirm at confidence ≥ 0.85 in `ml/confidence_filter.py`, which is opt-in.

**Q7. Does the drift card here run a new forecast?**
It shows the trajectory associated with this detection's run where one exists. On-demand forecasting lives on Map Explorer and Areas, where the release point can be chosen properly.

**Q8. Why does this page exist if Records already shows the row?**
Because a table row cannot carry an explanation. This is the page an analyst opens before committing a label — the FDI-versus-threshold bar is the evidence.

**Q9. What is the 0.02 FDI threshold and where does it come from?**
It is our candidacy cut-off, configurable via `FDI_THRESHOLD`. A pixel is a candidate only if `FDI > 0.02` **and** its SCL class is in the keep-mask `{6, 7}`.

**Q10. Could a detection be a candidate but not plastic?**
Absolutely — that is the whole point of stage 3. FDI flags anything floating; algae, foam and wood all clear the threshold. The classifier then separates them, and the two-tier confidence system decides whether the plastic call is dispatch-grade.

### Technical terms in simple language
- **Spectral anomaly** — This pixel reflects light differently from the water around it.
- **Threshold** — The line a value must cross to be considered.
- **Pixel footprint** — The real-world area one pixel covers: 10 m × 10 m here.
- **Ground truth** — A human-verified label used to train or test a model.

### Explain this page in under 1 minute
"Detection Detail answers 'why did the model say this?'. It shows the pixel's Floating Debris Index value on a bar with the 0.02 candidacy threshold marked, so you can see whether it was marginal or strong; then the class, the confidence and the real footprint — one detection is one ten-metre pixel, so 0.0001 square kilometres; then its drift outlook. At the bottom, a Coast Guard officer or admin can confirm it as real plastic or flag it as a false alarm, and that label goes straight into the training set for the next retraining round."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"An FDI bar is not model explainability — where is SHAP or LIME?"* | For a per-pixel model on an 11-feature spectral vector, the physically meaningful explanation *is* the feature values, and FDI is the dominant one by construction. SHAP over 11 spectral features would produce a chart no remote-sensing reviewer needs — they want the FDI number relative to threshold, which is what we show. |
| *"A 1000× area bug is alarming."* | It was, and it is exactly why we audit our own outputs and publish a change history. We found it, traced it to `area_from_fdi()`, removed it at source rather than patching the display, and every downstream export was corrected. |

---

## Page 17 — Hotspot Detail (`/app/hotspots/:id`)

**File:** `frontend/src/pages/HotspotDetail.tsx` · **Min role:** FIELD

### Purpose
The dossier for one DBSCAN cluster: severity and location header, drift forecast, a timeline of the cluster's life, and its member detections — the page a duty officer opens before dispatching a crew.

### Modules on this page

#### 17.1 Header
Cluster label (e.g. `MUM-2`), region, centroid coordinates, and an animated severity pill.

#### 17.2 Drift-forecast card
The cluster's 72-hour outlook: coast ETA, landfall probability where computed, forcing source, and the honest note that ETAs are modelled and not drifter-validated.

#### 17.3 Timeline
When the cluster was first detected, when it was last updated, and its severity history. Region hotspots update **in place by stable label**, so a hotspot is a persistent place rather than a new row every run; AOI hotspots get a run suffix so different drawn boxes never collide.

#### 17.4 Member detections
The detections that make up the cluster, each linking to its own detail page.

### Viva questions — Page 17

**Q1. How is a hotspot label like `MUM-2` generated?**
From the region code plus a cluster index. Region runs reuse the label so the same physical place updates in place across runs; AOI runs append a run suffix so two different drawn boxes cannot collide on one label.

**Q2. Why does a hotspot update in place instead of creating a new row?**
So a location accumulates history — you can see whether a place is getting worse. Creating a new row every six hours would fragment the record of one physical place.

**Q3. What is the severity rule?**
Member count: ≥10 → HIGH, ≥5 → MEDIUM, ≥3 → LOW. `min_samples = 3` means fewer than three points is not a cluster at all.

**Q4. Only high-confidence plastic is clustered — restate why.**
Hotspots are the dispatch unit. A crew must never be sent to a low-confidence maybe. If nothing clears the 0.648 bar, the result is *no hotspot* — we deliberately do not fall back to clustering all plastic.

**Q5. What if the model finds plastic but nothing clusters?**
Then there are detections but no hotspot, and no alert. That is a correct outcome: scattered low-density plastic is not an actionable patch.

**Q6. How is the coast ETA computed for a hotspot?**
`trajectory/eta_calculator.py` does a direction-aware coast crossing against the region's coast meridian. If the parcel is not heading toward the coast within the horizon, the ETA is `None` — open ocean.

**Q7. Is there a weakness in that coast model?**
Yes, and we list it as a known gap: `nearest_coast_lon` has **no distance guard**. An Andaman point — whose own `coast_lon` is `None` because it is open ocean — borrows Chennai's meridian about 1,300 km away. The fix is a maximum-distance check before falling back.

**Q8. What is CONFIRMED versus POSSIBLE on a hotspot?**
The Clay fusion verdict. CONFIRMED requires the MLP confidence, the Clay plastic-affinity and the novelty score all to clear calibrated thresholds; it measures **0.9219 precision at 0.7037 recall**. POSSIBLE is the wider net. Thresholds live in `models/fusion_thresholds.json` and are re-read live, so a recalibration takes effect without a code change.

**Q9. Can I dispatch a crew from here?**
The dispatch flow is on Areas (from a hotspot popup) and on Field Ops. It prefills the operation with the hotspot's severity as priority, its centroid as the target, and the region code.

**Q10. What happens to this page's hotspot after the next pipeline run?**
For a region hotspot, it updates in place if the cluster is still there, or becomes inactive if it is not. Any `Operation` created against it survives regardless, because operations hold a soft string reference plus a location snapshot rather than a cascading foreign key.

### Technical terms in simple language
- **Centroid** — The average position of all the points in a cluster.
- **Cluster member** — One detection belonging to a cluster.
- **In-place update** — Refreshing an existing row instead of inserting a new one.
- **Coast meridian** — A single longitude line used as a simple stand-in for the coastline.
- **Precision / recall at a tier** — How often a CONFIRMED call is right, and how much of the real plastic it catches.

### Explain this page in under 1 minute
"Hotspot Detail is the dossier for one cluster. The header gives the label, region, centroid and severity — severity is just member count: ten or more is HIGH, five is MEDIUM, three is LOW. Then the drift outlook with its coast ETA and forcing source, a timeline showing when the cluster was first seen and last updated, and the member detections. Two things matter here: hotspots cluster high-confidence plastic only, because this is what dispatch acts on; and the CONFIRMED verdict on a hotspot means both the pixel model and the Clay foundation model agreed, which measures 0.92 precision."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"Severity by raw count ignores area and density."* | Correct — it is a deliberately simple, explainable rule an officer can verify by counting dots. Because DBSCAN already enforces a density constraint via eps and min_samples, count within a cluster is a reasonable proxy for magnitude. Weighting by confidence or spatial extent is a clean upgrade. |
| *"Your coastline is a longitude line?"* | For the west and east coasts of India at these latitudes, a meridian is a workable first approximation, and the payload says so explicitly with `coastModel: "meridian"`. We also document the failure case honestly: an open-ocean region with no coast meridian currently borrows a distant one, and the fix is a distance guard. A real coastline polygon is the proper upgrade and is a data addition, not a redesign. |
| *"Hotspots are replaced every run — so your history is fake."* | Region hotspots update **in place by stable label**, so a place accumulates history rather than fragmenting. And precisely because they are mutable, operations reference them softly with a location snapshot, so an operational record can never be destroyed by a recomputation. |

---

## Page 18 — AI Lab (`/app/ai-lab`)

**File:** `frontend/src/pages/AILab.tsx` · **Embeds:** `ModelHealth.tsx`, `Intelligence.tsx` · **Min role:** COASTGUARD

### Purpose
The flagship ML page: the model's report card and its visual-fingerprint intelligence in one place. A four-tile honesty banner on top, then two tabs — **Classifier** (per-class performance, confusion matrix, live evaluation, operating regime, engine capabilities) and **Visual fingerprints** (Clay embeddings, similarity, fusion and temporal change).

### Modules on this page

#### 18.1 Report-card banner

| | |
|---|---|
| **What it is** | Four tiles: **Balanced score** (macro-F1), **Accuracy (unseen data)**, **Classes**, **Reference sites**, followed by a plain-language paragraph explaining each. |
| **Why we need it** | It is the honest headline, and it is deliberately ordered: macro-F1 **first**, accuracy second with an explanation of why it looks inflated. |
| **Input** | `usePipelineStatus()` (model card from the engine) and `useSimilarityInfo()` (Clay index size). |
| **Processing** | Reads `model.metrics.macroF1` and `.testAccuracy` live from the engine, never hardcoded. |
| **Output** | Four `StatCard`s + `InfoTip` explanations. |
| **Technologies** | TanStack Query, FastAPI `/model/info`, the shared `InfoTip` component. |
| **Why this approach** | Ordering is an ethical choice. Putting accuracy first would let a reader take away "99 %", which is the Water-inflated number. |
| **Example** | Balanced score 0.82 · Accuracy 99 % · Classes 4 · Reference sites 12,480. |
| **Called by** | `AILab.tsx`. |
| **Feeds into** | Reader understanding; the two tabs below. |

#### 18.2 Classifier tab → `ModelHealth`

**18.2a Model card tiles** — active classifier mode, held-out accuracy (live or shipped), macro-F1, and what it was trained on, with a **heuristic-mode warning banner** if no ONNX model is loaded: *"You're seeing the rule-based fallback, not the trained model"*, explicitly stating that the scores below describe the trained model and do not apply to what you are currently seeing.

**18.2b Per-class performance** — for each of Plastic / Algae / Sea_Foam / Water, recall and precision with a recall bar, plus `InfoTip` definitions of both terms.

**18.2c Confusion matrix**

| | |
|---|---|
| **What it is** | A 4×4 grid: rows are the true class, columns the model's guess, teal on the correct diagonal and red intensity off it. |
| **Why we need it** | It shows *which* mistakes the model makes, not just how many. |
| **Input** | `live?.confusion ?? metrics?.confusion`. |
| **Processing** | Each cell's background alpha scales with its share of the row, so the dominant confusions stand out. |
| **Output** | An annotated table with a caption. |
| **Technologies** | React, inline `rgba()` styling. |
| **Why this approach** | The interesting engineering answer lives here: plastic is most often confused with algae and foam, which is exactly the spectral-overlap limitation we describe elsewhere. The matrix is the evidence for that claim. |
| **Example** | Row "Plastic", column "Algae" being the largest off-diagonal cell. |
| **Called by** | `ModelHealth`. |
| **Feeds into** | The argument for why Clay verification exists. |

**18.2d Live held-out evaluation** — a dataset selector (MARIDA / MADOS) and an **Evaluate** button that calls `GET /model/evaluate`, re-scoring the shipped ONNX on a cached test split **right now** and replacing the displayed metrics with the live result (including the sample count). This is the difference between "our report says 0.82" and "watch it compute 0.82 in front of you".

**18.2e Operating regime & independent validation (`OperatingRegime`)** — the most defensible block in the project:
- **How reliable is "confirmed"?** CONFIRMED precision and recall, the calibration source, and the exact rule: a site is confirmed only when the pixel model is at least *conf_high* sure, Clay's plastic-affinity is at least *aff_min*, and novelty ≤ *anomaly_tau*. All read live from `models/fusion_thresholds.json`.
- **Tested against a real target (PLP)** — FDI gate rate on the deployed target, pixel-model hit rate, the rate at which floating **wood** was wrongly called plastic, and typical scene false-alarm percentage.
- **Where it works well vs where to be careful** — larger patches that fill much of a tile get a real Clay fingerprint and reach ~0.92 precision; tiny single-point targets (~28 m, 2–3 pixels) leave the tile ~99 % water, so Clay sees almost no plastic fingerprint, the site stays POSSIBLE, and it needs field verification.

**18.2f Engine capabilities** — the engine's self-described configuration chips (real Sentinel-2, trained model, gridded forcing, live mode), its spectral-index list, its feature list and version, all from `GET /capabilities`.

#### 18.3 Visual-fingerprints tab → `Intelligence`

**18.3a Index panel** — model (Clay v1.5), reference-location count, fingerprinted sites and observations, and the class mix of the reference library.

**18.3b Fingerprinted-sites picker** — every site the GPU node has embedded, keyed by a stable `site_key(region, lat, lon)`, with an observation count badge when a place has been seen more than once.

**18.3c Site intelligence** — for a chosen site: the **fusion verdict** (High / Medium / Low confidence, with a one-line human explanation of what each model said and whether they agreed), the retrieval class, a **novelty** flag when the site is unlike anything known, the observation date, and the closest known locations with similarity bars.

**18.3d Temporal change** — for a site with more than one observation: **intensifying / clearing / shifted / stable**, with the plastic-affinity change and the movement since the last pass. Crucially this is computed **without re-downloading anything** — it compares stored fingerprints across dates.

**18.3e Explore by surface type** — a fallback that works immediately even with zero embedded sites: pick Plastic / Algae / Sea_Foam / Water and see the reference locations that look most like it.

**18.3f Advanced: raw embedding search** — paste a raw 1024-number Clay embedding as JSON and get its nearest known locations, best-guess class and novelty score. It surfaces the raw `POST /similarity/search` endpoint for a power user.

### Viva questions — Page 18

**Q1. What are your actual model numbers?**
On 499,907 real held-out test pixels the model never saw: macro-F1 **0.8175**, accuracy 0.9899, balanced macro-F1 0.8776. Per class — Plastic P 0.776 / R 0.824 / F1 0.799; Algae 0.648 / 0.822 / 0.725; Sea_Foam 0.681 / 0.835 / 0.750; Water 0.998 / 0.993 / 0.995. Per dataset: MARIDA macro-F1 0.905, MADOS 0.784. New-seas water false-positive rate 0.7 %.

**Q2. Describe the shipped model architecture.**
`marinenet.onnx` — a 3-seed ensemble of 256-128-64-32 MLPs with averaged logits, trained with focal loss, class-balanced (effective-number) weights and folded per-class bias calibration, on real MARIDA + MADOS official splits plus a refined FloatingObjects subset. GPU-trained on an RTX 4050, exported to ONNX with a parity check — ONNX↔torch agreement is **1.0**.

**Q3. What is focal loss and why use it?**
Focal loss down-weights easy examples so the model stops optimising for the 98 % of pixels that are trivially water and starts learning the hard, rare classes. It is the standard answer to extreme class imbalance in a classification loss.

**Q4. What are class-balanced (effective-number) weights?**
Instead of weighting inversely by raw frequency, you weight by the *effective number* of samples, `(1 − β^n)/(1 − β)`, which accounts for the fact that heavily-duplicated samples add less new information. It avoids the over-correction that plain inverse-frequency weighting causes.

**Q5. What is the two-tier confidence system?**
`P(plastic) ≥ 0.648` → **HIGH**, calibrated to about 90 % precision at 57 % recall. Below that → **CANDIDATE**: shown to the analyst, never clustered into a hotspot, never dispatched against. Raising the bar to 0.79 gives ~95 % precision at 16 % recall. The threshold is env-tunable via `PLASTIC_HIGH_CONF`.

**Q6. Why not just maximise F1?**
Because the operational cost of a false positive is a boat trip. Precision is what a Coast Guard cares about. Our explicit positioning is **sell precision, not F1** — and we also state plainly that plastic F1 cannot be pushed to 0.9x with Sentinel-2 spectral data, because plastic overlaps algae, foam and wood spectrally and targets are frequently sub-pixel.

**Q7. Explain Clay fusion end to end.**
For each hotspot the engine cuts a 64×64×5 chip around the nearest candidate pixel and POSTs it to the GPU sidecar, which returns a 1024-d Clay v1.5 embedding (~36 ms warm). The engine then runs k-NN against a prebuilt reference index, computes **plastic affinity** = the similarity-weighted share of the 10 nearest reference sites that are Plastic, computes an **anomaly/novelty** score, and fuses MLP confidence + affinity + novelty into a calibrated verdict. CONFIRMED measures 0.9219 precision at 0.7037 recall.

**Q8. Why plastic affinity instead of plain k-NN argmax?**
Because the reference library is water-heavy, so raw argmax is biased toward water. A similarity-weighted share of the plastic neighbours is robust to that imbalance.

**Q9. Does Clay make the system better or is it decoration?**
It is measurable: MLP plastic precision 0.776 rises to **0.9219 at the CONFIRMED tier**. And on completely new seas (Durban, Marmara) Clay recalls 54.2 % of debris where a per-pixel MLP on the same chips recalls 22.2 %. It is a precision gate; its own plastic F1 is 0.37, so it is explicitly not a standalone detector.

**Q10. Why is Clay in a separate process?**
The engine is deliberately **torch-free** so the ₹0/no-GPU deployment story holds. Clay is a 4.8 GB PyTorch model. It lives in a stdlib-HTTP sidecar exposing only `/embed` and `/health`, and the engine calls it over loopback. Searching the embedding index needs no torch at all — only *generating* an embedding does.

**Q11. What happens when the sidecar is down?**
Every scan degrades gracefully to MLP-only **and says so** in the stage log — `_clay_stage()` always emits an entry, one of "verified N → M CONFIRMED", "Clay ON, no hotspots" or "Clay OFFLINE — MLP-only". That exists because Clay was once silently off for every scan with no indicator. Our rule: *a component that is present but silently off is a bug.*

**Q12. What does the live evaluation button prove?**
That the numbers are reproducible on demand. It re-scores the shipped ONNX on a cached MARIDA or MADOS test split and shows the accuracy, macro-F1 and sample count from that run — not a stored report.

**Q13. What is the PLP validation and why is it on this page?**
The Plastic Litter Project deployed real HDPE targets in the sea. It is genuinely independent ground truth, so it belongs next to our own metrics. Our model detects **0/33** of those targets. We show it, and we show the reason: the targets are 3.5–14 m in a 10 m pixel, so the pixel is ~90 % water.

**Q14. Did you try to fix the PLP result?**
Yes, empirically. Retraining **with** PLP data dropped plastic precision from 0.776 to 0.660 while lifting deployed-target recall only from 0/33 to 2/33. Teaching water-like spectra as "plastic" just buys false positives. We did not promote that model, and we report the experiment.

**Q15. What is the novelty / anomaly score for?**
It flags water that does not look like anything in the reference library. Operationally it says "this is unfamiliar — a human should look". It is also a fusion input: a highly novel site is not auto-CONFIRMED.

**Q16. How does temporal change work without new downloads?**
`ml/site_change.py` compares a site's stored Clay fingerprints across dates and classifies the trajectory as intensifying, clearing, shifted or stable. The embeddings are already on disk, keyed by a stable site key, so the comparison is pure numpy.

**Q17. What is the embedding spool and drainer?**
A batch-embed / serve-online split. During a scan, `embedding_spool.py` queues hotspot chips to `models/embed_queue/*.npz` so the scan is never blocked by the GPU. A daemon thread registered in the engine's `api/app.py` drains that queue every 60 s **through the running sidecar's `/embed`** — deliberately not by loading a second 4.8 GB Clay instance, which would OOM the 6 GB card. Opt-out with `EMBED_DRAIN=0`.

**Q18. Why is this page COASTGUARD+ and not public?**
Model internals and validation evidence are analyst-level information. A FIELD user needs the detections; a Coast Guard analyst needs to know how much to trust them.

### Technical terms in simple language
- **Confusion matrix** — A grid showing what the model thought each true class was. Diagonal = correct.
- **Precision** — Of what we flagged, how much was right.
- **Recall** — Of what was really there, how much we caught.
- **Macro-F1** — Average F1 across classes, so rare classes count equally.
- **Focal loss** — A loss function that stops the model coasting on easy examples.
- **Class-balanced weights** — Giving rare classes more say during training, adjusted for redundancy.
- **ONNX** — A portable model format, so a PyTorch-trained model runs anywhere without PyTorch.
- **Embedding** — A list of numbers summarising an image; similar images get similar lists.
- **k-NN** — Find the k most similar known items and use their labels.
- **Cosine similarity** — How closely two lists of numbers point in the same direction.
- **Novelty / anomaly score** — How unlike anything known this item is.
- **Sidecar** — A helper process running beside the main one.

### Explain this page in under 1 minute
"AI Lab is the model's report card. The banner leads with macro-F1 — 0.82 — not accuracy, because 99 % accuracy is inflated by the ocean being 98 % water. The Classifier tab gives per-class precision and recall, a confusion matrix showing that plastic is mostly confused with algae and foam — which is the spectral limit we keep talking about — and a button that re-evaluates the shipped ONNX model live on a held-out MARIDA or MADOS split so you can watch the number being produced. Below that is the operating-regime block: what CONFIRMED actually means, calibrated to 0.92 precision, and an independent test against real deployed plastic targets where we honestly report 0 out of 33 and explain that it is a pixel-size limit. The second tab is the Clay side — every site gets a 1024-number visual fingerprint, so we can find similar places, guess a class by retrieval, flag unusual water, and track whether a place is intensifying or clearing over time."

### Explain this page in detail
Add: the training recipe (focal loss + class-balanced effective-number weights + 256-128-64-32 net + folded per-class bias calibration + 3-seed ensemble + ONNX export with parity check = 1.0); the deliberate ensemble trade (macro-F1 0.824 → 0.8175 but plastic F1 0.742 → 0.799, precision 0.652 → 0.776, new-seas water FP 3 % → 0.7 %); the 11-feature contract mirroring `train_perpixel_gpu.augment11` exactly, enforced as a hard runtime order; ONNX Runtime with CUDA execution provider auto-selected and a robust CPU fallback plus a thread-safe load lock so a second concurrent scan cannot observe a half-loaded state and silently fall back to the heuristic; and the Clay path end to end including the spool/drain split.

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"0.82 macro-F1 is not state of the art."* | It is not, and we say so. Our thesis is architectural and operational, not algorithmic. On the numbers that matter operationally we are strong: ~90 % precision at the HIGH tier and 0.92 at the CONFIRMED tier. And we can tell you precisely why plastic F1 cannot reach 0.9x on Sentinel-2 spectral data — overlap with algae, foam and wood, plus sub-pixel targets — and what would actually move it: higher-resolution imagery, SAR, or multi-temporal fusion. |
| *"You detect 0 of 33 real targets. The model doesn't work."* | On sub-pixel targets it does not, and we publish that. The targets are 3.5–14 m in a 10 m pixel. We tested the obvious fix and it made the product worse: plastic precision fell 0.776 → 0.660 for a gain of 2/33. On the benchmarks that reflect real patch-scale debris — MARIDA and MADOS — plastic recall is 90.6 % and 89.9 %. |
| *"Clay is a fashionable add-on."* | It has a measured job: it takes plastic precision from 0.776 to 0.9219 at the CONFIRMED tier, and it generalises 2.4× better than a per-pixel model on seas neither has seen. We also state its limit — its own plastic F1 is 0.37 — so we use it strictly as a verifier. |
| *"Your own accuracy number is misleading."* | Which is why we never lead with it. Macro-F1 is first in the banner, the caption explains the water inflation, and the confusion matrix lets you verify it yourself. |
| *"Your CONFIRMED thresholds could be overfit to the calibration set."* | They are tuned on held-out MARIDA + MADOS test data, not training data, and they live in a JSON file that is re-read live so recalibration needs no code change. The honest caveat is that the calibration set is finite; the mitigation is that the tier is deliberately conservative — POSSIBLE is the wide net and CONFIRMED is the narrow one. |

---

## Page 19 — Active Learning (`/app/active-learning`)

**File:** `frontend/src/pages/ActiveLearning.tsx` · **Min role:** ADMIN

### Purpose
The human-in-the-loop that closes the ML cycle. Analysts review PENDING detections, mark each as real plastic or a false alarm, watch a retrain-readiness bar fill, and export the validated set as the CSV the next training round consumes.

### Modules on this page

#### 19.1 Stat tiles + retrain-readiness bar

| | |
|---|---|
| **What it is** | Four tiles: awaiting review, confirmed plastic, false alarms, and a progress bar toward `RETRAIN_TARGET = 50` labels. |
| **Why we need it** | It turns an abstract "we have an active-learning loop" into a visible, countable state with a finish line. |
| **Input** | `useDetections({status:'PENDING'})` and `useTrainingLabels()` → `GET /api/detections/training-labels`. |
| **Processing** | `readiness = min(100, round(totalLabelled / 50 × 100))`. |
| **Output** | Four tiles + a bar that turns teal at 100 % with the caption "Enough labels for a retrain round." |
| **Technologies** | TanStack Query, Framer Motion width animation. |
| **Why this approach** | A target makes the loop actionable. 50 is a pragmatic per-round batch — enough to matter, small enough to be reachable in one session. |
| **Example** | 34 labelled → 68 % → "16 more to a retrain round." |
| **Called by** | `ActiveLearning.tsx`. |
| **Feeds into** | The analyst's decision to keep going. |

#### 19.2 Review queue

| | |
|---|---|
| **What it is** | A filterable list (region, class) of PENDING detections, each row showing region, class badge, coordinates, a confidence bar, the FDI value, and Confirm / False-alarm buttons. |
| **Why we need it** | This is where human ground truth is created. |
| **Input** | `useDetections({status:'PENDING', region, classification, limit:100})`. |
| **Processing** | `useLabelDetection()` mutates and invalidates six query keys so the counters, charts and readiness bar all move at once. The buttons are disabled per-row while that row's mutation is pending (`label.variables?.id === d.id`), so double-clicks cannot double-submit. |
| **Output** | An updated `Detection.status`. |
| **Technologies** | TanStack mutation with per-row pending tracking, Prisma, RBAC middleware. |
| **Why this approach** | Showing confidence and FDI **in the row** means the analyst can triage without opening each detection — the queue is designed for throughput. |
| **Example** | 40 rows, region CHN, class Plastic → the analyst clears them in a few minutes. |
| **Called by** | `ActiveLearning.tsx`. |
| **Feeds into** | The labelled-set CSV. |

#### 19.3 Export labelled set
A COASTGUARD+ button downloading CONFIRMED + FALSE_ALARM rows as CSV — the file `ml/train_perpixel_gpu.py` consumes for the next training round.

#### 19.4 Read-only mode
FIELD users see the queue with an explanatory strip: *"You're viewing the queue read-only. Sign in as Coast Guard or Admin to confirm or reject detections."* The buttons are absent client-side and the write is refused server-side.

### Viva questions — Page 19

**Q1. What is active learning, in one sentence?**
Instead of labelling data at random, you let the model tell you which examples it is most uncertain about, and you label those — because uncertain examples carry the most information per label.

**Q2. How does *your* implementation choose what to review?**
Today the queue is every PENDING detection, filterable by region and class. The uncertainty ranking — sorting by proximity to the 0.648 decision boundary — is the natural next step and the data to do it (per-detection confidence) is already stored. We would rather describe that accurately than claim uncertainty sampling we have not shipped.

**Q3. Why is this page ADMIN-only when labelling is COASTGUARD+?**
Because this page is the *retraining* surface — it is the system-owner's view of the loop, including the readiness bar and the export that changes the model. Individual labelling is available to COASTGUARD from the Records/Detection-detail flow.

**Q4. Walk the loop end to end.**
Scan produces detections → the pipeline sets status PENDING → an analyst reviews here and marks CONFIRMED or FALSE_ALARM → the label persists to Postgres → the readiness bar counts toward 50 → export CSV → `train_perpixel_gpu.py` retrains on GPU with the new labels folded in → export to ONNX with a parity check → drop the new `marinenet.onnx` into `models/` → the engine's model loader picks it up → AI Lab shows the new metrics.

**Q5. Is the retraining automatic?**
No, and we do not claim it is. Retraining is a deliberate, offline, GPU step with a held-out evaluation before promotion. Auto-retraining on user labels without an evaluation gate is how models silently get worse.

**Q6. What stops a careless analyst from poisoning the model?**
Three things: labelling is role-gated to COASTGUARD+; every retrain is evaluated on a fixed held-out split before promotion, so a degraded model is not promoted; and we have already demonstrated the discipline by refusing to promote the PLP-augmented model when its precision fell.

**Q7. Why 50 labels?**
It is a pragmatic batch size for a session — enough that a retrain round is meaningful, small enough to be achieved by one analyst in one sitting. It is a constant, easy to tune.

**Q8. What is in the exported CSV?**
The human-verified detections — CONFIRMED and FALSE_ALARM — with their region, class, coordinates, confidence, FDI and status. False alarms matter as much as confirmations; negatives are what teach the model what plastic is *not*.

**Q9. Why disable the buttons per row rather than globally?**
Because a global disable would freeze the whole queue while one row saves. Tracking `label.variables?.id` disables only the row being submitted, so throughput stays high and double-submits are still impossible.

**Q10. Does labelling change anything immediately?**
Yes for the UI and analytics — six caches are invalidated so counts, class mix and trend update at once. The *model* only changes at the next retrain, which is correct.

**Q11. What is the relationship to the auto-confirm feature?**
`ml/confidence_filter.py` can auto-mark detections CONFIRMED at ≥ 0.85 confidence, but it is **opt-in and off by default** so the base result is never silently altered and human labels stay genuinely human.

**Q12. What would you build next here?**
Uncertainty-first ordering (sort by `|P(plastic) − 0.648|` ascending), a keyboard-driven review mode, and inter-annotator agreement tracking when more than one analyst reviews the same detection.

### Technical terms in simple language
- **Active learning** — Let the model pick the examples it is least sure about, and label those first.
- **Human-in-the-loop** — A person is part of the automated cycle, not outside it.
- **Ground truth** — A human-verified label treated as correct.
- **Retrain round** — Training the model again with new labels added.
- **Uncertainty sampling** — Choosing examples where the model's confidence is closest to the decision boundary.
- **Model poisoning** — Bad labels making the model worse.

### Explain this page in under 1 minute
"Active Learning closes the loop. Every detection starts as PENDING; an analyst sees the queue with the class, coordinates, confidence and FDI value on each row and marks it as real plastic or a false alarm. Four tiles track pending, confirmed, false alarms and a readiness bar toward fifty labels, which is our per-round batch. When it fills, you export the validated set as CSV and it becomes the ground truth for the next training round on the GPU. Retraining is deliberately manual with a held-out evaluation before promotion — we have already refused to promote a model that scored worse, so the gate is real."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"This isn't active learning — it's just a labelling queue."* | Fair, and we would rather be precise than overclaim: today it is human-in-the-loop labelling with a retrain export. True uncertainty sampling means ranking by distance to the 0.648 decision boundary, and every ingredient for that is already stored per detection. It is a sort order, not new infrastructure. |
| *"Manual retraining means the loop isn't closed."* | It is closed, just not automatic — and that is deliberate. The gate is a held-out evaluation before promotion. We have exercised that gate: we refused to promote the PLP-augmented model when plastic precision dropped from 0.776 to 0.660. An automatic loop with no gate is how models silently degrade. |
| *"Fifty labels won't move a model trained on half a million pixels."* | Correct for a full retrain, and worth stating. Fifty is the batch cadence, not the training-set size — labels accumulate across rounds, and their value is concentrated where the model is wrong, which is exactly where new labels move a decision boundary. |

---

## Page 20 — Pipeline (`/app/pipeline`)

**File:** `frontend/src/pages/Pipeline.tsx` · **Component:** `components/pipeline/LiveScanProgress.tsx` · **Min role:** FIELD

### Purpose
Run and watch the pipeline itself, at region scale rather than a drawn box. It has two runners — a **live SSE-streamed scan** that lights up stage by stage, and a full region run whose complete result is rendered afterwards — plus the model card and recent Sentinel-2 imagery.

### Modules on this page

#### 20.1 `LiveScanProgress` — the SSE runner

| | |
|---|---|
| **What it is** | A region selector plus "Run live scan", with a seven-tile stepper where each tile is queued → running (spinner) → done (tick + real duration + detail), and a result strip at the end. |
| **Why we need it** | It shows the pipeline **as it happens**, with genuine per-stage timings, rather than a spinner followed by a result. |
| **Input** | The region's bounding box (or a default Chennai AOI) as query parameters. |
| **Processing** | Opens a native `EventSource` to `/api/pipeline/stream?north=…&south=…&east=…&west=…&scene_size=48`. The backend proxies the engine's SSE. Events are `start`, `stage` (one per completed stage, with `durationMs` and `detail`), `result`, `error` and `done`. A `finished` ref distinguishes a normal close from a dropped stream so a clean finish never shows an error. |
| **Output** | Live stage states + a result strip (detections, plastic, hotspots, average confidence, provider badge). |
| **Technologies** | Server-Sent Events, native `EventSource`, FastAPI streaming, React refs for cleanup. |
| **Why this approach** | The engine's `run_aoi_events()` is a **generator twin** of `run_aoi()` that reuses the *identical* stage helpers, so the streamed timings are the genuine per-stage work, not a simulation. The CLAY tile is marked `optional`, so if the sidecar is offline it renders as **"skipped · GPU sidecar offline"** rather than as a failure. |
| **Example** | DOWNLOAD 18.4 s → FDI 210 ms → CNN 96 ms → DBSCAN 12 ms → CLAY 340 ms → DRIFT 1.2 s → ALERT 3 ms → result strip. |
| **Called by** | `Pipeline.tsx`. |
| **Feeds into** | The persisted run rows and the WebSocket feed. |

#### 20.2 Region runner
A region dropdown (or "All regions") plus "Run pipeline" → `usePipelineRun()` → `POST /api/pipeline/run`. On success it invalidates seven query keys (detections, hotspots, alerts, overview, trend, by-region, by-class), because the run has persisted to Postgres and everything reading from it is now stale. The result renders as six stage cards, four stat cards, the hotspots produced this run, and a drift summary naming the windage coefficients and forcing source.

#### 20.3 `ModelCard`

| | |
|---|---|
| **What it is** | The active classifier: mode, architecture, dataset badge (REAL data · MARIDA+MADOS), training sample count, held-out accuracy and macro-F1, per-class recall bars, ONNX↔numpy agreement, and input geometry. |
| **Why we need it** | Before trusting a run, you should know which model produced it. |
| **Input** | `usePipelineStatus()` → the engine's model card. |
| **Processing** | Branches on `m.trainedOn`: `marida+mados` → green "REAL data" badge; `marida` → green; anything else → an amber "synthetic baseline" badge. If no model is loaded at all, it renders a distinct heuristic-mode card explaining the interpretable FDI/NDVI fallback. |
| **Output** | A model card. |
| **Technologies** | TanStack Query, FastAPI `/model/info`. |
| **Why this approach** | The badge is derived from the model's own metadata, so it cannot claim real training data unless the loaded model actually declares it. |
| **Example** | "Per-pixel MLP ensemble · REAL data · MARIDA+MADOS · 99 % held-out · macro-F1 82 %" with four recall bars. |
| **Called by** | `Pipeline.tsx`. |
| **Feeds into** | Trust in the run below it. |

#### 20.4 `ScenesPanel`
Recent Sentinel-2 scenes for the selected region from `GET /api/satellite/scenes`, with a source badge (live · AWS STAC / offline · mock / demo scenes), tile ID, platform, acquisition date and colour-coded cloud percentage — plus an honest footnote that high cloud cover is expected during the Indian monsoon and is a real limitation of optical satellites.

### Viva questions — Page 20

**Q1. What is SSE and why here rather than WebSocket?**
Server-Sent Events is a one-way HTTP stream from server to browser. A scan is strictly server→client and short-lived, `EventSource` auto-reconnects, and it needs no protocol upgrade. We reserve the WebSocket for the long-lived, app-wide event feed.

**Q2. Are the streamed timings real?**
Yes. `run_aoi_events()` is a generator twin of `run_aoi()` that calls the *same* stage helper functions and yields after each one. There is no simulated delay anywhere in the path.

**Q3. Why does the CLAY tile show "skipped" instead of failing?**
Because Clay is an optional tier-2. If the sidecar is offline the scan is still valid — it is MLP-only — so the correct UI is "skipped · GPU sidecar offline", not an error. The engine always emits a CLAY stage entry precisely so the state is never invisible.

**Q4. Difference between this page and Map Explorer?**
Map Explorer scans a box you draw and is exploratory. This page runs the **monitored regions** and is operational, and it exposes the model card and scene inventory — the "is the machine healthy?" view.

**Q5. What happens when the run finishes?**
Seven query caches are invalidated because the run persisted rows to Postgres, so every list and chart that reads from the database refetches. Separately, the backend broadcasts a `run` event on the WebSocket.

**Q6. What is the heuristic fallback?**
If no trained ONNX model can be loaded, the engine uses an interpretable spectral rule (FDI + greenness + brightness). It is clearly labelled everywhere it appears, and `REQUIRE_MODEL=1` makes the engine **refuse to start** in that mode rather than degrade silently.

**Q7. Why was that flag necessary?**
Because it happened to us. `onnxruntime` was missing from the interpreter actually serving uvicorn, so the lazy import failed and the engine quietly ran the heuristic **while `metrics.json` still advertised the trained model's numbers**. That is the worst kind of failure — invisible. Hence the flag, the badges and the provenance strip.

**Q8. What is the ONNX↔numpy agreement figure?**
A parity check comparing the exported ONNX model's predictions against the original torch/numpy implementation on the same inputs. Ours is **1.0** — the export is lossless, so the served model is the model we evaluated.

**Q9. Why 48×48 for the streamed scan?**
`scene_size=48` keeps the streamed demo fast and responsive. The full AOI path uses adaptive resolution sized to about 20 m/px.

**Q10. How does the page know the engine is online?**
`usePipelineStatus()` polls every 15 s. If the engine is unreachable, the badge flips, the run button is disabled and a hint explains how to start it.

**Q11. Why is there both a live-stream runner and a normal runner?**
The stream is for watching one AOI's stages with real timings; the normal runner is for executing a full region (or all regions) and inspecting the complete persisted result, including hotspots and trajectories.

**Q12. What does the scenes panel tell an evaluator?**
Whether real imagery is actually reachable, how fresh it is, and how cloudy — which contextualises a disappointing scan honestly instead of leaving it unexplained.

### Technical terms in simple language
- **SSE / EventSource** — A one-way live text feed from server to browser over normal HTTP.
- **Generator** — A function that yields values one at a time instead of returning once at the end.
- **Stage duration** — How long that pipeline step actually took.
- **ONNX Runtime** — The engine that executes an ONNX model, on GPU or CPU.
- **Parity check** — Confirming the converted model gives the same answers as the original.
- **Heuristic** — A hand-written rule used when no trained model is available.

### Explain this page in under 1 minute
"Pipeline is where you run and watch the system itself. The top block opens a Server-Sent Events stream to the engine and lights up all seven stages one by one with their real durations and detail lines — those timings are genuine, because the streaming path is a generator twin of the normal pipeline that calls the identical stage helpers. If the Clay GPU sidecar is offline, that tile shows 'skipped', not a failure, because tier-2 is optional. Below it you can run a full region scan and see the complete result. There's also the model card — which classifier is loaded, what it was trained on, its held-out accuracy and macro-F1, per-class recall bars, and the ONNX parity figure — and a list of recent Sentinel-2 scenes with their cloud cover."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"The stage animation is fake progress."* | It is not. Each tile updates on a real SSE event carrying the measured `durationMs` for that stage, emitted by a generator that runs the same helper functions as the normal pipeline. If a stage is slow, the tile sits there — we do not animate ahead of the work. |
| *"Why does the code still say CNN when it's an MLP?"* | The stage code is a database enum and an API field; renaming it is a breaking migration for zero functional gain. We corrected every user-facing label to "Classify (MLP)" and documented the misnomer explicitly rather than leaving it to be discovered. |
| *"Running the pipeline from a browser button is not production."* | Which is why the internal scheduler exists (`SCHEDULER_ENABLED=1` registers a repeatable BullMQ region sweep) and why there is an external `/api/pipeline/scheduled-run` endpoint for GitHub Actions or cron, guarded by `SCHEDULER_TOKEN`. The button is the interactive path; the scheduler is the operational one. We keep scheduling opt-in because a timer on satellite fetches burns CDSE quota. |

---

## Page 21 — Field Operations (`/app/operations`)

**File:** `frontend/src/pages/Operations.tsx` · **Components:** `OperationCard`, `OperationForm`, `MissionReportForm`, `status.ts` · **Min role:** FIELD (reads public)

### Purpose
The bridge from *"the satellite detected plastic"* to *"a crew was dispatched and filed a report."* Create an operation against a hotspot, advance it through a status workflow, file an after-action mission report with recovered quantities, and export a PDF dossier.

### Modules on this page

#### 21.1 Impact tiles
Active now (dispatched + in-progress), total operations, **plastic collected (kg)** and **area cleared (km²)** — from `useOperationStats()`. These two impact figures are the project's outcome measure: not "we detected X", but "X was removed".

#### 21.2 Status workflow (`status.ts`)

| | |
|---|---|
| **What it is** | The shared state machine: `PLANNED → DISPATCHED → IN_PROGRESS → COMPLETED`, with `CANCELLED` as a terminal side state, plus display metadata (label + badge variant) and `NEXT_STATUS` transition rules. |
| **Why we need it** | The workflow must be identical on the card, the filter chips and the form. |
| **Input** | The current status. |
| **Processing** | `NEXT_STATUS` returns the single legal forward transition, or `undefined` at a terminal state (where the action becomes "file a report"). |
| **Output** | Labels, badge variants and the next legal action. |
| **Technologies** | TypeScript `Record` types keyed by the `OperationStatus` union — so adding a status is a compile error everywhere it must be handled. |
| **Why this approach** | One shared module prevents the classic drift where the card allows a transition the server rejects. |
| **Example** | A DISPATCHED card's button offers exactly one action: "In progress". |
| **Called by** | `Operations.tsx`, `OperationCard`, `MissionReportForm`. |
| **Feeds into** | `PATCH /api/operations/:id/status`. |

#### 21.3 `OperationCard`
Code, status badge, severity pill, title, target coordinates, team, and context-aware actions: advance to the next status, file a report at a terminal state, and a PDF export button. Actions render only when `canManage` (level ≥ FIELD) — and the server enforces the same.

#### 21.4 `OperationForm` (create / dispatch)

| | |
|---|---|
| **What it is** | A modal to create an operation: title, priority, region, team, target lat/lon, notes. |
| **Why we need it** | The dispatch action. |
| **Input** | An optional `OperationPrefill` (title, priority, region, hotspot/detection id, target coordinates). |
| **Processing** | `useCreateOperation()` → `POST /api/operations`. Prefill is applied through one-shot `useState` initialisers, which is why the caller in Areas keys the component with a `dispatchNonce` — the form must **remount** to pick up a new prefill. |
| **Output** | An `Operation` row with a generated code; every operations query is invalidated. |
| **Technologies** | Shared `Modal`/`Input`/`Select`, TanStack mutation. |
| **Why this approach** | Prefilling from a hotspot means dispatch is one click from the map, and the target coordinates are the cluster centroid rather than typed by hand. |
| **Example** | From an Areas hotspot popup: "Chennai outer roads — HIGH debris sweep", priority HIGH, target 13.08 / 80.31. |
| **Called by** | `Operations.tsx` and `Areas.tsx`. |
| **Feeds into** | The operations board and the activity ledger on the area. |

#### 21.5 `MissionReportForm`
Closes an operation with an after-action record: summary, outcome (`CLEARED` / `PARTIAL` / `NOT_FOUND` / `STOOD_DOWN`), plastic collected in kg, area cleared in km², team size and photo count. `NOT_FOUND` matters most scientifically — it is a **field-verified false positive**, the strongest possible negative label.

#### 21.6 PDF export
`api.exportOperationPdf(id, code)` → a server-generated PDF via pdfkit — a real briefing document, not a browser print.

### Viva questions — Page 21

**Q1. Why does a detection system need an operations module?**
Because a detection that nobody acts on has no value. This module is what makes the project *operational* rather than analytical, and it produces the outcome metric — kilograms recovered and area cleared — that an agency actually reports on.

**Q2. Describe the workflow.**
PLANNED → DISPATCHED → IN_PROGRESS → COMPLETED, with CANCELLED as a terminal side state. Transitions are forward-only and defined once in `status.ts`, which the card, filters and forms all read.

**Q3. Why is the state machine in a shared module?**
So the UI can never offer a transition the server rejects. And because the types are `Record<OperationStatus, …>` keyed by a union, adding a status becomes a compile error in every place that must handle it.

**Q4. How does an operation link to a hotspot?**
By a **soft reference** — `hotspotId` and `detectionId` are plain strings, not foreign-key relations, and `targetLat`/`targetLon` snapshot the location.

**Q5. Why soft references? That loses referential integrity.**
It is a deliberate trade. Hotspots are **recomputed and replaced on every pipeline run**. A hard foreign key with cascade delete would silently destroy completed operations the next time the pipeline ran. Snapshotting the coordinates preserves everything the operational record actually needs, and an operational record must outlive a recomputed analytic one.

**Q6. What is the scientific value of a mission report?**
It is field-verified ground truth. `CLEARED` with a recovered mass confirms the detection was real and quantifies it; `NOT_FOUND` is a confirmed false positive at field resolution — a far stronger negative label than an analyst's screen judgement.

**Q7. Who can create and advance operations?**
FIELD (level 1) and above, enforced in backend middleware. Reads are public so the demo board renders without a login.

**Q8. Why a server-generated PDF instead of `window.print()`?**
A briefing document needs a stable layout independent of the viewer's browser, zoom and printer settings. pdfkit on the server gives a deterministic file. We do also offer browser print on the Reports tab for a quick screen capture.

**Q9. What is the `dispatchNonce` in Areas?**
`OperationForm` seeds its fields from `prefill` via one-shot `useState` initialisers, so it only reads the prefill on mount. The nonce is used as a React `key`, forcing a remount each time a new hotspot is dispatched — otherwise the second dispatch would show the first hotspot's data.

**Q10. Can an operation be deleted?**
No delete route exists — it is in our known-gaps list. Operations can be CANCELLED, which is the correct operational semantic anyway: a dispatched mission that did not happen is part of the record, not something to erase.

**Q11. How does this connect back to the map?**
Two ways in: from an alert row in the Command Center inbox (hover reveals a dispatch shortcut) and from a hotspot popup in Areas (which prefills the whole form). One way out: the Activity tab on an area shows its operations and the cleanup-impact ledger.

**Q12. What do the kg and km² tiles really represent?**
The sum of what crews reported recovering across filed mission reports. It is self-reported field data, and we present it as such — it is the outcome measure, not a model output.

### Technical terms in simple language
- **State machine** — A defined set of states and the legal moves between them.
- **Soft reference** — Storing another record's ID as text, so deleting that record cannot destroy this one.
- **Cascade delete** — Deleting a parent automatically deletes its children. Dangerous when the parent is regenerated every run.
- **After-action report** — What actually happened, filed after the mission.
- **Dispatch** — Sending a crew to a location.

### Explain this page in under 1 minute
"Field Operations turns a detection into a response. You create an operation — usually prefilled straight from a hotspot popup, so the target coordinates are the cluster centroid — and advance it through planned, dispatched, in progress, completed. At the end the crew files a mission report: what happened, the outcome, kilograms of plastic collected and area cleared. Those two numbers are the project's real impact measure. Scientifically the important outcome is 'not found', because that is a field-verified false positive — the strongest negative label we can get. And operations reference hotspots by a soft string ID with a location snapshot, deliberately, because hotspots are recomputed every run and a hard foreign key would delete completed missions."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"This is just a CRUD to-do list."* | Structurally yes, and that is appropriate — the value is that it closes the loop from satellite to outcome and produces field ground truth. The interesting engineering decisions are the shared type-safe state machine and the soft-reference choice that protects operational records from analytic recomputation. |
| *"Soft references throw away database integrity."* | Deliberately, and for a specific reason: the referenced entity is regenerated every pipeline run. Integrity to a row that no longer exists is worth less than an operational record that survives. We snapshot the coordinates so nothing needed is lost. |
| *"You can't delete an operation."* | Correct, and it is in our known-gaps table. It is also arguably right: a dispatched mission belongs in the record. CANCELLED is the correct semantic, and it exists. |
| *"The impact numbers could be made up."* | They are crew-reported, and we present them as field-reported figures rather than as measurements. Photo counts and the audit log provide traceability; the alternative — omitting outcome entirely — would make the system unaccountable. |

---

## Page 22 — Analytics & Reports (`/app/analytics`)

**File:** `frontend/src/pages/AnalyticsReports.tsx` · **Embeds:** `Analytics.tsx`, `Reports.tsx` · **Min role:** COASTGUARD

### Purpose
Analyse then ship. One tab studies the trends, classification mix and regional breakdown; the other exports exactly what you just analysed, as CSV, GeoJSON, JSON or a server-built PDF situation report.

### Modules on this page

#### 22.1 Analyze tab

| Block | What it shows | Source |
|---|---|---|
| KPI tiles | Average confidence, total area (km²), false-alarm rate, model F1 | `useOverview()` |
| **Detection trend** | Daily detections and confirmed detections over 60 days (line chart) | `useTrend(60)` |
| **Classification mix** | Donut of Plastic / Algae / Sea_Foam / Water | `useByClass()` |
| **Regional breakdown** | Stacked bar of detections vs hotspots per region | `useByRegion()` |
| Region statistics | Sortable table with high-severity badges | `useByRegion()` |
| **Active model card** | Name, version, macro-F1, accuracy, training data, architecture | `usePipelineStatus()` — *prefers the engine's live metrics so the card can never go stale* |
| **`ModelEvalTool`** | Buttons to re-score the shipped ONNX live on the MARIDA or MADOS test split | `useModelEval()` → `GET /model/evaluate` |

Charts are Recharts (`LineChart`, `PieChart`, `BarChart`) inside a shared `ChartCard` that handles the loading skeleton and fixed chart height — so no chart ever causes a layout jump while data loads.

#### 22.2 Export tab

| Export | Format | How it is produced |
|---|---|---|
| Detections | CSV | Hand-built in the browser with an RFC-4180 `csvEscape` (doubling embedded quotes) |
| Hotspots | CSV | Same |
| **GeoJSON (GIS)** | `.geojson` | A `FeatureCollection` of detection and hotspot points with full properties — opens directly in QGIS / ArcGIS / geojson.io |
| Full snapshot | JSON | Overview + detections + hotspots + regions in one file |
| **Situation report** | PDF | **Server-generated** via pdfkit (`report.service.ts`), not a browser print |

#### 22.3 On-screen situation report
A printable report block rendered in the page — summary metrics, a regional breakdown table, the top six priority hotspots, and a closing honesty paragraph: *"Sentinel-2 revisits every ~5 days at 10 m and cannot see through cloud or at night — this report complements, and does not replace, patrols and field verification."* `window.print()` turns it into a PDF for a quick capture.

### Viva questions — Page 22

**Q1. Why merge Analytics and Reports?**
Because Reports only ever re-exported Analytics' own numbers. Separating them meant analysing on one page and exporting on another, with a real risk of the two disagreeing. Together, you export exactly what you just looked at.

**Q2. Why Recharts?**
It is declarative React (composable `<Line>`, `<Bar>`, `<Pie>` children), responsive out of the box via `ResponsiveContainer`, and lazy-loaded so it only ships on this route. D3 would give more control at far more code for standard chart types.

**Q3. Why hand-build the CSV instead of using a library?**
Because correct CSV is one function: quote every field and double embedded quotes (RFC 4180). A dependency for that is not worth the bytes. The backend's `report.service.ts` does the same on the server side.

**Q4. Why is the PDF generated on the server?**
A briefing document must look the same for everyone. `window.print()` depends on the viewer's browser, zoom, margins and printer. pdfkit produces a deterministic file. We keep browser print as the quick option.

**Q5. Why GeoJSON specifically?**
Because the target users have GIS teams. A GeoJSON `FeatureCollection` opens directly in QGIS or ArcGIS with the class, confidence, FDI, area, status and ETA carried as feature properties — so our output slots into their existing workflow rather than demanding they adopt ours.

**Q6. What is the false-alarm rate on this page?**
`falseAlarms / max(totalDetections, 1)` — the share of detections analysts have marked FALSE_ALARM. It is a direct read-out of the active-learning loop, and it is the honest counterweight to the detection count.

**Q7. Why does the model card prefer the engine's live metrics?**
So it can never go stale. If it read a stored value and the model was replaced, the page would advertise the old model's numbers — exactly the failure we hit when the engine silently ran the heuristic while `metrics.json` advertised the trained model.

**Q8. What does `ModelEvalTool` do?**
Calls `GET /model/evaluate?dataset=marida|mados`, which re-scores the shipped ONNX on a cached test split and returns accuracy, macro-F1 and the sample count. It lets an examiner watch the number being computed instead of trusting a report.

**Q9. Why is this page COASTGUARD+?**
Aggregate analytics and exportable data products are analyst/command-level outputs. A FIELD user's job is the map, records and their operations.

**Q10. What is `ChartCard` for?**
A shared wrapper handling the title, subtitle, loading skeleton and a fixed chart height. The fixed height is the important part — it prevents layout shift when data arrives.

**Q11. Are exports paginated or capped?**
The detections export requests up to 500 rows and the on-screen table up to 200. For larger extracts the correct path is a server-streamed export, which the backend's export routes are structured for.

**Q12. What does the disclaimer at the bottom of the report do?**
It travels with the document. A PDF gets forwarded and screenshotted; the limitation must be attached to the artefact, not left behind on a web page.

### Technical terms in simple language
- **CSV** — Comma-separated values; a spreadsheet-friendly text table.
- **RFC 4180** — The rules for writing valid CSV (quoting, escaping).
- **GeoJSON FeatureCollection** — A list of map features with geometry and properties.
- **QGIS / ArcGIS** — Standard desktop GIS applications.
- **Donut / stacked bar** — Chart types for composition and per-category comparison.
- **Layout shift** — Content jumping as things load. Reserving height prevents it.

### Explain this page in under 1 minute
"Analytics and Reports is one analyse-then-ship surface. The Analyze tab has KPI tiles, a sixty-day detection trend, a classification-mix donut, a regional breakdown, a sortable region table, and the active model card — which reads the engine's live metrics so it can never advertise a model that has been replaced. There's also a button to re-evaluate the shipped ONNX on a held-out MARIDA or MADOS split on demand. The Export tab ships exactly those numbers: detections and hotspots as RFC-4180 CSV, a GeoJSON FeatureCollection that opens straight in QGIS, a full JSON snapshot, and a server-generated PDF situation report — a real pdfkit document, not a browser print, with the limitations paragraph attached to it so the caveat travels with the file."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"Standard charts, nothing novel."* | Correct, and deliberate — an agency report should look like an agency report. The engineering choices worth defending are the live-metrics binding so the model card can never go stale, the server-generated PDF for deterministic output, and GeoJSON so our results drop into an existing GIS workflow. |
| *"Exports are capped at 500 rows."* | For the client-built exports, yes. Anything larger belongs in a streamed server export, which the backend export routes are structured for. Building a 100,000-row CSV in the browser is the wrong place to do it. |
| *"Your false-alarm rate depends on how much analysts labelled."* | Exactly, and that is why it is shown next to the label counts on Active Learning. It is a measure of the review loop as much as of the model, and we would state that rather than present it as a pure model metric. |

---

## Page 23 — Settings (`/app/settings`)

**File:** `frontend/src/pages/Settings.tsx` · **Min role:** FIELD

### Purpose
Account self-service: view your profile and clearance level, enable or disable two-factor authentication with a QR-code flow, and sign out.

### Modules on this page

#### 23.1 Profile card
Avatar initial, display name, username, email, `RoleBadge`, clearance level (`L1`/`L2`/`L3`) and a sign-out button. Signing out calls `authStore.logout()`, which calls `POST /api/auth/logout` so the refresh token is **denylisted server-side** — not merely dropped from the browser.

#### 23.2 Two-factor authentication

| | |
|---|---|
| **What it is** | A three-state card: enabled (with a disable button), not enabled (with an enable button), or mid-setup (QR code + manual secret + 6-digit verification field). |
| **Why we need it** | Privileged roles — especially ADMIN, who can retrain the model — should not rest on a password alone. |
| **Input** | The user's `totpEnabled` flag; the typed 6-digit code. |
| **Processing** | `api.twoFactorSetup()` → the server generates a TOTP secret and returns it as a `qrDataUrl` plus the raw secret. `api.twoFactorEnable(code)` verifies the code against the secret before flipping the flag — **enabling requires proof that the authenticator is actually working**, not just that a secret was generated. Then `refreshUser()` re-reads the user. |
| **Output** | `User.totpEnabled` true/false; a toast either way. |
| **Technologies** | TOTP (RFC 6238), QR data-URL, Zustand `refreshUser`. |
| **Why this approach** | Verify-before-enable prevents the classic lockout where a user enables 2FA, never successfully scans the code, and cannot log in again. |
| **Example** | Enable → scan QR in Authy → type 123456 → "Two-factor authentication enabled". |
| **Called by** | `Settings.tsx`; auto-started on arrival from sign-up. |
| **Feeds into** | The login flow's `needsTotp` branch. |

#### 23.3 Post-signup auto-prompt
Reads `location.state.promptTotp`, shows a welcome banner, and auto-opens 2FA setup — guarded by a `useRef` so React StrictMode's double effect cannot generate two secrets, and only when there is a real backend session (`accessToken` present) on an account that does not already have TOTP.

### Viva questions — Page 23

**Q1. How does TOTP work?**
Server and authenticator app share a secret. Both compute `HMAC(secret, current_30s_time_window)` and truncate it to six digits. Because both know the secret and the time, the codes match — and no code ever travels over the network to be replayed.

**Q2. Why show the raw secret next to the QR code?**
Because not every device can scan a QR — a desktop authenticator or a user without a camera needs manual entry. It is the standard TOTP enrolment fallback.

**Q3. Why verify a code before enabling?**
To prevent lockout. If we flipped the flag on setup and the user never actually completed enrolment, they would be permanently locked out of their own account.

**Q4. What happens on sign-out?**
`logout()` calls the backend so the refresh token is **denylisted server-side**, then clears the store. Dropping the token client-side alone would leave a valid token in existence.

**Q5. Can a user change their own role here?**
No. Role elevation is an admin action, and the server refuses a self-elevation attempt regardless of what the client sends.

**Q6. What is the clearance level for?**
`ROLE_LEVEL` — FIELD 1, COASTGUARD 2, ADMIN 3 — is the numeric comparison used by every gate (`>=`), so adding a role later does not require editing every check.

**Q7. Why does 2FA setup fail in offline demo mode?**
Because there is no `accessToken` — the offline session is local-only. The page says so explicitly: *"2FA setup needs the backend running and a real login session (not the offline demo)."*

**Q8. What is the `useRef` guard doing again?**
React 18 StrictMode double-invokes effects in development. Without the guard, arriving from sign-up would call the setup endpoint twice and generate two secrets, the second silently invalidating the first.

**Q9. Are there backup codes?**
No, and we do not pretend otherwise. The login page notes that in this demo, restarting the backend resets 2FA on the seeded accounts. Backup codes are a standard addition: generate N single-use codes at enrolment, store them hashed.

**Q10. Where is the TOTP secret stored?**
On the `User` row in Postgres, alongside the bcrypt password hash, in a self-hosted database with no third-party access.

### Technical terms in simple language
- **TOTP** — A 6-digit code that changes every 30 seconds, computed from a shared secret and the clock.
- **QR data URL** — A QR image embedded directly in the page as text, so no image file is served.
- **Enrolment** — The one-time process of linking your authenticator app to the account.
- **Denylist** — A server-side list of tokens that are no longer accepted.
- **Lockout** — Being unable to access your own account.

### Explain this page in under 1 minute
"Settings is account self-service. It shows your profile, your role badge and your clearance level, and lets you sign out — which denylists your refresh token on the server rather than just forgetting it in the browser. The main feature is two-factor authentication: press enable, the server generates a TOTP secret and returns a QR code plus the raw secret for devices that can't scan, you enter the six-digit code, and only when that code verifies do we flip the flag — verify-before-enable, so nobody can lock themselves out. New users arriving from sign-up land here with the flow already open, guarded by a ref so React's double effect can't generate two secrets."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"No backup codes — one lost phone and the account is gone."* | Correct, and we state it rather than implying recovery exists. The standard fix is N single-use hashed backup codes issued at enrolment. Today an admin can reset the flag. |
| *"2FA is optional — that's weak for an agency system."* | It is optional in the pilot to keep evaluation frictionless. Making it mandatory for COASTGUARD and ADMIN is a policy flag on the login path, not new code. |
| *"Not much on this page."* | It is deliberately small: profile, role, 2FA, sign out. Preferences that would live here — thresholds, region defaults — are engine configuration, and putting them in a user-level UI would let one user silently change the science for everyone. |

---

## Page 24 — Admin Panel (`/app/admin`)

**File:** `frontend/src/pages/AdminPanel.tsx` · **Min role:** ADMIN

### Purpose
System administration: the user and role table, live service configuration, satellite provider state, the scheduler contract, and the monitored-region registry.

### Modules on this page

#### 24.1 Double-gate refusal panel
Even though `RequireRole minRole="ADMIN"` guards the route, the component **also** checks `me?.role === 'ADMIN'` and renders a refusal card that states plainly: *"The backend enforces this independently — the API returns 403 for non-admin tokens."* Defence in depth, and an explicit teaching statement in the UI.

#### 24.2 System config cards
- **Services** — engine online/offline, queue (BullMQ up / direct mode), classifier mode.
- **Satellite** — provider, live/demo mode, latest scene ID.
- **Scheduler** — the endpoint (`GET /api/pipeline/scheduled-run`), the suggested cadence (every 6 h, since Sentinel-2 revisit is ~5 days), and the guard reminder to set `SCHEDULER_TOKEN` before public exposure.

#### 24.3 Users & roles table
`useAdminUsers()` → `GET /api/auth/users` (admin-only). Columns: user (display name, username, email), role badge, level, and 2FA status. `retry: false`, because a 403 is a real answer and retrying it three times is noise; on error the page says the session may lack a valid admin token and suggests re-authenticating.

#### 24.4 Monitored regions
The five registered regions with code, display name, centre coordinates and zoom level: **MUM** Mumbai Coast (19.076, 72.877), **GOA** Goa Coastline (15.299, 74.124), **KCH** Kochi–Arabian Sea (9.931, 76.267), **CHN** Chennai–Bay of Bengal (13.082, 80.270), **AND** Andaman & Nicobar Sea (11.740, 92.658 — open ocean, no coast meridian).

### Viva questions — Page 24

**Q1. Why check the role in the component when the route already guards it?**
Defence in depth. The route guard is the primary client gate; the component check is a second, and it also lets us show a *useful* refusal explaining that the backend enforces this independently, rather than a bare redirect.

**Q2. Is client-side role checking secure?**
No, and we never rely on it. The Express middleware is the boundary and returns 403 for non-admin tokens regardless of what the browser believes. The client checks exist for UX.

**Q3. Why can't an admin start or stop services here?**
We removed that deliberately. Services are host-owned by `start-all.cmd` and the watchdog and outlive any browser session. A dashboard click must not kill the engine mid-scan. `serviceControl.ts` is now **read-only by design**.

**Q4. How does it know a service is up?**
HTTP probes to `/health` for the engine and Clay; TCP probes for Postgres and Redis. We moved off a bare TCP connect for the engine because a bound-but-hung port reported "up" while real scans failed.

**Q5. What is `SCHEDULER_TOKEN`?**
A shared secret guarding `/api/pipeline/scheduled-run`. The route accepts either that token or a signed-in user, so an expensive satellite scan is never a default-open public trigger that anyone could use to burn our CDSE quota.

**Q6. Why is the suggested cadence 6 hours when the revisit is 5 days?**
Because a region sweep also refreshes drift forecasts, alert states and derived statistics, and different tiles in a region are acquired on different days. Six hours keeps derived state fresh without demanding new imagery every time.

**Q7. What are the five regions and why those?**
MUM, GOA, KCH, CHN and AND — the major Indian coastal zones plus an island sea. Each has a centre, a zoom level and (except Andaman) a coast meridian used for landfall ETA.

**Q8. What is special about Andaman?**
It is open ocean with no coast meridian, so its `coast_lon` is `None`. That exposes our known gap: `nearest_coast_lon` has no distance guard, so an Andaman point currently borrows Chennai's meridian ~1,300 km away. The fix is a maximum-distance check.

**Q9. Can an admin change a user's role from this page?**
The table displays users and roles; role mutation is an API-level operation. We show what exists rather than mocking a control that does not.

**Q10. Why `retry: false` on the users query?**
Because a 403 is a definitive answer. Retrying an authorisation failure three times produces three identical failures and a confusing delay.

**Q11. What else would you add here?**
Role editing, an audit-log viewer (the `AuditLog` table already exists and is append-only), API-key issuance (the `ApiKey` model exists), and region CRUD.

**Q12. How does an admin actually change engine parameters?**
Environment variables — `FDI_THRESHOLD`, `DBSCAN_EPS_DEG`, `PLASTIC_HIGH_CONF`, `INGEST_MAX_CLOUD`, `INGEST_KEEP_SCL`, `DRIFT_HORIZON_HOURS` and so on. Deliberately not in the UI: these change the *science*, and one user silently changing them for everyone mid-session would make results incomparable.

### Technical terms in simple language
- **Defence in depth** — Several independent layers of protection, so one failing does not open the door.
- **403 Forbidden** — "You are authenticated, but not allowed to do this."
- **Health probe** — A small request that checks whether a service is genuinely responding.
- **Cadence** — How often a scheduled job runs.
- **Region registry** — The list of monitored areas with their centres and coastlines.

### Explain this page in under 1 minute
"Admin is the system-owner view. It double-gates itself — the route guard plus a component check — and the refusal card explicitly says the backend enforces this independently and returns 403 regardless. It shows live service state for the engine, queue and classifier, the satellite provider and latest scene, the scheduler contract with its token guard, the users-and-roles table with 2FA status, and the five monitored regions with their centres. What it deliberately does *not* do is start or stop services — those are host-owned and outlive the browser, and a dashboard click must never kill the engine mid-scan."

### What the examiner can challenge — and your best response

| Challenge | Best response |
|---|---|
| *"An admin panel that can't administer much."* | It is read-mostly by design in this pilot, and the two most consequential controls are deliberately absent: service lifecycle (host-owned) and science parameters (environment variables, because one user changing thresholds silently would make everyone's results incomparable). Role editing and audit-log viewing are the obvious next additions, and both tables already exist. |
| *"You show a refusal card instead of hiding the page."* | The route is already gated for non-admins; the card is what an admin-less session sees if it reaches the route, and it is deliberately educational — it tells the reader the server enforces this too. |
| *"Region list is hardcoded."* | It is a registry seeded in the database and read through `/api/regions` — the page renders whatever is registered. Adding a region is a row plus a coast meridian, not a code change. |

---

## Page 25 — 404 / Not Found

**File:** `frontend/src/pages/NotFound.tsx`

### Purpose
Catch any unmatched URL with a branded 404 and a route back into the app, so a mistyped or outdated link never dead-ends.

### Modules
A large gradient "404", a short explanation and a link home. Registered as `<Route path="*">` — the last route, so it only matches when nothing else does.

### Viva questions — Page 25

**Q1. Why does the 404 come last in the route list?**
React Router v6 ranks routes by specificity, but `path="*"` is the explicit catch-all and belongs last so every real route is considered first.

**Q2. Do old links 404?**
No. The seven retired routes — `/app/ops`, `/app/alerts`, `/app/detections`, `/app/hotspots`, `/app/model`, `/app/intelligence`, `/app/reports` — are permanent `<Navigate replace>` redirects to their new homes, so bookmarks from before the 14→10 consolidation still work.

**Q3. What about `/dashboard`?**
It redirects to `/app`, from an even earlier naming.

**Q4. Why `replace` on those redirects?**
So the retired URL does not enter the history stack — otherwise pressing Back would bounce the user through the redirect again.

**Q5. Is the 404 protected?**
No, it is a top-level route, so an unauthenticated visitor hitting a bad URL gets the branded 404 rather than being bounced to login for a page that does not exist.

**Q6. What is the difference between this and the ErrorBoundary?**
The 404 handles "this URL does not exist". The `ErrorBoundary` in `App.tsx` handles "this page crashed or its JavaScript chunk failed to load" and offers a reload — the classic "Failed to fetch dynamically imported module" case after a dev-server restart.

### Explain this page in under 1 minute
"A branded 404 as the catch-all route, with a link home. The interesting part is what *doesn't* reach it: all seven routes we retired during the 14-to-10 page consolidation are permanent replace-redirects to their new homes, so no existing bookmark ever breaks. And a page that crashes or fails to load its chunk hits the app-level error boundary with a reload button instead, not this page."

---
---

# PART D2 — BEHIND-THE-SCREENS MODULES (no UI of their own)

These have no page, but every page depends on them, and the panel will ask.

## D2.1 Backend (Node 20 · Express · TypeScript · Prisma, port 3001)

**13 routers under `/api`:** `auth` · `stats` · `detections` · `hotspots` · `regions` · `alerts` · `satellite` · `pipeline` · `engine` (advanced-feature proxies) · `operations` · `areas` · `export` · `system`

| Service / lib | Role |
|---|---|
| **`pipelinePersist.service.ts`** | **What makes it real-time.** Every run lands as `SatelliteImage` + `Detection`s + `Hotspot`s + `Trajectory` + `Alert`s + `PipelineLog` rows. Region hotspots update **in place by stable label**; AOI hotspots get a run suffix so different drawn boxes never collide. Alerts dedupe per label per 24 h. Strictly **best-effort** — a broken DB never breaks a run. |
| `auth.service.ts` | JWT issue/verify, bcrypt, TOTP, and the refresh-token **denylist** |
| `report.service.ts` | CSV (hand-built, RFC-4180 escaped) and PDF (pdfkit) deliverables |
| `satellite.service.ts` | Provider status + newest scene |
| **`lib/queue.ts`** | BullMQ. Requests enqueue and return immediately; a worker executes engine-call + persist with 3 attempts and exponential backoff. Redis is probed with a 30 s cached throwaway connection; when down, routes fall back to the direct path. **The queue is an upgrade, never a requirement.** Also hosts the repeatable region sweep. |
| **`lib/live.ts`** | WebSocket `/ws/live` broadcasting run / alert / job / schedule events. **Push-only and best-effort** — the UI keeps polling as fallback, so a dropped socket loses immediacy, never data. |
| **`lib/dataMode.ts`** | Live-DB vs bundled-demo, with 30 s health polling that **self-heals mock → db**. Every response carries an `X-Data-Source` header. |
| **`lib/serviceControl.ts`** | **Read-only by design.** HTTP-probes `/health` for engine and Clay; TCP-probes db and redis. |
| `lib/engine.ts` · `env.ts` · `prisma.ts` · `logger.ts` | Engine HTTP client, zero-dependency env loader, Prisma singleton, tiny logger |
| **`data/*.ts`** | `repo.ts`, `operations.repo.ts`, `areas.repo.ts`, `mock.ts`, `users.ts` — every function tries Prisma first and **transparently falls back to an in-memory demo store**, so the entire API works with no database at all. |

## D2.2 Python engine (FastAPI, port 8000 — torch-free)

**`satellite/`** — `download.py` (scene discovery via STAC, ingest orchestration, region registry, synthetic fallback) · `band_loader.py` (the real pixel source: OAuth, evalscript, adaptive grid, native-res tiling, retry) · `cloud_masker.py` (SCL → composition + coverage + reliability grade) · `cloud_filter.py` (the SCL keep-mask) · `fdi_calculator.py` (the core physics) · `threshold_applier.py` (array → candidates + `arr6`) · `spectral_indices.py` · `patch_extractor.py` (64×64 windows for Clay chips) · `landmask.py` (keyless terrain-elevation land/water estimate, also the marine/inland gate) · `geotiff_exporter.py` · `band_normalizer.py` · `band_resampler.py`

**`ml/`** — inference path `model_loader.py` → `inference_engine.py` → `batch_classifier.py`. Post-processing (all **opt-in, default off**): `confidence_filter.py`, `detection_merger.py`, `biofouling_corrector.py`, `area_estimator.py`. Clay layer: `clay_embed.py`, `clay_index.py` (numpy-only cosine index — **engine-safe**), `embedding_spool.py`, `embed_hotspots.py`, `hotspot_embeddings.py`, `similarity_service.py`, `site_change.py`, `confidence_fusion.py`. Training/validation (offline, GPU env): `train_perpixel_gpu.py` (the live model's trainer), `train_patch_cnn.py` (the ResNet that **lost** and was honestly not shipped), `train_clay_head.py`, `tune_clay_threshold.py`, `tune_fusion.py`, `validate_plp.py`, `validate_plp_clay.py`, `validate_drift.py`, `datasets/`.

**`hotspot/`** — `dbscan_clusterer.py` (DBSCAN implemented from scratch, no scikit-learn), `severity_scorer.py`, `alert_trigger.py`, `hotspot_storage.py`.

**`trajectory/`** — `forecast.py` (forcing resolution), `gridded_forcing.py` (CMEMS), `data_interpolator.py` (Open-Meteo point), `lagrangian_model.py` (RK4), `ensemble_model.py` (mean + cone), `eta_calculator.py`, `landfall.py`, `path_clamp.py`, `back_tracker.py`, `coastline_loader.py`, `trajectory_storage.py`.

**`api/`** — `health_route.py`, `predict_route.py`, `stream_route.py`, `forecast_route.py`, `analysis_route.py`, `similarity_route.py`, `model_route.py`, `export_route.py`, `system_route.py`.

> **A hard-won rule encoded in every route:** any route whose body blocks (satellite fetch, STAC, ONNX, DBSCAN) is declared plain `def`, **not** `async def`. Previously every route was `async def` and none used `await`, so a single scan froze the entire single-worker uvicorn — `/health` blipped to **2703 ms** and the watchdog thought the engine was dead. It was never dying; it was *blocked*. As plain `def`, FastAPI runs them in its threadpool. Measured after the fix: worst `/health` **72 ms across 34 probes during a real 29 s scan**.

## D2.3 Database (PostgreSQL + Prisma) — 18 models

| Group | Models |
|---|---|
| **Core science** | `Region`, `SatelliteImage`, `Detection`, `Hotspot`, `Trajectory`, `Alert`, `PipelineLog`, `ModelVersion` |
| **Identity** | `User`, `UserRegion`, `RefreshToken`, `ApiKey`, `AuditLog` (append-only) |
| **Operations** | `Operation`, `OperationEvent`, `MissionReport` |
| **Study areas** | `SavedArea`, `AreaForecast` |

Two schema decisions to be able to defend: `Operation.hotspotId`/`detectionId` are **soft references** with a location snapshot (hotspots are recomputed every run; a cascading FK would delete completed operations), and `AreaForecast` is **append-only history** (so successive forecasts over the same water stay comparable — which is what makes the drift model auditable rather than a one-shot number).

---
---

# PART E — COMPLETE PROJECT WORKFLOW (END TO END)

## E.1 The one-paragraph version

A user draws a box on the map. The browser asks the backend to run the pipeline for that box. The backend either queues the job or calls the Python engine directly. The engine downloads real Sentinel-2 pixels for exactly that box, works out how much of it is water, computes the Floating Debris Index to find candidate pixels, classifies each candidate with a trained MLP ensemble into plastic / algae / foam / water, clusters only the high-confidence plastic into hotspots, sends each hotspot's image chip to a Clay foundation model on the GPU for a second opinion, forecasts 72 hours of drift with an ensemble of ocean currents and windage, and raises alerts for anything severe or coast-bound. The backend writes every row to PostgreSQL and pushes an event over a WebSocket. The browser draws the markers, the hotspots and the drift cone — and labels every claim with where it came from.

## E.2 Walkthrough A — Analyst draws a box (the main flow)

```
1. USER            Map Explorer → "Draw area" → drags a rectangle
                   AoiSelector normalises it to {north, south, east, west}

2. FRONTEND        useAoiAnalysis (TanStack Query, key = bbox + run options)
                   POST /api/pipeline/run  { bbox, sceneSize, opts }     [auth required]
                   (optional) GET /api/pipeline/stream → SSE → live stage strip

3. BACKEND         Redis up?  → enqueue BullMQ job, return 202
                   Redis down? → call the engine directly, 120 s timeout

4. ENGINE          POST /pipeline/run → run_aoi(bbox)

   ┌ Stage 1  DOWNLOAD ──────────────────────────────────────────────────────┐
   │ CDSE OAuth2 (token cached) → Sentinel Hub Process API                   │
   │ → float32 GeoTIFF, 6 channels: B04 B06 B08 B8A B11 SCL                  │
   │ → decoded with tifffile (pure numpy — no GDAL/rasterio)                 │
   │ → adaptive resolution ~20 m/px; native-res tiling ≤9 tiles for medium   │
   │ → leastCC mosaic, INGEST_MAX_CLOUD=50, 45-day window (→180 if coverage  │
   │   is low, NOT if land-dominated)                                        │
   │ OUT: SceneData carrying ITS OWN surface/mask (no module globals)        │
   └─────────────────────────────────────────────────────────────────────────┘
   ┌ Stage 1b SURFACE + RELIABILITY ─────────────────────────────────────────┐
   │ SCL → water/land/cloud/other % over OBSERVED pixels only (0/1 excluded) │
   │     → coverage_pct  → reliability grade reliable/degraded/unusable      │
   │ SCL composite cloud % is AUTHORITATIVE over the STAC tile cloud %       │
   └─────────────────────────────────────────────────────────────────────────┘
   ┌ Stage 2  FDI ───────────────────────────────────────────────────────────┐
   │ FDI = B08 − [B06 + (B11−B06) × ((λ8−λ6)/(λ11−λ6)) × 10]                 │
   │ candidate ⟺ FDI > 0.02  AND  SCL ∈ {6 water, 7 unclassified}            │
   │ OUT: ≤500 candidates (even striding) + arr6 (H,W,6)                     │
   └─────────────────────────────────────────────────────────────────────────┘
   ┌ Stage 3  CLASSIFY (labelled CNN, actually an MLP ensemble) ─────────────┐
   │ 11 features: B04 B06 B08 B8A B11 FDI NDVI PI MNDWI NDVI_RE BRIGHT       │
   │ ONNX Runtime (CUDA provider if available, robust CPU fallback)          │
   │ 3-seed 256-128-64-32 MLP ensemble → Plastic/Algae/Sea_Foam/Water        │
   │ TWO-TIER: P(plastic) ≥ 0.648 → HIGH (~90% precision) else CANDIDATE     │
   └─────────────────────────────────────────────────────────────────────────┘
   ┌ Stage 4  DBSCAN ────────────────────────────────────────────────────────┐
   │ HIGH-confidence plastic ONLY. eps 0.09°, min_samples 3                  │
   │ severity: ≥10 HIGH · ≥5 MEDIUM · ≥3 LOW                                 │
   │ No plastic clears the bar → NO hotspot (never falls back to all plastic)│
   │ (spool) 64×64×5 chips queued to models/embed_queue/                     │
   └─────────────────────────────────────────────────────────────────────────┘
   ┌ Stage 4b CLAY VERIFY ───────────────────────────────────────────────────┐
   │ chip → POST :8010/embed → 1024-d Clay v1.5 embedding (~36 ms warm)      │
   │ k-NN vs reference index → plastic affinity (similarity-weighted share   │
   │   of the 10 nearest that are Plastic) + novelty/anomaly score           │
   │ fuse(MLP conf, affinity, novelty) → CONFIRMED (P 0.9219 / R 0.7037)     │
   │                                    or POSSIBLE (the wider net)          │
   │ sidecar down → MLP-only, and the stage SAYS SO                          │
   └─────────────────────────────────────────────────────────────────────────┘
   ┌ Stage 5  DRIFT ─────────────────────────────────────────────────────────┐
   │ forcing: gridded CMEMS (sampled ALONG the moving track) → point         │
   │          Open-Meteo → synthetic (labelled)                              │
   │ RK4, 1-hour step, 4 windage members 1.5/2/2.5/3 %                       │
   │   new_velocity = current + windage × wind                               │
   │ → mean path + per-hour min/max CONE                                     │
   │ → coast ETA, landfall probability (computed on RAW path, pre-clamp)     │
   │ → path clamp at coast (AGGREGATE only, never members) — clamp=False AOI │
   │ → back-track (deliberately UNclamped: backwards land = a source)        │
   └─────────────────────────────────────────────────────────────────────────┘
   ┌ Stage 6  ALERT ─────────────────────────────────────────────────────────┐
   │ HIGH/MEDIUM hotspots → alert candidates                                 │
   │ type = COAST_PROXIMITY if landfall ETA ≤ 48 h, else HOTSPOT             │
   └─────────────────────────────────────────────────────────────────────────┘

5. BACKEND         persistRun() → SatelliteImage + Detections + Hotspots +
                   Trajectory + Alerts + PipelineLog   (best-effort, never
                   breaks a run; alerts dedupe per label per 24 h)
                   publishLive() → WebSocket /ws/live broadcast

6. FRONTEND        markers (SUPPRESSED if the scan grades unusable),
                   heatmap, hotspot circles, drift cone,
                   legend "N high-confidence (~90% precise) · M candidate",
                   reliability banner, 7 stage tiles with real durations
                   WebSocket event → invalidate queries → every list updates
```

## E.3 Walkthrough B — Saving an area and forecasting drift

```
Map Explorer "Save area"  → POST /api/areas (FIELD+) → SavedArea row with the
                            bbox, run options and the FULL result JSON

Areas page → pick horizon (24/48/72/120/240 h) → POST /api/areas/:id/forecast

  Release point resolution (BACKEND, not the browser):
     body coords → strongest plastic hotspot → highest-confidence plastic
     detection → else HTTP 422.   NEVER the AOI centroid.

  → Engine POST /forecast/trajectory
       _is_marine() elevation gate → 422 if inland (>10 m ⇒ landlocked)
       forcing: gridded CMEMS → point Open-Meteo → synthetic
       RK4 windage members → mean + cone
       ETA + landfall probability on the RAW path
       → clamp the aggregate → back-track

  → Backend stores WHAT THE ENGINE RETURNED (never a client-supplied path)
  → AreaForecast row APPENDED (history preserved, never overwritten)

  → Frontend: verdict hero, risk meter, drift map with every stored run
    (newest solid, older faded), ensemble-agreement card, printable brief
    — all gated by areaHasPlasticToForecast() so a stale forecast on an
      algae-only or inland area NEVER renders
```

## E.4 Walkthrough C — Continuous scanning (opt-in)

```
Internal:   SCHEDULER_ENABLED=1 → startScheduler() registers a repeatable
            BullMQ sweep every SCAN_INTERVAL_MINUTES (default 360)
            → sweep fans out one 'region' job per DB region
            → worker: runOnEngine → persistRun → publishLive

External:   GET/POST /api/pipeline/scheduled-run
            (GitHub Actions cron / cron-job.org / Windows Task Scheduler)
            guarded by SCHEDULER_TOKEN or a signed-in user —
            no default-open expensive-scan trigger
```

## E.5 Walkthrough D — The active-learning loop (how the model improves)

```
Pipeline run → Detection rows written with status = PENDING
     ↓
Analyst opens Active Learning (ADMIN) or Detection Detail (COASTGUARD+)
     ↓
Marks CONFIRMED (real plastic) or FALSE_ALARM (not plastic)
     ↓  POST /api/detections/:id/label   → 6 query caches invalidated
Retrain-readiness bar counts toward 50 labels
     ↓
"Export labelled set" → CSV of CONFIRMED + FALSE_ALARM
     ↓
ml/train_perpixel_gpu.py  (offline, GPU env)
   focal loss + class-balanced weights + 256-128-64-32 + calibration
   → 3 seeds → averaged logits → ONNX export with parity check (=1.0)
     ↓
Held-out evaluation gate — promote ONLY if it does not get worse
   (we have EXERCISED this gate: the PLP-augmented model was rejected,
    plastic precision 0.776 → 0.660 for +2/33 recall)
     ↓
Drop marinenet.onnx into python_engine/models/ → model_loader picks it up
     ↓
AI Lab shows the new numbers; "Evaluate" re-scores it live on demand
```

## E.6 Failure behaviour — what happens when each piece dies

| What dies | What happens | Where the user sees it |
|---|---|---|
| Clay sidecar | Scan continues MLP-only | CLAY stage says "Clay OFFLINE — MLP-only"; provenance chip amber; Pipeline tile shows "skipped" |
| Redis | Runs go direct instead of queued | Toast says "(direct mode)"; queue chip amber |
| PostgreSQL | API falls back to an in-memory demo store | `X-Data-Source` header → header badge "Offline · mock"; `DATA_STRICT=1` disables this and fails fast |
| Python engine | Reads still work from the DB; scans fail loudly | Provenance strip "engine unreachable"; Run button disabled; error card with retry |
| Backend | Offline demo session; browsing only, no writes | Header badge "Offline · mock" |
| CDSE credentials | Deterministic synthetic scene | Labelled "synthetic placeholder" in the surface readout and the stage detail |
| Trained model missing | Interpretable FDI/NDVI heuristic | Amber "heuristic" badges + a full warning banner on Model Health; `REQUIRE_MODEL=1` refuses to start instead |
| WebSocket | Polling continues | Badge reads "reconnecting · checking on a timer" |

**The design principle behind that whole table:** *every degradation is graceful, and every degradation is labelled.* The failure we consider worst is not a crash — it is a capability that is silently off while the UI still looks healthy. We shipped that bug (Clay off for every scan; the engine running the heuristic while metrics advertised the trained model) and the provenance strip, the always-emitted CLAY stage and the `REQUIRE_MODEL` flag are the fixes.

---
---

# PART F — 4-MEMBER PRESENTATION PLAN

> **Adapt the names to who actually built what.** The split below is by *system layer*, which is the cleanest way to divide a full-stack + ML project, and it guarantees no two people can be asked the same question and give different answers.

## F.1 The split at a glance

| # | Member | Owns | Pages to know cold | The one number they own |
|---|---|---|---|---|
| 1 | **Nimisha Nair** | Problem, data & remote sensing (Stages 1–2) | Landing, About, Docs, FAQ, Compliance, Map Explorer (ingest + surface) | **10 m pixel · 5-day revisit · FDI > 0.02** |
| 2 | **Darshan Gadekar** | ML — classification, Clay, active learning (Stages 3, 4b) | AI Lab, Active Learning, Records, Detection Detail | **macro-F1 0.8175 · HIGH tier 0.648 ≈ 90 % precision · CONFIRMED 0.9219** |
| 3 | **Krushna Taiwade** | Clustering, drift physics & alerting (Stages 4, 5, 6) | Areas, Hotspot Detail, Pipeline, Command Center (gauge) | **DBSCAN eps 0.09° min 3 · RK4 1 h · windage 1.5–3 % · 72 h** |
| 4 | **Nalaksh Randhawa** | Platform — backend, DB, auth, real-time, frontend architecture | Command Center, Field Ops, Analytics & Reports, Settings, Admin, Login | **5 processes · 18 tables · 3 roles · 13 routers** |

## F.2 Suggested 15-minute demo script

| Time | Who | What they do |
|---|---|---|
| 0:00–1:30 | **All / Member 1** | Problem + one-line pitch + the honesty framing ("we complement patrols, we don't replace them"). Show Landing: seven stages, live counters, the 0.82 / ~90 % / ₹0 band. |
| 1:30–4:00 | **Member 1** | About + Map Explorer: draw a box over open sea. **While the scan runs**, explain ingest — CDSE OAuth, six bands, adaptive resolution, SCL cloud/land masking — and FDI with the formula. Then show the surface readout. Then draw a box over land and show that markers are **suppressed**. |
| 4:00–7:00 | **Member 2** | The scan has finished. Explain the 11 features, the 3-seed MLP ensemble, and the two tiers on the legend. Open a hotspot popup → CONFIRMED vs POSSIBLE. Go to **AI Lab**: macro-F1 first, confusion matrix, then press **Evaluate** and let the panel watch the number compute live. Finish with the PLP 0/33 honesty slide. |
| 7:00–10:00 | **Member 3** | Back to the map: DBSCAN parameters and why only HIGH-confidence plastic is clustered. Then **Areas**: open a saved area, run a 72-hour forecast, explain the cone, landfall probability, the release-point rule and the two guards (no plastic → 422; inland → elevation gate). Show the append-only history and ensemble agreement. |
| 10:00–13:00 | **Member 4** | **Command Center**: the situation gauge (expand "what drives this?"), the provenance strip, the live WebSocket feed. Press **Run all regions** and let an event land. Then **Field Ops**: dispatch from a hotspot, advance the status, file a mission report with kilograms recovered. Then show the role gate — sign in as FIELD and watch four pages disappear. |
| 13:00–15:00 | **All** | Limitations slide, roadmap (oil spills / HABs / coastal flooding on the same spine), and Q&A. |

## F.3 Rules for the team during Q&A

1. **The owner answers first.** If a question lands on someone else's layer, say *"that's the detection side — [name] built it"* and hand over. A confident hand-off reads better than a vague answer.
2. **Everyone can answer the [10 golden sentences](#the-10-golden-sentences).** Those are shared, not owned.
3. **Never round a number upward.** Say 0.82, not "about 0.9". Say 0/33, not "it struggles a bit".
4. **If you don't know, say so and say what you'd check.** *"I don't know that off-hand — it's in `models/metrics.json` and I can show you."*
5. **Volunteer a limitation before you are asked for one.** It converts a challenge into a strength every time.
6. **If a panelist is wrong, be polite and factual.** *"That's a reasonable read — what we actually measured was X, and here's the file."*

---
---

# PART G — INDIVIDUAL CONTRIBUTION PREPARATION

Every member will be asked **"what was *your* contribution?"** The structure that works is: **one-line claim → what you built → the hardest problem you solved → the number you own → what you'd do next.** The hardest-problem story is what separates a good answer from a memorised one — it proves you were actually there.

## G.1 Member 1 — Problem, data & remote sensing

**One-line claim:** *"I own everything from the satellite to the candidate pixel — data acquisition, cloud and land masking, and the Floating Debris Index."*

**What I built:** CDSE / Sentinel Hub OAuth2 ingest with token caching; the six-band evalscript (B04, B06, B08, B8A, B11, SCL); adaptive resolution and native-resolution tiling; cloud gating with a `leastCC` mosaic; the SCL surface classifier, coverage percentage and reliability grading; the FDI implementation, threshold and SCL keep-mask; the honest synthetic fallback.

**Hardest problem — the "LAND 0 %" bug:** a half-land bounding box was reporting *land 0 %*. The cause was that a `leastCC` composite leaves nodata wherever no clear pass existed, and we were computing composition over the **full grid**, which diluted every real category toward zero. The fix was to compute over **observed pixels only** (excluding SCL 0/1) and expose `coverage_pct` separately as its own reliability signal. In the same investigation I found we were trusting the STAC tile cloud percentage over the composite we had actually classified — a tile can read 100 % cloud while the composite is ~9 % — so I made the **SCL composite cloud figure authoritative**.

**Second story — dropping SCL class 2:** class 2 ("dark area") was in our keep-mask and was the single largest land and haze false-positive leak, because it is mostly terrain and cloud shadow. I removed it, kept it revertible behind `INGEST_KEEP_SCL`, and the land false positives dropped substantially.

**The number I own:** 10 m pixel · ~5-day revisit · FDI threshold 0.02 · keep-mask {6, 7} · max cloud 50 % · 45-day window widening to 180 only when coverage is low.

**What I'd do next:** a proper coastline polygon instead of the coast meridian, and PlanetScope 3 m for sub-pixel targets.

## G.2 Member 2 — Machine learning (classification, Clay, active learning)

**One-line claim:** *"I own the models — the per-pixel classifier, the Clay verification tier, and the honesty of every number we publish."*

**What I built:** the 11-feature spectral contract; the training pipeline in `train_perpixel_gpu.py` (focal loss, class-balanced effective-number weights, 256-128-64-32 network, folded per-class bias calibration, 3-seed ensemble, ONNX export with a parity check); ONNX Runtime inference with CUDA auto-selection and CPU fallback; the two-tier confidence system; the Clay embedding path, the numpy-only cosine index, the plastic-affinity and novelty scores, and confidence fusion; the active-learning loop and the AI Lab surfaces.

**Hardest problem — the ensemble trade:** our single best model scored macro-F1 0.824, but its plastic precision was only 0.652, which is unacceptable operationally — you cannot send a boat on a coin flip. I trained three seeds and averaged logits. Macro-F1 went *down* slightly to 0.8175, but **plastic F1 rose 0.742 → 0.799, plastic precision 0.652 → 0.776, and the water false-positive rate on brand-new seas fell from 3 % to 0.7 %**. I argued for promoting the model with the *lower* headline metric because precision is what the user actually needs, and I can show the numbers on both sides.

**Second story — the negative result I refused to hide:** against real deployed HDPE targets (Plastic Litter Project 2021) the model detects 0 of 33. I tested the obvious fix — retrain including PLP — and it dropped plastic precision from 0.776 to 0.660 while lifting deployed-target recall only to 2/33. Teaching water-like spectra as "plastic" just buys false positives. I did not promote it, and I put the result on the AI Lab page rather than in a footnote. It is a **resolution limit, not a data limit** — the targets are 3.5–14 m in a 10 m pixel.

**Third story — the silent heuristic:** the engine was running the interpretable fallback rather than the trained model for a period, because `onnxruntime` was missing from the interpreter actually serving uvicorn, so the lazy import failed and it degraded quietly **while `metrics.json` still advertised the trained model's numbers**. I added the `REQUIRE_MODEL=1` flag that refuses to start in un-benchmarked mode, the heuristic-mode banners, and a thread-safe load lock so a second concurrent scan cannot observe a half-loaded state and silently fall back.

**The number I own:** macro-F1 0.8175 · accuracy 0.9899 (Water-inflated) · Plastic P 0.776 / R 0.824 / F1 0.799 · HIGH tier at 0.648 ≈ 90 % precision, 57 % recall · CONFIRMED 0.9219 precision / 0.7037 recall · Clay's own plastic F1 0.37 · patch CNN 0.555 (not shipped).

**What I'd do next:** uncertainty-first ordering in the review queue, a Clay head trained on more labelled chips, and multi-temporal fusion.

## G.3 Member 3 — Clustering, drift physics & alerting

**One-line claim:** *"I own everything after a pixel is classified — how detections become an actionable hotspot, where that hotspot goes over the next three days, and when that becomes an alert."*

**What I built:** DBSCAN implemented from scratch (no scikit-learn dependency); severity scoring; the drift stack — forcing resolution (gridded CMEMS → point Open-Meteo → synthetic), the RK4 integrator, the windage ensemble, mean-and-cone aggregation, coast ETA, landfall probability, path clamping and back-tracking; the alert trigger and its typing; the Areas forecast surfaces and the Command Center situation gauge.

**Hardest problem — the drift that ran inland:** a Mumbai release with a 15-hour landfall ETA was drawing a path that ended around 19.33 N / 73.22 E — well inland. A beached parcel does not keep drifting. Clamping sounds trivial but has two traps. First, if you clamp the individual **ensemble members** you get ragged arrays that silently drop hours or throw an `IndexError` in `mean_and_cone` — so I clamp the **aggregated mean and cone only**. Second, if you clamp before computing ETA and landfall probability you destroy the very quantities you want — so both are computed on the **raw** path *before* clamping, which makes them correct by construction. I also made the payload self-describing with `pathEndHours`, `pathEndReason`, `coastLon` and `coastModel`. In the same work I found a snake_case/camelCase mismatch that meant the on-demand forecast **cone had never rendered at all**.

**Second story — senseless drift:** we were producing confident 72-hour trajectories from the centre of an AOI that contained no plastic at all — including inland reservoirs. A drift model advects plastic parcels; with no plastic there is nothing to advect. I implemented the release-point resolution chain (body coordinates → strongest plastic hotspot → highest-confidence plastic detection → **422**), the `_is_marine()` elevation gate for inland points, and — because guarding *creation* left stale rows still rendering — the `areaHasPlasticToForecast()` **display** gate that silences every forecast surface at once.

**Third story — RK4 over Euler:** the original integrator was forward Euler, which accumulates truncation error on curved current paths over a 72-hour horizon. I moved to fourth-order Runge–Kutta at a one-hour step, which is the standard choice for Lagrangian advection.

**The number I own:** DBSCAN eps 0.09° / min_samples 3 · severity ≥10/≥5/≥3 · RK4 at 1 h · windage 1.5 / 2 / 2.5 / 3 % · 72 h default horizon (24–240 selectable) · COAST_PROXIMITY at ETA ≤ 48 h · alert dedupe per label per 24 h.

**What I'd do next:** validate ETAs against real drifter tracks with the Liu–Weisberg skill score (`validate_drift.py` is already written), add a distance guard to `nearest_coast_lon`, and use a real coastline polygon.

## G.4 Member 4 — Platform (backend, database, auth, real-time, frontend architecture)

**One-line claim:** *"I own everything that makes it a product rather than a script — the API, the database, authentication and roles, the queue, the real-time layer, and the frontend architecture."*

**What I built:** the Express + Prisma backend with 13 routers; the 18-model schema; JWT + bcrypt + TOTP authentication and three-tier RBAC; `pipelinePersist.service.ts`; the BullMQ queue with its Redis-optional fallback; the WebSocket live feed and the SSE proxy; `dataMode` with `X-Data-Source` and self-healing; the read-only service health probes; CSV/PDF/GeoTIFF/GeoJSON exports; and on the frontend, the routing, the ~45 TanStack hooks, the two Zustand stores, the design system and the 14→10 information-architecture consolidation.

**Hardest problem — the refresh-token bug:** the app was silently losing **write** access. Scans, acknowledgements and dispatch would 401, but public reads kept working — so everything *looked* healthy and nothing pointed at auth. The cause was that we kept an in-memory **allowlist** of valid refresh JTIs, and dev runs `tsx watch`, so *every code edit* restarted the backend and wiped it. Every outstanding refresh token instantly read as "reused/revoked". I inverted it to a **denylist**: a fresh token is valid by signature and 7-day expiry, rotation denylists the old JTI so one-time use is preserved, and logout denylists so revocation is preserved. A restart now fails **open** rather than closed. The general lesson I took from it: *a security store that fails closed on restart is a denial-of-service against your own users* — and I can state the production upgrade (move the denylist to Redis) rather than pretend the trade-off does not exist.

**Second story — health checks that lied:** our service chips reported the engine as "up" while real scans failed with "engine unreachable". A bare TCP connect only proves a port is **bound**, not that the process is **serving**. I moved the engine and Clay probes to an HTTP `/health` request. Separately, the Clay probe was costing a full second per call because a dead loopback port whose SYN is *dropped* costs the whole timeout — and `/capabilities` polls it. I added a **negative-only** 30-second cache: a live sidecar still answers in ~1 ms, and a dead one is remembered. That took the endpoint from **1035 ms to 3.6 ms**.

**Third story — the fake-async freeze:** a single scan was freezing the entire engine. Every FastAPI route was declared `async def` and **none of them used `await`** — so blocking work (satellite fetch, ONNX, DBSCAN) ran on the event loop of a single-worker uvicorn. `/health` blipped to 2703 ms and the watchdog concluded the engine was dead; it was never dying, it was *blocked*. Declaring the blocking routes as plain `def` lets FastAPI run them in its threadpool. Measured after: worst `/health` **72 ms across 34 probes during a real 29-second scan**.

**Fourth story — the snapshot that showed the wrong area:** Map Explorer was painting the **previous** area's detections before the new scan ran. The session-restore guard re-derived its comparison key from mutable current state, so a new box was effectively compared against itself and always matched, and `staleTime` then suppressed the refetch. I added a `snapshotKey` provenance field, bumped the persist version to 2 with a migration that drops key-less rows (fails closed), added a visible "restored — not re-scanned" badge, and wrote regression tests. The rule I extracted: *any cache or snapshot restored into a UI must store the key it was computed for — never re-derive that key from mutable current state.*

**The number I own:** 5 processes (frontend 5173, backend 3001, engine 8000, Clay 8010, Postgres 5432, Redis 6379) · 18 Prisma models · 13 routers · 3 roles enforced in 4 places · ~45 query hooks.

**What I'd do next:** move the denylist to Redis, add HttpOnly cookie auth with CSRF, enable PostGIS, and add a `scan_snapshot` table so AOI-level scheduled monitoring becomes possible without overwriting history.

## G.5 Answers everyone must be able to give about their own work

- **"What would you do differently?"** — Name one real thing. Member 1: enable PostGIS from day one. Member 2: build the uncertainty ranking before the labelling UI. Member 3: validate drift against drifter tracks before building the ensemble-agreement card. Member 4: put the token denylist in Redis from the start.
- **"What's the weakest part of your component?"** — Have it ready and say it first. It is always better coming from you.
- **"Show me the code."** — Know the file path for your three most important modules. Being able to say *"that's `python_engine/trajectory/path_clamp.py`"* without looking is worth a lot.

---
---

# PART H — FINAL VIVA CHEAT SHEET

## H.1 Project summary

**Marine Plastic Tracker** turns free Sentinel-2 satellite imagery into marine-plastic detections and 72-hour drift forecasts for the Indian Ocean, delivered as an operational console for INCOIS, NCCR and the Indian Coast Guard. It runs end-to-end on free data at ₹0.

Seven pipeline stages: **DOWNLOAD → FDI → CLASSIFY (MLP) → DBSCAN → CLAY VERIFY → DRIFT → ALERT.**

The thesis is **operational and transparency-led, not algorithmic-novelty-led.** It does not beat state-of-the-art detection papers. It is the only end-to-end agency console in this space with per-stage live/demo tagging, a two-tier confidence system, a foundation-model verifier in the path, a closed active-learning loop, and a field-operations workflow that ends in kilograms recovered.

## H.2 Architecture summary

| Process | Port | Stack | Role |
|---|---|---|---|
| Frontend | 5173 | React 18 · Vite · TypeScript · Tailwind · Leaflet | Analyst console |
| Backend | 3001 | Node 20 · Express · TypeScript · Prisma | Auth, RBAC, persistence, queue, exports |
| Python engine | 8000 | Python 3.14 · FastAPI · numpy + onnxruntime, **no torch** | All the science |
| Clay GPU sidecar | 8010 | Python · PyTorch (RTX 4050) | Foundation-model embeddings |
| PostgreSQL | 5432 | Portable cluster | System of record, 18 tables |
| Redis | 6379 | Portable | BullMQ job queue (optional) |

**The key architectural decision — the torch-free split.** The ₹0 engine is torch-free. Clay is 4.8 GB of PyTorch and cannot live inside it, so it became a stdlib-HTTP sidecar exposing only `/embed` and `/health`, called over loopback. Searching the embedding index needs no torch; only *generating* an embedding does. If the sidecar is down, every scan degrades to MLP-only **and says so**.

## H.3 Module summaries (one line each)

| Module | One line |
|---|---|
| `band_loader.py` | The real pixel source: CDSE OAuth, evalscript, adaptive grid, native-res tiling |
| `cloud_masker.py` | SCL → water/land/cloud % over observed pixels + coverage + reliability grade |
| `cloud_filter.py` | The candidacy keep-mask: which SCL classes may host a detection ({6,7}) |
| `fdi_calculator.py` | The core physics — Floating Debris Index, vectorised |
| `threshold_applier.py` | Array → ≤500 candidate pixels + `arr6` |
| `model_loader.py` | ONNX registry, model card, GPU/CPU provider, strict mode, thread-safe load lock |
| `inference_engine.py` | 11-feature engineering, softmax, heuristic fallback |
| `batch_classifier.py` | The classify stage; tags the HIGH-confidence tier |
| `dbscan_clusterer.py` | DBSCAN from scratch — eps 0.09°, min_samples 3, HIGH plastic only |
| `severity_scorer.py` | ≥10 HIGH · ≥5 MEDIUM · ≥3 LOW |
| `clay_live.py` / `clay_service.py` | Chip → GPU sidecar → 1024-d Clay v1.5 embedding |
| `clay_index.py` | Numpy-only cosine index: find_similar, knn_predict, anomaly_score |
| `confidence_fusion.py` | MLP conf + plastic affinity + novelty → CONFIRMED / POSSIBLE + a human reason |
| `site_change.py` | Temporal change with no new downloads — intensifying/clearing/shifted/stable |
| `forecast.py` | Forcing resolution: gridded CMEMS → point Open-Meteo → synthetic |
| `lagrangian_model.py` | RK4 at 1 h, one track per windage member |
| `ensemble_model.py` | Members → mean path + per-hour min/max cone |
| `eta_calculator.py` / `landfall.py` | Direction-aware coast crossing; landfall probability from member fraction |
| `path_clamp.py` | Halt the drawn path at the coast — aggregate only, ETA computed pre-clamp |
| `back_tracker.py` | Reverse-time integration for source attribution — deliberately unclamped |
| `alert_trigger.py` | HIGH/MEDIUM → alert; COAST_PROXIMITY if ETA ≤ 48 h |
| `pipelinePersist.service.ts` | Every run → rows; hotspots update in place; alerts dedupe per 24 h; best-effort |
| `auth.service.ts` | JWT + bcrypt + TOTP + the refresh-token **denylist** |
| `lib/queue.ts` | BullMQ — an upgrade, never a requirement |
| `lib/live.ts` | WebSocket `/ws/live` — push improves latency, never correctness |
| `lib/dataMode.ts` | Live-DB vs demo, self-healing, `X-Data-Source` on every response |
| `config/nav.ts` | One navigation source for sidebar + palette + role gating |
| `stores/mapStore.ts` | Session restore **with provenance keys** |
| `lib/classColors.ts` | One palette — Algae recoloured to lime so it never reads as plastic teal |

## H.4 Technologies used

**Frontend:** React 18 · TypeScript · Vite · Tailwind CSS · React Router v6 · TanStack Query v5 · Zustand (+persist) · Framer Motion · Leaflet + react-leaflet + leaflet.heat · Recharts · Axios · lucide-react · react-hot-toast · Vitest

**Backend:** Node 20 · Express · TypeScript · Prisma · PostgreSQL · Redis + BullMQ · `ws` · pdfkit · bcrypt · jsonwebtoken · TOTP

**Engine:** Python 3.14 · FastAPI · uvicorn · numpy · onnxruntime · tifffile · Pydantic · `copernicusmarine`

**GPU / training:** PyTorch · Clay v1.5 foundation model · ONNX export with parity check · CUDA (RTX 4050)

**Data:** Sentinel-2 L2A via Copernicus Data Space (Sentinel Hub Process API, OAuth2) · Element84 Earth Search STAC (AWS Open Data, keyless) · Open-Meteo Marine + Forecast (keyless) · CMEMS / Copernicus Marine · MARIDA + MADOS + RefinedFloatingObjects + PLP datasets · Esri World Imagery basemap

## H.5 Important APIs

**Backend (`:3001`)**

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/api/auth/login` | Login → JWT pair (or `needsTotp`) | — |
| POST | `/api/auth/register` · `/refresh` · `/logout` | Account + token lifecycle | mixed |
| POST | `/api/auth/2fa/setup` · `/2fa/enable` · `/2fa/disable` | TOTP | ✔ |
| GET | `/api/stats/overview` · `/trend` · `/by-region` · `/by-class` | Aggregates | — |
| GET | `/api/detections` · `/api/detections/:id` | Detection catalogue | — |
| POST | `/api/detections/:id/label` | Analyst validation | ✔ CG+ |
| GET | `/api/detections/training-labels` | Active-learning CSV | ✔ CG+ |
| GET | `/api/hotspots` · `/api/hotspots/:id` | Clusters | — |
| GET | `/api/alerts` · PATCH `/api/alerts/:id/ack` | Alert inbox | ack ✔ |
| POST | **`/api/pipeline/run`** | **Run the pipeline (region or AOI)** | ✔ |
| GET | **`/api/pipeline/stream`** | **SSE — one event per stage** | — |
| GET/POST | `/api/pipeline/scheduled-run` | External cron trigger | token or ✔ |
| GET | `/api/pipeline/status` · `/logs` | Engine + model + queue state | — |
| GET/POST/PATCH/DELETE | `/api/areas` · `/:id` | Saved study areas | writes ✔ |
| POST | **`/api/areas/:id/forecast`** | **Server-side 72 h drift → appended history** | ✔ |
| GET/POST/PATCH | `/api/operations` · `/:id/status` · `/:id/report` | Field operations | writes ✔ |
| GET | `/api/satellite/status` · `/scenes` | Provider + scene inventory | — |
| GET | `/api/system/services` | Read-only health probes | ✔ |
| POST | `/api/engine/forecast/trajectory` · `/backtrack` · `/change` · `/indices` · `/export/geotiff` | Engine proxies | mixed |
| GET | `/api/engine/capabilities` · `/model/evaluate` · `/model/validation` · `/similarity/*` | Engine proxies | — |
| WS | `/ws/live` | run / alert / job / schedule events | — |

**Engine (`:8000`)** — `/health`, `/capabilities`, `/metrics`, `/pipeline/run`, `/pipeline/batch`, `/pipeline/last`, `/pipeline/stream`, `/compute/fdi`, `/compute/drift`, `/compute/indices`, `/compute/change`, `/forecast/trajectory`, `/forecast/backtrack`, `/model/info`, `/model/evaluate`, `/model/validation`, `/similarity/info|search|demo|hotspot|change|sites`, `/export/geotiff`, `/satellite/scenes`

**Clay sidecar (`:8010`)** — `/embed`, `/health`

## H.6 Scientific constants (memorise this table)

| Parameter | Value | Env var |
|---|---|---|
| FDI threshold | **0.02** | `FDI_THRESHOLD` |
| SCL keep-mask | **6 (water), 7 (unclassified)** | `INGEST_KEEP_SCL` |
| DBSCAN eps | **0.09°** | `DBSCAN_EPS_DEG` |
| DBSCAN min_samples | **3** | `DBSCAN_MIN_SAMPLES` |
| Severity | ≥10 HIGH · ≥5 MEDIUM · ≥3 LOW | — |
| HIGH-confidence plastic | **0.648** (≈90 % precision, 57 % recall) | `PLASTIC_HIGH_CONF` |
| Drift horizon | **72 h** (24–240 selectable) | `DRIFT_HORIZON_HOURS` |
| Windage members | **1.5 / 2 / 2.5 / 3 %** | — |
| Integrator | **RK4, 1-hour step** | — |
| Ingest max cloud | **50 %** | `INGEST_MAX_CLOUD` |
| Ingest window | 45 d → 180 d if coverage is low | `INGEST_DAYS_BACK(_MAX)` |
| Candidate cap | **500** (even striding) | — |
| Clay chip | **64 × 64 × 5 → 1024-d** | — |
| Auto-confirm confidence | 0.85 (opt-in) | — |
| Coast-proximity alert | ETA ≤ **48 h** | — |
| Pixel footprint | **0.0001 km²** (10 m) | — |

**Monitored regions:** MUM Mumbai (19.076, 72.877, coast 72.95) · GOA (15.299, 74.124, coast 74.20) · KCH Kochi (9.931, 76.267, coast 76.35) · CHN Chennai (13.082, 80.270, coast 80.35) · AND Andaman (11.740, 92.658, *open ocean, no coast meridian*)

**Opt-in flags:** `SCHEDULER_ENABLED=1` · `DATA_STRICT=1` · `REQUIRE_MODEL=1` · `CLAY_LIVE=0` · `EMBED_DRAIN=0` / `EMBED_SPOOL=0` · `BIOFOULING_CORRECTION=on` · **`DEMO_MODE=false` (required for real drift forcing — it defaults to `True` when unset)**

## H.7 The 50 most probable viva questions

### Problem & positioning (1–8)

**1. What is your project in one sentence?**
A system that uses free satellite images to detect floating marine plastic, verifies it with a second AI model, forecasts where it will drift over the next 72 hours, and presents it all on a live console for coastal agencies.

**2. Why marine plastic?**
Around 8 million tonnes enter the oceans yearly. India has a ~7,500 km coastline and a real, growing problem, but monitoring today means beach surveys and patrol boats — slow, costly and tiny in coverage. Satellites cover everything for free; the gap is that raw pixels are useless to a responder.

**3. Who is the user?**
INCOIS (ocean information), NCCR (coastal research) and the Indian Coast Guard (response). Naming the user forced every design decision to answer "would a duty officer use this?"

**4. What is genuinely new here?**
Not the detection algorithm. It is the **complete operational chain** — detect → two-tier confidence → foundation-model verification → drift forecast with an uncertainty cone → role-based console → dispatch → mission report — with per-stage live/demo tagging so every claim on screen is traceable to something the system actually computed.

**5. How is this different from published research?**
Most papers stop at a static classification map on a curated dataset. We run live on arbitrary user-drawn boxes, degrade gracefully and visibly when a component is down, close the loop with analyst labelling, and end at kilograms recovered.

**6. Why should we believe your numbers?**
Because you can reproduce them in front of us. AI Lab has an **Evaluate** button that re-scores the shipped ONNX model on a held-out MARIDA or MADOS split live. And we publish the numbers that hurt — 0/33 on deployed targets, patch CNN 0.555, drift not validated against drifter tracks.

**7. What is the single biggest limitation?**
One pixel is 10 m. A single bottle can never fill a pixel, so we detect **patches**, not items. Everything else — cloud, revisit, spectral overlap — follows from working with a free 10 m optical sensor.

**8. What's the roadmap?**
Reuse the same spine — fingerprints, fusion, change detection, active learning — for **oil spills, harmful algal blooms and coastal flooding**. Each is a new head on top of Clay embeddings: a labelled set plus a small head, not a rebuild.

### Data & remote sensing (9–16)

**9. Which satellite and why?**
Sentinel-2 L2A: free, 10 m in the visible/NIR bands, ~5-day revisit with both satellites, and it ships with a Scene Classification Layer we use for cloud and land masking. L2A means ESA has already done the atmospheric correction.

**10. Which bands do you fetch?**
Six channels in one request: B04 (red, 665 nm), B06 (red-edge, 740 nm), B08 (NIR, 842 nm), B8A (narrow NIR, 865 nm), B11 (SWIR, 1610 nm) and SCL.

**11. Give the FDI formula and explain it.**
`FDI = B08 − [B06 + (B11 − B06) × ((λ8 − λ6)/(λ11 − λ6)) × 10]`. You interpolate a baseline between the red-edge and SWIR bands, evaluate it at the NIR wavelength, and measure how far the observed NIR sits above it. Water absorbs NIR strongly, so anything floating stands out. Biermann et al., 2020.

**12. Why do you keep SCL class 7?**
Class 7 is "unclassified", and floating debris very often falls there at SCL's 20 m resolution — dropping it would discard real detections. We keep {6, 7} and we **dropped class 2** ("dark area"), which is mostly terrain and cloud shadow and was our single largest land/haze false-positive leak.

**13. What is adaptive resolution?**
The grid is sized to hit ~20 m/px: a small AOI is one native-resolution request, a medium AOI is native-resolution **tiling** of up to nine stitched tiles, and a huge region is one capped coarser request rather than an explosion of tiles that would blow the CDSE Processing-Unit quota. This replaced a fixed 256×256 over any box (~640 m/px), which averaged small rafts away entirely.

**14. How do you handle cloud?**
Three ways. We request a `leastCC` mosaic under a 50 % cloud cap within a 45-day window (widening to 180 days only when coverage is low, not when land-dominated). We mask cloud pixels out of candidacy via SCL. And we grade the whole scan reliable / degraded / unusable and say so on screen.

**15. What was the "LAND 0 %" bug?**
A composite leaves nodata wherever no clear pass existed. We were computing surface composition over the **full grid**, which diluted every category toward zero — so a half-land box read "land 0 %". We now compute over **observed pixels only** and expose `coverage_pct` as its own reliability signal.

**16. Why is SCL cloud percentage authoritative over STAC tile cloud?**
Because the tile figure describes a whole 110 km tile at one acquisition, whereas the composite we actually classified may be far clearer. A tile can read 100 % cloud while the composite is ~9 %. We trust what we classified, not the catalogue metadata.

### Model & ML (17–30)

**17. What model do you ship?**
`marinenet.onnx` — a 3-seed ensemble of 256-128-64-32 per-pixel MLPs with averaged logits, trained with focal loss, class-balanced effective-number weights and folded per-class bias calibration, on real MARIDA + MADOS official splits plus a refined FloatingObjects subset.

**18. What are the 11 features?**
`B04, B06, B08, B8A, B11, FDI, NDVI, PI, MNDWI, NDVI_RE, BRIGHT`. The last five are engineered indices — Plastic Index, a NIR-SWIR floating-matter index, red-edge NDVI for algae, and broadband brightness for foam and glint — all derived from the same five bands, so they cost **zero extra data**. The order is a hard runtime contract mirroring `train_perpixel_gpu.augment11` exactly.

**19. Your headline numbers?**
macro-F1 **0.8175** on 499,907 held-out real test pixels. Accuracy 0.9899 but Water-inflated. Plastic P 0.776 / R 0.824 / F1 0.799. Per dataset: MARIDA 0.905, MADOS 0.784.

**20. Why lead with macro-F1?**
Because Water is ~98 % of pixels, so a model predicting only "water" would already score ~98 % accuracy. Macro-F1 averages per-class F1 equally, so plastic counts as much as water.

**21. Why an MLP and not a CNN?**
We tested both. A ResNet patch CNN on 64×64×6 chips scored macro-F1 **0.555** versus the per-pixel MLP's 0.818 on the same held-out split — with only a few hundred distinct scenes it memorised scenes rather than learning plastic. We report the negative result and ship the MLP; the CNN path remains available behind `CNN_MODEL_PATH`.

**22. Why a 3-seed ensemble?**
It cost 0.007 macro-F1 (0.824 → 0.8175) and bought **plastic F1 0.742 → 0.799, precision 0.652 → 0.776, and new-seas water false positives 3 % → 0.7 %**. Precision is what an operational user needs, so we promoted the model with the slightly lower headline metric.

**23. Explain the two-tier confidence system.**
`P(plastic) ≥ 0.648` → **HIGH**, calibrated to ~90 % precision at 57 % recall. Below → **CANDIDATE**, shown but never clustered and never dispatched against. Raising to 0.79 gives ~95 % precision at 16 % recall.

**24. Why not just report F1?**
Because the cost of a false positive is a boat trip. Our explicit positioning is **sell precision, not F1**, and we state that plastic F1 cannot reach 0.9x on Sentinel-2 spectral data because plastic overlaps algae, foam and wood and targets are often sub-pixel.

**25. What is Clay and what does it do for you?**
An open Earth-observation foundation model. We use v1.5 **frozen**, as a verifier. Each hotspot's 64×64×5 chip becomes a 1024-d embedding; we k-NN it against a reference index, compute a similarity-weighted plastic affinity and a novelty score, and fuse those with the MLP confidence. CONFIRMED measures **0.9219 precision at 0.7037 recall**, up from 0.776 MLP plastic precision.

**26. Why not use Clay as the detector?**
Its own plastic F1 is 0.37. It generalises beautifully — on brand-new seas it recalls 54.2 % of debris where a per-pixel MLP on the same chips recalls 22.2 % — but it is not precise enough alone. Verifier, not detector.

**27. Why plastic affinity instead of k-NN argmax?**
The reference library is water-heavy, so argmax is biased toward water. A similarity-weighted share of the plastic neighbours is robust to that imbalance.

**28. What is focal loss?**
A loss that down-weights easy examples, so the model stops optimising for the trivial 98 % of water pixels and starts learning the rare, hard classes.

**29. Why ONNX?**
Portability and deployment. We train in PyTorch on the GPU, export to ONNX with a parity check (**agreement = 1.0**), and serve with ONNX Runtime — which auto-selects CUDA when available and falls back to CPU. It keeps the serving engine torch-free, which is what makes the ₹0 deployment story work.

**30. You detect 0 of 33 real deployed targets. Explain.**
The Plastic Litter Project targets are 3.5–14 m across in a 10 m pixel, so the pixel is ~90 % water and the plastic signature is diluted below threshold. It is a **resolution limit**. We proved it: retraining *with* PLP dropped plastic precision 0.776 → 0.660 for only 0/33 → 2/33 recall, so we did not promote it. On patch-scale benchmarks plastic recall is 90.6 % (MARIDA) and 89.9 % (MADOS).

### Clustering, drift & alerting (31–38)

**31. Why DBSCAN and not k-means?**
Three reasons: k-means needs `k` in advance and we do not know how many patches exist; DBSCAN finds arbitrary shapes, and debris fields are not spherical; and DBSCAN labels sparse points as noise instead of forcing every point into a cluster.

**32. Your DBSCAN parameters?**
`eps = 0.09°` (≈10 km at our latitudes) and `min_samples = 3`, run over **HIGH-confidence plastic only**. Severity is member count: ≥10 HIGH, ≥5 MEDIUM, ≥3 LOW.

**33. Why cluster only high-confidence plastic?**
Because hotspots drive dispatch. A crew must never be sent to a low-confidence maybe. If nothing clears the bar, the answer is *no hotspot* — we deliberately do not fall back to clustering all plastic.

**34. Did you implement DBSCAN yourself?**
Yes, from scratch — no scikit-learn dependency, which keeps the engine's dependency surface small and keeps it torch- and sklearn-free.

**35. Explain the drift model.**
Lagrangian advection. Forcing is resolved best-first: gridded CMEMS hourly surface currents sampled **along the moving track** at (lat, lon, t), then point Open-Meteo currents and 10 m winds, then a clearly-labelled synthetic field. Integration is fourth-order Runge–Kutta at a one-hour step, one track per windage member, `new_velocity = current + windage × wind`, with four members at 1.5–3 %. The members collapse into a mean path plus a per-hour min/max cone.

**36. Why RK4 and not Euler?**
Forward Euler accumulates truncation error on curved current paths over a 72-hour horizon. RK4 evaluates the derivative four times per step and is the standard choice for this problem.

**37. What is landfall probability?**
The fraction of ensemble members that beach within the horizon, plus the earliest and latest member ETA. With four members it quantises to 0/25/50/75/100 % — we say so rather than dress it up.

**38. When is an alert raised?**
For HIGH and MEDIUM hotspots. Type is `COAST_PROXIMITY` when landfall ETA ≤ 48 h, otherwise `HOTSPOT`. The engine only *proposes* alerts; the backend owns delivery, deduplication (per label per 24 h) and the WebSocket push.

### System, backend & frontend (39–46)

**39. Why three separate processes plus a sidecar?**
Each in the right ecosystem. Node owns auth, RBAC, persistence, queueing and exports; Python owns numpy, ONNX and remote sensing; the Clay sidecar isolates a 4.8 GB PyTorch dependency so the main engine stays torch-free and the ₹0 deployment story holds. Each can be restarted independently.

**40. Why is the queue optional?**
Because it must never be a single point of failure. Redis is probed with a 30-second cached throwaway connection; if it is down, routes fall back to a direct engine call. **The queue is an upgrade, never a requirement.**

**41. Real-time — SSE or WebSocket, and why both?**
SSE for a scan, because it is one-way, short-lived and needs auto-reconnect (`/api/pipeline/stream`, one event per stage). WebSocket for the app-wide event feed, because it is long-lived and drives cache invalidation (`/ws/live`). Polling remains the fallback for both: **push improves latency, never correctness.**

**42. What happens with no database at all?**
The whole API still works. Every data function tries Prisma first and transparently falls back to an in-memory demo store, and every response carries an `X-Data-Source` header so the UI can tell you. `DATA_STRICT=1` disables the fallback and fails fast instead.

**43. Explain your RBAC.**
Three roles by numeric level — FIELD 1, COASTGUARD 2, ADMIN 3. Enforced in **four** places: the sidebar filter, the command palette, `RequireRole` on the route, and — the only one that matters for security — Express middleware, which returns 403 regardless of what the client believes.

**44. Your most interesting bug?**
The refresh-token allowlist. An in-memory allowlist of valid refresh JTIs was wiped on every backend restart, and dev runs `tsx watch`, so every code edit invalidated all outstanding refresh tokens. Refresh 401'd, the app silently lost **write** access while public reads kept working — so everything *looked* healthy. We inverted it to a denylist: valid by signature and expiry, rotation denylists the old JTI, logout denylists. A restart now fails **open** rather than closed.

**45. What was the fake-async freeze?**
Every FastAPI route was `async def` and none used `await`, so a single blocking scan froze the whole single-worker uvicorn — `/health` blipped to 2703 ms and the watchdog thought the engine had died. Declaring the blocking routes as plain `def` lets FastAPI run them in a threadpool. Worst `/health` after the fix: **72 ms across 34 probes during a real 29-second scan**.

**46. Why do you suppress map markers on some scans?**
Because FDI over land or heavy cloud produces guaranteed false positives — a pure-land box painted ~160 fake "algae" dots. When the scan grades unusable we suppress the map markers and heatmap and show the reason, while keeping the raw rows in the data tabs and exports. We suppress the misleading picture, not the data.

### Honesty, evaluation & viability (47–50)

**47. How do you avoid overclaiming?**
Structurally. Macro-F1 is always first and accuracy is always captioned as Water-inflated. Every stage is tagged live or demo from the engine's own `/capabilities`. Synthetic scenes are labelled. Heuristic mode is banner-warned. Every negative result — 0/33 PLP, the 0.555 patch CNN, unvalidated drift ETAs — is published in-app, not in a footnote.

**48. What are the known gaps?**
Drift is not validated against real drifter tracks (the Liu–Weisberg harness exists, reference tracks do not). `nearest_coast_lon` has no distance guard, so an Andaman point borrows Chennai's meridian ~1,300 km away. `DEMO_MODE` defaults to `True` when unset, so forecasts silently use synthetic forcing unless `DEMO_MODE=false` is exported. There is no delete-forecast route, and no delete route for operations. Scheduled monitoring is region-level only — AOI-level needs a `scan_snapshot` table. PostGIS is not yet enabled. Our own README is stale, which we flag at the top of our system overview.

**49. Is this deployable and what would it cost?**
It is deployable today on one machine with a consumer GPU. Data is free — Copernicus, AWS Open Data, Open-Meteo, CMEMS. For an agency deployment the real work is not the algorithms: it is HttpOnly cookie auth with CSRF, the token denylist in Redis, PostGIS, a managed Postgres, and CDSE quota planning if scanning runs continuously on a timer.

**50. If you had six more months, what would you do?**
Three things, in order. (1) Validate the drift model against real drifter tracks — the harness is written; it needs data access. (2) Attack the resolution limit properly with PlanetScope 3 m or SAR fusion, since we have shown empirically that more Sentinel-2 data does not fix sub-pixel targets. (3) Extend the same fingerprint-plus-fusion spine to oil spills and harmful algal blooms, which is a new head on Clay embeddings rather than a rebuild.

## H.8 One-minute explanation of the complete project

> "Around eight million tonnes of plastic enter the ocean every year, and right now the only way to monitor it is beach surveys and patrol boats — slow, expensive, and they cover almost nothing.
>
> We built a system that uses **free Sentinel-2 satellite imagery** to find floating plastic and predict where it drifts. There are seven stages. We download real satellite pixels for whatever area you draw and work out how much of it is actually water using the satellite's own classification band. We compute the **Floating Debris Index**, a spectral formula that flags anything floating. We classify each candidate with a **three-seed neural-network ensemble** trained on the real MARIDA and MADOS benchmarks — it scores 0.82 macro-F1, and we lead with that rather than our 99 % accuracy, because the ocean is 98 % water and accuracy flatters the model. We cluster only **high-confidence** plastic — the tier calibrated to about 90 % precision — into hotspots with DBSCAN, so a crew is never dispatched on a maybe. Each hotspot then gets a **second opinion from a frozen Clay foundation model** running on a GPU, which lifts precision to 0.92. Then we forecast **72 hours of drift** using real Copernicus ocean currents and a wind-drag ensemble, and we publish it as an **uncertainty cone, never a single line**. Finally we raise alerts with a landfall ETA.
>
> It's a full operational console — role-based access, live status, dispatch, mission reports — and it runs at **₹0** on free data.
>
> And we are honest about what it can't do. A pixel is ten metres, so we find patches, not bottles. Against real deployed plastic targets we detect zero out of thirty-three, and we publish that, because it's a resolution limit — we tested the fix and it made the model worse. This complements patrols. It doesn't replace them."

## The 10 golden sentences

Every team member should be able to say all ten, cold.

1. **"Seven stages: download, FDI, classify, cluster, Clay verify, drift, alert."**
2. **"Macro-F1 0.82 — not 99 % accuracy, because the ocean is 98 % water."**
3. **"Ten-metre pixels, so we detect patches, not bottles."**
4. **"High-confidence plastic is P ≥ 0.648, calibrated to about 90 % precision — and only that tier becomes a hotspot."**
5. **"Clay is a frozen verifier, not a detector — it takes plastic precision from 0.78 to 0.92."**
6. **"The drift is an ensemble cone, never a single line, and the ETAs aren't yet validated against drifter tracks."**
7. **"No plastic means no forecast — the backend returns 422 rather than drift from the centre of an empty box."**
8. **"Every stage is tagged live or demo from the engine's own capabilities endpoint — a component that's present but silently off is a bug."**
9. **"We detect 0 of 33 deployed targets; we tested the obvious fix and it made precision worse, so we published the negative result instead."**
10. **"This is decision support. It complements patrols, drones and field teams — it does not replace them."**

---

*End of viva preparation guide. Every claim in this document was verified against the source code in this repository on 2026-07-30. If a number here disagrees with what the running system shows, trust the running system — and say so, because that is exactly the discipline this project is built on.*




