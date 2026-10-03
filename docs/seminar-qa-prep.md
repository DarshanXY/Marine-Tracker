# Seminar Q&A Preparation — Marine Plastic Tracker

**Project:** Satellite-Based Detection and 72-Hour Drift Forecasting of Marine Plastic Pollution
**Team:** Nimisha Nair, Darshan Gadekar, Krushna Taiwade, Nalaksh Randhawa
**Guide:** Dr. Roshan Kotkondawar · **Mentor:** Mr. Nehal P Kubade

> **How to use this file:** Each question has a **short answer** (what to say out loud) and, where useful, a **"if they push further"** deeper line. Answers are in simple language. The golden rule for this project: **be honest about what it can and cannot do — the panel respects honesty far more than overclaiming.**

---

## ⭐ CHEAT SHEET — memorise these first

**One-line pitch:**
> "We use free satellite images to find floating plastic in the ocean, confirm it with AI, and predict where it will drift over the next 3 days — so coastal agencies can act before it reaches the shore."

**Key numbers to remember:**
- **10 metres** — size of one satellite pixel (this is our main limitation).
- **~0.82 macro-F1** — our model's honest accuracy score (NOT 99%).
- **~90% precision** — our HIGH-confidence plastic tier.
- **7 stages** — in our detection pipeline.
- **72 hours** — how far ahead we forecast drift.
- **4 classes** — Plastic, Algae, Sea-Foam, Water.
- **₹0** — cost of the data (all free and open).
- **Sentinel-2** — the satellite we use (from Copernicus, European Space Agency).

**The 7 pipeline stages (memorise the order):**
1. **Download** satellite image + remove clouds/land
2. **FDI** (Floating Debris Index) — a formula that flags floating stuff
3. **Classify** each pixel with our ML model
4. **Cluster** plastic pixels into hotspots (DBSCAN)
5. **Verify** each hotspot with the Clay AI model
6. **Drift** — forecast where it goes (72h) using real currents + wind
7. **Alert** — raise an alert with coast arrival time

**If you only remember 3 honesty points:**
1. We detect plastic *patches*, not single bottles (10 m pixel limit).
2. Our score is ~0.82 macro-F1, and we lead with that, not "99% accuracy" (99% is misleading because 98% of the ocean is just water).
3. This **complements** patrols and surveys — it does not replace them.

---

## SECTION A — Basics, Problem & Motivation

**Q1. What is your project in one sentence?**
A system that uses free satellite images to detect floating marine plastic, verify it with AI, and forecast where it will drift over the next 72 hours, presented on a live console for coastal agencies.

**Q2. Why did you choose marine plastic pollution?**
Around 8 million tonnes of plastic enter the oceans every year. It kills marine life, damages fisheries and tourism, and reaches our coasts. India has a long coastline and this is a real, growing problem. Yet there's no easy, wide-area way to monitor it.

**Q3. What exact problem are you solving?**
Today, monitoring plastic means manual beach surveys, ships, and patrol boats — slow, costly, and they only cover tiny areas. Satellites can see the whole ocean for free, but the raw images are useless to a responder without processing. We fill that gap: raw pixels → verified plastic → drift forecast → actionable alert.

**Q4. Who is this for? Who will use it?**
Coastal and marine agencies — for example INCOIS (ocean information), NCCR (coastal research), and the Indian Coast Guard. Researchers can use the data; officers can plan responses.

**Q5. What is new about your project compared to existing work?**
Most existing research stops at a static "detection map" — it just classifies pixels. We built the **full operational chain**: detect → verify with a foundation model → forecast drift → deliver a live, role-based console with alerts and honest confidence grading. That end-to-end, honest, deployable console is our contribution — not a new plastic-detection algorithm.

**Q6. What does "operational console" mean?**
A working web dashboard that an agency officer can actually use day-to-day — draw an area, run a scan, see verified hotspots, get a drift forecast, receive alerts — not just a research demo.

**Q7. Is this a research project or a product?**
It's a working prototype / pilot. Everything runs on real data end-to-end. It's meant to show a *deployable* approach, and it's honest that it's a pilot, not a certified replacement for patrols.

---

## SECTION B — How the System Works (the pipeline)

**Q8. Explain your whole system in simple steps.**
A user draws a box on a satellite map. We download the latest Sentinel-2 image for that box, remove clouds and land, run a formula (FDI) that highlights floating material, classify each water pixel with our trained model, group the plastic pixels into hotspots, verify each hotspot with the Clay AI model, forecast where the plastic will drift over 72 hours using real ocean currents and wind, and finally raise alerts. All of this shows up live on the screen.

**Q9. What are the 7 stages of your pipeline?**
Download + cloud mask → FDI → Classify (ML) → Cluster (DBSCAN) → Verify (Clay) → Drift forecast (RK4) → Alert. *(See cheat sheet for the memory trick.)*

**Q10. What happens when a user draws an area on the map?**
The frontend sends that area to the backend, which asks the Python engine to run the full pipeline for that exact area. Results (detections, hotspots, drift) come back and render on the map in real time, stage by stage.

**Q11. What is the input and output of your system?**
**Input:** a geographic area (a box on the map) the user selects. **Output:** classified pixels (plastic/algae/foam/water), verified plastic hotspots with confidence, a 72-hour drift path with an uncertainty cone and coast-arrival time, and alerts.

**Q12. How long does one scan take?**
Roughly 20–30 seconds for a typical area — most of that is fetching the satellite image and ocean data over the internet. The computation itself is fast.

---

## SECTION C — Satellite Data

**Q13. What is Sentinel-2?**
A pair of Earth-observation satellites run by the European Space Agency under the Copernicus programme. They take multi-band (multi-colour, including infrared) images of the whole Earth, and the data is free.

**Q14. What is Copernicus / CDSE?**
Copernicus is the EU's Earth-observation programme. CDSE (Copernicus Data Space Ecosystem) is the official free portal we use to download Sentinel-2 imagery. No payment, just a free account.

**Q15. Why satellites instead of drones or boats?**
Satellites cover huge areas repeatedly and for free. Drones and boats only cover tiny areas and cost money and time. For wide-area, continuous monitoring, satellites are the only practical choice.

**Q16. How often does the satellite revisit the same place?**
About every 5 days for Sentinel-2. That's a limitation — we don't get a live video, we get a fresh image every few days (and only when it's not too cloudy).

**Q17. What is the resolution? How big is one pixel?**
About **10 metres** per pixel for the bands we use. So one pixel covers a 10 m × 10 m patch of ocean. This is the single most important limitation to remember.

**Q18. Is the satellite data free? What does it cost to run?**
The data is completely free and open (Copernicus, Open-Meteo). The main cost is a normal computer with a consumer GPU. So it runs at essentially zero data cost.

**Q19. Which spectral bands do you use?**
Mainly red, red-edge, near-infrared, and short-wave infrared bands (like B04, B06, B08, B8A, B11). Plastic and floating debris reflect infrared light differently from clean water, which is what lets us spot it.

**Q20. What is a cloud mask / the SCL band?**
Sentinel-2 provides a "Scene Classification Layer" (SCL) that labels each pixel as cloud, land, water, shadow, etc. We use it to **remove clouds and land** so we only analyse actual water pixels. This prevents false alarms from bright clouds.

**Q21. What if it's cloudy — especially during the monsoon?**
Clouds are a real problem. We handle it two ways: we pick the *least-cloudy* composite image, and we mask out cloudy pixels. We also **grade every scan** as reliable / degraded / unusable and show that honestly, so nobody trusts a cloudy scan too much.

**Q22. Can the satellite see through clouds or at night?**
No. Sentinel-2 is an *optical* satellite — it needs daylight and clear sky. This is why radar (Sentinel-1), which sees through clouds and at night, is in our future-work plan.

---

## SECTION D — Detecting Plastic (FDI)

**Q23. How can you detect plastic from space at all?**
Floating plastic and debris sit on the water surface and reflect near-infrared light more strongly than the surrounding water. We compute an index (FDI) that measures exactly this difference, then use machine learning to decide what the flagged pixels actually are.

**Q24. What is FDI (Floating Debris Index)?**
It's a published formula (Biermann et al.) that combines a few satellite bands to highlight floating material against water. A high FDI value means "something is floating here" — but it doesn't say *what*, so we pass those candidates to the ML model.

**Q25. Can you actually see a plastic bottle?**
No — and we're honest about this. A bottle is much smaller than a 10 m pixel, so it's "sub-pixel." We detect **aggregations**: patches, slicks, and rafts of debris big enough to change a pixel's colour. Single small items are below what the satellite can resolve.

**Q26. So what does one "detection" actually mean?**
It means: "this 10 m × 10 m patch of water is spectrally consistent with floating plastic/debris." It's evidence of a plastic-like patch, not a count of items.

---

## SECTION E — The Machine Learning Model

**Q27. What ML model do you use?**
A **per-pixel MLP (Multi-Layer Perceptron) ensemble** — a small neural network that looks at each pixel's spectral values and predicts its class. "Ensemble" means we average three models trained with different random seeds for stability.

**Q28. What is an MLP in simple terms?**
It's a basic neural network: numbers (the pixel's band values) go in, pass through a few layers of simple math, and out comes a class prediction with a confidence. Small, fast, and effective for per-pixel classification.

**Q29. Why an MLP and not a CNN (image model)?**
Our features are *spectral* (the colour/infrared signature of each pixel), not spatial shapes — plastic doesn't have a consistent visual "shape" at 10 m. A per-pixel MLP is lighter, needs no GPU for detection, and matches the data well. We *do* use a bigger foundation model (Clay) for the verification step where spatial context helps.

**Q30. What data did you train the model on?**
Two public, expert-labelled benchmark datasets: **MARIDA** and **MADOS** (Marine Debris Archive) — real Sentinel-2 pixels labelled by scientists as plastic, algae, foam, water, etc. We also added some diverse global water/debris scenes (RFO/FloatingObjects) to sharpen the water-vs-plastic boundary.

**Q31. What classes does the model predict?**
Four: **Plastic, Algae, Sea-Foam, and Water.** These are the things that look similar from space and are easy to confuse — which is exactly why we need ML to tell them apart.

**Q32. What is your accuracy?**
We report **macro-F1 ≈ 0.82**. We deliberately do *not* lead with the 99% overall accuracy.

**Q33. Why not just say 99% accuracy?**
Because about 98% of ocean pixels are just water. A model that guessed "water" every time would score ~98% accuracy while finding zero plastic. That number is misleading. **Macro-F1** averages performance across all classes equally, so it honestly reflects how well we find the rare classes like plastic. Leading with macro-F1 is the honest choice.

**Q34. What are precision and recall in simple words?**
**Precision** = of the things we *called* plastic, how many really were plastic (avoids false alarms). **Recall** = of all the real plastic, how much we *caught*. There's usually a trade-off between them. **F1** is their balanced combination.

**Q35. What is your two-tier confidence system?**
Every plastic detection gets a confidence score. We split them into **HIGH-confidence** (~90% precision — very likely real) and **candidate** (lower confidence — possible). Dispatch decisions and hotspots use only the HIGH tier, so we never send a boat chasing a low-confidence maybe.

**Q36. What is an ensemble and why 3 seeds?**
Training the same network three times with different random starting points gives three slightly different models. Averaging them cancels out random quirks and gives more stable, more precise predictions — it raised our plastic precision noticeably.

**Q37. How do you deal with false positives (false alarms)?**
Three layers: (1) the cloud/land mask removes non-water pixels, (2) the HIGH-confidence tier filters out weak detections, and (3) the Clay verifier double-checks each hotspot. Plus we grade scan reliability and hide detections over cloud/land.

**Q38. What confuses your model the most?**
Algae and sea-foam — they're spectrally similar to weathered plastic. Turbid (muddy) coastal water can also trigger false readings. We manage this with verification, confidence tiers, and honest reliability grading rather than pretending it's solved.

---

## SECTION F — Verification with Clay (the foundation model)

**Q39. What is Clay?**
Clay is an open **foundation model** for satellite imagery — a large AI model pre-trained on huge amounts of Earth-observation data. We use version 1.5, running on our GPU, as a **second-stage verifier**.

**Q40. What is a foundation model in simple terms?**
A large, general-purpose AI model trained on massive data that already "understands" a domain (here, satellite imagery). We don't retrain it — we use its learned understanding to double-check our detections.

**Q41. Why do you need a second verifier if you already have a model?**
Because plastic detection has false positives. Our MLP flags candidate hotspots; Clay looks at each hotspot's image patch and its overall "affinity" to plastic-like features, and confirms or rejects it. This raises plastic precision from about 0.78 to about 0.92.

**Q42. What is CONFIRMED vs POSSIBLE?**
After Clay checks a hotspot, we label it **CONFIRMED** (Clay agrees it's plastic-like — high precision) or **POSSIBLE** (Clay isn't convinced). Officers can prioritise CONFIRMED hotspots.

**Q43. Does Clay detect plastic by itself?**
No. Clay on its own is weak at directly detecting plastic. Its job is to **verify** and act as a precision gate — it filters our detections, it doesn't generate them. We're clear about this distinction.

**Q44. Why run Clay on a GPU?**
It's a large model, so it needs a GPU (we use an RTX 4050) to embed image patches quickly. The lightweight MLP detection runs fine on CPU; only the verifier needs the GPU.

---

## SECTION G — Drift Forecasting

**Q45. What is drift forecasting?**
Once we find floating plastic, we predict where the ocean currents and wind will carry it over the next 72 hours.

**Q46. Why forecast drift at all?**
Because a detection is only useful if you can act. Knowing where plastic is *going* lets an agency plan an interception at sea or warn a coastline before it lands.

**Q47. How do you predict where the plastic goes?**
We take the plastic hotspot as a starting point, get the real ocean-current and wind data for that location, and simulate the movement step by step over 72 hours using a physics integrator (RK4). We also add "windage" — the extra push wind gives to floating objects.

**Q48. What is RK4?**
Runge-Kutta 4th order — a standard, accurate numerical method for stepping a moving object forward through a changing flow field. It's more accurate than a naive straight-line step because it samples the current at several sub-steps.

**Q49. Where do the currents and wind data come from?**
Ocean currents from **CMEMS** (Copernicus Marine Service) and **Open-Meteo**; winds from **Open-Meteo**. All free, and fetched live for the specific area.

**Q50. What is the uncertainty cone?**
Instead of one exact line, we run many slightly-varied simulations and draw a widening cone showing the *range* of where the plastic could go. It honestly shows that the further ahead you predict, the less certain you are.

**Q51. What is landfall / coast ETA?**
If the drift path reaches the coast, we compute *when* (the estimated arrival time). If it hits land, we stop the path at the coastline instead of drawing it inland.

**Q52. Why 72 hours specifically?**
It's a useful operational window — long enough to plan a response, short enough that the forecast is still meaningful. Uncertainty grows quickly beyond that. (The system can actually forecast up to 240 hours if needed.)

**Q53. Is your drift forecast validated?**
Honestly, not yet against real drifter-buoy tracks. It uses real physics and real current data, but we haven't formally verified it against GPS-tracked buoys. We've already built the validation harness (using the Liu–Weisberg skill score) and that verification is our next step. We say this openly.

**Q54. Does algae or foam drift too? Why only forecast plastic?**
We only forecast from **plastic** hotspots because that's the actionable target. In fact, if a scan finds no plastic, the system refuses to draw a drift forecast at all — it would be meaningless.

---

## SECTION H — Architecture & Technology

**Q55. Explain your architecture.**
Three layers. A **React frontend** (the console the user sees). A **Node.js/Express backend** that handles logins, security, and a job queue. A separate **Python/FastAPI engine** that runs the 7-stage detection pipeline. Results are stored in **PostgreSQL** and pushed live to the browser over WebSocket. External free APIs supply the satellite and ocean data.

**Q56. Why three separate parts instead of one program?**
Separation of concerns. The frontend is about display, the backend about security and coordination, and the Python engine about heavy scientific computation (which Python's libraries are best at). Keeping them separate makes each easier to build, scale, and replace.

**Q57. What frontend technology did you use?**
React with TypeScript and Vite, styled with Tailwind CSS, maps with Leaflet, animations with framer-motion, and state managed with Zustand and React Query.

**Q58. What backend technology?**
Node.js with Express, the Prisma ORM to talk to PostgreSQL, and Redis with BullMQ for the job queue.

**Q59. Why Python for the detection engine?**
Because the scientific and ML ecosystem — NumPy, ONNX Runtime, PyTorch, image tools — is strongest in Python. All our satellite processing and ML runs there via a FastAPI service.

**Q60. What database do you use and why?**
PostgreSQL — a reliable relational database. It stores detections, hotspots, saved areas, forecasts, alerts, and users. It's proven, free, and handles structured geographic data well.

**Q61. What is the Redis/BullMQ queue for?**
Scans take time and there can be many. The queue lets the system accept a scan request instantly and process jobs one at a time in the background, instead of making the user wait on a frozen request. It also powers scheduled automatic scans.

**Q62. What is WebSocket used for?**
For live updates. When a scan finishes or an alert is raised, the server *pushes* it to the open browser instantly, so the Ops Board updates in real time without refreshing.

**Q63. In what sense is it "real-time"?**
The user gets live stage-by-stage progress during a scan, and new results/alerts push to the screen immediately via WebSocket. It's real-time *interaction*, though the underlying satellite images still refresh only every ~5 days.

**Q64. Can the system work offline / if a service is down?**
Yes — it degrades gracefully. If the database or engine is unreachable, it falls back to a clearly-labelled demo mode rather than crashing. But we always *label* when data isn't live, so it's never misleading.

---

## SECTION I — Security & Access

**Q65. How do you handle login and security?**
JWT tokens for sessions, bcrypt for password hashing, optional TOTP two-factor authentication, and role-based access control (RBAC) so users only see what their role permits. All over HTTPS.

**Q66. What is RBAC (role-based access control)?**
Different users have different roles (e.g. Coast Guard officer, Researcher, Ministry, Admin), and each role can access only the features relevant to them. An admin can manage users; a public viewer sees only public pages.

**Q67. What is JWT?**
JSON Web Token — a signed token the server gives you after login. Your browser sends it with each request to prove who you are, so you don't re-enter your password every time.

**Q68. What is 2FA / TOTP?**
Two-factor authentication using a time-based one-time code (like Google Authenticator). Even if someone steals your password, they can't log in without the changing 6-digit code.

**Q69. What are the different user roles?**
Roughly: Admin, Coast Guard/operations, Researcher, Ministry/analyst, and Public. Each sees a tailored dashboard and set of permissions.

---

## SECTION J — Accuracy, Limitations & Honesty

**Q70. What are the main limitations of your system?**
Four honest ones: (1) 10 m resolution means we miss small/sub-pixel plastic; (2) optical satellites can't see through clouds or at night; (3) ~5-day revisit, so no continuous live view; (4) drift isn't yet validated against real buoys. We surface all of these in the app.

**Q71. What is your biggest weakness?**
The 10 m resolution limit — we detect plastic *patches*, not individual items. This is a physics limit of the satellite, not a flaw we can fix with better code or more data.

**Q72. Why can't you detect all the plastic?**
Because a lot of plastic is small, thin, submerged, or spread out — smaller than a 10 m pixel or below the surface. Optical satellites simply can't resolve it. We're honest that we catch surface aggregations, not everything.

**Q73. Would more training data fix the accuracy?**
We tested this directly, and the honest answer is **no** for the resolution limit — adding sub-pixel plastic examples actually *hurt* precision. Plastic detection is capped by the satellite's 10 m resolution, not by data volume. More data helped *precision* a little, but not the fundamental recall of tiny targets. The real fix is higher-resolution or radar imagery.

**Q74. Isn't a macro-F1 of 0.82 quite low?**
It's realistic and honest for this hard problem. Plastic, algae, and foam overlap spectrally, and targets are often sub-pixel. State-of-the-art in this field sits in similar ranges. We chose to report the honest number and compensate with a HIGH-confidence tier (~90% precision) and AI verification, rather than quote an inflated 99%.

**Q75. How do you avoid sending a boat to the wrong place?**
By only acting on HIGH-confidence, Clay-CONFIRMED hotspots, by masking cloud/land, and by grading each scan's reliability. A low-confidence or cloudy result is clearly marked so nobody over-trusts it.

**Q76. Is this a replacement for patrols and beach surveys?**
No — it's a **complement**. It tells agencies *where to look* so they can focus their limited boats and people. Ground truth still comes from patrols. We say this clearly everywhere in the app.

**Q77. What is "reliability grading"?**
Every scan is automatically graded **reliable / degraded / unusable** based on how much clear water we actually saw (cloud cover, land, coverage). A big banner shows the grade, so the user knows how much to trust that scan.

**Q78. Could your tool give false confidence to a user?**
We engineered *against* exactly that. We never show a drift forecast without plastic, we hide detections over cloud/land, we lead with the honest macro-F1, we grade reliability, and we label demo vs live data. Honesty is a core design principle, not an afterthought.

---

## SECTION K — Comparison & Novelty

**Q79. What have other researchers done in this field?**
Most work (we reviewed ~25 papers) focuses on the *detection algorithm* — improving how well a classifier labels plastic pixels on benchmark datasets (e.g. Biermann's FDI, various CNN classifiers). They typically stop at a detection map.

**Q80. How is your project different or better?**
We don't claim the best classifier. Our novelty is being (as far as we've seen) the only **end-to-end operational console** in this space: detection + foundation-model verification + drift forecasting + live agency dashboard + honest confidence grading + a closed active-learning loop. It's an *operational and transparency* contribution, not an algorithmic one.

**Q81. So is your detection model the best in the world?**
No, and we don't claim that. Our detection science is comparable to, and in places behind, the best published models. Our strength is the operational, verified, honest, deployable *system* around the detection.

**Q82. What is a "closed active-learning loop"?**
When an analyst corrects or labels a detection, that feedback can be fed back to improve the model over time. It's a loop: predict → expert corrects → retrain → better predictions.

---

## SECTION L — Real-World Use & Deployment

**Q83. Is this actually deployed and used by anyone?**
It's a working pilot that runs fully on real data on our machines. It's not yet deployed at an agency — deploying with an agency like INCOIS or NCCR is our next step.

**Q84. How would an agency use it day-to-day?**
An officer opens the console, checks priority coastal zones (or draws a new area), runs a scan, reviews CONFIRMED hotspots and their drift forecasts, and gets alerts for high-risk cases. They can export the data as GeoJSON/CSV for their GIS tools.

**Q85. Can it scale to monitor a whole coastline?**
Yes, architecturally — the job queue and separate engine let us run many scans, and we support scheduled automatic sweeps of priority zones. Full-coast continuous coverage would need more compute and careful use of the satellite data quota.

**Q86. What does it cost to run?**
The data is free. You need a server and a consumer GPU. So running costs are low compared to boats and manual surveys.

**Q87. Which agencies is this aimed at?**
INCOIS (Indian National Centre for Ocean Information Services), NCCR (National Centre for Coastal Research), and the Indian Coast Guard — the bodies responsible for ocean monitoring and coastal response.

**Q88. Can it export data to GIS software?**
Yes — we export detections, hotspots, and drift as GeoJSON (RFC 7946) and CSV, which open directly in QGIS/ArcGIS.

---

## SECTION M — Your Learning & Project Management

**Q89. What was the hardest part of the project?**
Being honest, several things: getting real satellite ingestion working through the cloud mask, handling monsoon clouds and turbid water without false alarms, and integrating the GPU foundation-model verifier reliably. Also learning to *not overclaim* — building the honesty features took real engineering.

**Q90. What did you learn from this project?**
Full-stack development (React, Node, Python), machine learning on real satellite data, ocean-drift physics, system integration across three services, and — importantly — the value of scientific honesty in reporting results.

**Q91. What tools and languages did you use?**
TypeScript, Python, SQL; React/Vite/Tailwind; Node/Express/Prisma; FastAPI/NumPy/ONNX/PyTorch; PostgreSQL, Redis; Git, VS Code, Postman.

**Q92. How is the work divided in the team?**
*(Fill in truthfully for your team — e.g. frontend/console, backend/API & security, ML/detection engine, drift/data integration. Make sure each member can speak to their part.)*

**Q93. How long did the project take?**
*(Answer with your real timeline — describe it in phases: scaffold → data & auth → detection engine → drift → operational console & polish.)*

---

## SECTION N — Tricky / "Gotcha" Questions

**Q94. If you can't even detect a single bottle, what's the point?**
The point isn't counting bottles — it's finding *large aggregations* (patches, slicks, rafts) that matter for cleanup and coastal protection, over huge areas, cheaply and repeatedly. That's exactly where boats and surveys fail, and where satellites add real value.

**Q95. How do you know a detected patch is plastic and not just algae?**
We don't rely on one check. The ML model distinguishes the four classes by their spectral signatures, the HIGH-confidence tier filters weak calls, and the Clay foundation model verifies each hotspot. Where we're unsure, we label it POSSIBLE, not CONFIRMED — we don't pretend to be certain.

**Q96. What if the satellite image is several days old?**
That's a real limitation of the ~5-day revisit. We always show the image date, and the drift forecast starts from the detection time. For a fast-moving situation, agencies combine our wide-area screening with their own on-ground checks.

**Q97. Why should the panel trust your numbers?**
Because we report the *honest* ones. We lead with macro-F1 (0.82), not inflated accuracy; we show a real weak point (near-zero recall on tiny sub-pixel targets) instead of hiding it; and the metrics come straight from held-out benchmark test data, not cherry-picked examples.

**Q98. Isn't this just an existing algorithm (FDI) plus a dashboard?**
FDI is only stage 2 of 7, and it just flags candidates. The real work is the trained ML classifier, the foundation-model verification, the physics-based drift forecast, and turning all of it into a live, honest, secure operational system. The integration *is* the contribution.

**Q99. What happens over muddy/turbid coastal water?**
Turbidity can raise false readings — we acknowledge this. We mitigate it with the confidence tiers, Clay verification, and reliability grading, and we mark such scans as "degraded" rather than presenting them as clean results.

**Q100. Can it detect plastic under the water surface?**
No. Optical satellites only see the surface (and only a very thin layer). Submerged and seabed plastic is invisible to this method — another honest limitation.

**Q101. What if there's no internet?**
The pipeline needs internet for live satellite and ocean data. Without it, the system runs in a clearly-labelled demo mode so it can still be shown, but it won't produce new live results.

**Q102. Your accuracy dropped when you added more data — doesn't that mean your model is bad?**
No — it means we did an honest experiment and learned something real: adding *sub-pixel* plastic examples teaches the model that water-like pixels are plastic, which increases false alarms. The finding confirms the limit is the satellite's resolution, not our model. Discovering and reporting that is good science.

**Q103. Why didn't you just use a bigger/better model to hit 95%+?**
Because the ceiling here is physical, not computational. At 10 m resolution, plastic overlaps spectrally with algae, foam, and sediment, and many targets are sub-pixel. No model can reliably exceed what the sensor can see. The honest path forward is better *sensors* (higher-res or radar), which is our future work — not a bigger classifier.

---

## SECTION O — Future Work

**Q104. What are your next steps?**
Higher-resolution imagery (PlanetScope 3 m, drones) to catch smaller plastic; SAR/radar fusion (Sentinel-1) to see through clouds and at night; validating drift against real drifter buoys; automated continuous monitoring with threshold alerts; and a real pilot deployment with a coastal agency.

**Q105. How would you improve detection accuracy specifically?**
Not with more 10 m data — with **higher-resolution or radar imagery**, and by fusing multiple sensors and multiple dates. Those attack the actual limit (resolution and cloud cover) rather than tweaking the classifier.

**Q106. What is SAR fusion?**
Combining radar (SAR — Synthetic Aperture Radar, e.g. Sentinel-1) with optical imagery. Radar works through clouds and at night and responds to surface roughness, so fusing it with optical could improve reliability, especially in the monsoon.

**Q107. What would a real deployment need?**
Agency onboarding, a hosted cloud server, careful management of the satellite data quota for continuous scanning, drift validation, and integration with the agency's existing response workflow.

---

## FINAL TIPS FOR THE PRESENTATION

- **Lead with the story, not the tech:** problem (plastic) → gap (no operational tool) → our solution (detect–verify–forecast–alert).
- **Say the honest numbers first.** If you volunteer the 0.82 and the 10 m limit before they ask, you look credible and disarm the "gotcha" questions.
- **When you don't know an answer:** say "That's a good question — we haven't tested that specific case, but based on how the system works, I'd expect…" Never bluff a fake number.
- **Every member should know:** the 7 stages, the one-line pitch, the key numbers, and their own contribution.
- **Repeat the theme:** "It complements patrols, it doesn't replace them." This single line answers half the sceptical questions.
