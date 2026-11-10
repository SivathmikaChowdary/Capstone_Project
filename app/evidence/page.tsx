"use client";

import clsx from "clsx";
import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, Spinner, Stat } from "@/components/ui";
import { api, type Evidence, pct } from "@/lib/api";

const MODALITY_TONE: Record<string, string> = {
  Clinical: "bg-accent-soft text-accent",
  Ultrasound: "bg-c1-soft text-c1",
  Multimodal: "bg-c2-soft text-c2",
};

export default function EvidencePage() {
  const [ev, setEv] = useState<Evidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Evidence["figures"][number] | null>(null);

  useEffect(() => {
    api.evidence().then(setEv).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="py-24 text-center text-sm text-muted">{error}</p>;
  if (!ev)
    return (
      <div className="flex items-center justify-center gap-2 py-32 text-sm text-muted">
        <Spinner /> Loading results…
      </div>
    );

  const m = ev.clinical_metrics;
  const chart = ev.experiments.map((e) => ({
    name: e.model.replace(" (deployed)", "*").replace(" (clinical + ultrasound)", ""),
    Accuracy: +(e.accuracy * 100).toFixed(1),
    "Macro F1": +(e.macro_f1 * 100).toFixed(1),
    "Complicated recall": +(e.complicated_recall * 100).toFixed(1),
  }));
  const cm = ev.fusion_confusion_matrix;
  const cmMax = Math.max(...cm.flat());
  const labels = ["No appendicitis", "Uncomplicated", "Complicated"];

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Evidence</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">Model performance</h1>
        <p className="mt-2 max-w-3xl text-ink-2">
          Results on patients held out before training and model selection, from the {ev.dataset.name} (
          {ev.dataset.patients} children, {ev.dataset.ultrasound_images.toLocaleString()} ultrasound images).
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink-2">Deployed clinical model · 156 locked test patients</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Accuracy (3 classes)" value={pct(m["Accuracy"], 1)} hint={`95% CI ${pct(ev.clinical_accuracy_ci[0], 0)}–${pct(ev.clinical_accuracy_ci[1], 0)}`} />
          <Stat label="Macro ROC-AUC" value={m["Macro ROC-AUC (OvR)"].toFixed(2)} />
          <Stat label="Macro F1" value={pct(m["Macro F1"], 1)} />
          <Stat label="Appendicitis sensitivity" value={pct(m["Appendicitis sensitivity"], 1)} hint={`specificity ${pct(m["Appendicitis specificity"], 1)}`} />
          <Stat label="Complicated sensitivity" value={pct(m["Complicated sensitivity"], 1)} hint={`specificity ${pct(m["Complicated specificity"], 1)}`} />
          <Stat label="Balanced accuracy" value={pct(m["Balanced accuracy"], 1)} />
        </div>
      </section>

      <Card>
        <CardHeader title="All experiments" subtitle="Clinical, ultrasound-only and multimodal models" />
        <div className="p-5">
          <div className="h-80 w-full">
            <ResponsiveContainer>
              <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 56, left: -12 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--line)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} angle={-28} textAnchor="end" interval={0} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} unit="%" />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }}
                  formatter={(v) => `${v}%`}
                />
                <Legend verticalAlign="top" height={32} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Accuracy" fill="var(--accent)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Macro F1" fill="var(--c1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Complicated recall" fill="var(--c2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Model</th>
                  <th className="py-2 pr-3 font-medium">Modality</th>
                  <th className="py-2 pr-3 font-medium">Test protocol</th>
                  <th className="py-2 pr-3 text-right font-medium">Accuracy</th>
                  <th className="py-2 pr-3 text-right font-medium">Macro F1</th>
                  <th className="py-2 text-right font-medium">Complicated recall</th>
                </tr>
              </thead>
              <tbody className="tnum">
                {ev.experiments.map((e) => (
                  <tr key={e.model} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-ink">{e.model}</td>
                    <td className="py-2.5 pr-3">
                      <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", MODALITY_TONE[e.modality])}>{e.modality}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-muted">{e.protocol}</td>
                    <td className="py-2.5 pr-3 text-right">{pct(e.accuracy, 1)}</td>
                    <td className="py-2.5 pr-3 text-right">{pct(e.macro_f1, 1)}</td>
                    <td className="py-2.5 text-right">{pct(e.complicated_recall, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-[13px] text-warn">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {ev.note}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Fusion model — confusion matrix" subtitle={`${ev.dataset.paired_cohort}-patient paired cohort · 99 locked test patients`} />
          <div className="p-5">
            <div className="grid grid-cols-[auto_repeat(3,minmax(0,1fr))] gap-1.5 text-xs">
              <div />
              {labels.map((l) => (
                <div key={l} className="pb-1 text-center font-medium text-muted">
                  Pred. {l}
                </div>
              ))}
              {cm.map((row, i) => (
                <div key={i} className="contents">
                  <div className="flex items-center pr-2 font-medium text-muted">{labels[i]}</div>
                  {row.map((v, j) => (
                    <div
                      key={j}
                      className="tnum grid h-16 place-items-center rounded-lg text-base font-semibold"
                      style={{
                        background: `color-mix(in srgb, var(${i === j ? "--accent" : "--c2"}) ${Math.round((v / cmMax) * 70) + 6}%, var(--surface))`,
                        color: v / cmMax > 0.55 ? "white" : "var(--ink)",
                      }}
                    >
                      {v}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">Rows are the true outcome. Diagonal cells are correct predictions.</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Dataset" subtitle={ev.dataset.name} />
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Children" value={ev.dataset.patients} />
              <Stat label="With ultrasound" value={ev.dataset.ultrasound_patients} />
              <Stat label="Images" value={ev.dataset.ultrasound_images.toLocaleString()} />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted">Outcome distribution</div>
              <div className="flex h-7 overflow-hidden rounded-lg text-[11px] font-semibold text-white">
                {Object.entries(ev.dataset.classes).map(([k, v], i) => (
                  <div
                    key={k}
                    className={clsx("tnum flex items-center justify-center", ["bg-c0", "bg-c1", "bg-c2"][i])}
                    style={{ width: `${(v / ev.dataset.patients) * 100}%` }}
                  >
                    {v}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
                {Object.keys(ev.dataset.classes).map((k, i) => (
                  <span key={k} className="flex items-center gap-1.5">
                    <span className={clsx("size-2 rounded-full", ["bg-c0", "bg-c1", "bg-c2"][i])} />
                    {k}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-[13px] text-muted">
              Children admitted with abdominal pain to a single paediatric centre in Regensburg, Germany. “Complicated”
              includes perforation, abscess and similar findings.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Evaluation figures" subtitle="Clinical model — click a figure to enlarge" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {ev.figures.map((f) => (
            <button
              key={f.file}
              type="button"
              onClick={() => setZoom(f)}
              className="group overflow-hidden rounded-xl border border-line bg-white text-left transition hover:border-accent"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/figures/${f.file}`} alt={f.title} className="aspect-[4/3] w-full object-contain p-2" />
              <div className="border-t border-line bg-surface px-3 py-2.5">
                <div className="text-sm font-medium text-ink">{f.title}</div>
                <div className="mt-0.5 text-xs text-muted">{f.caption}</div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Limitations" subtitle="Read before interpreting any result" icon={<AlertTriangle className="size-4" />} />
        <ul className="space-y-2 p-5 text-sm text-ink-2">
          {ev.limitations.map((l) => (
            <li key={l} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted" />
              {l}
            </li>
          ))}
        </ul>
      </Card>

      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setZoom(null)} role="dialog" aria-modal>
          <div className="relative max-h-full max-w-5xl overflow-auto rounded-2xl bg-white p-3" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Close" onClick={() => setZoom(null)} className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-black/60 text-white">
              <X className="size-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/figures/${zoom.file}`} alt={zoom.title} className="max-h-[80vh] w-auto" />
            <p className="px-2 pt-2 text-sm text-slate-600">{zoom.caption}</p>
          </div>
        </div>
      )}
    </div>
  );
}
