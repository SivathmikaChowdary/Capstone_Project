"""Clinical insights built on top of the clinical model.

- assess():        prediction + explanation + warnings in one call
- confidence():    flags results the model is unsure about ("refer for senior review")
- next_tests():    for tests not yet done, how far could the result move? (value of information)
- stage_trajectory(): how the estimate changed as each step of information was added
"""
from __future__ import annotations

from .clinical import LitePredictor, _is_missing
from .fields import CHOICE_LABELS, FIELD_INFO, KEY_FIELDS, PROBE_GROUPS, PROBE_VALUES, STAGES, TEST_NAMES

# Thresholds for the "unsure → refer" state. These are deliberately conservative heuristics;
# the planned conformal-calibration study (research/README.md) will replace them with thresholds
# learned on held-out patients.
MIN_TOP_PROBABILITY = 0.60
MIN_MARGIN = 0.20
MIN_FILLED_FIELDS = 8
COMPLICATED_SAFETY_NET = 0.20


def complete_bmi(patient: dict) -> dict:
    patient = dict(patient)
    try:
        if _is_missing(patient.get("BMI")) and patient.get("Height") and patient.get("Weight"):
            h = float(patient["Height"]) / 100
            if h > 0:
                patient["BMI"] = round(float(patient["Weight"]) / h ** 2, 2)
    except (TypeError, ValueError):
        pass
    return patient


def filled_count(model: LitePredictor, patient: dict) -> int:
    return sum(not _is_missing(patient.get(f)) for f in model.features)


def confidence(model: LitePredictor, patient: dict, probs) -> dict:
    ordered = sorted((float(p) for p in probs), reverse=True)
    top, margin = ordered[0], ordered[0] - ordered[1]
    reasons = []
    filled = filled_count(model, patient)
    if filled < MIN_FILLED_FIELDS:
        reasons.append(f"Only {filled} inputs entered; at least {MIN_FILLED_FIELDS} are needed for a dependable estimate.")
    if top < MIN_TOP_PROBABILITY:
        reasons.append(f"No outcome is clearly favoured (highest probability {top:.0%}).")
    if margin < MIN_MARGIN:
        reasons.append(f"The two most likely outcomes are close ({margin:.0%} apart).")
    missing_key = [f for f in KEY_FIELDS if _is_missing(patient.get(f))]
    if len(missing_key) >= 2:
        reasons.append("Key inputs are missing: " + ", ".join(TEST_NAMES.get(f, f) for f in missing_key) + ".")
    p_comp = float(probs[2])
    idx = max(range(len(probs)), key=lambda i: probs[i])
    safety = idx != 2 and p_comp >= COMPLICATED_SAFETY_NET
    status = "refer" if reasons else "confident"
    return {
        "status": status,
        "top_probability": top,
        "margin": margin,
        "reasons": reasons,
        "complicated_safety_net": safety,
        "safety_message": (
            f"Complicated appendicitis cannot be ruled out ({p_comp:.0%}). Consider senior surgical review."
            if safety else None
        ),
        "method": "heuristic thresholds (top probability ≥ 60%, margin ≥ 20%, ≥ 8 inputs)",
    }


def next_tests(model: LitePredictor, patient: dict, limit: int = 4) -> list:
    """For each relevant test not yet entered, try plausible results and measure how much the answer moves."""
    base = model.predict_proba(patient)
    base_idx = int(base.argmax())
    out = []
    for field, values in PROBE_VALUES.items():
        if not _is_missing(patient.get(field)):
            continue
        comps, apps, flips = [], [], 0
        for v in values:
            trial = dict(patient)
            trial[field] = v
            for extra_field, extra_value in PROBE_GROUPS.get(field, {}).items():
                if _is_missing(trial.get(extra_field)):
                    trial[extra_field] = extra_value
            p = model.predict_proba(trial)
            comps.append(float(p[2]))
            apps.append(float(p[1] + p[2]))
            flips += int(int(p.argmax()) != base_idx)
        spread = max(max(comps) - min(comps), max(apps) - min(apps))
        out.append({
            "field": field,
            "test": TEST_NAMES.get(field, field),
            "complicated_range": [min(comps), max(comps)],
            "appendicitis_range": [min(apps), max(apps)],
            "spread": spread,
            "could_change_outcome": flips > 0,
        })
    out.sort(key=lambda r: (r["could_change_outcome"], r["spread"]), reverse=True)
    return [r for r in out if r["spread"] >= 0.03][:limit]


def stage_trajectory(model: LitePredictor, patient: dict) -> list:
    """Probability after each clinical step that has entered values.

    Demographics alone are not reported: the model never saw a patient with every clinical value
    missing, so a demographics-only estimate would be meaningless.
    """
    traj, cumulative = [], {}
    for stage in STAGES:
        entered = {f: patient.get(f) for f in stage["fields"] if not _is_missing(patient.get(f))}
        cumulative.update(entered)
        if stage["id"] == "patient" or not entered:
            continue
        p = model.predict_proba(cumulative)
        filled = sum(not _is_missing(v) for v in cumulative.values())
        traj.append({
            "stage": stage["id"],
            "title": stage["title"],
            "probabilities": {c: float(v) for c, v in zip(model.classes, p)},
            "inputs": filled,
            "reliable": filled >= MIN_FILLED_FIELDS,
        })
    return traj


def labelled_explanation(model: LitePredictor, patient: dict) -> list:
    out = []
    for e in model.explain(patient, top=8):
        f = e["field"]
        label, unit = FIELD_INFO[f][0], FIELD_INFO[f][1]
        v = patient.get(f)
        if _is_missing(v):
            shown = "not entered"
        elif isinstance(v, float):
            shown = f"{v:g}" + (f" {unit}" if unit else "")
        else:
            shown = CHOICE_LABELS.get(str(v), str(v))
        out.append({"field": f, "feature": label, "value": shown, "effect": e["effect"]})
    return out


def relabel(messages: list) -> list:
    """Use the clinical labels from the form instead of raw column names in warnings."""
    from .clinical import pretty
    out = []
    for m in messages:
        for f, info in FIELD_INFO.items():
            m = m.replace(pretty(f) + " ", info[0] + " ")
        out.append(m)
    return out


def assess(model: LitePredictor, patient: dict) -> dict:
    patient = complete_bmi({f: patient.get(f) for f in model.features})
    prediction = model.predict(patient)
    probs = [prediction["probabilities"][c] for c in model.classes]
    return {
        "patient": patient,
        "prediction": prediction,
        "confidence": confidence(model, patient, probs),
        "explanation": labelled_explanation(model, patient),
        "warnings": relabel(model.validate(patient)),
        "next_tests": next_tests(model, patient),
        "trajectory": stage_trajectory(model, patient),
        "filled": filled_count(model, patient),
        "total_fields": len(model.features),
    }
