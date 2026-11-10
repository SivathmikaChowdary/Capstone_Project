"use client";

import clsx from "clsx";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Download,
  FileText,
  FlaskConical,
  Gauge,
  Image as ImageIcon,
  ListChecks,
  RotateCcw,
  Stethoscope,
  User,
  Waves,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FieldInput } from "@/components/FieldInput";
import { ImagingStep, type UploadItem } from "@/components/ImagingStep";
import { ConfidenceBanner, ExplanationBars, NextTests, OutcomeBars, RiskGauge, Trajectory } from "@/components/results";
import { Badge, Button, Card, CardHeader, Spinner, TONE } from "@/components/ui";
import { api, type Assessment, type Config, type ImagingResult, type Patient, pct, prepareImage, type Value } from "@/lib/api";

const STEP_ICONS = [User, Stethoscope, FlaskConical, Waves, ImageIcon, ListChecks];
const SHORT: Record<string, string> = { patient: "Patient", exam: "Exam", labs: "Labs", us_report: "US report", images: "Images", results: "Results" };

function isFilled(v: Value) {
  return v !== null && v !== undefined && v !== "";
}

export default function AssessPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [patient, setPatient] = useState<Patient>({});
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [sample, setSample] = useState<{ id: string; truth: string; scans: number } | null>(null);

  const [uploads, setUploadsState] = useState<UploadItem[]>([]);
  const [imaging, setImaging] = useState<ImagingResult | null>(null);
  const [imagingKey, setImagingKey] = useState<string | null>(null);
  const [imagingBusy, setImagingBusy] = useState(false);
  const [imagingError, setImagingError] = useState<string | null>(null);

  const [patientId, setPatientId] = useState("");
  const [clinician, setClinician] = useState("");
  const [note, setNote] = useState("");
  const [downloading, setDownloading] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.config().then(setConfig).catch((e) => setLoadError(e.message));
  }, []);

  const stages = config?.stages ?? [];
  const steps = useMemo(
    () => [
      ...stages.map((s) => ({ id: s.id, title: s.title, subtitle: s.subtitle, fields: s.fields })),
      { id: "images", title: "Ultrasound images", subtitle: "Optional — scan views for the fusion model", fields: [] as string[] },
      { id: "results", title: "Results", subtitle: "Full assessment, explanations and report", fields: [] as string[] },
    ],
    [stages],
  );

  const bmi = useMemo(() => {
    const h = Number(patient.Height), w = Number(patient.Weight);
    return h > 0 && w > 0 ? w / (h / 100) ** 2 : null;
  }, [patient.Height, patient.Weight]);

  // ---- live assessment (debounced)
  const filledCount = Object.values(patient).filter(isFilled).length;
  useEffect(() => {
    if (!config) return;
    if (filledCount === 0) {
      setAssessment(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setAssessing(true);
      api
        .assess(patient, ctrl.signal)
        .then((a) => {
          setAssessment(a);
          setAssessError(null);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setAssessError(e.message);
        })
        .finally(() => setAssessing(false));
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [patient, config, filledCount]);

  const setField = useCallback((name: string, v: Value) => setPatient((p) => ({ ...p, [name]: v })), []);
  const setUploads = useCallback((fn: (prev: UploadItem[]) => UploadItem[]) => setUploadsState(fn), []);

  const goTo = (i: number) => {
    setStep(i);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const loadSample = async (id: string) => {
    if (!id) return;
    const s = await api.sample(id);
    setPatient(s.patient);
    setSample({ id: s.id, truth: s.true_diagnosis, scans: s.scans?.length ?? 0 });
    setImaging(null);
    setPatientId(s.id);
    // Sample cases that come with real ultrasound scans: put them straight into the Images step.
    const items = await Promise.all(
      (s.scans ?? []).map(async (url) => {
        const blob = await fetch(url).then((r) => r.blob());
        const file = new File([blob], url.split("/").pop() ?? "scan.jpg", { type: blob.type || "image/jpeg" });
        return { id: `${file.name}-${Math.random()}`, file, preview: URL.createObjectURL(file) };
      }),
    ).catch(() => []);
    setUploadsState(items);
  };

  const reset = () => {
    setPatient({});
    setImagingError(null);
    setSample(null);
    setImaging(null);
    setUploadsState([]);
    setPatientId("");
    setNote("");
    goTo(0);
  };

  const patientKey = JSON.stringify(patient) + uploads.map((u) => u.id).join();
  const imagingStale = imaging != null && imagingKey !== patientKey;

  const analyseImages = async () => {
    setImagingBusy(true);
    setImagingError(null);
    try {
      const files = (await Promise.all(uploads.map((u) => prepareImage(u.file)))).map((f, i) => ({ ...f, name: uploads[i].file.name }));
      const r = await api.imaging(patient, files);
      setImaging(r);
      setImagingKey(patientKey);
    } catch (e) {
      setImagingError((e as Error).message);
      setImaging(null);
    } finally {
      setImagingBusy(false);
    }
  };

  const downloadReport = async () => {
    setDownloading(true);
    try {
      const blob = await api.report({
        patient,
        imaging: imaging && !imagingStale ? imaging : null,
        patient_id: patientId || undefined,
        clinician: clinician || undefined,
        note: note || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `AppendixAi_report_${(patientId || "patient").replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  if (loadError)
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-xl font-semibold">Could not reach the AppendixAi API</h1>
        <p className="mt-2 text-sm text-muted">{loadError}</p>
      </div>
    );
  if (!config)
    return (
      <div className="flex items-center justify-center gap-2 py-32 text-sm text-muted">
        <Spinner /> Loading the assessment…
      </div>
    );

  const current = steps[step];
  const disagreement =
    imaging && !imagingStale && assessment && imaging.predicted_class !== assessment.prediction.predicted_class
      ? [`The image-based fusion model suggests “${imaging.predicted_class}”, unlike the clinical model.`]
      : [];

  return (
    <div ref={topRef} className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-28 pt-8 sm:px-6 lg:pb-12">
      {/* ---------- title row */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">Assessment</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Child with abdominal pain</h1>
          <p className="mt-1 text-sm text-muted">Every field is optional. The estimate updates as you go.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Load a sample patient"
            value={sample?.id ?? ""}
            onChange={(e) => loadSample(e.target.value)}
            className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="">Load a sample patient…</option>
            {config.samples.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} (actual: {s.true_diagnosis})
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={reset}>
            <RotateCcw className="size-4" /> New patient
          </Button>
        </div>
      </div>

      {sample && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-ink-2">
          <ClipboardList className="mt-0.5 size-4 shrink-0 text-accent" />
          <p>
            {sample.scans > 0 ? (
              <>
                Sample <strong>{sample.id}</strong> from the Regensburg dataset, with {sample.scans} real ultrasound scan
                {sample.scans > 1 ? "s" : ""} already added in the Images step (this child may have been in the training data).
              </>
            ) : (
              <>
                Sample <strong>{sample.id}</strong> from the locked test set (never used for training).
              </>
            )}{" "}
            Actual diagnosis:{" "}
            <Badge tone={sample.truth === "Complicated" ? 2 : sample.truth === "Uncomplicated" ? 1 : 0}>{sample.truth}</Badge>
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ---------- left: steps */}
        <div className="min-w-0 space-y-6">
          <Card>
            <nav className="flex gap-1 overflow-x-auto border-b border-line p-2" aria-label="Assessment steps">
              {steps.map((s, i) => {
                const Icon = STEP_ICONS[i];
                const done = s.fields.filter((f) => isFilled(patient[f])).length;
                const complete = s.id === "images" ? !!imaging : s.fields.length > 0 && done > 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goTo(i)}
                    className={clsx(
                      "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition",
                      i === step ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2",
                    )}
                    aria-current={i === step ? "step" : undefined}
                  >
                    <span
                      className={clsx(
                        "grid size-6 place-items-center rounded-full text-[11px]",
                        i === step ? "bg-accent text-accent-ink" : complete ? "bg-c0-soft text-c0" : "bg-surface-2 text-muted",
                      )}
                    >
                      {complete && i !== step ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                    </span>
                    <span className="whitespace-nowrap">{SHORT[s.id] ?? s.title}</span>
                    {s.fields.length > 0 && (
                      <span className="tnum text-[11px] text-muted">
                        {done}/{s.fields.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="px-5 pb-2 pt-5">
              <h2 className="text-lg font-semibold tracking-tight text-ink">
                <span className="mr-2 text-muted">{step + 1}.</span>
                {current.title}
              </h2>
              <p className="mt-0.5 text-sm text-muted">{current.subtitle}</p>
            </div>

            <div className="px-5 pb-5 pt-3">
              {current.fields.length > 0 && (
                <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                  {current.fields.map((f) => (
                    <FieldInput
                      key={f}
                      name={f}
                      def={config.fields[f]}
                      value={patient[f] ?? null}
                      onChange={(v) => setField(f, v)}
                      computed={f === "BMI" ? bmi : undefined}
                    />
                  ))}
                </div>
              )}
              {current.id === "images" && (
                <ImagingStep
                  status={config.imaging}
                  maxImages={config.max_images}
                  items={uploads}
                  setItems={setUploads}
                  result={imaging}
                  busy={imagingBusy}
                  error={imagingError}
                  stale={imagingStale}
                  onAnalyze={analyseImages}
                  clinical={assessment}
                />
              )}
              {current.id === "results" && !assessment && (
                <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-muted">
                  Enter some patient data first — or load a sample patient above.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-3">
              <Button variant="ghost" onClick={() => goTo(Math.max(0, step - 1))} disabled={step === 0}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              {step < steps.length - 1 ? (
                <Button onClick={() => goTo(step + 1)}>
                  {step === steps.length - 2 ? "See results" : "Next"} <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => goTo(0)}>
                  Edit inputs
                </Button>
              )}
            </div>
          </Card>

          {current.id === "results" && assessment && (
            <ResultsView
              a={assessment}
              classes={config.classes}
              imaging={imaging && !imagingStale ? imaging : null}
              disagreement={disagreement}
              onImages={() => goTo(steps.length - 2)}
              report={{ patientId, setPatientId, clinician, setClinician, note, setNote, downloading, downloadReport }}
            />
          )}
        </div>

        {/* ---------- right: live panel */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <LivePanel a={assessment} busy={assessing} error={assessError} imaging={imaging && !imagingStale ? imaging : null} disagreement={disagreement} onResults={() => goTo(steps.length - 1)} />
          </div>
        </aside>
      </div>

      {/* ---------- mobile risk bar */}
      {assessment && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold" style={{ color: `var(--c${assessment.prediction.predicted_index})` }}>
                {assessment.prediction.predicted_class}
              </div>
              <div className="tnum text-xs text-muted">
                Complicated risk {pct(assessment.prediction.complicated_probability)} ·{" "}
                {assessment.confidence.status === "refer" || disagreement.length ? "uncertain" : "confident"}
              </div>
            </div>
            <Button onClick={() => goTo(steps.length - 1)} className="shrink-0">
              Results
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== live panel */
function LivePanel({
  a,
  busy,
  error,
  imaging,
  disagreement,
  onResults,
}: {
  a: Assessment | null;
  busy: boolean;
  error: string | null;
  imaging: ImagingResult | null;
  disagreement: string[];
  onResults: () => void;
}) {
  const refer = a && (a.confidence.status === "refer" || disagreement.length > 0);
  return (
    <Card>
      <CardHeader
        title="Live estimate"
        subtitle="Clinical model · updates as you type"
        icon={<Activity className="size-4" />}
        action={busy ? <Spinner className="mt-1 text-muted" /> : null}
      />
      <div className="space-y-5 p-5">
        {error && <div className="rounded-lg bg-c2-soft px-3 py-2 text-xs text-c2">{error}</div>}
        {!a ? (
          <div className="py-8 text-center">
            <Gauge className="mx-auto size-8 text-muted/60" />
            <p className="mt-3 text-sm text-muted">Start entering findings to see the estimate.</p>
          </div>
        ) : (
          <>
            <RiskGauge value={a.prediction.complicated_probability} />
            <div className="space-y-1.5">
              {Object.entries(a.prediction.probabilities).map(([c, p], i) => {
                const on = c === a.prediction.predicted_class;
                return (
                  <div
                    key={c}
                    className={clsx(
                      "flex items-center justify-between rounded-lg px-3 py-2 text-sm",
                      on ? [TONE.soft[i], TONE.text[i], "font-semibold"] : "text-ink-2",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className={clsx("size-2 rounded-full", TONE.bg[i])} /> {c}
                    </span>
                    <span className="tnum">{pct(p)}</span>
                  </div>
                );
              })}
            </div>
            <div
              className={clsx(
                "rounded-lg px-3 py-2 text-xs font-medium",
                refer ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent",
              )}
            >
              {refer ? "Uncertain — refer for senior review" : "Confident estimate"}
            </div>
            {imaging && (
              <div className="rounded-lg border border-line px-3 py-2 text-xs text-ink-2">
                <span className="font-medium">With images:</span> {imaging.predicted_class} · complicated{" "}
                {pct(imaging.complicated_probability)}
              </div>
            )}
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-muted">
                <span>Inputs entered</span>
                <span className="tnum">
                  {a.filled}/{a.total_fields}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(a.filled / a.total_fields) * 100}%` }} />
              </div>
            </div>
            <Button variant="secondary" className="w-full" onClick={onResults}>
              View full results <ArrowRight className="size-4" />
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

/* ================================================================== results */
function ResultsView({
  a,
  classes,
  imaging,
  disagreement,
  onImages,
  report,
}: {
  a: Assessment;
  classes: string[];
  imaging: ImagingResult | null;
  disagreement: string[];
  onImages: () => void;
  report: {
    patientId: string;
    setPatientId: (v: string) => void;
    clinician: string;
    setClinician: (v: string) => void;
    note: string;
    setNote: (v: string) => void;
    downloading: boolean;
    downloadReport: () => void;
  };
}) {
  const p = a.prediction;
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Most likely outcome</p>
            <h2 className={clsx("mt-1 text-3xl font-semibold tracking-tight", TONE.text[p.predicted_index])}>{p.predicted_class}</h2>
            <div className="tnum mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-2">
              <span>
                Appendicitis <strong className="text-ink">{pct(p.appendicitis_probability)}</strong>
              </span>
              <span>
                Complicated <strong className="text-ink">{pct(p.complicated_probability)}</strong> ({p.complicated_risk})
              </span>
              <span>
                Inputs <strong className="text-ink">{a.filled}/{a.total_fields}</strong>
              </span>
            </div>
          </div>
          <div className="w-56 justify-self-center">
            <RiskGauge value={p.complicated_probability} />
          </div>
        </div>
        <div className="space-y-2 border-t border-line px-6 py-4">
          <ConfidenceBanner a={a} extraReasons={disagreement} />
          {a.warnings.length > 0 && (
            <ul className="space-y-1 pt-1 text-[13px] text-muted">
              {a.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Outcome probabilities" subtitle="Clinical model (CatBoost, 32 inputs)" icon={<Gauge className="size-4" />} />
          <div className="p-5">
            <OutcomeBars probabilities={p.probabilities} predicted={p.predicted_class} compare={imaging?.probabilities} compareLabel="images" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Why this estimate" subtitle="Main contributing factors" icon={<ListChecks className="size-4" />} />
          <div className="p-5">
            <ExplanationBars a={a} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Tests that could change the estimate" subtitle="Value of information for pending tests" icon={<FlaskConical className="size-4" />} />
          <div className="p-5">
            <NextTests a={a} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Step-by-step trajectory" subtitle="Estimate after each stage of information" icon={<Activity className="size-4" />} />
          <div className="p-5">
            <Trajectory a={a} classes={classes} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Ultrasound images"
          subtitle={imaging ? `${imaging.n_images} image(s) analysed with the fusion model` : "No images analysed"}
          icon={<ImageIcon className="size-4" />}
          action={
            <Button variant="secondary" onClick={onImages}>
              {imaging ? "View heatmaps" : "Add images"}
            </Button>
          }
        />
        {imaging && (
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            {Object.entries(imaging.probabilities).map(([c, v], i) => (
              <div key={c} className={clsx("rounded-xl px-4 py-3", TONE.soft[i])}>
                <div className={clsx("text-xs font-medium", TONE.text[i])}>{c}</div>
                <div className="tnum mt-0.5 text-xl font-semibold text-ink">{pct(v, 1)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Decision-support report" subtitle="Printable PDF for the case notes or handover" icon={<FileText className="size-4" />} />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="text-[13px] font-medium text-ink-2">
            Patient ID
            <input
              value={report.patientId}
              onChange={(e) => report.setPatientId(e.target.value)}
              maxLength={60}
              placeholder="e.g. ED-2026-0142"
              className="mt-1.5 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm font-normal text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="text-[13px] font-medium text-ink-2">
            Clinician
            <input
              value={report.clinician}
              onChange={(e) => report.setClinician(e.target.value)}
              maxLength={80}
              placeholder="Name of the reviewing clinician"
              className="mt-1.5 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm font-normal text-ink outline-none focus:border-accent"
            />
          </label>
          <label className="text-[13px] font-medium text-ink-2 sm:col-span-2">
            Note
            <textarea
              value={report.note}
              onChange={(e) => report.setNote(e.target.value)}
              maxLength={1500}
              rows={3}
              placeholder="Optional clinical note to include in the report"
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-normal text-ink outline-none focus:border-accent"
            />
          </label>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <p className="text-xs text-muted">Patient data is sent only to generate the PDF and is not stored.</p>
            <Button onClick={report.downloadReport} disabled={report.downloading}>
              {report.downloading ? <Spinner /> : <Download className="size-4" />} Download PDF
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
