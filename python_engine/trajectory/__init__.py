"""Drift forecasting: Lagrangian advection under a windage ensemble, forced by
REAL Open-Meteo currents + winds (keyless) with a synthetic fallback.

    fetch_ocean_currents + fetch_wind_data  →  data_interpolator.fetch_forcing
    →  lagrangian_model.simulate (ensemble_model)  →  eta_calculator.coast_eta_hours
back_tracker runs the same model in reverse for upstream-source estimation.
"""
