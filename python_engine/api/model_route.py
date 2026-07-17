"""Model routes — active classifier card + live held-out evaluation.

/model/info is the model card (from metrics.json); /model/evaluate re-scores the
shipped ONNX on a cached MARIDA/MADOS split on demand (real held-out metrics).
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ml import model_loader

router = APIRouter()
_MODELS = Path(__file__).resolve().parents[1] / "models"


def _read_json(name: str) -> dict:
    try:
        return json.loads((_MODELS / name).read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 — missing artefact is fine
        return {}


@router.get("/model/info", summary="Active classifier + held-out evaluation metrics")
def model_info() -> dict:
    return model_loader.model_info()


@router.get("/model/validation", summary="Operating regime — fusion calibration + PLP independent validation")
def model_validation() -> dict:
    """The evidence behind the CONFIRMED/POSSIBLE tier: how the tier was calibrated
    (MARIDA+MADOS held-out) and how it holds up on independent PLP deployed targets,
    including the honest chip-scale limitation. Reads the shipped JSON artefacts."""
    metrics = _read_json("metrics.json")
    thresholds = _read_json("fusion_thresholds.json")
    plp = metrics.get("plpValidation", {})
    return {
        "available": bool(thresholds or plp),
        "fusion": thresholds or None,
        "plp": {k: plp.get(k) for k in ("hdpeHitRate", "fdiGateRate", "woodAsPlasticRate",
                                        "medianSceneFpPct", "dates", "dataset")} if plp else None,
        "clayFusion": plp.get("clayFusion"),
    }


@router.get("/model/evaluate", summary="Live held-out evaluation on a cached split")
def model_evaluate(dataset: str = "marida", split: str = "test") -> dict:
    if dataset not in ("marida", "mados"):
        raise HTTPException(status_code=400, detail="dataset must be 'marida' or 'mados'")
    if split not in ("train", "val", "test"):
        raise HTTPException(status_code=400, detail="split must be 'train', 'val' or 'test'")
    try:
        from ml.evaluate import evaluate_npz
        res = evaluate_npz(dataset, split)
    except Exception as exc:  # noqa: BLE001 — numpy/onnxruntime optional
        raise HTTPException(status_code=503, detail=f"evaluation unavailable: {exc}")
    if res is None:
        raise HTTPException(status_code=404, detail="no cached split or no ONNX model loaded")
    return {"dataset": dataset, "split": split, **res}
