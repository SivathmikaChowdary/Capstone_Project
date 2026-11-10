"""Printable PDF decision-support report (ReportLab)."""
from __future__ import annotations

import base64
import io
from datetime import datetime, timedelta, timezone

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Image as RLImage, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)

from .fields import CHOICE_LABELS, FIELD_INFO, STAGES

INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#64748b")
LINE = colors.HexColor("#e2e8f0")
SOFT = colors.HexColor("#f1f5f9")
ACCENT = colors.HexColor("#0f766e")
CLASS_HEX = ["#16a34a", "#d97706", "#dc2626"]
CLASS_COLORS = [colors.HexColor(h) for h in CLASS_HEX]
IST = timezone(timedelta(hours=5, minutes=30))

styles = getSampleStyleSheet()
H1 = ParagraphStyle("h1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=17, textColor=INK, spaceAfter=2)
H2 = ParagraphStyle("h2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11.5, textColor=INK,
                    spaceBefore=10, spaceAfter=5)
BODY = ParagraphStyle("body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, leading=12.5,
                      textColor=INK, alignment=TA_LEFT)
SMALL = ParagraphStyle("small", parent=BODY, fontSize=7.8, leading=10.5, textColor=MUTED)


_PDF_SAFE = str.maketrans({"×": "x", "³": "^3", "⁶": "^6", "²": "2", "µ": "u"})


def _safe(text) -> str:
    """The built-in PDF font cannot draw superscripts or µ; use plain-text units instead."""
    return str(text).translate(_PDF_SAFE)


def _fmt_value(field, v):
    if v is None or v == "":
        return "—"
    if isinstance(v, (int, float)):
        unit = FIELD_INFO.get(field, (None, None))[1]
        return _safe(f"{v:g}" + (f" {unit}" if unit else ""))
    return CHOICE_LABELS.get(str(v), str(v))


def _table(rows, widths, header=True, zebra=True):
    t = Table(rows, colWidths=widths, hAlign="LEFT")
    style = [
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8.6),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    if header:
        style += [("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8.2), ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
                  ("LINEBELOW", (0, 0), (-1, 0), 0.8, INK)]
    if zebra:
        for r in range(1 if header else 0, len(rows)):
            if r % 2 == 0:
                style.append(("BACKGROUND", (0, r), (-1, r), SOFT))
    t.setStyle(TableStyle(style))
    return t


def _bar(p, color, width=60 * mm, height=3.2 * mm):
    t = Table([["", ""]], colWidths=[max(width * p, 0.5), max(width * (1 - p), 0.5)], rowHeights=[height])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), color), ("BACKGROUND", (1, 0), (1, 0), LINE),
                           ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    return t


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10 * mm, "AppendixAi research prototype — not a medical device. "
                                        "Results support, and never replace, clinical judgement.")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_pdf(assessment: dict, imaging: dict | None = None, patient_id: str | None = None,
              clinician: str | None = None, note: str | None = None) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                            bottomMargin=18 * mm, title="AppendixAi report", author="AppendixAi")
    pred, conf = assessment["prediction"], assessment["confidence"]
    classes = list(pred["probabilities"].keys())
    now = datetime.now(IST).strftime("%d %b %Y, %H:%M IST")
    story = []

    head = Table([[Paragraph("<b>AppendixAi</b> · Pediatric appendicitis decision support", SMALL),
                   Paragraph(f"Generated {now}", ParagraphStyle("r", parent=SMALL, alignment=2))]],
                 colWidths=[110 * mm, 64 * mm])
    head.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, 0), 1.2, ACCENT), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                              ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [head, Spacer(1, 8), Paragraph("Decision-support report", H1)]
    meta = [f"Patient ID: <b>{patient_id or '—'}</b>", f"Inputs entered: <b>{assessment['filled']} / {assessment['total_fields']}</b>"]
    if clinician:
        meta.append(f"Clinician: <b>{clinician}</b>")
    story.append(Paragraph(" &nbsp;·&nbsp; ".join(meta), BODY))

    # ---- headline
    final = imaging if imaging else pred
    final_probs = final["probabilities"]
    final_idx = classes.index(final["predicted_class"])
    p_comp = final_probs[classes[2]]
    tier = "High" if p_comp >= 0.5 else "Moderate" if p_comp >= 0.2 else "Low"
    status = "Confident" if conf["status"] == "confident" else "Uncertain — refer for senior review"
    source = "Clinical + ultrasound fusion model" if imaging else "Clinical model"
    headline = [
        [Paragraph("<font color='#64748b' size=7.5>MOST LIKELY OUTCOME</font>", BODY),
         Paragraph("<font color='#64748b' size=7.5>COMPLICATED RISK</font>", BODY),
         Paragraph("<font color='#64748b' size=7.5>MODEL CONFIDENCE</font>", BODY)],
        [Paragraph(f"<font size=13 color='{CLASS_HEX[final_idx]}'><b>{final['predicted_class']}</b></font>", BODY),
         Paragraph(f"<font size=13><b>{tier}</b></font> &nbsp;({p_comp:.0%})", BODY),
         Paragraph(f"<font size=11><b>{status}</b></font>", BODY)],
    ]
    ht = Table(headline, colWidths=[62 * mm, 50 * mm, 62 * mm])
    ht.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, LINE), ("BACKGROUND", (0, 0), (-1, -1), SOFT),
                            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                            ("LEFTPADDING", (0, 0), (-1, -1), 7)]))
    story += [Spacer(1, 8), ht, Paragraph(f"Source: {source}.", SMALL)]

    if conf["reasons"] or conf.get("safety_message"):
        lines = conf["reasons"] + ([conf["safety_message"]] if conf.get("safety_message") else [])
        story += [Spacer(1, 4), Paragraph("<b>Attention:</b> " + " ".join(lines), BODY)]

    # ---- probabilities
    story.append(Paragraph("Outcome probabilities", H2))
    rows = [["Outcome", "Clinical model", "", "Fusion (clinical + images)" if imaging else ""]]
    for i, c in enumerate(classes):
        p = pred["probabilities"][c]
        row = [c, f"{p:.1%}", _bar(p, CLASS_COLORS[i], 45 * mm)]
        row.append(f"{imaging['probabilities'][c]:.1%}" if imaging else "")
        rows.append(row)
    story.append(_table(rows, [48 * mm, 24 * mm, 52 * mm, 50 * mm], zebra=False))

    # ---- explanation
    story.append(Paragraph(f"Main factors behind the clinical estimate (towards “{pred['predicted_class']}”)", H2))
    rows = [["Factor", "Value", "Direction", "Effect"]]
    for e in assessment["explanation"]:
        rows.append([e["feature"], _safe(e["value"]), "raises" if e["effect"] > 0 else "lowers", f"{e['effect']:+.3f}"])
    story.append(_table(rows, [70 * mm, 40 * mm, 34 * mm, 30 * mm]))
    story.append(Paragraph("Effects are exact SHAP values of the CatBoost model (log-odds scale) for the predicted outcome.", SMALL))

    # ---- next tests
    if assessment.get("next_tests"):
        story.append(Paragraph("Tests that could change the estimate", H2))
        rows = [["Test not yet entered", "Complicated risk range", "Appendicitis range", "Could change outcome"]]
        for t in assessment["next_tests"]:
            lo, hi = t["complicated_range"]
            alo, ahi = t["appendicitis_range"]
            rows.append([t["test"], f"{lo:.0%} – {hi:.0%}", f"{alo:.0%} – {ahi:.0%}", "Yes" if t["could_change_outcome"] else "No"])
        story.append(_table(rows, [62 * mm, 40 * mm, 38 * mm, 34 * mm]))

    # ---- trajectory
    if assessment.get("trajectory"):
        story.append(Paragraph("How the estimate changed at each step", H2))
        rows = [["After step"] + classes]
        for s in assessment["trajectory"]:
            rows.append([s["title"]] + [f"{s['probabilities'][c]:.0%}" for c in classes])
        story.append(_table(rows, [62 * mm, 37 * mm, 37 * mm, 38 * mm]))

    # ---- imaging
    if imaging:
        story.append(Paragraph(f"Ultrasound images ({imaging['n_images']}) — Grad-CAM attention", H2))
        cells, row = [], []
        for img in imaging.get("images", [])[:8]:
            try:
                raw = base64.b64decode(img["gradcam"].split(",", 1)[1])
                pic = RLImage(io.BytesIO(raw), width=38 * mm, height=38 * mm, kind="proportional")
            except Exception:
                continue
            infl = img.get("influence")
            caption = Paragraph(f"{img['name'][:28]}<br/>influence {infl:+.1%}" if infl is not None else img["name"][:28], SMALL)
            row.append([pic, caption])
            if len(row) == 4:
                cells.append(row)
                row = []
        if row:
            cells.append(row + [""] * (4 - len(row)))
        if cells:
            grid = Table(cells, colWidths=[43.5 * mm] * 4)
            grid.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 1)]))
            story.append(grid)
        story.append(Paragraph("Heatmaps show where the model's attention was highest for the predicted outcome. "
                               "They are model explanations, not anatomical or pathological localisation.", SMALL))

    # ---- inputs
    story.append(Paragraph("Entered data", H2))
    patient = assessment["patient"]
    for stage in STAGES:
        rows = [[FIELD_INFO[f][0], _fmt_value(f, patient.get(f))] for f in stage["fields"]]
        half = (len(rows) + 1) // 2
        left, right = rows[:half], rows[half:] + [["", ""]] * (half - len(rows[half:]))
        merged = [[a[0], a[1], b[0], b[1]] for a, b in zip(left, right)]
        block = [Paragraph(f"<b>{stage['title']}</b>", BODY), _table(merged, [52 * mm, 35 * mm, 52 * mm, 35 * mm], header=False)]
        story.append(KeepTogether(block))
        story.append(Spacer(1, 4))

    if note:
        story += [Paragraph("Clinician note", H2), Paragraph(note.replace("\n", "<br/>"), BODY)]
    story += [Spacer(1, 14), Paragraph("Reviewed by: ______________________ &nbsp;&nbsp; Signature: ______________ "
                                       "&nbsp;&nbsp; Date: ____________", BODY)]
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()
