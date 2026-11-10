"""Export the trained ultrasound + clinical fusion model for the AppendixAi web app.

Run this ONCE at the end of the Kaggle notebook where the fusion model was trained
(the variables it needs only exist in that session). It writes three files:

    backbone.onnx         ResNet18 backbone → 512×7×7 feature maps (for features and Grad-CAM)
    fusion_weights.npz    fusion MLP weights + training-average ultrasound features
    fusion_meta.json      clinical preprocessing, layer layout, image settings, metrics

and zips them as appendixai_imaging.zip. Download that zip from the Kaggle output panel,
unzip it into  api/_appendix/model/imaging/  of the app, commit and push. Done.

------------------------------------------------------------------------------------------
HOW TO RUN (in a new cell at the end of the notebook):

    %run /kaggle/input/<your-upload>/export_imaging_for_app.py      # or paste this file in a cell

    export_for_app(
        backbone=frozen_model,                    # the ResNet18 used to extract the 512-D features
        fusion_model=fusion_mm_model,             # the trained 1115-D fusion MLP
        preprocessor=fusion_preprocessor,         # the fitted clinical ColumnTransformer
        clinical_sample=X_clinical_fusion_train,  # raw clinical training rows (DataFrame)
        train_us=train_us_mm_aligned,             # training mean+max ultrasound features (N × 1024)
        metrics={"accuracy": 0.7071, "macro_f1": 0.6921, "complicated_recall": 0.625,
                 "test_patients": 99},
        # strongly recommended — verifies the app reproduces your notebook exactly:
        check_images=[os.path.join(image_dir, r["filename"]) for r in test_images[:6]],
        check_features=test_features[:6],         # the 512-D features your notebook stored for them
        # optional — one test patient end to end (detects the mean/max order automatically):
        check_patient={
            "images": [os.path.join(image_dir, r["filename"]) for r in test_images
                       if r["subject_id"] == fused_test_ids[0]],
            "clinical": clinical_fusion_test.set_index("subject_id").loc[fused_test_ids[0], clinical_feature_cols],
            "fused": X_fusion_mm_test[0],
        },
    )

Use the names from YOUR notebook if they differ (e.g. a different fusion model variable).
------------------------------------------------------------------------------------------
"""
from __future__ import annotations

import json
import os
import zipfile

import numpy as np
import torch
import torch.nn as nn
from PIL import Image

# the 32 clinical inputs the web app collects
APP_FIELDS = [
    "Age", "BMI", "Sex", "Height", "Weight", "Appendix_on_US", "Appendix_Diameter", "Migratory_Pain",
    "Lower_Right_Abd_Pain", "Contralateral_Rebound_Tenderness", "Coughing_Pain", "Nausea", "Loss_of_Appetite",
    "Body_Temperature", "WBC_Count", "Neutrophil_Percentage", "Neutrophilia", "RBC_Count", "Hemoglobin", "RDW",
    "Thrombocyte_Count", "Ketones_in_Urine", "RBC_in_Urine", "WBC_in_Urine", "CRP", "Dysuria", "Stool",
    "Peritonitis", "Psoas_Sign", "Ipsilateral_Rebound_Tenderness", "US_Performed", "Free_Fluids",
]
IMAGENET = {"mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]}


# ------------------------------------------------------------------ 1. backbone → ONNX
def feature_map_model(backbone: nn.Module) -> nn.Module:
    """Return a module that outputs the last convolutional feature maps (N, C, h, w)."""
    if hasattr(backbone, "layer4") and hasattr(backbone, "fc"):          # torchvision ResNet
        body = nn.Sequential(*list(backbone.children())[:-2])
    elif isinstance(backbone, nn.Sequential):                             # Sequential(*children[:-1])
        mods = list(backbone.children())
        if isinstance(mods[-1], (nn.AdaptiveAvgPool2d, nn.AvgPool2d)):
            mods = mods[:-1]
        body = nn.Sequential(*mods)
    else:
        raise TypeError("Pass the torchvision ResNet18 (e.g. frozen_model) or its feature_extractor Sequential.")
    body.eval()
    with torch.no_grad():
        out = body(torch.zeros(1, 3, 224, 224, device=next(body.parameters()).device))
    if out.dim() != 4:
        raise ValueError(f"Backbone output should be (N, C, h, w), got {tuple(out.shape)}")
    print(f"  backbone feature maps: {tuple(out.shape[1:])}")
    return body


def export_onnx(body: nn.Module, path: str, image_size: int):
    body = body.cpu().float().eval()
    dummy = torch.zeros(1, 3, image_size, image_size)
    kwargs = dict(input_names=["image"], output_names=["fmap"], dynamic_axes={"image": {0: "n"}, "fmap": {0: "n"}},
                  opset_version=17, do_constant_folding=True)
    try:
        torch.onnx.export(body, dummy, path, dynamo=False, **kwargs)
    except TypeError:                                                     # older PyTorch without `dynamo`
        torch.onnx.export(body, dummy, path, **kwargs)
    print(f"  wrote {path} ({os.path.getsize(path) / 1e6:.1f} MB)")


# ------------------------------------------------------------------ 2. fusion MLP → layer list
def mlp_layers(model: nn.Module):
    leaves = [m for m in model.modules() if len(list(m.children())) == 0]
    layers, arrays = [], {}
    for i, m in enumerate(leaves):
        if isinstance(m, nn.Linear):
            arrays[f"l{i}_w"] = m.weight.detach().cpu().double().numpy()
            arrays[f"l{i}_b"] = (m.bias.detach().cpu().double().numpy() if m.bias is not None
                                 else np.zeros(m.out_features))
            layers.append({"type": "linear", "weight": f"l{i}_w", "bias": f"l{i}_b"})
        elif isinstance(m, nn.ReLU):
            layers.append({"type": "relu"})
        elif isinstance(m, nn.LeakyReLU):
            layers.append({"type": "leaky_relu", "slope": float(m.negative_slope)})
        elif isinstance(m, nn.BatchNorm1d):
            scale = (m.weight / torch.sqrt(m.running_var + m.eps)).detach().cpu().double().numpy()
            shift = (m.bias - m.running_mean * (m.weight / torch.sqrt(m.running_var + m.eps))).detach().cpu().double().numpy()
            arrays[f"l{i}_s"], arrays[f"l{i}_t"] = scale, shift
            layers.append({"type": "batchnorm", "scale": f"l{i}_s", "shift": f"l{i}_t"})
        elif isinstance(m, (nn.Dropout, nn.Identity)):
            layers.append({"type": "identity"})
        else:
            raise TypeError(f"Unsupported layer in fusion model: {type(m).__name__}. "
                            "The app supports Linear, ReLU, LeakyReLU, BatchNorm1d and Dropout.")
    return layers, arrays


def numpy_mlp(layers, arrays, x):
    h = x
    for L in layers:
        if L["type"] == "linear":
            h = h @ arrays[L["weight"]].T + arrays[L["bias"]]
        elif L["type"] == "relu":
            h = np.maximum(h, 0)
        elif L["type"] == "leaky_relu":
            h = np.where(h > 0, h, L["slope"] * h)
        elif L["type"] == "batchnorm":
            h = h * arrays[L["scale"]] + arrays[L["shift"]]
    return h


# ------------------------------------------------------------------ 3. clinical preprocessing
def preprocessing_params(ct):
    from sklearn.impute import SimpleImputer
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder, StandardScaler

    num = cat = None
    blocks = []
    for name, trans, cols in ct.transformers_:
        if name == "remainder":
            if trans != "drop" and len(cols):
                raise ValueError("The preprocessor passes extra columns through (remainder); the app cannot reproduce that.")
            continue
        steps = trans.steps if isinstance(trans, Pipeline) else [("only", trans)]
        objs = [s for _, s in steps]
        if any(isinstance(s, OneHotEncoder) for s in objs):
            imp = next((s for s in objs if isinstance(s, SimpleImputer)), None)
            oh = next(s for s in objs if isinstance(s, OneHotEncoder))
            if oh.drop is not None:
                raise ValueError("OneHotEncoder(drop=...) is not supported by the app.")
            cat = {"categorical_columns": list(cols),
                   "categories": [[str(c) for c in cats] for cats in oh.categories_],
                   "fill_value": str(imp.fill_value) if imp is not None else "Missing"}
            blocks.append("cat")
        else:
            imp = next(s for s in objs if isinstance(s, SimpleImputer))
            sc = next((s for s in objs if isinstance(s, StandardScaler)), None)
            num = {"numeric_columns": list(cols), "medians": imp.statistics_.tolist(),
                   "indicator_columns": [int(i) for i in imp.indicator_.features_] if imp.add_indicator else [],
                   "scaler_mean": sc.mean_.tolist() if sc is not None else None,
                   "scaler_scale": sc.scale_.tolist() if sc is not None else None}
            blocks.append("num")
    if blocks != ["num", "cat"]:
        raise ValueError(f"Expected a numeric block followed by a categorical block, found {blocks}.")
    return {**num, **cat}


def numpy_clinical(p, row: dict):
    def missing(v):
        return v is None or (isinstance(v, float) and np.isnan(v))
    raw = [None if missing(row.get(c)) else float(row[c]) for c in p["numeric_columns"]]
    imputed = [p["medians"][i] if v is None else v for i, v in enumerate(raw)]
    flags = [1.0 if raw[i] is None else 0.0 for i in p["indicator_columns"]]
    num = np.array(imputed + flags, dtype=np.float64)
    if p["scaler_mean"] is not None:
        num = (num - np.array(p["scaler_mean"])) / np.array(p["scaler_scale"])
    cat = []
    for col, cats in zip(p["categorical_columns"], p["categories"]):
        v = row.get(col)
        value = p["fill_value"] if missing(v) else str(v)
        cat.extend(1.0 if value == c else 0.0 for c in cats)
    return np.concatenate([num, np.array(cat)])


# ------------------------------------------------------------------ 4. image preprocessing (same as the app)
def letterbox(path, size):
    img = Image.open(path).convert("RGB")
    img.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (size, size), (0, 0, 0))
    canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2))
    return np.asarray(canvas, dtype=np.float32).transpose(2, 0, 1) / 255.0


def app_features(onnx_path, paths, size, normalize):
    import onnxruntime as ort
    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    batch = np.stack([letterbox(p, size) for p in paths])
    if normalize:
        batch = (batch - np.array(IMAGENET["mean"], np.float32)[:, None, None]) / np.array(IMAGENET["std"], np.float32)[:, None, None]
    fmap = sess.run(None, {"image": batch.astype(np.float32)})[0]
    return fmap.mean(axis=(2, 3))


# ------------------------------------------------------------------ main
def export_for_app(backbone, fusion_model, preprocessor, clinical_sample, train_us=None, metrics=None,
                   check_images=None, check_features=None, check_patient=None, normalize=True, image_size=224,
                   input_order=("clinical", "us_mean", "us_max"), out_dir="appendixai_imaging",
                   classes=("No appendicitis", "Uncomplicated", "Complicated"), model_name="ResNet18 + fusion MLP"):
    os.makedirs(out_dir, exist_ok=True)
    onnx_path = os.path.join(out_dir, "backbone.onnx")

    print("1/5 Backbone")
    body = feature_map_model(backbone)
    channels = int(body(torch.zeros(1, 3, image_size, image_size, device=next(body.parameters()).device)).shape[1])
    export_onnx(body, onnx_path, image_size)

    print("2/5 Clinical preprocessing")
    prep = preprocessing_params(preprocessor)
    cols = prep["numeric_columns"] + prep["categorical_columns"]
    unknown = [c for c in cols if c not in APP_FIELDS]
    if unknown:
        print(f"  ⚠ these columns are not collected by the app and will always be treated as missing: {unknown}")
    rows = clinical_sample[cols].head(25)
    sk = preprocessor.transform(rows)
    mine = np.stack([numpy_clinical(prep, r.to_dict()) for _, r in rows.iterrows()])
    err = float(np.abs(np.asarray(sk, dtype=float) - mine).max())
    print(f"  clinical vector: {mine.shape[1]} features, max difference vs scikit-learn = {err:.2e}")
    assert err < 1e-6, "Clinical preprocessing does not match — please report this."
    n_clin = mine.shape[1]

    print("3/5 Fusion MLP")
    fusion_model = fusion_model.cpu().double().eval()
    layers, arrays = mlp_layers(fusion_model)
    in_dim = arrays[layers[0]["weight"]].shape[1]
    expected = n_clin + 2 * channels
    assert in_dim == expected, f"Fusion input is {in_dim}-D but clinical {n_clin} + 2×{channels} = {expected}."
    x = np.random.default_rng(0).normal(size=(16, in_dim))
    with torch.no_grad():
        ref = fusion_model(torch.from_numpy(x)).numpy()
    err = float(np.abs(ref - numpy_mlp(layers, arrays, x)).max())
    print(f"  {len(layers)} layers, input {in_dim}-D, max difference vs PyTorch = {err:.2e}")
    assert err < 1e-8, "Fusion MLP does not match — please report this."
    fusion_model.float()

    print("4/5 Reference ultrasound features")
    reference = {}
    if train_us is not None:
        tu = np.asarray(train_us, dtype=np.float64)
        assert tu.shape[1] == 2 * channels, f"train_us should be N × {2 * channels}, got {tu.shape}"
        first, second = tu[:, :channels].mean(0), tu[:, channels:].mean(0)
        a, b = (first, second) if input_order[1] == "us_mean" else (second, first)
        arrays["ref_us_mean"], arrays["ref_us_max"] = a, b
        reference = {"us_mean": "ref_us_mean", "us_max": "ref_us_max"}
        print("  stored training-average features (used to show how much the images changed the result)")
    else:
        print("  skipped (pass train_us=... to enable the 'effect of images' read-out)")

    print("5/5 Checking that the app reproduces your notebook's image features")
    if check_images is not None and check_features is not None:
        try:
            stored = np.asarray(check_features, dtype=np.float64)
            got = app_features(onnx_path, check_images, image_size, normalize)
            err = float(np.abs(got - stored).max())
            other = float(np.abs(app_features(onnx_path, check_images, image_size, not normalize) - stored).max())
            print(f"  normalize={normalize}: max difference {err:.2e}   (normalize={not normalize}: {other:.2e})")
            if other < err:
                normalize = not normalize
                print(f"  → your features were made with normalize={normalize}; using that.")
            if min(err, other) > 1e-2:
                print("  ⚠ features differ noticeably — check that the same image preprocessing was used.")
        except ImportError:
            print("  onnxruntime not installed; run  !pip install onnxruntime  and re-run to verify.")
    else:
        print("  skipped (pass check_images=... and check_features=... to verify)")

    if check_patient is not None:
        print("  Checking one complete patient (clinical + all images → fused vector)")
        try:
            clin = numpy_clinical(prep, dict(check_patient["clinical"]))
            feats = app_features(onnx_path, check_patient["images"], image_size, normalize)
            fused = np.asarray(check_patient["fused"], dtype=np.float64)
            mean_first = np.concatenate([clin, feats.mean(0), feats.max(0)])
            max_first = np.concatenate([clin, feats.max(0), feats.mean(0)])
            e1, e2 = float(np.abs(mean_first - fused).max()), float(np.abs(max_first - fused).max())
            print(f"  mean-then-max difference {e1:.2e}, max-then-mean difference {e2:.2e}")
            if e2 < e1:
                input_order = ("clinical", "us_max", "us_mean")
                print("  → your fused vector puts MAX before MEAN; using that order.")
                if reference:
                    arrays["ref_us_mean"], arrays["ref_us_max"] = arrays["ref_us_max"], arrays["ref_us_mean"]
            if min(e1, e2) > 1e-2:
                print("  ⚠ the fused vector differs noticeably — check the image list and clinical row for this patient.")
        except ImportError:
            print("  onnxruntime not installed; run  !pip install onnxruntime  and re-run to verify.")

    meta = {
        "format": "appendixai-imaging-1",
        "model_name": model_name,
        "classes": list(classes),
        "image_size": image_size,
        "normalize": IMAGENET if normalize else None,
        "feature_channels": channels,
        "input_order": list(input_order),
        "clinical_preprocessing": prep,
        "layers": layers,
        "reference": reference,
        "metrics": metrics,
        "source": "Exported from the AppendixAi Kaggle notebook with research/export_imaging_for_app.py",
    }
    with open(os.path.join(out_dir, "fusion_meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=1)
    np.savez_compressed(os.path.join(out_dir, "fusion_weights.npz"), **arrays)

    zip_path = out_dir.rstrip("/") + ".zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in ["backbone.onnx", "fusion_meta.json", "fusion_weights.npz"]:
            z.write(os.path.join(out_dir, f), f)
    print(f"\n✅ Done: {zip_path} ({os.path.getsize(zip_path) / 1e6:.1f} MB)")
    print("   Download it, unzip into api/_appendix/model/imaging/ in the app, then commit and push.")
    return zip_path
