"""Training datasets + loaders.

  * dataset  — synthetic Sentinel-2 spectral library (baseline, pure numpy)
  * marida   — REAL MARIDA benchmark loader (Kikaki et al. 2022)
  * mados    — REAL MADOS benchmark loader (Kikaki/Kakogeorgiou et al. 2024)
All three yield the engine's 7-feature contract [B04,B06,B08,B8A,B11,FDI,NDVI].
Loaders cache to python_engine/models/<name>_<split>.npz.
"""
