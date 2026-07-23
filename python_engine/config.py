"""Engine configuration — reads env + .env (zero extra dependency).

Loads .env from the current dir, this package dir, and the repo root, then
exposes a `settings` singleton. Identical knobs to the previous engine so the
scientific parameters (FDI threshold, DBSCAN eps/min, drift horizon) and the
Sentinel Hub / CDSE credentials are picked up unchanged.
"""
from __future__ import annotations

import os
from pathlib import Path


def _load_env_files() -> None:
    """Populate os.environ from .env files without python-dotenv."""
    here = Path(__file__).resolve()
    candidates = [
        Path.cwd() / ".env",
        here.parent / ".env",          # python_engine/.env
        here.parent.parent / ".env",   # repo-root/.env  (real CDSE creds live here)
    ]
    for path in candidates:
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for raw in text.splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_env_files()


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    """Runtime settings (env-driven)."""

    demo_mode: bool = _bool(os.getenv("DEMO_MODE"), True)
    satellite_provider: str = os.getenv("SATELLITE_PROVIDER", "demo").lower()
    sh_client_id: str = os.getenv("SENTINEL_HUB_CLIENT_ID", "")
    sh_client_secret: str = os.getenv("SENTINEL_HUB_CLIENT_SECRET", "")
    sh_base_url: str = os.getenv("SENTINEL_HUB_BASE_URL", "https://sh.dataspace.copernicus.eu")
    sh_token_url: str = os.getenv(
        "SENTINEL_HUB_TOKEN_URL",
        "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
    )

    # Plastic reliability tier. A plastic detection is HIGH-CONFIDENCE when its
    # P(plastic) >= this threshold — calibrated on the held-out test to ~90%
    # precision (P>=0.648 → precision 0.90, recall 0.57 for the ensemble). Hotspots
    # (what dispatch acts on) are built from HIGH-CONFIDENCE plastic ONLY, so a crew
    # is never sent to a low-confidence maybe. Lower it to widen recall, raise it
    # (e.g. 0.79 → 95% precision) to only ever flag near-certain plastic.
    plastic_high_conf: float = float(os.getenv("PLASTIC_HIGH_CONF", "0.648"))

    # Detection pipeline parameters (match the scientific spec).
    fdi_threshold: float = float(os.getenv("FDI_THRESHOLD", "0.02"))
    dbscan_eps_deg: float = float(os.getenv("DBSCAN_EPS_DEG", "0.09"))
    dbscan_min_samples: int = int(os.getenv("DBSCAN_MIN_SAMPLES", "3"))
    drift_horizon_hours: int = int(os.getenv("DRIFT_HORIZON_HOURS", "72"))

    # Real-ingest quality gate. FDI is only physically meaningful over clear water,
    # so we ask CDSE for a LEAST-cloud composite under `ingest_max_cloud`% within a
    # `ingest_days_back`-day window, widening to `ingest_days_back_max` only when the
    # first pull is still too cloudy. 100 → a monsoon scene returned cloud-top false
    # positives; 25 was too strict → most pixels had no clear pass (nodata gaps,
    # ~18% coverage). 50 is the sweet spot: leastCC compositing already picks the
    # clearest pixels, so 50 gives FULL coverage at the same low effective cloud,
    # while the scene filter still drops the worst passes.
    ingest_max_cloud: int = int(os.getenv("INGEST_MAX_CLOUD", "50"))
    ingest_days_back: int = int(os.getenv("INGEST_DAYS_BACK", "45"))
    ingest_days_back_max: int = int(os.getenv("INGEST_DAYS_BACK_MAX", "180"))
    # SCL classes kept as possible marine detections. Default 6 (water) + 7
    # (unclassified — where 20 m debris rafts usually fall). Class 2 (dark area) is
    # dropped by default: it is mostly terrain/cloud shadow and was the biggest
    # land/haze false-positive leak. Set INGEST_KEEP_SCL="2,6,7" to restore it.
    ingest_keep_scl: tuple[int, ...] = tuple(
        int(x) for x in os.getenv("INGEST_KEEP_SCL", "6,7").split(",") if x.strip()
    )

    @property
    def satellite_configured(self) -> bool:
        if self.satellite_provider in {"cdse", "sentinelhub"}:
            return bool(self.sh_client_id and self.sh_client_secret)
        return self.satellite_provider == "aws-stac"


settings = Settings()
