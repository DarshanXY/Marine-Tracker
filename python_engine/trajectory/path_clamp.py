"""Halt a drift path at the coastline (landfall clamp).

A floating parcel that reaches the coast beaches there — it does not keep
drifting inland. The raw integrator has no concept of land, so a forecast whose
mean path crosses the coastline within the horizon otherwise runs on for the
full 72 h and ends kilometres inland. This post-processes the AGGREGATED mean
path + uncertainty cone so the drawn path stops on the coast.

Design note — why this operates on the mean/cone and NOT the ensemble members:
`ensemble_model.mean_and_cone` takes ``horizon = len(members[0]) - 1`` and then
indexes ``m[t]`` for every member. Clamping members individually makes them
ragged (different windage coefficients beach at different hours), which either
silently drops hours (it reads the horizon off member 0 alone) or raises
IndexError depending on member order. Clamping only the two output arrays keeps
every member full-length and untouched, so:
  • `landfall_stats(members, coast_lon)` sees bit-identical input → the landfall
    PROBABILITY is unchanged by construction, not by argument;
  • `coast_eta_hours(raw_points, coast_lon)` is computed on the raw mean before
    truncation → `etaHours` keeps exactly today's value.

The single-longitude coast model (`coast_lon`) is a crude approximation; the
caller records `coastModel: "meridian"` in the payload so that is auditable
rather than implied. The clamp is a no-op when `coast_lon is None`.
"""
from __future__ import annotations

from .eta_calculator import coast_eta_hours


def clamp_path_to_coast(
    points: list[dict], cone: list[dict], coast_lon: float | None,
) -> tuple[list[dict], list[dict], float, str]:
    """Clamp an aggregated (points, cone) drift path at `coast_lon`.

    Both arrays are snake_case dicts exactly as `ensemble_model.mean_and_cone`
    returns them (points: t/lat/lon; cone: t/lat_min/lat_max/lon_min/lon_max),
    and are returned in the same shape — so this is safe to call on both the
    on-demand forecast path and the pipeline trajectory path.

    Returns (points, cone, end_hours, end_reason) where end_reason is
    "landfall" if the mean path met the coast within the horizon (path is
    truncated at the crossing, terminal longitude assigned to `coast_lon`
    verbatim), else "horizon" (path untouched — only the cone is capped so an
    over-shooting member cannot bulge the envelope inland).
    """
    if coast_lon is None or not points:
        end = float(points[-1]["t"]) if points else 0.0
        return points, cone, end, "horizon"

    # Approach side: does the coast lie east (higher lon) or west of the release
    # point? Mirrors eta_calculator.coast_eta_hours exactly.
    east = coast_lon >= points[0]["lon"]

    # Cap the cone's longitude at the coast for EVERY step, regardless of whether
    # the mean path crosses: individual ensemble members can overshoot the coast
    # even when their mean does not, and the envelope must not extend inland.
    capped: list[dict] = []
    for e in cone:
        e = dict(e)
        if east:
            e["lon_max"] = min(e["lon_max"], coast_lon)
            e["lon_min"] = min(e["lon_min"], coast_lon)
        else:
            e["lon_min"] = max(e["lon_min"], coast_lon)
            e["lon_max"] = max(e["lon_max"], coast_lon)
        capped.append(e)

    eta = coast_eta_hours(points, coast_lon)
    if eta is None:
        # Mean path never reaches the coast within the horizon → full path stands.
        return points, capped, float(points[-1]["t"]), "horizon"

    k = int(eta)
    clamped_pts = [dict(p) for p in points[:k + 1]]

    if k >= 1:
        # Place the terminal vertex exactly on the coast: interpolate its
        # latitude along the final mean segment at the crossing longitude, then
        # ASSIGN the longitude verbatim (never rounded) so a consumer
        # re-deriving the ETA from the payload gets the same crossing index.
        a, b = points[k - 1], points[k]
        d = b["lon"] - a["lon"]
        f = min(1.0, max(0.0, (coast_lon - a["lon"]) / d)) if d else 1.0
        clamped_pts[k]["lat"] = round(a["lat"] + f * (b["lat"] - a["lat"]), 5)
    clamped_pts[k]["lon"] = coast_lon

    clamped_cone = capped[:k + 1]
    # Keep the terminal vertex inside its own cone: the interpolated mean point
    # can fall just outside the raw index-k latitude envelope, and a mean point
    # drawn outside its uncertainty band reads as a defect.
    tail = dict(clamped_cone[k])
    tail["lat_min"] = min(tail["lat_min"], clamped_pts[k]["lat"])
    tail["lat_max"] = max(tail["lat_max"], clamped_pts[k]["lat"])
    clamped_cone[k] = tail

    return clamped_pts, clamped_cone, float(k), "landfall"
