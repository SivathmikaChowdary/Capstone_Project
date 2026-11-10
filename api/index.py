"""AppendixAi API (FastAPI) — runs as a Vercel Python serverless function.

Every route lives under /api/py so the Next.js frontend can reach it in development
(proxied to http://127.0.0.1:8000) and in production (Vercel routes /api/* here).
Interactive docs: /api/py/docs
"""
import csv
import json
import math
import sys
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI, File, Form, HTTPException, UploadFile  # noqa: E402
from fastapi.responses import Response  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from _appendix.clinical import LitePredictor  # noqa: E402
from _appendix.fields import CHOICE_LABELS, FIELD_INFO, STAGES  # noqa: E402
from _appendix.imaging import ImagingModel, MAX_IMAGES, NotUltrasoundError  # noqa: E402
from _appendix.insights import assess  # noqa: E402
from _appendix.report import build_pdf  # noqa: E402

MODEL_DIR = Path(__file__).resolve().parent / "_appendix" / "model"
MAX_UPLOAD_BYTES = 3_500_000  # Vercel caps request bodies at 4.5 MB; the frontend downsizes images first

app = FastAPI(title="AppendixAi API", version="2.0.0", docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")
clinical = LitePredictor()
imaging = ImagingModel()
evidence = json.loads((MODEL_DIR / "evidence.json").read_text(encoding="utf-8"))
with open(MODEL_DIR / "sample_patients.csv", newline="", encoding="utf-8") as fh:
    SAMPLES = list(csv.DictReader(fh))


def _scans(row: dict) -> list[str]:
    """Ultrasound files (in public/samples/) that belong to a sample patient, if any."""
    return [s for s in (row.get("scans") or "").split(";") if s]


class PatientIn(BaseModel):
    patient: dict[str, Any] = Field(default_factory=dict)


class ReportIn(BaseModel):
    patient: dict[str, Any] = Field(default_factory=dict)
    imaging: Optional[dict[str, Any]] = None
    patient_id: Optional[str] = Field(default=None, max_length=60)
    clinician: Optional[str] = Field(default=None, max_length=80)
    note: Optional[str] = Field(default=None, max_length=1500)


def _clean_patient(raw: dict) -> dict:
    out = {}
    for f in clinical.features:
        v = raw.get(f)
        if v is None or v == "":
            out[f] = None
        elif f in clinical.numeric:
            try:
                x = float(v)
            except (TypeError, ValueError):
                raise HTTPException(400, f"{FIELD_INFO[f][0]} must be a number.")
            if math.isnan(x) or math.isinf(x):
                raise HTTPException(400, f"{FIELD_INFO[f][0]} must be a finite number.")
            out[f] = x
        else:
            allowed = clinical.info["categorical_features"][f]
            if str(v) not in allowed:
                raise HTTPException(400, f"{FIELD_INFO[f][0]}: '{v}' is not one of {allowed}.")
            out[f] = str(v)
    return out


@app.get("/api/py/health")
def health():
    return {"status": "ok", "clinical_model": clinical.info["model_name"], "imaging": imaging.status["available"]}


@app.get("/api/py/config")
def config():
    info = clinical.info
    fields = {}
    for f in clinical.features:
        label, unit, help_text, ref = FIELD_INFO[f]
        entry = {"label": label, "unit": unit, "help": help_text, "reference": list(ref) if ref else None}
        if f in clinical.numeric:
            rng = info["numeric_features"][f]
            entry.update(type="number", min=rng["min"], max=rng["max"], median=rng["median"])
        else:
            entry.update(type="choice", options=[{"value": o, "label": CHOICE_LABELS.get(o, o)}
                                                  for o in info["categorical_features"][f]])
        fields[f] = entry
    return {
        "clinical_model": {
            "name": info["model_name"],
            "n_inputs": len(clinical.features),
            "metrics": info["test_metrics"],
            "accuracy_ci": info["test_accuracy_95ci"],
            "cv_accuracy": info.get("cv_accuracy"),
            "trained_on": info.get("trained_on_patients"),
        },
        "classes": clinical.classes,
        "stages": STAGES,
        "fields": fields,
        "imaging": imaging.status,
        "max_images": MAX_IMAGES,
        "samples": [
            {"id": r["sample_id"], "true_diagnosis": r["true_diagnosis"], "has_scans": bool(_scans(r))} for r in SAMPLES
        ],
        "disclaimer": info["disclaimer"],
    }


@app.get("/api/py/evidence")
def get_evidence():
    data = dict(evidence)
    data["clinical_metrics"] = clinical.info["test_metrics"]
    data["clinical_accuracy_ci"] = clinical.info["test_accuracy_95ci"]
    data["figures"] = [
        {"file": "01_model_selection_cv_accuracy.png", "title": "Model selection", "caption": "Cross-validated accuracy of candidate clinical models; the chosen model is highlighted."},
        {"file": "02_confusion_matrix.png", "title": "Confusion matrix", "caption": "Clinical model on the 156 locked test patients."},
        {"file": "03_roc_and_pr_curves.png", "title": "ROC and precision–recall", "caption": "One-vs-rest curves for each outcome."},
        {"file": "04_per_class_metrics.png", "title": "Per-class metrics", "caption": "Precision, recall and F1 for each outcome."},
        {"file": "05_accuracy_ci_and_sensitivity.png", "title": "Accuracy and sensitivity", "caption": "Bootstrap confidence interval with clinical sensitivity and specificity."},
        {"file": "06_cv_vs_test_accuracy.png", "title": "CV vs test", "caption": "Cross-validation compared with locked-test accuracy."},
        {"file": "07_permutation_importance.png", "title": "Important variables", "caption": "Permutation importance on the test set."},
        {"file": "08_validation_five_setups.png", "title": "Does ultrasound add value?", "caption": "Five input setups compared on the same 578 patients."},
        {"file": "09_validation_boxplot.png", "title": "Fold-to-fold stability", "caption": "Accuracy across 25 cross-validation folds."},
    ]
    if imaging.status.get("metrics"):
        data["installed_imaging_metrics"] = imaging.status["metrics"]
    return data


@app.get("/api/py/sample")
def sample(id: str):
    row = next((r for r in SAMPLES if r["sample_id"] == id), None)
    if row is None:
        raise HTTPException(404, f"Sample patient '{id}' not found")
    patient = {}
    for f in clinical.features:
        v = row.get(f)
        patient[f] = None if v in (None, "") else (float(v) if f in clinical.numeric else v)
    return {
        "id": id,
        "true_diagnosis": row["true_diagnosis"],
        "patient": patient,
        "scans": [f"/samples/{name}" for name in _scans(row)],
    }


@app.post("/api/py/assess")
def assess_patient(body: PatientIn):
    return assess(clinical, _clean_patient(body.patient))


@app.post("/api/py/imaging")
async def assess_imaging(patient: str = Form("{}"), files: list[UploadFile] = File(...)):
    if not imaging.status["available"]:
        raise HTTPException(503, imaging.status["reason"])
    if not files:
        raise HTTPException(400, "Upload at least one ultrasound image.")
    if len(files) > MAX_IMAGES:
        raise HTTPException(400, f"Upload at most {MAX_IMAGES} images per patient.")
    try:
        data = json.loads(patient)
    except json.JSONDecodeError:
        raise HTTPException(400, "Patient data is not valid JSON.")
    cleaned = _clean_patient(data)
    blobs, names, total = [], [], 0
    for f in files:
        b = await f.read()
        total += len(b)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "Images are too large; please upload fewer or smaller images.")
        blobs.append(b)
        names.append(f.filename or f"Image {len(names) + 1}")
    try:
        return imaging.predict(cleaned, blobs, names)
    except NotUltrasoundError as exc:
        raise HTTPException(422, str(exc))
    except (OSError, ValueError) as exc:
        raise HTTPException(400, f"Could not read an image: {exc}")


@app.post("/api/py/report")
def report(body: ReportIn):
    result = assess(clinical, _clean_patient(body.patient))
    pdf = build_pdf(result, imaging=body.imaging, patient_id=body.patient_id, clinician=body.clinician, note=body.note)
    name = f"AppendixAi_report_{(body.patient_id or 'patient').replace(' ', '_')}.pdf"
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"'})
