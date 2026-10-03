# %% [markdown]
# # Live training demo — watch the real model train on the real data
#
# **This is not a copy or a simplified version.** Every function this script calls
# (`load_split`, `PerPixelNet`, `train_candidate`, `report`, ...) is imported directly
# from `python_engine/ml/train_perpixel_gpu.py` — the actual script that trained the
# model your app ships with. This file only adds a handful of fewer epochs and some
# printing/plots so a live run is fast enough to watch, cell by cell.
#
# ## How to run this in VS Code (do this once before the panel sees it)
# 1. Open this file in VS Code.
# 2. Bottom-right corner of the VS Code window: click the Python version shown there,
#    and pick the interpreter named **`mpt-train`** (it is the Anaconda environment
#    that has PyTorch + a GPU). If you don't see it, type its path instead:
#    `C:\Anaconda\envs\mpt-train\python.exe`
# 3. You'll see a greyed-out `Run Cell` / `Run All` link above each `# %%` block —
#    that's VS Code treating this .py file like a notebook. Click **Run Cell** on the
#    first cell below; the first time, VS Code asks to install/activate a Jupyter
#    kernel — accept it (this only happens once).
# 4. From there, click **Run Cell** (or press `Shift+Enter`) on each cell top to
#    bottom. Wait for one cell to finish (you'll see a number appear, `[1]`, `[2]`, ...)
#    before running the next — some cells use results from the one before.
#
# ## What you are about to show her
# - Cell 2 loads the **real labelled pixels** (MARIDA + MADOS, ~1 million rows) straight
#   from the same cache files `python_engine/main_pipeline.py` loads at run time.
# - Cell 3 proves the class imbalance ("why is plastic hard") with a real bar chart.
# - Cell 4 prints one real labelled pixel's raw numbers, so she can see exactly what
#   "a training example" is: 7 numbers in, 1 class label out.
# - Cell 6 **actually trains** — a progress line prints every epoch, live, in front of
#   her. On a laptop GPU this takes well under a minute for the default 15 epochs.
# - Cell 7 scores the model you just trained against real held-out test pixels it has
#   never seen, side by side with the model the app currently ships with.
# - Cell 8 draws the confusion matrix of the model you just trained.
#
# **Nothing here overwrites the live app's model.** Cell 9 is optional and saves to a
# clearly separate file (`demo_run.onnx`), never to `marinenet.onnx`.

# %%
import sys
import time
from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt
import torch

# This file lives in docs/code-tour/; the training code lives in python_engine/.
# Add python_engine to sys.path so the imports below are the PROJECT'S real code,
# not a copy of it.
ENGINE_DIR = Path(__file__).resolve().parents[2] / "python_engine"
sys.path.insert(0, str(ENGINE_DIR))

from ml.train_perpixel_gpu import (  # noqa: E402  (import must follow the sys.path fix above)
    CLASSES, MODELS, PerPixelNet, _balanced_idx, _confusion, _macro_f1, _predict, _prf,
    augment11, export_onnx, load_split, report, shipped_baseline, train_candidate,
)

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {DEVICE}" + (f"  ({torch.cuda.get_device_name(0)})" if DEVICE.type == "cuda" else "  (no GPU found -- will still work, just slower)"))
print(f"Reading cached training data from: {MODELS}")

# %% [markdown]
# ## Cell 2 — load the real dataset
# `load_split` is the exact function `train_perpixel_gpu.py` uses. It reads the
# labelled-pixel caches built from **MARIDA** (Kikaki et al. 2022) and **MADOS**
# (Kikaki et al. 2024) — real Sentinel-2 satellite pixels that humans hand-labelled
# as Plastic / Algae / Sea_Foam / Water. The official train/val/test split that
# ships with those datasets is respected here (test pixels were never trained on,
# by either this demo or the shipped model).

# %%
x_train, y_train, n_marida_train = load_split("train")
x_val, y_val, _ = load_split("val")
x_test, y_test, n_marida_test = load_split("test")

print(f"train pixels: {len(y_train):,}   ({n_marida_train:,} from MARIDA, {len(y_train) - n_marida_train:,} from MADOS)")
print(f"val pixels:   {len(y_val):,}")
print(f"test pixels:  {len(y_test):,}   ({n_marida_test:,} from MARIDA, {len(y_test) - n_marida_test:,} from MADOS)")
print(f"each pixel has {x_train.shape[1]} features: B04, B06, B08, B8A, B11, FDI, NDVI")

# %% [markdown]
# ## Cell 3 — why plastic is the hard class
# Count how many training pixels belong to each of the 4 classes. This is the real
# imbalance the model has to deal with — say out loud what the bar chart shows.

# %%
counts = np.bincount(y_train, minlength=4)
for name, n in zip(CLASSES, counts):
    print(f"  {name:10s} {n:>8,}  ({100 * n / len(y_train):5.2f}% of all training pixels)")

plt.figure(figsize=(6, 3.5))
bars = plt.bar(CLASSES, counts, color=["#0D9488", "#84CC16", "#38BDF8", "#94A3B8"])
plt.yscale("log")
plt.ylabel("training pixels (log scale)")
plt.title("Real class counts in the training data -- why plastic is rare")
for b, n in zip(bars, counts):
    plt.text(b.get_x() + b.get_width() / 2, b.get_height(), f"{n:,}", ha="center", va="bottom", fontsize=9)
plt.tight_layout()
plt.show()

# %% [markdown]
# ## Cell 4 — what one training example actually looks like
# Pick one real plastic-labelled pixel and print its raw numbers. This is the exact
# input the neural network sees: 7 numbers, 1 label — nothing more mysterious than that.

# %%
plastic_idx = np.where(y_train == CLASSES.index("Plastic"))[0][0]
feature_names = ("B04 (red)", "B06 (red edge)", "B08 (NIR)", "B8A (narrow NIR)", "B11 (SWIR)", "FDI", "NDVI")
print("One real MARIDA/MADOS pixel labelled 'Plastic':")
for name, v in zip(feature_names, x_train[plastic_idx]):
    print(f"    {name:<18} = {v:.4f}")
print(f"    label              = {CLASSES[y_train[plastic_idx]]}")

# %% [markdown]
# ## Cell 5 — build the model
# `PerPixelNet` is the exact class the shipped model is an instance of: a small
# multi-layer perceptron (MLP). Printing it shows its real layer sizes.

# %%
FEATURES_11 = True  # the shipped model uses 11 features (7 base + 4 engineered indices)
xtr = augment11(x_train) if FEATURES_11 else x_train
xva = augment11(x_val) if FEATURES_11 else x_val
xte = augment11(x_test) if FEATURES_11 else x_test

demo_model = PerPixelNet(in_dim=xtr.shape[1], widths=(64, 32, 16))
print(demo_model)
n_params = sum(p.numel() for p in demo_model.parameters())
print(f"\ntotal trainable numbers in this network: {n_params:,}")

# %% [markdown]
# ## Cell 6 — TRAIN IT (the moment to let her watch)
# This calls the real `train_candidate` function with a **reduced epoch count** so it
# finishes in well under a minute — the production run (`--epochs 80`) uses the same
# code, just longer. Watch `val_macroF1` rise as epochs go by: that is the model
# actually learning from the data you just looked at.
#
# Raise `EPOCHS` below and re-run this cell if you have more time to show a longer,
# closer-to-production run.

# %%
EPOCHS = 15

t0 = time.time()
demo_model, train_acc = train_candidate(
    name="live-demo", xtr=xtr, ytr=y_train, xva=xva, yva=y_val,
    epochs=EPOCHS, lr=2e-3, batch=8192, device=DEVICE, seed=1,
)
print(f"\ntrained {EPOCHS} epochs on {len(y_train):,} real pixels in {time.time() - t0:.1f}s on {DEVICE}")

# %% [markdown]
# ## Cell 7 — score it on data it has NEVER seen
# `x_test` / `y_test` are the official held-out test pixels — excluded from training
# by the dataset's own authors, not by us. We score the model you just trained on
# them, and print the shipped `marinenet.onnx` model's score on the SAME test pixels
# right next to it, so the comparison is apples-to-apples.

# %%
pred_demo = _predict(demo_model, xte, DEVICE)
demo_result = report("your model  ", y_test, pred_demo)

pred_shipped = shipped_baseline(x_test)  # the shipped model decides its own feature count
if pred_shipped is not None:
    shipped_result = report("shipped model", y_test, pred_shipped)
    diff = demo_result["macroF1"] - shipped_result["macroF1"]
    print(f"\n{EPOCHS}-epoch demo run vs the production model (trained far longer, with extra tuning):")
    print(f"  macro-F1 difference: {diff:+.4f}  "
          f"({'close to' if abs(diff) < 0.03 else 'below'} production -- expected, since this ran only {EPOCHS} epochs)")

# %% [markdown]
# ## Cell 8 — the confusion matrix of the model you just trained
# Rows = the pixel's real class. Columns = what the model guessed. The diagonal is
# correct; anything off the diagonal is a mistake — point out that most mistakes
# land on the neighbouring classes (e.g. Algae mistaken for Plastic), not random ones.

# %%
cm = _confusion(y_test, pred_demo)
fig, ax = plt.subplots(figsize=(4.5, 4))
im = ax.imshow(cm, cmap="BuGn")
ax.set_xticks(range(4)); ax.set_xticklabels(CLASSES, rotation=20)
ax.set_yticks(range(4)); ax.set_yticklabels(CLASSES)
ax.set_xlabel("predicted"); ax.set_ylabel("actual")
ax.set_title(f"Confusion matrix -- your {EPOCHS}-epoch model\non real held-out test pixels")
for i in range(4):
    for j in range(4):
        ax.text(j, i, f"{cm[i, j]:,}", ha="center", va="center",
                color="white" if cm[i, j] > cm.max() / 2 else "black", fontsize=8)
plt.colorbar(im, ax=ax, shrink=0.8)
plt.tight_layout()
plt.show()

# %% [markdown]
# ## Cell 9 (optional) - export to ONNX, the same format the live app loads
# This is the exact export step the production trainer uses. It writes next to THIS
# script (`docs/code-tour/demo_run.onnx`), nowhere near `python_engine/models/`, so
# **running this cell cannot change what the live app uses** even by accident.

# %%
demo_out_path = Path(__file__).resolve().parent / "demo_run.onnx"
agreement = export_onnx(demo_model, xtr.shape[1], demo_out_path)
print(f"wrote {demo_out_path}")
print(f"PyTorch vs exported-ONNX agreement on a random batch: {agreement:.4f}  (1.0 = identical predictions)")
print("\nThe real app still runs python_engine/models/marinenet.onnx, completely untouched by this script.")
