"""Ultrasound + clinical fusion model with Grad-CAM, using ONNX Runtime and NumPy only.

Pipeline (identical to the training notebook):
  image → letterbox to 224×224 (aspect ratio kept, black padding) → ImageNet normalisation
        → ResNet18 backbone (ONNX) → 512×7×7 feature map → global average pool → 512-D per image
  patient → element-wise mean and max over that patient's images → 1024-D
  [clinical 91-D, US mean 512-D, US max 512-D] → fusion MLP → 3 class probabilities

Grad-CAM is computed exactly: the gradient of the predicted class score is back-propagated by hand
through the (small) fusion MLP and the mean/max pooling to the backbone feature maps.

The model files come from research/export_imaging_for_app.py (run once on Kaggle, where the
trained weights live) and go in api/_appendix/model/imaging/.
"""
from __future__ import annotations

import base64
import io
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

IMAGING_DIR = Path(__file__).resolve().parent / "model" / "imaging"
REQUIRED = ["backbone.onnx", "fusion_meta.json", "fusion_weights.npz"]
MAX_IMAGES = 8


def _missing(v) -> bool:
    return v is None or v == "" or v == "Unknown" or (isinstance(v, float) and math.isnan(v))


def _jet(x: np.ndarray) -> np.ndarray:
    """Jet-like colormap for values in [0, 1] → uint8 RGB."""
    r = np.clip(1.5 - np.abs(4 * x - 3), 0, 1)
    g = np.clip(1.5 - np.abs(4 * x - 2), 0, 1)
    b = np.clip(1.5 - np.abs(4 * x - 1), 0, 1)
    return (np.stack([r, g, b], axis=-1) * 255).astype(np.uint8)


class NotUltrasoundError(ValueError):
    """Raised when an uploaded file does not look like an abdominal ultrasound scan."""


# Thresholds calibrated on real Regensburg scans vs. screenshots, charts, photos, documents and noise.
US_CHECK = {
    "max_colour": 0.15,   # share of strongly coloured pixels (ultrasound is grey; Doppler boxes are small)
    "max_bright": 0.10,   # share of near-white pixels (pages, UI, charts)
    "min_dark": 0.12,     # share of near-black pixels (the black frame around the scan)
    "min_mid": 0.15,      # share of mid-grey pixels (tissue)
    "min_speckle": 0.004, # median neighbour difference in tissue: flat graphics ≈ 0
    "max_speckle": 0.03,  # random noise is far grainier than ultrasound speckle
}
# Below this cosine similarity to the reference dataset scans, the result carries a caution.
DOMAIN_SIMILARITY_WARN = 0.72


def ultrasound_check(img: Image.Image) -> tuple[bool, str, dict]:
    """Cheap, model-free test of whether an image looks like a grey-scale ultrasound scan."""
    small = img.convert("RGB")
    small = small.resize((256, max(1, round(256 * small.height / max(small.width, 1)))))
    a = np.asarray(small, dtype=np.float32) / 255.0
    mx, mn = a.max(-1), a.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)
    lum = a.mean(-1)
    tissue = lum[:, 1:] > 0.15
    diffs = np.abs(np.diff(lum, axis=1))
    s = {
        "colour": float(((sat > 0.3) & (mx > 0.25)).mean()),
        "bright": float((lum > 0.85).mean()),
        "dark": float((lum < 0.12).mean()),
        "mid": float(((lum > 0.15) & (lum < 0.75)).mean()),
        "speckle": float(np.median(diffs[tissue])) if tissue.any() else 0.0,
    }
    c = US_CHECK
    if s["colour"] > c["max_colour"]:
        return False, "it is too colourful for an ultrasound scan", s
    if s["bright"] > c["max_bright"]:
        return False, "it is mostly white, like a document, chart or screenshot", s
    if s["dark"] < c["min_dark"]:
        return False, "it has no dark scan background", s
    if s["mid"] < c["min_mid"]:
        return False, "it has almost no grey tissue texture", s
    if not (c["min_speckle"] <= s["speckle"] <= c["max_speckle"]):
        return False, "its texture does not match ultrasound speckle", s
    return True, "", s


def _png_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


class ImagingModel:
    def __init__(self, model_dir: Path = IMAGING_DIR):
        self.dir = model_dir
        self._session = None
        self.meta = None
        self.status = self._check()

    # ------------------------------------------------------------------ loading
    def _check(self) -> dict:
        missing = [f for f in REQUIRED if not (self.dir / f).exists()]
        if missing:
            return {
                "available": False,
                "reason": "The trained imaging model has not been installed yet "
                          "(run research/export_imaging_for_app.py on Kaggle and add its files).",
                "missing_files": missing,
            }
        self.meta = json.loads((self.dir / "fusion_meta.json").read_text(encoding="utf-8"))
        return {
            "available": True,
            "model_name": self.meta.get("model_name", "ResNet18 + fusion MLP"),
            "metrics": self.meta.get("metrics"),
            "source": self.meta.get("source"),
            "max_images": MAX_IMAGES,
        }

    def _load(self):
        if self._session is not None:
            return
        import onnxruntime as ort  # imported lazily so the clinical-only app starts fast

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        self._session = ort.InferenceSession(str(self.dir / "backbone.onnx"), opts, providers=["CPUExecutionProvider"])
        self._input = self._session.get_inputs()[0].name
        w = np.load(self.dir / "fusion_weights.npz")
        self.weights = {k: w[k].astype(np.float64) for k in w.files}
        m = self.meta
        self.classes = m["classes"]
        self.size = int(m.get("image_size", 224))
        norm = m.get("normalize")
        self.norm_mean = np.array(norm["mean"], dtype=np.float32)[:, None, None] if norm else None
        self.norm_std = np.array(norm["std"], dtype=np.float32)[:, None, None] if norm else None
        self.layers = m["layers"]
        self.order = m.get("input_order", ["clinical", "us_mean", "us_max"])
        self.prep = m["clinical_preprocessing"]
        ref = m.get("reference", {})
        self.ref_mean = self.weights.get(ref.get("us_mean", ""))
        self.ref_max = self.weights.get(ref.get("us_max", ""))
        ref_path = self.dir / "reference_scans.npy"
        self.ref_scans = np.load(ref_path).astype(np.float64) if ref_path.exists() else None

    # ------------------------------------------------------------------ preprocessing
    def letterbox(self, data: bytes):
        img = Image.open(io.BytesIO(data)).convert("RGB")
        img.thumbnail((self.size, self.size), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (self.size, self.size), (0, 0, 0))
        x, y = (self.size - img.width) // 2, (self.size - img.height) // 2
        canvas.paste(img, (x, y))
        return canvas, (x, y, x + img.width, y + img.height)

    def to_tensor(self, canvas: Image.Image) -> np.ndarray:
        arr = np.asarray(canvas, dtype=np.float32).transpose(2, 0, 1) / 255.0
        if self.norm_mean is not None:
            arr = (arr - self.norm_mean) / self.norm_std
        return arr

    def clinical_vector(self, patient: dict) -> np.ndarray:
        p = self.prep
        raw = [None if _missing(patient.get(c)) else float(patient[c]) for c in p["numeric_columns"]]
        imputed = [p["medians"][i] if v is None else v for i, v in enumerate(raw)]
        flags = [1.0 if raw[i] is None else 0.0 for i in p["indicator_columns"]]
        num = np.array(imputed + flags, dtype=np.float64)
        if p.get("scaler_mean") is not None:
            num = (num - np.array(p["scaler_mean"])) / np.array(p["scaler_scale"])
        cat = []
        for col, cats in zip(p["categorical_columns"], p["categories"]):
            v = patient.get(col)
            value = p["fill_value"] if _missing(v) else str(v)
            cat.extend(1.0 if value == c else 0.0 for c in cats)
        return np.concatenate([num, np.array(cat, dtype=np.float64)])

    # ------------------------------------------------------------------ fusion MLP (forward + backward)
    def _forward(self, x: np.ndarray):
        cache, h = [], x
        for layer in self.layers:
            t = layer["type"]
            if t == "linear":
                W, b = self.weights[layer["weight"]], self.weights[layer["bias"]]
                cache.append(("linear", W))
                h = h @ W.T + b
            elif t == "relu":
                cache.append(("relu", h > 0))
                h = np.maximum(h, 0)
            elif t == "leaky_relu":
                slope = layer.get("slope", 0.01)
                cache.append(("leaky_relu", np.where(h > 0, 1.0, slope)))
                h = np.where(h > 0, h, slope * h)
            elif t == "batchnorm":
                scale = self.weights[layer["scale"]]
                shift = self.weights[layer["shift"]]
                cache.append(("affine", scale))
                h = h * scale + shift
            else:  # dropout / identity do nothing at inference
                cache.append(("identity", None))
        return h, cache

    @staticmethod
    def _backward(cache, grad_out: np.ndarray) -> np.ndarray:
        g = grad_out
        for kind, val in reversed(cache):
            if kind == "linear":
                g = g @ val
            elif kind == "relu":
                g = g * val
            elif kind in ("leaky_relu", "affine"):
                g = g * val
        return g

    def _fuse(self, clin, us_mean, us_max):
        parts = {"clinical": clin, "us_mean": us_mean, "us_max": us_max}
        return np.concatenate([parts[k] for k in self.order])

    @staticmethod
    def _softmax(z):
        e = np.exp(z - z.max())
        return e / e.sum()

    # ------------------------------------------------------------------ main entry
    def predict(self, patient: dict, images: list[bytes], names: list[str] | None = None) -> dict:
        if not self.status["available"]:
            raise RuntimeError(self.status["reason"])
        self._load()
        images = images[:MAX_IMAGES]
        names = names or [f"Image {i + 1}" for i in range(len(images))]
        rejected = []
        for data, name in zip(images, names):
            ok, why, _ = ultrasound_check(Image.open(io.BytesIO(data)))
            if not ok:
                rejected.append(f"“{name}” ({why})")
        if rejected:
            raise NotUltrasoundError(
                "This does not look like an abdominal ultrasound scan: " + "; ".join(rejected)
                + ". Please upload ultrasound images only."
            )
        canvases, boxes = zip(*(self.letterbox(b) for b in images))
        batch = np.stack([self.to_tensor(c) for c in canvases]).astype(np.float32)
        fmap = self._session.run(None, {self._input: batch})[0].astype(np.float64)  # (N, C, h, w)
        n, c, fh, fw = fmap.shape
        pooled = fmap.mean(axis=(2, 3))                                            # (N, C)
        us_mean, us_max = pooled.mean(axis=0), pooled.max(axis=0)
        similarity = [None] * n
        if self.ref_scans is not None:
            unit = pooled / np.maximum(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-12)
            similarity = [float(v) for v in (unit @ self.ref_scans.T).max(axis=1)]
        owner = pooled.argmax(axis=0)                                              # which image gives each max

        clin = self.clinical_vector(patient)
        x = self._fuse(clin, us_mean, us_max)
        logits, cache = self._forward(x)
        probs = self._softmax(logits)
        cls = int(probs.argmax())

        # --- exact Grad-CAM: d(logit_cls)/d(feature map) through MLP → concat → mean/max → GAP
        one_hot = np.zeros_like(logits)
        one_hot[cls] = 1.0
        g = self._backward(cache, one_hot)
        offsets, start = {}, 0
        for k in self.order:
            size = len(clin) if k == "clinical" else c
            offsets[k] = (start, start + size)
            start += size
        g_mean = g[offsets["us_mean"][0]:offsets["us_mean"][1]]
        g_max = g[offsets["us_max"][0]:offsets["us_max"][1]]
        heatmaps = []
        for i in range(n):
            d_pooled = g_mean / n + g_max * (owner == i)                           # (C,)
            alpha = d_pooled / (fh * fw)                                           # GAP derivative
            cam = np.maximum(np.tensordot(alpha, fmap[i], axes=(0, 0)), 0)         # (h, w)
            heatmaps.append(cam)
        top = max(float(h.max()) for h in heatmaps) or 1.0

        # --- how much did the images change the answer? (replace them with the training average)
        without = None
        if self.ref_mean is not None and self.ref_max is not None:
            z0, _ = self._forward(self._fuse(clin, self.ref_mean, self.ref_max))
            without = self._softmax(z0)

        results = []
        for i in range(n):
            peak = float(heatmaps[i].max())
            # per-image normalisation (standard Grad-CAM); relative strength is reported separately
            cam = heatmaps[i] / peak if peak > 1e-6 * top else np.zeros_like(heatmaps[i])
            cam_img = Image.fromarray((cam * 255).astype(np.uint8)).resize((self.size, self.size), Image.Resampling.BILINEAR)
            cam_arr = np.asarray(cam_img, dtype=np.float32) / 255.0
            mask = np.zeros_like(cam_arr)
            x0, y0, x1, y1 = boxes[i]
            mask[y0:y1, x0:x1] = 1.0
            base = np.asarray(canvases[i].convert("L").convert("RGB"), dtype=np.float32)
            heat = _jet(cam_arr).astype(np.float32)
            a = (0.6 * np.clip((cam_arr - 0.1) / 0.9, 0, 1) * mask)[..., None]
            overlay = (base * (1 - a) + heat * a).astype(np.uint8)
            # leave-one-out influence of this image on the predicted class
            if n > 1:
                keep = [j for j in range(n) if j != i]
                z, _ = self._forward(self._fuse(clin, pooled[keep].mean(axis=0), pooled[keep].max(axis=0)))
                influence = float(probs[cls] - self._softmax(z)[cls])
            else:
                influence = float(probs[cls] - without[cls]) if without is not None else None
            crop = (x0, y0, x1, y1)
            results.append({
                "name": names[i],
                "original": _png_b64(canvases[i].crop(crop)),
                "gradcam": _png_b64(Image.fromarray(overlay).crop(crop)),
                "influence": influence,
                "peak_activation": peak / top,
                "similarity": similarity[i],
                "unfamiliar": similarity[i] is not None and similarity[i] < DOMAIN_SIMILARITY_WARN,
            })

        return {
            "model_name": self.status.get("model_name"),
            "classes": self.classes,
            "probabilities": {k: float(v) for k, v in zip(self.classes, probs)},
            "predicted_index": cls,
            "predicted_class": self.classes[cls],
            "complicated_probability": float(probs[2]),
            "appendicitis_probability": float(probs[1] + probs[2]),
            "without_images": {k: float(v) for k, v in zip(self.classes, without)} if without is not None else None,
            "n_images": n,
            "images": results,
            "explained_class": self.classes[cls],
            "domain_warning": (
                "Some scans look different from the hospital scans the model was trained on "
                "(different machine, crop or annotations). Treat the image-based estimate with extra caution."
                if any(r["unfamiliar"] for r in results) else None
            ),
        }
