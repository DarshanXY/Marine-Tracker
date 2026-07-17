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

    # Detection pipeline parameters (match the scientific spec).
    fdi_threshold: float = float(os.getenv("FDI_THRESHOLD", "0.02"))
    dbscan_eps_deg: float = float(os.getenv("DBSCAN_EPS_DEG", "0.09"))
    dbscan_min_samples: int = int(os.getenv("DBSCAN_MIN_SAMPLES", "3"))
    drift_horizon_hours: int = int(os.getenv("DRIFT_HORIZON_HOURS", "72"))

    @property
    def satellite_configured(self) -> bool:
        if self.satellite_provider in {"cdse", "sentinelhub"}:
            return bool(self.sh_client_id and self.sh_client_secret)
        return self.satellite_provider == "aws-stac"


settings = Settings()
