"""Fuse the per-pixel MLP and the Clay foundation model into ONE confidence tier.

The two models see a site differently: the MLP reads a pixel's spectral signature
(fast, precise, low false-positive), while Clay reads the whole 64x64 chip's learned
fingerprint (generalises to new seas, gives a retrieval class + a novelty score). A
detection is most trustworthy when BOTH agree; least when they disagree or the site
looks unlike anything known. This collapses those signals into High / Medium / Low.

Pure python (no numpy/torch) so it runs anywhere and is trivially testable.
"""
from __future__ import annotations

import json
from pathlib import Path

TIERS = ("Low", "Medium", "High")

# CONFIRMED / POSSIBLE tier thresholds, calibrated on the real MARIDA+MADOS held-out
# test set by ml.tune_fusion (max recall s.t. CONFIRMED precision >= target). Falls
# back to sensible defaults if the file is absent. Re-read live so a re-calibration
# takes effect without a code change.
_THRESH_PATH = Path(__file__).resolve().parents[1] / "models" / "fusion_thresholds.json"
_DEFAULTS = {"conf_high": 0.7, "aff_min": 0.10, "anomaly_tau": 0.20, "conf_low": 0.50}


def thresholds() -> dict:
    try:
        return {**_DEFAULTS, **json.loads(_THRESH_PATH.read_text(encoding="utf-8"))}
    except Exception:  # noqa: BLE001 — defaults are always safe
        return dict(_DEFAULTS)


def hotspot_tier(mlp_conf: float, plastic_affinity: float, anomaly: float) -> dict:
    """Calibrated CONFIRMED / POSSIBLE decision for an MLP-Plastic hotspot, from the
    MLP confidence + Clay's class-robust Plastic-affinity (weighted k-NN vote share —
    NOT raw argmax, which is water-biased) + novelty. CONFIRMED is deliberately
    precise (~0.92 on held-out); everything else is POSSIBLE (the wider net). Returns
    the frontend ConfidenceFusion shape (tier = High/Medium/Low) + confirmed flag."""
    t = thresholds()
    novel = anomaly > t["anomaly_tau"]
    confirmed = (mlp_conf >= t["conf_high"] and plastic_affinity >= t["aff_min"] and not novel)
    if confirmed:
        level = "High"
        reasons = [f"MLP {mlp_conf:.0%} + Clay plastic-affinity {plastic_affinity:.0%} → confirmed"]
    else:
        why = []
        if mlp_conf < t["conf_high"]:
            why.append(f"MLP confidence {mlp_conf:.0%} below {t['conf_high']:.0%}")
        if plastic_affinity < t["aff_min"]:
            why.append(f"low Clay plastic-affinity {plastic_affinity:.0%}")
        if novel:
            why.append(f"unusual site (novelty {anomaly:.2f})")
        level = "Low" if (plastic_affinity < 0.15 or novel or mlp_conf < t["conf_low"]) else "Medium"
        reasons = why or ["below the confirmed bar"]
    return {"tier": level, "confirmed": confirmed, "basis": "mlp+clay",
            "score": round(float(plastic_affinity), 3),
            "plasticAffinity": round(float(plastic_affinity), 3),
            "anomaly": round(float(anomaly), 4), "reasons": reasons}


def fuse(mlp_class: str, mlp_conf: float,
         clay_class: str | None = None,
         anomaly: float | None = None,
         novel: bool | None = None) -> dict:
    """Combine MLP (class, confidence) with Clay (retrieval class, novelty) into a
    tier + a 0-1 fused score + human reasons.

    basis='mlp+clay' when a Clay signal is present (agreement + novelty modulate the
    score), else 'mlp-only' (confidence banding). Agreement between the two
    independent models is the strongest trust signal; disagreement or novelty
    downgrades even a confident MLP call, since that's exactly where it's least
    reliable on unfamiliar water.
    """
    reasons: list[str] = []
    conf = max(0.0, min(1.0, float(mlp_conf)))

    if clay_class is None:
        # No embedding for this site yet — confidence banding on the MLP alone.
        score = conf
        tier = "High" if conf >= 0.85 else "Medium" if conf >= 0.60 else "Low"
        reasons.append(f"MLP {mlp_class} @ {conf:.0%} (no Clay embedding yet)")
        return {"tier": tier, "score": round(score, 3), "basis": "mlp-only",
                "agreement": None, "reasons": reasons}

    agreement = mlp_class == clay_class
    score = conf
    if agreement:
        score += 0.15
        reasons.append(f"MLP and Clay agree: {mlp_class}")
    else:
        score -= 0.20
        reasons.append(f"MLP says {mlp_class}, Clay says {clay_class}")
    if novel:
        score -= 0.15
        reasons.append(f"unusual site (novelty {anomaly:.2f})" if anomaly is not None else "unusual site")
    score = max(0.0, min(1.0, score))

    # Tier from the joint evidence, not the score alone, so the rules are explicit.
    if agreement and conf >= 0.75 and not novel:
        tier = "High"
    elif (not agreement) or novel or conf < 0.50:
        tier = "Low"
    else:
        tier = "Medium"
    return {"tier": tier, "score": round(score, 3), "basis": "mlp+clay",
            "agreement": agreement, "reasons": reasons}
