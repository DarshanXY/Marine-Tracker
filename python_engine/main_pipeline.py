"""Pipeline orchestrator: scene → FDI → classify → DBSCAN → drift → alerts.

Runs the six stages end-to-end and returns a fully-typed PipelineResult with
per-stage timings, detections, hotspots and drift trajectories. Two entry points:
`run_aoi(bbox)` for a user-drawn area and `run_pipeline(region)` for a monitored
region. Behaviour matches the validated engine; the surface readout comes from
each scan's own SceneData (no shared globals → no stale-surface bug).
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone

from config import settings
from hotspot import dbscan_clusterer
from hotspot.severity_scorer import severity_for
from ml import batch_classifier, clay_live, embedding_spool, inference_engine as infer
from ml.confidence_filter import filter_by_confidence
from ml.detection_merger import merge as merge_detections
from ml.hotspot_embeddings import site_key
from satellite import download
from satellite.download import REGIONS
from satellite.fdi_calculator import floating_debris_index
from schemas import (
    BBox, ConePoint, Detection, Hotspot, PipelineResult, PipelineStats,
    SceneRef, StageLog, Surface, Trajectory, TrajectoryPoint,
)
from trajectory import data_interpolator, eta_calculator, lagrangian_model, path_clamp
from trajectory.coastline_loader import coast_lon_for
from trajectory.ensemble_model import DEFAULT_WINDAGE


def _ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


def _forcing_for(lat: float, lon: float, horizon: int) -> dict | None:
    """REAL hourly currents+winds for a drift release point, or None → synthetic.
    Attempted only when demo_mode is off so offline demos never hit the network."""
    if settings.demo_mode:
        return None
    try:
        return data_interpolator.fetch_forcing(lat, lon, horizon)
    except Exception:  # noqa: BLE001 — degrade to synthetic field
        return None


def _surface(sd: download.SceneData) -> Surface | None:
    return Surface(**sd.surface) if sd.surface else None


def _download_detail(prefix: str, sd: download.SceneData) -> str:
    """DOWNLOAD-stage text: honest surface breakdown + candidacy mask %."""
    detail = prefix
    if sd.surface:
        s = sd.surface
        detail += (f" · surface {s['water_pct']}% water / {s['land_pct']}% land / "
                   f"{s['cloud_pct']}% cloud")
    if sd.mask:
        detail += f" · SCL kept {sd.mask['valid_pct']}% candidate px"
    return detail


def _fdi_candidates(pixels: list[dict]) -> list[tuple[dict, float]]:
    out: list[tuple[dict, float]] = []
    for px in pixels:
        b = px["bands"]
        fdi = floating_debris_index(b["B06"], b["B08"], b["B11"])
        if fdi > settings.fdi_threshold:
            out.append((px, fdi))
    return out


def _apply_options(det_dicts: list[dict], min_confidence: float, dedupe: bool) -> list[dict]:
    """Opt-in /pipeline/run post-processing: drop low-confidence detections and/or
    collapse near-duplicates. Both default off, so the base result is unchanged."""
    if min_confidence and min_confidence > 0:
        det_dicts = filter_by_confidence(det_dicts, min_confidence)
    if dedupe:
        det_dicts = merge_detections(det_dicts)
    return det_dicts


def _make_hotspots(detections: list[Detection], label_prefix: str) -> list[Hotspot]:
    # Hotspots drive dispatch, so cluster HIGH-CONFIDENCE plastic ONLY — a crew is
    # never sent to a low-confidence maybe. Falls back to nothing (not to all
    # plastic) when no detection clears the bar: no reliable plastic → no hotspot.
    hi = [d for d in detections if d.classification == "Plastic" and getattr(d, "high_confidence", False)]
    pts = [(d.lat, d.lon) for d in hi]
    confs = [d.confidence for d in hi]
    hotspots: list[Hotspot] = []
    if pts:
        clusters = dbscan_clusterer.cluster(pts, settings.dbscan_eps_deg, settings.dbscan_min_samples)
        for n, (_lab, members) in enumerate(sorted(clusters.items()), start=1):
            count = len(members)
            hotspots.append(Hotspot(
                label=f"{label_prefix}-H{n}",
                centroid_lat=round(sum(pts[i][0] for i in members) / count, 4),
                centroid_lon=round(sum(pts[i][1] for i in members) / count, 4),
                detection_count=count, severity=severity_for(count),
                confidence=round(sum(confs[i] for i in members) / count, 2), eta_hours=None,
            ))
    return hotspots


def _embed_sites(run_tag: str, arr6, hotspots: list[Hotspot], candidates, region, ts: str) -> None:
    """Tag each hotspot with its stable embed key and queue its chip for offline
    Clay embedding. Best-effort: never raises into the pipeline, no-op on synthetic
    scenes (arr6 None). The GPU node drains the queue → serves true per-hotspot
    similarity + change detection later."""
    for h in hotspots:
        h.embed_key = site_key(region, h.centroid_lat, h.centroid_lon)
    embedding_spool.spool_sites(
        run_tag, arr6, embedding_spool.sites_from_hotspots(hotspots), candidates, region, ts)


def _drift_stage(hotspots: list[Hotspot], coast_lon_of,
                 clamp: bool = True) -> tuple[list[Trajectory], str, StageLog]:
    """Compute ETA per hotspot + full tracks for the top 2. coast_lon_of(hotspot)
    returns the coastline longitude to use for that hotspot.

    When `clamp` is True the drawn track halts at that coastline (a beached
    parcel does not drift inland). AOI runs pass clamp=False: their "coast" is
    the drawn box's eastern edge, which is not a real coastline — halting a
    trajectory on the AOI rectangle would make its length a function of where
    the user dragged the box."""
    t = time.perf_counter()
    trajectories: list[Trajectory] = []
    drift_source = "demo" if settings.demo_mode else "synthetic"
    for rank, h in enumerate(hotspots):
        forcing = _forcing_for(h.centroid_lat, h.centroid_lon, settings.drift_horizon_hours)
        if forcing:
            drift_source = forcing["source"]
        points, cone = lagrangian_model.simulate(
            h.centroid_lat, h.centroid_lon, settings.drift_horizon_hours, forcing=forcing,
        )
        coast = coast_lon_of(h)
        # ETA is read off the RAW mean path before any clamp, so it is unchanged.
        h.eta_hours = eta_calculator.coast_eta_hours(points, coast)
        if clamp:
            points, cone, _end_h, _end_r = path_clamp.clamp_path_to_coast(points, cone, coast)
        if rank < 2:
            trajectories.append(Trajectory(
                detection_index=rank,
                points=[TrajectoryPoint(t=p["t"], lat=p["lat"], lon=p["lon"]) for p in points],
                cone=[ConePoint(t=c["t"], lat_min=c["lat_min"], lat_max=c["lat_max"],
                                lon_min=c["lon_min"], lon_max=c["lon_max"]) for c in cone],
                windage_coeffs=list(DEFAULT_WINDAGE),
                horizon_hours=settings.drift_horizon_hours,
                data_source=forcing["source"] if forcing else drift_source,
            ))
    log = StageLog(
        stage="DRIFT", status="COMPLETED", duration_ms=_ms(t),
        detail=f"{len(trajectories)} trajectory forecast(s), {settings.drift_horizon_hours}h horizon"
               + (" — REAL currents+winds (Open-Meteo)" if drift_source == "open-meteo" else ""),
    )
    return trajectories, drift_source, log


def _clay_stage(t: float, clay_n: int, hotspots: list[Hotspot]) -> StageLog:
    """Always-emitted CLAY stage so a scan ALWAYS shows whether the 2nd-stage Clay
    verifier ran — on (N verified, M CONFIRMED), idle (no hotspots), or OFFLINE."""
    if clay_n:
        confirmed = sum(1 for h in hotspots if getattr(h, "tier", None) == "CONFIRMED")
        return StageLog(stage="CLAY", status="COMPLETED", duration_ms=_ms(t),
                        detail=f"Clay verified {clay_n} hotspot(s) → {confirmed} CONFIRMED / "
                               f"{clay_n - confirmed} POSSIBLE (foundation-model 2nd opinion, ~0.92 precision)")
    if not hotspots:
        return StageLog(stage="CLAY", status="COMPLETED", duration_ms=_ms(t),
                        detail="Clay ON — no plastic hotspots to verify this scan")
    if clay_live.available():
        return StageLog(stage="CLAY", status="COMPLETED", duration_ms=_ms(t),
                        detail="Clay ON — verifier returned no verdicts (chip/index issue)")
    return StageLog(stage="CLAY", status="SKIPPED", duration_ms=_ms(t),
                    detail="Clay OFFLINE — MLP-only; start clay_service.py on the GPU for 2nd-stage verification")


def _alert_stage(hotspots: list[Hotspot]) -> StageLog:
    t = time.perf_counter()
    alertable = [h for h in hotspots if h.severity in ("HIGH", "MEDIUM")]
    return StageLog(stage="ALERT", status="COMPLETED", duration_ms=_ms(t),
                    detail=f"{len(alertable)} alert(s) generated (HIGH/MEDIUM hotspots)")


# ── AOI run ───────────────────────────────────────────────────────────────────
def run_aoi(bbox: dict, scene_size: int = 64, min_confidence: float = 0.0,
            dedupe: bool = False, biofouling: bool = False) -> PipelineResult:
    """Run the full pipeline on ONE user-drawn AOI (bbox: north/south/east/west).

    Opt-in modifiers (all default off → identical to before): min_confidence drops
    weak detections, dedupe merges near-duplicates, biofouling reclassifies
    likely-biofouled plastic."""
    stages: list[StageLog] = []

    # 1. Ingest
    t = time.perf_counter()
    sd = download.scene_for_bbox(bbox, scene_size)
    real = sd.source == "sentinelhub"
    provider = "sentinelhub" if real else ("demo" if settings.demo_mode else settings.satellite_provider)
    detail = f"{len(sd.pixels)} candidate pixels for AOI via {provider}"
    if real:
        detail = _download_detail(detail + " — REAL Sentinel-2 reflectance", sd)
    elif download.band_loader.available() and sd.error:
        detail += f" — real ingest failed → synthetic ({sd.error[:60]})"
    stages.append(StageLog(stage="DOWNLOAD", status="COMPLETED", duration_ms=_ms(t), detail=detail))

    # 2. FDI
    t = time.perf_counter()
    candidates = _fdi_candidates(sd.pixels)
    stages.append(StageLog(stage="FDI", status="COMPLETED", duration_ms=_ms(t),
                           detail=f"{len(candidates)} candidate pixels above FDI {settings.fdi_threshold}"))

    # 3. CNN classification
    t = time.perf_counter()
    det_dicts, _, mode = batch_classifier.classify_candidates(candidates, sd.arr6, biofouling=biofouling)
    det_dicts = _apply_options(det_dicts, min_confidence, dedupe)
    plastic = sum(1 for d in det_dicts if d["classification"] == "Plastic")
    detections = [Detection(**d) for d in det_dicts]
    stages.append(StageLog(stage="CNN", status="COMPLETED", duration_ms=_ms(t),
                           detail=f"{plastic} plastic of {len(detections)} classified via {mode} "
                                  f"(model_loaded={infer.model_loaded()})"))

    # 4. DBSCAN
    t = time.perf_counter()
    hotspots = _make_hotspots(detections, "AOI")
    hotspots.sort(key=lambda h: h.detection_count, reverse=True)
    stages.append(StageLog(stage="DBSCAN", status="COMPLETED", duration_ms=_ms(t),
                           detail=f"{len(hotspots)} hotspot cluster(s) "
                                  f"(eps={settings.dbscan_eps_deg}°, min={settings.dbscan_min_samples})"))

    # Tag hotspots + queue their chips for offline Clay embedding (best-effort).
    run_id = f"aoi_{uuid.uuid4().hex[:10]}"
    generated_at = datetime.now(timezone.utc).isoformat()
    _embed_sites(run_id, sd.arr6, hotspots, candidates, None, generated_at)

    # 4b. Clay tier-2 — live second opinion from the GPU sidecar (best-effort; MLP
    #     result stands if the sidecar is offline).
    t = time.perf_counter()
    clay_n = clay_live.enrich_hotspots(sd.arr6, hotspots, candidates)
    stages.append(_clay_stage(t, clay_n, hotspots))

    # 5. Drift (coast ETA uses the AOI's eastern edge). clamp=False: the box edge
    #    is not a real coastline, so the path must not halt on the drawn rectangle.
    coast_lon = float(bbox["east"])
    trajectories, _src, drift_log = _drift_stage(hotspots, lambda _h: coast_lon, clamp=False)
    stages.append(drift_log)

    # 6. Alerts
    stages.append(_alert_stage(hotspots))

    avg_conf = round(sum(d.confidence for d in detections) / len(detections), 3) if detections else 0.0
    total_area = round(sum(d.area_sq_km for d in detections), 4)

    return PipelineResult(
        run_id=run_id, region=None,
        generated_at=generated_at, demo_mode=settings.demo_mode,
        stages=stages, detections=detections, hotspots=hotspots, trajectories=trajectories,
        stats=PipelineStats(
            candidate_pixels=len(candidates), detections=len(detections), plastic=plastic,
            hotspots=len(hotspots), avg_confidence=avg_conf, total_area_sq_km=total_area,
            provider=provider, model_loaded=infer.model_loaded(), surface=_surface(sd),
        ),
        bbox=BBox(north=bbox["north"], south=bbox["south"], east=bbox["east"], west=bbox["west"]),
        scene=_scene_ref_for_bbox(bbox),
    )


def run_aoi_events(bbox: dict, scene_size: int = 64):
    """Generator twin of run_aoi that YIELDS a real event after each pipeline stage
    (for SSE live-scan progress). Reuses the same stage helpers as run_aoi, so the
    timings and detail are the genuine per-stage work — just streamed as they finish.
    Yields dicts: {type:'stage',...} per stage, then one {type:'result',...}."""
    def stage_ev(stage, t0, detail):
        return {"type": "stage", "stage": stage, "status": "COMPLETED",
                "durationMs": _ms(t0), "detail": detail}

    # 1. Ingest
    t = time.perf_counter()
    sd = download.scene_for_bbox(bbox, scene_size)
    real = sd.source == "sentinelhub"
    yield stage_ev("DOWNLOAD", t, f"{len(sd.pixels)} candidate pixels"
                   + (" — REAL Sentinel-2" if real else " (synthetic)"))

    # 2. FDI
    t = time.perf_counter()
    candidates = _fdi_candidates(sd.pixels)
    yield stage_ev("FDI", t, f"{len(candidates)} candidate pixels above FDI {settings.fdi_threshold}")

    # 3. Classify
    t = time.perf_counter()
    det_dicts, _, mode = batch_classifier.classify_candidates(candidates, sd.arr6)
    plastic = sum(1 for d in det_dicts if d["classification"] == "Plastic")
    detections = [Detection(**d) for d in det_dicts]
    yield stage_ev("CNN", t, f"{plastic} plastic of {len(detections)} classified via {mode}")

    # 4. Cluster (+ spool embeddings, like run_aoi)
    t = time.perf_counter()
    hotspots = _make_hotspots(detections, "AOI")
    hotspots.sort(key=lambda h: h.detection_count, reverse=True)
    run_id = f"aoi_{uuid.uuid4().hex[:10]}"
    generated_at = datetime.now(timezone.utc).isoformat()
    _embed_sites(run_id, sd.arr6, hotspots, candidates, None, generated_at)
    yield stage_ev("DBSCAN", t, f"{len(hotspots)} hotspot cluster(s)")

    # 4b. Clay tier-2 (live GPU sidecar) — only emitted when it actually re-scored.
    t = time.perf_counter()
    clay_n = clay_live.enrich_hotspots(sd.arr6, hotspots, candidates)
    _cs = _clay_stage(t, clay_n, hotspots)
    yield {"type": "stage", "stage": "CLAY", "status": _cs.status,
           "durationMs": _cs.duration_ms, "detail": _cs.detail}

    # 5. Drift (clamp=False — AOI box edge is not a real coastline, see run_aoi)
    coast_lon = float(bbox["east"])
    _traj, _src, drift_log = _drift_stage(hotspots, lambda _h: coast_lon, clamp=False)
    yield {"type": "stage", "stage": "DRIFT", "status": drift_log.status,
           "durationMs": drift_log.duration_ms, "detail": drift_log.detail}

    # 6. Alerts
    alert_log = _alert_stage(hotspots)
    yield {"type": "stage", "stage": "ALERT", "status": alert_log.status,
           "durationMs": alert_log.duration_ms, "detail": alert_log.detail}

    avg_conf = round(sum(d.confidence for d in detections) / len(detections), 3) if detections else 0.0
    yield {"type": "result", "runId": run_id, "generatedAt": generated_at,
           "detections": len(detections), "plastic": plastic, "hotspots": len(hotspots),
           "avgConfidence": avg_conf, "provider": sd.source,
           "topHotspots": [{"label": h.label, "detectionCount": h.detection_count,
                            "severity": h.severity, "embedKey": h.embed_key} for h in hotspots[:5]]}


def _scene_ref_for_bbox(bbox: dict) -> SceneRef | None:
    s = download.scene_ref_for_bbox(bbox)
    if not s:
        return None
    return SceneRef(
        scene_id=s["sceneId"], platform=s.get("platform", "sentinel-2"),
        tile=s.get("tile", ""), acquisition_date=s.get("acquisitionDate", ""),
        cloud_cover_pct=float(s.get("cloudCoverPct", 0.0) or 0.0),
        thumbnail=s.get("thumbnail"), source="stac", bbox=s.get("bbox"),
    )


# ── Region run ────────────────────────────────────────────────────────────────
def run_pipeline(region: str | None = None, scene_size: int = 48, min_confidence: float = 0.0,
                 dedupe: bool = False, biofouling: bool = False) -> PipelineResult:
    codes = [region] if region in REGIONS else list(REGIONS)
    stages: list[StageLog] = []

    # 1. Ingest (per region — each SceneData carries its own surface/mask)
    t = time.perf_counter()
    scene_map: dict[str, download.SceneData] = {code: download.scene_for(code, scene_size) for code in codes}
    pixel_count = sum(len(sd.pixels) for sd in scene_map.values())
    sources = {sd.source for sd in scene_map.values()}
    real = "sentinelhub" in sources
    provider = "sentinelhub" if real else ("demo" if settings.demo_mode else settings.satellite_provider)
    detail = f"{pixel_count} pixels across {len(codes)} region(s) via {provider}"
    single_sd = scene_map[codes[0]] if len(codes) == 1 else None
    if real:
        detail += " — REAL Sentinel-2 reflectance"
        if single_sd is not None and single_sd.source == "sentinelhub":
            detail = _download_detail(detail, single_sd)
        else:
            last = next((sd for sd in scene_map.values() if sd.mask), None)
            if last and last.mask:
                detail += f" · SCL kept {last.mask['valid_pct']}% candidate px (last region)"
    else:
        err = next((sd.error for sd in scene_map.values() if sd.error), None)
        if download.band_loader.available() and err:
            detail += f" — real ingest failed → synthetic ({err[:60]})"
    stages.append(StageLog(stage="DOWNLOAD", status="COMPLETED", duration_ms=_ms(t), detail=detail))

    # 2. FDI (per region)
    t = time.perf_counter()
    candidates_by_code = {code: _fdi_candidates(sd.pixels) for code, sd in scene_map.items()}
    total_cand = sum(len(v) for v in candidates_by_code.values())
    stages.append(StageLog(stage="FDI", status="COMPLETED", duration_ms=_ms(t),
                           detail=f"{total_cand} candidate pixels above FDI {settings.fdi_threshold}"))

    # 3. CNN (per region so patch models cut from that region's array)
    t = time.perf_counter()
    detections: list[Detection] = []
    det_region: list[str] = []
    plastic = 0
    modes: set[str] = set()
    for code, lst in candidates_by_code.items():
        dets, _, mode = batch_classifier.classify_candidates(lst, scene_map[code].arr6, biofouling=biofouling)
        dets = _apply_options(dets, min_confidence, dedupe)
        for d in dets:
            detections.append(Detection(**d))
            det_region.append(code)
        plastic += sum(1 for d in dets if d["classification"] == "Plastic")
        modes.add(mode)
    mode = "patch CNN" if "patch CNN" in modes else ("per-pixel model" if "per-pixel model" in modes else "heuristic")
    stages.append(StageLog(stage="CNN", status="COMPLETED", duration_ms=_ms(t),
                           detail=f"{plastic} plastic of {len(detections)} classified via {mode} "
                                  f"(model_loaded={infer.model_loaded()})"))

    # 4. DBSCAN (per region → labels encode the region)
    t = time.perf_counter()
    hotspots: list[Hotspot] = []
    for code in codes:
        region_dets = [d for d, rc in zip(detections, det_region) if rc == code]
        hotspots.extend(_make_hotspots(region_dets, code))
    hotspots.sort(key=lambda h: h.detection_count, reverse=True)
    stages.append(StageLog(stage="DBSCAN", status="COMPLETED", duration_ms=_ms(t),
                           detail=f"{len(hotspots)} hotspot cluster(s) "
                                  f"(eps={settings.dbscan_eps_deg}°, min={settings.dbscan_min_samples})"))

    # Tag hotspots + queue chips for offline Clay embedding, per region (each uses
    # its own scene array + candidates so chips are cut from the right scene).
    run_id = f"run_{uuid.uuid4().hex[:10]}"
    generated_at = datetime.now(timezone.utc).isoformat()
    t_clay = time.perf_counter()
    clay_total = 0
    for code in codes:
        region_hotspots = [h for h in hotspots if h.label.split("-H")[0] == code]
        _embed_sites(f"{run_id}_{code}", scene_map[code].arr6, region_hotspots,
                     candidates_by_code[code], code, generated_at)
        clay_total += clay_live.enrich_hotspots(scene_map[code].arr6, region_hotspots,
                                                candidates_by_code[code])
    stages.append(_clay_stage(t_clay, clay_total, hotspots))

    # 5. Drift (coast from the hotspot's region, derived from its label — robust
    #    to the post-sort order, unlike the previous index-based lookup)
    trajectories, _src, drift_log = _drift_stage(
        hotspots, lambda h: coast_lon_for(h.label.split("-H")[0]),
    )
    stages.append(drift_log)

    # 6. Alerts
    stages.append(_alert_stage(hotspots))

    avg_conf = round(sum(d.confidence for d in detections) / len(detections), 3) if detections else 0.0
    total_area = round(sum(d.area_sq_km for d in detections), 4)

    return PipelineResult(
        run_id=run_id,
        region=region if region in REGIONS else None,
        generated_at=generated_at, demo_mode=settings.demo_mode,
        stages=stages, detections=detections, hotspots=hotspots, trajectories=trajectories,
        stats=PipelineStats(
            candidate_pixels=total_cand, detections=len(detections), plastic=plastic,
            hotspots=len(hotspots), avg_confidence=avg_conf, total_area_sq_km=total_area,
            provider=provider, model_loaded=infer.model_loaded(),
            surface=_surface(single_sd) if single_sd is not None else None,
        ),
    )
