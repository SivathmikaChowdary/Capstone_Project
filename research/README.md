# Research files

## `export_imaging_for_app.py`

Packages the trained fusion model from the Kaggle notebook for the web app (see the instructions at the top of
the file). It verifies, numerically, that the app reproduces the notebook:

- clinical preprocessing vs scikit-learn (exact)
- fusion MLP vs PyTorch (exact)
- image features from the exported ONNX backbone vs the features stored in the notebook
- one full patient (clinical + all images → fused vector), which also detects the mean/max order

It was tested on a stand-in model with the same architecture: app probabilities matched PyTorch to 6×10⁻⁸ and
Grad-CAM heatmaps matched PyTorch autograd to 1.2×10⁻⁶ (relative).

## How the app computes things

| Output | Method |
|---|---|
| Clinical prediction | CatBoost (exported to JSON, evaluated with NumPy; identical to the original model) |
| Clinical explanation | Exact path-dependent TreeSHAP for oblivious trees |
| Ultrasound features | ResNet18 backbone in ONNX Runtime, letterboxed 224×224 input, ImageNet normalisation |
| Fusion prediction | Mean + max pooling across views, fusion MLP in NumPy |
| Grad-CAM | Exact: gradient of the predicted class back-propagated by hand through the MLP, the mean/max pooling and global average pooling |
| Image influence | Leave-one-view-out change in the predicted class probability |
| Effect of images | Same patient with images replaced by the training-average ultrasound features |
| "Refer" state | Heuristic: top probability < 60 %, margin < 20 %, < 8 inputs, or ≥ 2 key inputs missing |
| Complicated safety net | Predicted non-complicated but complicated probability ≥ 20 % |
| Next tests | Value of information: plausible results tried for each pending test; range of complicated risk |
| Trajectory | Prediction after each clinical step (exam → labs → ultrasound report) |

## Planned experiments for the paper

1. **Leakage check** of the earlier 95.4 % clinical result (87-patient test set vs the 624-patient clinical training split).
2. **One shared patient-level split** (ultrasound cohort) for clinical-only, ultrasound-only and fusion models, with
   repeated nested 5×5 cross-validation, bootstrap 95 % CIs and DeLong / McNemar tests.
3. **Stage-wise models** (exam → + labs → + ultrasound report → + images) with ΔAUC and net reclassification
   improvement — does each step add value?
4. **Class-conditional conformal prediction** to replace the heuristic "refer" thresholds with a guaranteed
   sensitivity for complicated appendicitis.
5. **Calibration** (reliability plots, Brier score, calibration slope) and **decision-curve analysis**.
6. **Missing-data robustness**: performance when labs or ultrasound are unavailable.
7. Report following the **TRIPOD+AI** checklist.
