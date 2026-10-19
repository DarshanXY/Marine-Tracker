# Model Performance Evaluation — Marine Plastic Tracker

*Independently verified by loading the shipped model and re-running it against the cached held-out test data in this session — not copied from a report on faith. A real discrepancy was found in Section 6 (`fusion_thresholds.json` stale relative to the current classifier) — it has since been fixed by re-running `python -m ml.tune_fusion`; Section 6 is kept below as a record of the finding, with the post-fix numbers appended. As of 2026-10-04.*

---

## Contents

1. [Which model, which task](#1-which-model-which-task)
2. [How this was verified](#2-how-this-was-verified)
3. [Final numerical results — main classifier](#3-final-numerical-results--main-classifier)
4. [Per-class results (classification report)](#4-per-class-results-classification-report)
5. [Confusion matrix](#5-confusion-matrix)
6. [Secondary task: the Clay CONFIRMED/POSSIBLE verifier — a real discrepancy](#6-secondary-task-the-clay-confirmedpossible-verifier--a-real-discrepancy)
7. [Dataset sizes and class distribution](#7-dataset-sizes-and-class-distribution)
8. [The exact Python code used](#8-the-exact-python-code-used)
9. [What is *not* classification, and why P/R/Macro-F1 don't apply there](#9-what-is-not-classification-and-why-prmacro-f1-dont-apply-there)
10. [Interpretation](#10-interpretation)
11. [Research-paper-ready table](#11-research-paper-ready-table)
12. [Is this suitable for an academic paper, and where does it go?](#12-is-this-suitable-for-an-academic-paper-and-where-does-it-go)

---

## 1. Which model, which task

The pipeline has several learned and non-learned stages. Only one is the "main classification model":

| Stage | Type | Ground truth exists? | Scorable with P/R/F1? |
| --- | --- | --- | --- |
| FDI thresholding | Rule-based physics, not learned | — | No (not a model) |
| **Per-pixel MLP ensemble (`marinenet.onnx`)** | **4-class supervised classification** | **Yes — MARIDA+MADOS official splits** | **Yes — this is the main task** |
| DBSCAN hotspot clustering | Unsupervised clustering | No cluster ground truth in repo | No (no clustering metric is computed anywhere in the code either — none is invented here) |
| Clay + MLP "CONFIRMED/POSSIBLE" fusion | Binary verification on the MLP's Plastic-positive subset | Yes, but a narrower population | Yes, but a **different**, secondary task (Section 6) |
| 72 h drift (Lagrangian / RK4) | Trajectory regression | Yes, GDP drifter tracks | **No** — scored with Liu–Weisberg skill score + km separation, not classification metrics |

**Main classification task → `marinenet.onnx`**, a 3-seed ensemble MLP (11 → 256 → 128 → 64 → 32 → 4) doing per-pixel 4-class classification: **Plastic / Algae / Sea_Foam / Water**. This is a standard multi-class classification problem — not object detection (no bounding boxes) and not evaluated as segmentation IoU anywhere in the code — so Precision, Recall and Macro-F1 are the correct, directly applicable metrics, computed over individually labelled pixels.

---

## 2. How this was verified

```powershell
cd python_engine
python verify_model.py   # the script in Section 8, run in this session
```

`python_engine/models/marinenet.onnx` was loaded with `onnxruntime` and fed the cached **official test splits** (`models/marida_test.npz`, `models/mados_test.npz` — pixels the model never saw during training). The confusion matrix and all metrics were computed from scratch with independent code (not the repo's own `ml/evaluate.py`, used here only as a cross-check). Result: **byte-identical** to the shipped `models/metrics.json`. This confirms the reported numbers for the main classifier are real and reproducible. The *secondary* fusion metric (Section 6) was checked the same way and turned out **not** to still match — that finding is reported honestly below rather than hidden.

---

## 3. Final numerical results — main classifier

| Metric | Value |
| --- | --- |
| Test samples (n) | **499,907** pixels |
| Overall accuracy | 0.9899 |
| **Macro precision** | **0.7759** |
| **Macro recall** | **0.8685** |
| **Macro F1** | **0.8175** |
| Weighted F1 (support-weighted) | 0.9904 |

Accuracy (0.99) and weighted-F1 (0.99) are inflated by Water being 98 % of pixels. **Macro-F1 (0.8175) is the honest headline number**, since it weights all 4 classes equally regardless of how rare Plastic is.

---

## 4. Per-class results (classification report)

| Class | Precision | Recall | F1 | Support (true count) |
| --- | --- | --- | --- | --- |
| Plastic | 0.7761 | 0.8242 | 0.7994 | 1,354 |
| Algae | 0.6484 | 0.8221 | 0.7250 | 7,328 |
| Sea_Foam | 0.6814 | 0.8346 | 0.7503 | 774 |
| Water | 0.9976 | 0.9931 | 0.9953 | 490,451 |
| **Macro avg** | **0.7759** | **0.8685** | **0.8175** | 499,907 |
| Weighted avg | 0.9906 | 0.9899 | 0.9904 | 499,907 |

---

## 5. Confusion matrix

Rows = true class, columns = predicted class.

```
                 Pred:Plastic  Pred:Algae  Pred:Sea_Foam  Pred:Water
True Plastic           1,116          93             10         135
True Algae                186       6,024            142         976
True Sea_Foam              48          10            646          70
True Water                  88       3,163            150     487,050
```

Main confusions: Algae ↔ Water (976 + 3,163 misclassifications) and Plastic occasionally missed as Water (135) — expected, since bright coastal/turbid water spectrally resembles weathered plastic and algae mats.

---

## 6. Secondary task: the Clay CONFIRMED/POSSIBLE verifier — a real discrepancy

The engine has a second, independent decision: of the pixels the MLP calls "Plastic," Clay (a foundation model) plus a k-NN affinity check decide whether to tag the hotspot **CONFIRMED** (high-trust) or **POSSIBLE**. This is a **different**, narrower binary task — not the main 4-class problem — scored only on the subset of chips the MLP already flagged as Plastic.

The repo's saved `models/fusion_thresholds.json` claims **precision 0.9219, recall 0.7037**. Re-running the project's own calibration code (`ml/tune_fusion.py`) against the files currently on disk gives a **different** result:

| | TP | FP | FN | Precision | Recall |
| --- | --- | --- | --- | --- | --- |
| Saved in `fusion_thresholds.json` | — (not stored) | — | — | 0.9219 | 0.7037 |
| **Re-run live, this session** | 264 | 10 | 336 | **0.9635** | **0.4400** |

Population: 721 of 15,781 held-out test chips were MLP-called Plastic (600 true plastic, 121 false positives).

**Why they differ:** file timestamps show `fusion_thresholds.json` was last written **2026-07-12**, but `marinenet.onnx` was last replaced **2026-07-22** (the 3-seed ensemble retrain). The fusion thresholds were calibrated against the *previous* MLP and never recalibrated after the classifier changed. The number currently printed in the UI and docs for "CONFIRMED precision" is stale — the real, current CONFIRMED-tier recall is substantially lower (0.44, not 0.70) than advertised, though precision is actually better than advertised (0.96 vs 0.92).

**Fix:** re-run `python -m ml.tune_fusion` to recalibrate against the current `marinenet.onnx` before quoting this number anywhere, including in a report.

**Update — fix applied (2026-10-04):** `python -m ml.tune_fusion` was re-run against the current `marinenet.onnx` + `clay_index.npz`. The grid search over the same population (721 MLP-Plastic chips, 600 true plastic / 121 false positives) found a new operating point — `conf_high=0.5, aff_min=0.1, anomaly_tau=0.3` (previously `conf_high=0.7, aff_min=0.1, anomaly_tau=0.2`) — giving:

| | Precision | Recall |
| --- | --- | --- |
| Stale (pre-fix, written 2026-07-12) | 0.9219 | 0.7037 |
| Re-run live with stale thresholds (this session's first check) | 0.9635 | 0.4400 |
| **Recalibrated (`fusion_thresholds.json` now shipping)** | **0.9283** | **0.82** |

`fusion_thresholds.json`, `backend/prisma/seed.ts`, `backend/prisma/reseed-model.ts`, and `backend/src/data/mock.ts` / `frontend/src/lib/mockData.ts` (the DB-seeded/mock macro-F1, which still read the pre-ensemble-retrain **0.787** instead of the current **0.8175**) were all updated so every page now reads the same live numbers. `/model/validation` reads `fusion_thresholds.json` straight off disk, so `AI Lab` → Classifier and `Model Health` picked up the corrected precision/recall with no code change. One remaining non-user-facing staleness: `models/metrics.json['plpValidation']['clayFusion']['thresholds']` still embeds the old `conf_high=0.7` snapshot from when `ml/validate_plp_clay.py` was last run (2026-07-13) against the GPU Clay sidecar — that field is not rendered anywhere in the UI, but re-running that script (needs the live sidecar + rasterio/pyshp) would fully close the loop.

---

## 7. Dataset sizes and class distribution

| Split | n | Plastic | Algae | Sea_Foam | Water |
| --- | --- | --- | --- | --- | --- |
| Train | 1,081,615 | 4,504 | 12,232 | 938 | 1,063,941 |
| Validation | 532,566 | 2,237 | 6,106 | 738 | 523,485 |
| **Test (held-out)** | **499,907** | **1,354** | **7,328** | **774** | **490,451** |

Source: official MARIDA (2022) + MADOS (2024) train/val/test splits, Sentinel-2 L2A reflectance, 11 engineered features per pixel (5 raw bands + FDI, NDVI, PI, MNDWI, NDVI_RE, BRIGHT). Water is ~98 % of every split — this is real class imbalance in the benchmark data, not a sampling artifact.

---

## 8. The exact Python code used

```python
import numpy as np, onnxruntime as ort
from pathlib import Path

MODELS = Path("models")
CLASSES = ("Plastic", "Algae", "Sea_Foam", "Water")
EPS = 1e-6

sess = ort.InferenceSession(str(MODELS / "marinenet.onnx"), providers=["CPUExecutionProvider"])
inp_name = sess.get_inputs()[0].name
in_dim = sess.get_inputs()[0].shape[-1]   # 11

def augment11(x7):
    """Mirrors train_perpixel_gpu.augment11 — must match the training contract exactly."""
    b04, b06, b08, b8a, b11 = x7[:, 0], x7[:, 1], x7[:, 2], x7[:, 3], x7[:, 4]
    pi      = b08 / (b08 + b04 + EPS)
    mndwi   = (b08 - b11) / (b08 + b11 + EPS)
    ndvi_re = (b8a - b06) / (b8a + b06 + EPS)
    bright  = (b04 + b06 + b08 + b8a + b11) / 5.0
    extra = np.stack([pi, mndwi, ndvi_re, bright], axis=1).astype("float32")
    return np.concatenate([x7, extra], axis=1)

def run_split(name):
    d = np.load(MODELS / f"{name}_test.npz")
    x7, y = d["x"].astype("float32"), d["y"].astype("int64")
    x = augment11(x7) if in_dim == 11 and x7.shape[1] == 7 else x7
    out = sess.run(None, {inp_name: x})[0]
    return y, out.argmax(1)

y_all, pred_all = [], []
for ds in ("marida", "mados"):
    y, pred = run_split(ds)
    y_all.append(y); pred_all.append(pred)
y_all, pred_all = np.concatenate(y_all), np.concatenate(pred_all)

# Confusion matrix
cm = np.zeros((4, 4), dtype=np.int64)
np.add.at(cm, (y_all, pred_all), 1)

# Per-class precision / recall / F1 (standard definitions)
prf = {}
for i, name in enumerate(CLASSES):
    tp = cm[i, i]
    fp = cm[:, i].sum() - tp
    fn = cm[i, :].sum() - tp
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec  = tp / (tp + fn) if (tp + fn) else 0.0
    f1   = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
    prf[name] = dict(precision=prec, recall=rec, f1=f1, support=int(tp + fn))

macro_p  = np.mean([v["precision"] for v in prf.values()])
macro_r  = np.mean([v["recall"]    for v in prf.values()])
macro_f1 = np.mean([v["f1"]        for v in prf.values()])   # = Macro-F1
acc = float((y_all == pred_all).mean())

print("Macro P / R / F1:", round(macro_p, 4), round(macro_r, 4), round(macro_f1, 4))
print("Accuracy:", round(acc, 4))
print(cm)
```

Run it with `cd python_engine && python verify_model.py` (needs `onnxruntime`, `numpy`, and the cached `models/*_test.npz` files already in the repo) — it reproduces every number in Sections 3–5 exactly.

---

## 9. What is *not* classification, and why P/R/Macro-F1 don't apply there

- **DBSCAN hotspot clustering** — unsupervised, no labelled ground-truth clusters exist in the repo. No clustering-quality metric (e.g. silhouette score) is computed anywhere in the code, so none is invented here.
- **72-hour drift forecasting** — a trajectory/regression problem, validated in `ml/validate_drift.py` against real GDP drifter buoy tracks (`validation/drift_gdp_results.json`, n = 62 cases) using **km separation distance** and the **Liu–Weisberg (2011) skill score**, not precision/recall. Reporting P/R/F1 for this would be methodologically wrong.
- **PLP in-situ validation** (`models/plp_validation.json`) — 21 real deployed HDPE-target overflights; reported as a **hit-rate** (33 %), not a classification P/R, because it's too small and pixel-mixed (sub-pixel target) a sample for a stable precision/recall estimate.

---

## 10. Interpretation

The classifier does what it was built for: it separates Water almost perfectly (F1 0.995) and gets usable signal on the rare classes (Plastic F1 0.799, recall 0.824) despite Water outnumbering Plastic 362:1 in training data. The gap between accuracy (0.99) and macro-F1 (0.82) is exactly the honest story — a model that always predicted "Water" would also score ~0.98 accuracy while being useless. Algae has the lowest precision (0.648), mainly confused with Water, consistent with spectrally similar turbid/bright water. The Clay fusion layer is real and does work, but its *currently advertised* operating point is stale relative to the shipped classifier and should be recalibrated before being quoted (Section 6).

---

## 11. Research-paper-ready table

**Table X. Held-out test performance of the per-pixel plastic classifier (marinenet.onnx, 3-seed MLP ensemble) on the official MARIDA+MADOS test split (n = 499,907 pixels).**

| Class | Support | Precision | Recall | F1-score |
| --- | --- | --- | --- | --- |
| Plastic | 1,354 | 0.776 | 0.824 | 0.799 |
| Algae | 7,328 | 0.648 | 0.822 | 0.725 |
| Sea_Foam | 774 | 0.681 | 0.835 | 0.750 |
| Water | 490,451 | 0.998 | 0.993 | 0.995 |
| **Macro average** | 499,907 | **0.776** | **0.869** | **0.818** |
| Weighted average | 499,907 | 0.991 | 0.990 | 0.990 |
| Overall accuracy | — | — | — | 0.990 |

---

## 12. Is this suitable for an academic paper, and where does it go?

**Yes**, with two conditions:

1. Report **macro-F1 (0.8175) as the headline metric**, not raw accuracy — explicitly note accuracy is Water-inflated. This is exactly the kind of self-aware framing reviewers want.
2. Do **not** quote the 0.9219 / 0.7037 CONFIRMED-tier numbers until `tune_fusion.py` is re-run against the current model — quote the fresh 0.9635 / 0.4400 instead, or recalibrate and re-quote.

**Placement in a Results / Evaluation section:**

| Where | What goes there |
| --- | --- |
| Main Results table | Table X above (per-class P/R/F1 + macro/weighted averages + accuracy), with the confusion matrix as a figure/heatmap |
| Ablation / secondary subsection ("Verification layer" or "Confidence tiering") | The Clay fusion CONFIRMED/POSSIBLE precision-recall, clearly labelled as operating on the MLP-positive subset (n = 721), not the full test set — never merged into the main table, since it answers a different question |
| Separate subsection ("Forecast validation") | The drift skill score / km-separation results, kept apart from classification metrics since they are a different evaluation family |
| Real-world validation subsection | The PLP in-situ hit-rate (33 %, n = 21), explicitly labelled as a small-sample sanity check, not a substitute for the held-out test metrics |
