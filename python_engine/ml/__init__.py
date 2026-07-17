"""Machine learning: model loading, inference, classification, evaluation, training.

Runtime path:  batch_classifier → inference_engine → model_loader (ONNX Runtime),
with an interpretable spectral heuristic when no model is loaded.
Post-processing utilities: area_estimator, confidence_filter, detection_merger,
biofouling_corrector (opt-in).
Datasets + trainers (datasets/, train*.py) re-create the shipped per-pixel MLP
from the synthetic library or the REAL MARIDA / MADOS benchmarks; evaluate.py
scores the loaded ONNX on the cached splits.
"""
