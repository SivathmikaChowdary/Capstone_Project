"""Form metadata: which step each input belongs to, labels, units and reference ranges.

The clinical steps mirror the real emergency-department pathway:
patient → symptoms & examination → laboratory → ultrasound report → ultrasound images.
"""

STAGES = [
    {
        "id": "patient",
        "title": "Patient",
        "subtitle": "Demographics and body measurements",
        "fields": ["Age", "Sex", "Height", "Weight", "BMI"],
    },
    {
        "id": "exam",
        "title": "Symptoms & examination",
        "subtitle": "History and bedside findings",
        "fields": [
            "Lower_Right_Abd_Pain", "Migratory_Pain", "Nausea", "Loss_of_Appetite", "Coughing_Pain",
            "Dysuria", "Stool", "Body_Temperature", "Ipsilateral_Rebound_Tenderness",
            "Contralateral_Rebound_Tenderness", "Psoas_Sign", "Peritonitis",
        ],
    },
    {
        "id": "labs",
        "title": "Laboratory",
        "subtitle": "Blood count, inflammation markers and urine",
        "fields": [
            "WBC_Count", "Neutrophil_Percentage", "Neutrophilia", "CRP", "RBC_Count", "Hemoglobin",
            "RDW", "Thrombocyte_Count", "Ketones_in_Urine", "RBC_in_Urine", "WBC_in_Urine",
        ],
    },
    {
        "id": "us_report",
        "title": "Ultrasound report",
        "subtitle": "Structured findings from the radiologist",
        "fields": ["US_Performed", "Appendix_on_US", "Appendix_Diameter", "Free_Fluids"],
    },
]

# label, unit, help text, typical reference range (shown as a hint only)
FIELD_INFO = {
    "Age": ("Age", "years", "Age at presentation", None),
    "Sex": ("Sex", None, None, None),
    "Height": ("Height", "cm", None, None),
    "Weight": ("Weight", "kg", None, None),
    "BMI": ("BMI", "kg/m²", "Calculated automatically from height and weight", None),
    "Lower_Right_Abd_Pain": ("Right lower quadrant pain", None, "Pain in the right lower abdomen", None),
    "Migratory_Pain": ("Migratory pain", None, "Pain that moved from the umbilicus to the right lower quadrant", None),
    "Nausea": ("Nausea / vomiting", None, None, None),
    "Loss_of_Appetite": ("Loss of appetite", None, None, None),
    "Coughing_Pain": ("Pain on coughing", None, "Pain worsens with coughing or hopping", None),
    "Dysuria": ("Dysuria", None, "Pain or burning on urination", None),
    "Stool": ("Stool", None, None, None),
    "Body_Temperature": ("Body temperature", "°C", None, (36.0, 37.5)),
    "Ipsilateral_Rebound_Tenderness": ("Rebound tenderness (right)", None, "Rebound tenderness in the right lower quadrant", None),
    "Contralateral_Rebound_Tenderness": ("Rebound tenderness (left)", None, "Rovsing-type contralateral rebound tenderness", None),
    "Psoas_Sign": ("Psoas sign", None, None, None),
    "Peritonitis": ("Peritonitis", None, "Signs of peritoneal irritation", None),
    "WBC_Count": ("White blood cells", "×10³/µL", None, (4.5, 13.5)),
    "Neutrophil_Percentage": ("Neutrophils", "%", None, (40, 70)),
    "Neutrophilia": ("Neutrophilia", None, "Raised neutrophil count reported by the lab", None),
    "CRP": ("C-reactive protein", "mg/L", None, (0, 5)),
    "RBC_Count": ("Red blood cells", "×10⁶/µL", None, (4.0, 5.2)),
    "Hemoglobin": ("Haemoglobin", "g/dL", None, (11.5, 15.5)),
    "RDW": ("RDW", "%", "Red cell distribution width", (11.5, 14.5)),
    "Thrombocyte_Count": ("Platelets", "×10³/µL", None, (150, 450)),
    "Ketones_in_Urine": ("Urine ketones", None, None, None),
    "RBC_in_Urine": ("Urine red cells", None, None, None),
    "WBC_in_Urine": ("Urine white cells", None, None, None),
    "US_Performed": ("Ultrasound performed", None, None, None),
    "Appendix_on_US": ("Appendix visualised", None, "Was the appendix seen on ultrasound?", None),
    "Appendix_Diameter": ("Appendix diameter", "mm", "Above 6 mm suggests appendicitis", (0, 6)),
    "Free_Fluids": ("Free fluid", None, "Free intra-abdominal fluid on ultrasound", None),
}

# fields that strongly drive the model (used for warnings and the "next test" suggestions)
KEY_FIELDS = ["CRP", "WBC_Count", "Appendix_Diameter"]

# plausible values tried when estimating how much an unmeasured test could change the result
PROBE_VALUES = {
    "CRP": [2, 10, 40, 100, 200],
    "WBC_Count": [6, 10, 14, 18, 24],
    "Neutrophil_Percentage": [50, 65, 75, 85, 92],
    "Body_Temperature": [36.8, 37.5, 38.3, 39.2],
    "Appendix_Diameter": [5, 7, 9, 11, 13],
    "Free_Fluids": ["no", "yes"],
    "Peritonitis": ["no", "local", "generalized"],
    "Ipsilateral_Rebound_Tenderness": ["no", "yes"],
}
PROBE_GROUPS = {
    # a test may set several fields at once (an ultrasound reports the appendix and free fluid together)
    "Appendix_Diameter": {"US_Performed": "yes", "Appendix_on_US": "yes"},
}
TEST_NAMES = {
    "CRP": "CRP",
    "WBC_Count": "White blood cell count",
    "Neutrophil_Percentage": "Neutrophil percentage",
    "Body_Temperature": "Temperature",
    "Appendix_Diameter": "Ultrasound: appendix diameter",
    "Free_Fluids": "Ultrasound: free fluid",
    "Peritonitis": "Examination for peritonitis",
    "Ipsilateral_Rebound_Tenderness": "Rebound tenderness",
}

CHOICE_LABELS = {
    "yes": "Yes", "no": "No", "male": "Male", "female": "Female",
    "local": "Local", "generalized": "Generalised", "normal": "Normal",
    "constipation": "Constipation", "diarrhea": "Diarrhoea", "constipation, diarrhea": "Constipation and diarrhoea",
    "+": "+", "++": "++", "+++": "+++",
}
