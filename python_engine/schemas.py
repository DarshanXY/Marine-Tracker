"""Pydantic schemas — the engine's JSON contract.

Fields are snake_case in Python but serialize to camelCase (via alias) so the
JSON matches the Node backend / React frontend exactly. This is the SAME contract
the previous engine served, so nothing downstream changes.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Bands(Camel):
    b04: float
    b06: float
    b08: float
    b8a: float = 0.0
    b11: float


class Detection(Camel):
    lat: float
    lon: float
    classification: str
    confidence: float
    fdi_score: float
    area_sq_km: float
    status: str = "PENDING"
    # True only for Plastic whose P(plastic) clears the calibrated ~90%-precision
    # threshold. The reliable tier that hotspots/dispatch act on; everything else
    # is a review-queue candidate.
    high_confidence: bool = False


class Hotspot(Camel):
    label: str
    centroid_lat: float
    centroid_lon: float
    detection_count: int
    severity: str
    confidence: float
    eta_hours: float | None = None
    # Stable site key for the Clay embedding store (region:lat,lon). Lets the UI
    # ask for THIS site's true foundation-model neighbours once it's been embedded.
    embed_key: str | None = None
    # Live Clay tier-2 (set when the GPU sidecar re-scored this hotspot during the
    # scan). tier: 'CONFIRMED' (MLP+Clay agree, high) | 'POSSIBLE' (wider net).
    clay_class: str | None = None
    anomaly: float | None = None
    tier: str | None = None
    fusion: dict | None = None


class TrajectoryPoint(Camel):
    t: int
    lat: float
    lon: float


class ConePoint(Camel):
    t: int
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float


class Trajectory(Camel):
    detection_index: int
    points: list[TrajectoryPoint]
    cone: list[ConePoint]
    windage_coeffs: list[float]
    horizon_hours: int
    data_source: str = "demo"


class StageLog(Camel):
    stage: str
    status: str
    duration_ms: int
    detail: str


class Surface(Camel):
    """What the scanned area actually is, from the Sentinel-2 SCL scene
    classification — so the UI can say in real time whether you scanned water,
    land, cloud, or a mix. Marine-debris detection (FDI) is only valid over
    water; `water_valid` is False when there is too little real water to trust
    any candidates found here."""
    water_pct: float
    land_pct: float
    cloud_pct: float
    other_pct: float
    label: str          # 'water' | 'land' | 'cloud' | 'mixed' | 'no-observation'
    water_valid: bool
    source: str = "scl"  # 'scl' (precise, real scene) | 'geographic-estimate' (terrain elevation)
    reliability: str = "unknown"  # 'reliable' | 'degraded' | 'unusable' | 'unknown'
    coverage_pct: float = 100.0  # % of AOI with a clear observation (rest = cloud-gapped nodata)


class PipelineStats(Camel):
    candidate_pixels: int
    detections: int
    plastic: int
    hotspots: int
    avg_confidence: float
    total_area_sq_km: float
    provider: str
    model_loaded: bool
    surface: Surface | None = None


class BBox(Camel):
    north: float
    south: float
    east: float
    west: float


class SceneRef(Camel):
    """The real Sentinel-2 scene an AOI run corresponds to (from STAC), if any."""
    scene_id: str
    platform: str = "sentinel-2"
    tile: str = ""
    acquisition_date: str = ""
    cloud_cover_pct: float = 0.0
    thumbnail: str | None = None
    source: str = "stac"  # 'stac' (real) | 'demo'
    bbox: list[float] | None = None  # STAC footprint [w, s, e, n] for map overlay


class PipelineResult(Camel):
    run_id: str
    region: str | None
    generated_at: str
    demo_mode: bool
    stages: list[StageLog]
    detections: list[Detection]
    hotspots: list[Hotspot]
    trajectories: list[Trajectory]
    stats: PipelineStats
    bbox: BBox | None = None
    scene: SceneRef | None = None


# ── Request bodies ────────────────────────────────────────────────
class RunRequest(Camel):
    region: str | None = None
    scene_size: int = 48
    bbox: BBox | None = None
    # Opt-in post-processing (all default off → base result unchanged).
    min_confidence: float = 0.0   # drop detections below this confidence
    dedupe: bool = False          # merge near-duplicate detections
    biofouling: bool = False      # reclassify likely-biofouled plastic


class BatchRunRequest(Camel):
    """Scan several AOIs in one call → a result per bbox (see /pipeline/batch)."""
    bboxes: list[BBox]
    scene_size: int = 64
    min_confidence: float = 0.0
    dedupe: bool = False
    biofouling: bool = False


class FdiRequest(Camel):
    b06: float
    b08: float
    b11: float


class DriftRequest(Camel):
    lat: float
    lon: float
    horizon_hours: int = 72


class IndicesRequest(Camel):
    """Bands for a full spectral-index readout (FDI/NDVI/NDWI/FAI/PI). B03 (green)
    is optional — NDWI/FAI need it; the rest work without."""
    b03: float = 0.0
    b04: float
    b06: float
    b08: float
    b8a: float = 0.0
    b11: float


class GeoTiffRequest(Camel):
    bbox: BBox
    layer: str = "fdi"   # 'fdi' | 'ndvi' | 'ndwi' | 'class'


class ChangeRequest(Camel):
    """Change detection: compare a recent window vs an older one over an AOI."""
    bbox: BBox
    days_recent: int = 30
    days_old: int = 180
