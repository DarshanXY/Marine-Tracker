"""Generate the Marine Plastic Tracker system-architecture diagram (SVG in HTML)."""
from html import escape as e
from pathlib import Path

W, H = 2600, 1700
PITCH, BW = 418, 340
def cx(i): return 70 + i * PITCH
def cc(i): return cx(i) + BW / 2
def cr(i): return cx(i) + BW

SEC = {
    "A": ("#f5f3ff", "#7c3aed", "#ede9fe"),   # offline training: violet
    "B": ("#eff6ff", "#2563eb", "#dbeafe"),   # engine: blue
    "C": ("#f0fdf4", "#16a34a", "#dcfce7"),   # application: green
    "S": ("#fffbeb", "#d97706", "#fef3c7"),   # sources: amber
    "M": ("#fdf2f8", "#db2777", "#fce7f3"),   # monitoring: pink
    "D": ("#f8fafc", "#475569", "#e2e8f0"),   # storage: slate
}
out = []
def add(s): out.append(s)

def box(x, y, w, h, title, sub, lines, sec, cols=1, head_h=58):
    _, stroke, head = SEC[sec]
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="#ffffff" stroke="{stroke}" stroke-width="2"/>')
    add(f'<path d="M{x} {y+12} a12 12 0 0 1 12 -12 h{w-24} a12 12 0 0 1 12 12 v{head_h-12} h{-w} z" fill="{head}"/>')
    add(f'<line x1="{x}" y1="{y+head_h}" x2="{x+w}" y2="{y+head_h}" stroke="{stroke}" stroke-width="1"/>')
    add(f'<text x="{x+14}" y="{y+25}" class="t">{e(title)}</text>')
    add(f'<text x="{x+14}" y="{y+46}" class="s">{e(sub)}</text>')
    per = -(-len(lines) // cols)
    colw = (w - 28) / cols
    for i, ln in enumerate(lines):
        c, r = divmod(i, per)
        tx, ty = x + 14 + c * colw, y + head_h + 24 + r * 21
        if ln.startswith("#"):
            add(f'<text x="{tx}" y="{ty}" class="g">{e(ln[1:])}</text>')
        elif ln.startswith("  "):
            add(f'<text x="{tx+14}" y="{ty}" class="b">{e(ln.strip())}</text>')
        else:
            add(f'<circle cx="{tx+4}" cy="{ty-5}" r="2.6" fill="{stroke}"/>')
            add(f'<text x="{tx+14}" y="{ty}" class="b">{e(ln)}</text>')

def arrow(d, color="#334155", dash=False, both=False):
    m = "ad" if color == "#334155" else "am"
    extra = ' stroke-dasharray="8 6"' if dash else ""
    start = f' marker-start="url(#{m}s)"' if both else ""
    add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="2.4"{extra} marker-end="url(#{m})"{start}/>')

def label(x, y, lines, anchor="middle", size=13.5, color="#334155", rot=None):
    tr = f' transform="rotate({rot} {x} {y})"' if rot else ""
    for i, ln in enumerate(lines):
        add(f'<text x="{x}" y="{y + i*16}" text-anchor="{anchor}" class="l" style="font-size:{size}px;fill:{color}"{tr}>{e(ln)}</text>')

def band(y, h, sec, num, title, note):
    fill, stroke, _ = SEC[sec]
    add(f'<rect x="40" y="{y}" width="2520" height="{h}" rx="18" fill="{fill}" stroke="{stroke}" stroke-width="1.6" stroke-dasharray="10 6"/>')
    add(f'<circle cx="74" cy="{y+28}" r="16" fill="{stroke}"/>')
    add(f'<text x="74" y="{y+34}" text-anchor="middle" style="font:700 17px Segoe UI,Arial;fill:#fff">{num}</text>')
    add(f'<text x="100" y="{y+35}" class="h" style="fill:{stroke}">{e(title)}</text>')
    add(f'<text x="2540" y="{y+35}" text-anchor="end" class="n">{e(note)}</text>')

# ---------------- title ----------------
add(f'<text x="{W/2}" y="52" text-anchor="middle" style="font:700 36px Segoe UI,Arial;fill:#0f172a">Marine Plastic Tracker — System Architecture</text>')
add(f'<text x="{W/2}" y="84" text-anchor="middle" style="font:400 18px Segoe UI,Arial;fill:#475569">Sentinel-2 floating-plastic detection, hotspot verification and 72-hour drift forecasting · end-to-end data flow</text>')

# ================= BAND A: offline training =================
band(108, 428, "A", "1", "OFFLINE TRAINING PIPELINE",
     "GPU workstation (RTX 4050) · conda env mpt-train · PyTorch · NumPy · rasterio")
RA, HA = 160, 196
box(cx(0), RA, BW, HA, "Training Datasets", "Sentinel-2 L2A reflectance · data/", [
    "MARIDA (2022): 11-band patches", "MADOS (2024): 174 scenes",
    "RefinedFloatingObjects: 6 scenes", "Plastic Litter Project (in-situ)",
    "GeoTIFF + pixel label masks", "Official train / val / test splits"], "S")
box(cx(1), RA, BW, HA, "Preprocessing / Adapters", "ml/datasets/ · rasterio · NumPy", [
    "Band selection: B04 B06 B08 B8A B11", "20 / 60 m bands resampled to 10 m",
    "FDI + NDVI computed per pixel", "15 classes mapped to 4 classes",
    "Plastic·Algae·Sea_Foam·Water", "Clouds, ships, wakes excluded"], "A")
box(cx(2), RA, BW, HA, "Feature Caches", "python_engine/models/*.npz", [
    "Per-pixel table x[N, 7] + labels y", "64×64×6 image chips (float16)",
    "1.08 M train / 0.50 M test pixels", "Water ≈ 98 % → class imbalance"], "A")
box(cx(3), RA, BW, HA, "MLP Training", "train_perpixel_gpu.py · PyTorch CUDA", [
    "augment11: +PI, MNDWI, NDVI_RE, BRIGHT", "z-score normalisation (in model)",
    "MLP 11→256→128→64→32→4", "Focal loss + class-balanced weights",
    "AdamW · cosine LR · batch 8192", "3 random seeds → ensemble"], "A")
box(cx(4), RA, BW, HA, "Validation & Testing", "held-out splits · validate_*.py", [
    "Best epoch by validation macro-F1", "Per-class bias calibration",
    "Test macro-F1 = 0.8175", "Plastic F1 0.799 (P .776 · R .824)",
    "ONNX parity check = 1.0", "PLP in-situ + drift validation"], "A")
box(cx(5), RA, BW, 360, "Model Registry", "python_engine/models/", [
    "marinenet.onnx — live MLP ensemble", "metrics.json — test scores",
    "clay_index.npz — k-NN library", "clay_head.pt — Clay classifier head",
    "fusion_thresholds.json", "clay_threshold.json",
    "Older versions kept as backup", "Promotion = manual review",
    "#Read live by the engine"], "D")
box(cx(3), 392, BW * 2 + 78, 124, "Clay Foundation-Model Preparation",
    "Clay v1.5 · train_clay_head.py · tune_clay_threshold.py · tune_fusion.py", [
    "Image chips → 1024-d Clay embeddings → k-NN reference index",
    "Clay head trained · MLP + Clay fusion tuned (CONFIRMED ≈ 0.92 precision)"], "A")
ya = RA + 112
for i, lab in enumerate([["GeoTIFF", "+ masks"], ["features", "+ labels"], ["x[N,7], y", ""],
                         ["trained", "models"], ["promote", "best"]]):
    arrow(f"M{cr(i)+4} {ya} H{cx(i+1)-6}")
    label(cr(i) + 39, ya - 26, [l for l in lab if l])
arrow(f"M{cc(2)} {RA+HA+2} V454 H{cx(3)-6}")
label(cc(2) + 70, 444, ["64×64×6 chips"])
arrow(f"M{cr(4)+4} 454 H{cx(5)-6}")
label(cr(4) + 39, 430, ["Clay", "artefacts"])

# ================= BAND B: online engine =================
band(568, 560, "B", "2", "ONLINE DETECTION ENGINE  —  Python FastAPI :8000",
     "torch-free: NumPy · onnxruntime · tifffile · Pydantic")
R1, R2, HB = 620, 884, 212
box(cx(0), R1, BW, R2 + HB - R1, "Live Data Sources", "external services (internet)", [
    "#Satellite imagery", "Copernicus Data Space", "  Sentinel Hub Process API · OAuth2",
    "AWS Earth Search STAC", "  scene search (keyless)",
    "#Ocean & weather forcing", "CMEMS hourly surface currents", "  copernicusmarine toolbox",
    "Open-Meteo marine + 10 m wind",
    "#Geography", "Country / coastline GeoJSON", "Open-Meteo terrain elevation",
    "#User input (via backend)", "AOI bounding box from map"], "S")
box(cx(1), R1, BW, HB, "Satellite Ingest", "satellite/download.py · band_loader.py", [
    "Adaptive grid ≈ 20 m/px, ≤ 9 tiles", "leastCC mosaic · max cloud 50 %",
    "45-day window (180 if sparse)", "6-ch float32 GeoTIFF (tifffile)",
    "  B04 B06 B08 B8A B11 + SCL", "Retry + bandwidth budget"], "B")
box(cx(2), R1, BW, HB, "Preprocessing", "cloud_masker · band_normalizer · landmask", [
    "SCL cloud / land / nodata masking", "Coverage % + reliability grade",
    "NaN/inf removal · clip [0, 1.6]", "Land-polygon & inland filter",
    "Unusable scene → markers hidden"], "B")
box(cx(3), R1, BW, HB, "Candidate Generation", "fdi_calculator · threshold_applier", [
    "FDI = B08 − baseline(B06, B11)", "Keep pixels with FDI > 0.02",
    "SCL ∈ {water, unclassified}", "≤ 500 candidates (even stride)",
    "#Floating Debris Index (Biermann 2020)"], "B")
box(cx(4), R1, BW, HB, "Pixel Classification (MLP)", "batch_classifier · inference_engine", [
    "11-feature vector per candidate", "ONNX MLP ensemble · onnxruntime",
    "CUDA provider, CPU fallback", "Plastic / Algae / Sea_Foam / Water",
    "HIGH tier: P(plastic) ≥ 0.648", "Spectral heuristic if no model"], "B")
box(cx(5), R1, BW, HB, "Hotspot Clustering", "hotspot/dbscan_clusterer · severity", [
    "DBSCAN (NumPy, from scratch)", "eps = 0.09°, min_samples = 3",
    "HIGH-confidence plastic only", "Severity: HIGH ≥ 10 · MED ≥ 5",
    "  LOW ≥ 3 detections"], "B")
box(cx(5), R2, BW, HB, "Clay Verification", "clay_service.py :8010 · PyTorch GPU", [
    "64×64×5 chip per hotspot", "Clay v1.5 → 1024-d embedding",
    "k-NN plastic affinity + novelty", "Fusion → CONFIRMED / POSSIBLE",
    "Sidecar down → MLP-only (logged)"], "B")
box(cx(4), R2, BW, HB, "Drift Forecasting", "trajectory/ · Lagrangian model", [
    "Forcing: CMEMS → Open-Meteo → synth.", "RK4 integration · 1 h step · 72 h",
    "Windage ensemble 1.5 – 3 %", "Mean path + uncertainty cone",
    "Landfall probability · coast ETA", "Back-tracking to likely source"], "B")
box(cx(3), R2, BW, HB, "Alert Generation", "hotspot/alert_trigger.py", [
    "From HIGH / MEDIUM hotspots", "COAST_PROXIMITY if ETA ≤ 48 h",
    "otherwise HOTSPOT alert", "#delivery + dedupe in backend"], "B")
box(cx(2), R2, BW, HB, "Engine REST API", "FastAPI · Uvicorn · Pydantic schemas", [
    "/pipeline/run · /pipeline/stream", "/forecast/trajectory · /backtrack",
    "/similarity/* · /compute/*", "/model/* · /export/geotiff",
    "/health · /capabilities · /metrics"], "B")
box(cx(1), R2, BW, HB, "Intelligence Analytics", "similarity_service · site_change", [
    "Find similar sites (Clay index)", "Novelty / anomaly score",
    "Site change over time", "Spectral indices · change detection"], "B")
y1, y2 = R1 + 100, R2 + 100
for i, lab in [(0, ["S2 bands", "+ SCL"]), (1, ["raw", "scene"]), (2, ["clean", "bands"]),
               (3, ["candidate", "pixels"]), (4, ["classified", "pixels"])]:
    arrow(f"M{cr(i)+4} {y1} H{cx(i+1)-6}")
    label(cr(i) + 39, y1 - 26, lab)
for i, lab in [(5, ["verified", "hotspots"]), (4, ["forecasts"]), (3, ["alerts +", "results"])]:
    arrow(f"M{cx(i)-4} {y2} H{cr(i-1)+6}")
    label(cx(i) - 39, y2 - 26, lab)
arrow(f"M{cr(1)+4} {y2} H{cx(2)-6}")
label(cr(1) + 39, y2 - 26, ["on", "demand"])
arrow(f"M{cc(5)} {R1+HB+2} V{R2-6}")
label(cc(5) + 12, R1 + HB + 34, ["hotspot centroids"], anchor="start")
cy = (R1 + HB + R2) // 2
arrow(f"M{cr(0)+4} {cy} H{cc(4)} V{R2-6}")
label(1180, cy - 8, ["ocean currents + 10 m wind (forcing data)"])
# registry -> engine
arrow(f"M{cc(5)-80} {RA+360+2} V552 H{cc(4)} V{R1-6}")
label(2080, 558, ["marinenet.onnx → onnxruntime"])
arrow(f"M{cr(5)+2} 480 H2540 V{y2+40} H{cr(5)+6}")
label(2553, 760, ["Clay index + fusion thresholds"], rot=-90)

# ================= BAND C: application =================
band(1168, 464, "C", "3", "APPLICATION, STORAGE & PRESENTATION LAYER", "")
RC, HC = 1222, 380
box(70, RC, 350, HC, "Data Storage", "system of record + caches", [
    "#PostgreSQL :5432 (Prisma, 18 tables)", "detections · hotspots", "trajectories · alerts",
    "satellite_images · pipeline_logs", "users · operations", "saved_areas · area_forecasts",
    "#Redis :6379", "BullMQ job queue",
    "#Other", "In-memory demo store (fallback)", "MySQL dataset browser (copy)",
    "Files: data/ GeoTIFF · models/", "Browser localStorage (session)"], "D")
box(530, RC, 720, HC, "Backend API — Node.js / Express :3001", "TypeScript · Prisma ORM · zod · helmet · cors", [
    "#REST API", "13 routers under /api", "detections · hotspots · alerts", "pipeline · areas · operations",
    "#Security", "JWT access + refresh tokens", "bcrypt passwords · TOTP 2FA", "RBAC: FIELD · COASTGUARD · ADMIN",
    "#Data pipeline", "persistRun(): engine JSON → rows", "BullMQ queued + scheduled scans",
    "Repositories with demo fallback",
    "#Real-time & reports", "WebSocket /ws/live push", "CSV + PDF reports (pdfkit)",
    "X-Data-Source live/demo header"], "C", cols=2)
box(1360, RC, 400, HC, "Web Frontend — React 18 :5173", "Vite · TypeScript · Tailwind CSS", [
    "#Pages", "Command Center · Map Explorer", "Areas · Records · Field Ops",
    "AI Lab · Analytics · Admin",
    "#Libraries", "Leaflet / react-leaflet maps", "Recharts charts",
    "React Query (server state)", "Zustand (auth + map state)", "axios + auto token refresh",
    "#Users", "Field officer · Coast guard · Admin", "Role-gated routes & menus"], "C")
box(1850, RC, 320, HC, "Outputs & Visualization", "what the analyst sees", [
    "Detection map by class", "Hotspots + severity", "72 h drift path + cone",
    "Landfall probability · ETA", "Alerts feed", "Saved areas & forecasts",
    "AI Lab: model metrics", "Similar-site search", "Field missions + reports",
    "#Exports", "CSV · PDF · GeoTIFF"], "C")
box(2210, RC, 320, HC, "Monitoring & Tracking", "health · logs · provenance", [
    "watchdog.ps1 · keep-alive", "start-all.cmd launcher", "/health HTTP probes",
    "/metrics counters", "Per-stage pipeline_logs", "Audit log (append-only)",
    "Live/demo data-source tag", "Model card + /capabilities", "Scan reliability grade",
    "#Admin page shows status"], "M")
# engine <-> backend
arrow(f"M1000 {RC-4} V{R2+HB+6}")
label(990, 1138, ["scan / forecast", "request (HTTP)"], anchor="end")
arrow(f"M1150 {R2+HB+2} V{RC-6}")
label(1162, 1146, ["result JSON"], anchor="start")
# backend <-> storage
arrow(f"M526 {RC+120} H{420+6}", both=True)
label(475, RC + 98, ["Prisma", "ORM"])
arrow(f"M526 {RC+250} H{420+6}", both=True)
label(475, RC + 228, ["BullMQ", "jobs"])
# frontend <-> backend
arrow(f"M{1360-4} {RC+130} H{1250+6}")
label(1305, RC + 92, ["REST", "+ JWT"])
arrow(f"M{1250+4} {RC+250} H{1360-6}")
label(1305, RC + 212, ["JSON +", "WS push"])
# frontend -> outputs
arrow(f"M{1760+4} {RC+190} H{1850-6}")
label(1805, RC + 168, ["renders"])
# monitoring
arrow(f"M{cc(5)} {RC-4} V{R2+HB+6}", color="#db2777", dash=True)
label(cc(5) + 12, 1138, ["health probes", "/health · /metrics"], anchor="start", color="#be185d")

# ---------------- legend ----------------
ly = 1670
add(f'<line x1="70" y1="{ly-5}" x2="130" y2="{ly-5}" stroke="#334155" stroke-width="2.4" marker-end="url(#ad)"/>')
add(f'<text x="142" y="{ly}" class="b">data / control flow</text>')
add(f'<line x1="330" y1="{ly-5}" x2="390" y2="{ly-5}" stroke="#db2777" stroke-width="2.4" stroke-dasharray="8 6" marker-end="url(#am)"/>')
add(f'<text x="402" y="{ly}" class="b">monitoring probe</text>')
x = 600
for sec, name in [("S", "data sources"), ("A", "offline training"), ("B", "detection engine"),
                  ("C", "application layer"), ("D", "storage / artefacts"), ("M", "monitoring")]:
    _, stroke, head = SEC[sec]
    add(f'<rect x="{x}" y="{ly-17}" width="26" height="18" rx="4" fill="{head}" stroke="{stroke}" stroke-width="2"/>')
    add(f'<text x="{x+36}" y="{ly}" class="b">{name}</text>')
    x += 230

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<defs>
<marker id="ad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#334155"/></marker>
<marker id="ads" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#334155"/></marker>
<marker id="am" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#db2777"/></marker>
<style>
.t{{font:700 18px "Segoe UI",Arial;fill:#0f172a}}
.s{{font:italic 400 13.5px "Segoe UI",Arial;fill:#475569}}
.b{{font:400 14.5px "Segoe UI",Arial;fill:#1e293b}}
.g{{font:700 13.5px "Segoe UI",Arial;fill:#334155;text-transform:uppercase;letter-spacing:.4px}}
.h{{font:700 21px "Segoe UI",Arial;letter-spacing:.6px}}
.n{{font:400 15px "Segoe UI",Arial;fill:#475569}}
.l{{font-family:"Segoe UI",Arial;font-weight:600;paint-order:stroke;stroke:#ffffff;stroke-width:5px;stroke-linejoin:round}}
</style>
</defs>
<rect width="{W}" height="{H}" fill="#ffffff"/>
{chr(10).join(out)}
</svg>'''
here = Path(__file__).parent
(here / "architecture.svg").write_text(svg, encoding="utf-8")
(here / "architecture.html").write_text(
    f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;padding:0;background:#fff}}</style></head><body>{svg}</body></html>',
    encoding="utf-8")
print("ok")
