export type Value = string | number | null;
export type Patient = Record<string, Value>;

export interface FieldDef {
  label: string;
  unit: string | null;
  help: string | null;
  reference: [number, number] | null;
  type: "number" | "choice";
  min?: number;
  max?: number;
  median?: number;
  options?: { value: string; label: string }[];
}

export interface Stage {
  id: string;
  title: string;
  subtitle: string;
  fields: string[];
}

export interface ImagingStatus {
  available: boolean;
  reason?: string;
  missing_files?: string[];
  model_name?: string;
  metrics?: Record<string, number> | null;
  max_images?: number;
}

export interface Config {
  clinical_model: {
    name: string;
    n_inputs: number;
    metrics: Record<string, number>;
    accuracy_ci: [number, number];
    cv_accuracy?: number;
    trained_on?: number;
  };
  classes: string[];
  stages: Stage[];
  fields: Record<string, FieldDef>;
  imaging: ImagingStatus;
  max_images: number;
  samples: { id: string; true_diagnosis: string; has_scans?: boolean }[];
  disclaimer: string;
}

export interface Prediction {
  predicted_class: string;
  predicted_index: number;
  probabilities: Record<string, number>;
  appendicitis_probability: number;
  diagnosis: string;
  complicated_probability: number;
  complicated_risk: "Low" | "Moderate" | "High";
}

export interface Assessment {
  patient: Patient;
  prediction: Prediction;
  confidence: {
    status: "confident" | "refer";
    top_probability: number;
    margin: number;
    reasons: string[];
    complicated_safety_net: boolean;
    safety_message: string | null;
    method: string;
  };
  explanation: { field: string; feature: string; value: string; effect: number }[];
  warnings: string[];
  next_tests: {
    field: string;
    test: string;
    complicated_range: [number, number];
    appendicitis_range: [number, number];
    spread: number;
    could_change_outcome: boolean;
  }[];
  trajectory: {
    stage: string;
    title: string;
    probabilities: Record<string, number>;
    inputs: number;
    reliable: boolean;
  }[];
  filled: number;
  total_fields: number;
}

export interface ImagingResult {
  model_name?: string;
  classes: string[];
  probabilities: Record<string, number>;
  predicted_index: number;
  predicted_class: string;
  complicated_probability: number;
  appendicitis_probability: number;
  without_images: Record<string, number> | null;
  n_images: number;
  explained_class: string;
  images: {
    name: string;
    original: string;
    gradcam: string;
    influence: number | null;
    peak_activation: number;
    similarity?: number | null;
    unfamiliar?: boolean;
  }[];
  domain_warning?: string | null;
}

export interface Evidence {
  note: string;
  experiments: {
    model: string;
    modality: string;
    protocol: string;
    accuracy: number;
    macro_f1: number;
    complicated_recall: number;
  }[];
  fusion_confusion_matrix: number[][];
  dataset: {
    name: string;
    patients: number;
    ultrasound_patients: number;
    ultrasound_images: number;
    paired_cohort: number;
    classes: Record<string, number>;
  };
  limitations: string[];
  clinical_metrics: Record<string, number>;
  clinical_accuracy_ci: [number, number];
  figures: { file: string; title: string; caption: string }[];
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") msg = body.detail;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  config: () => fetch("/api/py/config").then((r) => handle<Config>(r)),
  evidence: () => fetch("/api/py/evidence").then((r) => handle<Evidence>(r)),
  sample: (id: string) =>
    fetch(`/api/py/sample?id=${encodeURIComponent(id)}`).then((r) =>
      handle<{ id: string; true_diagnosis: string; patient: Patient; scans: string[] }>(r),
    ),
  assess: (patient: Patient, signal?: AbortSignal) =>
    fetch("/api/py/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient }),
      signal,
    }).then((r) => handle<Assessment>(r)),
  imaging: (patient: Patient, files: { blob: Blob; name: string }[]) => {
    const form = new FormData();
    form.append("patient", JSON.stringify(patient));
    files.forEach((f) => form.append("files", f.blob, f.name));
    return fetch("/api/py/imaging", { method: "POST", body: form }).then((r) => handle<ImagingResult>(r));
  },
  report: async (body: {
    patient: Patient;
    imaging?: ImagingResult | null;
    patient_id?: string;
    clinician?: string;
    note?: string;
  }) => {
    const res = await fetch("/api/py/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Report failed (${res.status})`);
    return res.blob();
  },
};

/** Prepare an image for upload while staying under Vercel's 4.5 MB request limit.
 *  Small files are sent untouched (the server letterboxes them to 224×224 exactly as in training);
 *  large ones are downsized in the browser; anything the browser cannot decode is sent as-is. */
export async function prepareImage(file: File, budget = 400_000): Promise<{ blob: Blob; name: string }> {
  if (file.size <= budget) return { blob: file, name: file.name };
  try {
    const blob = await downsizeImage(file);
    return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
  } catch {
    return { blob: file, name: file.name };
  }
}

export async function downsizeImage(file: File, maxSide = 640): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not open ${file.name}`));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.95),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const pct = (p: number, digits = 0) => `${(p * 100).toFixed(digits)}%`;

export const CLASS_TONE = ["c0", "c1", "c2"] as const;
export const SHORT_CLASS: Record<string, string> = {
  "No appendicitis": "No appendicitis",
  Uncomplicated: "Uncomplicated",
  Complicated: "Complicated",
};
