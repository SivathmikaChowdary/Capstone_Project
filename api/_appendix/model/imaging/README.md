# Imaging model files go here

The ultrasound + clinical fusion model is trained in the Kaggle notebook, so its weights are not in this repository yet.
Until these three files are added, the app runs the clinical model only and the "Ultrasound images" step shows
"Imaging model not installed".

| File | What it is |
|---|---|
| `backbone.onnx` | ResNet18 backbone (≈45 MB), outputs 512×7×7 feature maps |
| `fusion_weights.npz` | Fusion MLP weights + training-average ultrasound features |
| `fusion_meta.json` | Clinical preprocessing, layer layout, image settings, test metrics |

## How to add them (≈5 minutes)

1. Open the Kaggle notebook where the fusion model was trained and run it to the end.
2. Upload `research/export_imaging_for_app.py` as a Kaggle dataset (or paste it into a cell).
3. In a new cell, call `export_for_app(...)` as shown at the top of that file.
   It checks that the app reproduces your notebook exactly and writes `appendixai_imaging.zip`.
4. Download the zip from the Kaggle **Output** panel and unzip its three files into this folder.
5. Commit and push. Vercel redeploys automatically and the imaging step switches on.
