"""Polygon landfall: a parcel beaches the first hour it is inside land, and the
drawn path is cut exactly at the coast crossing."""
from trajectory import polygon_landfall as pl


def _land_east_of_10(lat: float, lon: float) -> bool:  # coast is the meridian lon=10 (test double)
    return lon >= 10.0


def _mean(lons):
    return [{"t": i, "lat": 5.0, "lon": lon} for i, lon in enumerate(lons)]


def _cone(points):
    return [{"t": p["t"], "lat_min": p["lat"] - .1, "lat_max": p["lat"] + .1,
             "lon_min": p["lon"] - .1, "lon_max": p["lon"] + .1} for p in points]


def test_path_is_cut_at_the_crossing():
    pts = _mean([8.0, 9.0, 11.0, 12.0])  # crosses lon 10 between hour 1 and 2
    cp, cc, end_h, reason = pl.clamp_path(pts, _cone(pts), _land_east_of_10)
    assert reason == "landfall"
    assert 1.0 < end_h < 2.0
    assert abs(cp[-1]["lon"] - 10.0) < 0.01          # ends on the coast, not inland
    assert all(p["lon"] < 10.0 + 0.01 for p in cp)
    assert len(cp) == len(cc)


def test_open_water_path_is_untouched():
    pts = _mean([1.0, 2.0, 3.0])
    cp, _cc, end_h, reason = pl.clamp_path(pts, _cone(pts), _land_east_of_10)
    assert reason == "horizon" and end_h == 2.0 and cp == pts


def test_probability_is_fraction_of_members_that_reach_land():
    members = [
        [(5.0, 8.0), (5.0, 11.0)],   # lands at hour 1
        [(5.0, 8.0), (5.0, 9.0)],    # stays at sea
        [(5.0, 8.0), (5.0, 9.5), (5.0, 12.0)],  # lands at hour 2
        [(5.0, 1.0), (5.0, 2.0)],    # stays at sea
    ]
    s = pl.landfall_stats(members, _land_east_of_10)
    assert s["probability"] == 0.5 and s["madeLandfall"] == 2
    assert s["earliestEtaHours"] == 1.0 and s["latestEtaHours"] == 2.0


def test_start_on_land_is_not_counted_as_landfall():
    s = pl.landfall_stats([[(5.0, 11.0), (5.0, 12.0)]], _land_east_of_10)
    # index 0 is the release point; only later hours count
    assert s["madeLandfall"] == 1 and s["earliestEtaHours"] == 1.0
