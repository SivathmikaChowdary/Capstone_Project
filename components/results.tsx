"use client";

import clsx from "clsx";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, FlaskConical, ShieldAlert } from "lucide-react";
import type { Assessment } from "@/lib/api";
import { pct } from "@/lib/api";
import { Badge, TONE } from "./ui";

/* ------------------------------------------------------------------ risk gauge */
function polar(cx: number, cy: number, r: number, p: number) {
  const t = Math.PI * (1 - p);
  return [cx + r * Math.cos(t), cy - r * Math.sin(t)] as const;
}
function arc(cx: number, cy: number, r: number, a: number, b: number) {
  const [x1, y1] = polar(cx, cy, r, a);
  const [x2, y2] = polar(cx, cy, r, b);
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
}

export function RiskGauge({ value, label = "Complicated risk" }: { value: number; label?: string }) {
  const tier = value >= 0.5 ? 2 : value >= 0.2 ? 1 : 0;
  const tierName = ["Low", "Moderate", "High"][tier];
  const [nx, ny] = polar(100, 100, 62, Math.min(Math.max(value, 0), 1));
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 118" className="w-full max-w-[240px]" role="img" aria-label={`${label} ${pct(value)}, ${tierName}`}>
        <path d={arc(100, 100, 78, 0.003, 0.197)} stroke="var(--c0)" strokeWidth="14" fill="none" strokeLinecap="round" opacity={tier === 0 ? 1 : 0.28} />
        <path d={arc(100, 100, 78, 0.203, 0.497)} stroke="var(--c1)" strokeWidth="14" fill="none" strokeLinecap="round" opacity={tier === 1 ? 1 : 0.28} />
        <path d={arc(100, 100, 78, 0.503, 0.997)} stroke="var(--c2)" strokeWidth="14" fill="none" strokeLinecap="round" opacity={tier === 2 ? 1 : 0.28} />
        <line x1="100" y1="100" x2={nx} y2={ny} stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="100" cy="100" r="6" fill="var(--ink)" />
        <text x="22" y="116" fontSize="9" fill="var(--muted)" textAnchor="middle">0%</text>
        <text x="178" y="116" fontSize="9" fill="var(--muted)" textAnchor="middle">100%</text>
      </svg>
      <div className="-mt-1 text-center">
        <div className={clsx("tnum text-3xl font-semibold tracking-tight", TONE.text[tier])}>{pct(value)}</div>
        <div className="text-xs font-medium text-muted">
          {label} · <span className={TONE.text[tier]}>{tierName}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ outcome probabilities */
export function OutcomeBars({
  probabilities,
  predicted,
  compare,
  compareLabel,
}: {
  probabilities: Record<string, number>;
  predicted: string;
  compare?: Record<string, number> | null;
  compareLabel?: string;
}) {
  return (
    <div className="space-y-3">
      {Object.entries(probabilities).map(([name, p], i) => {
        const on = name === predicted;
        return (
          <div key={name}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className={clsx("font-medium", on ? TONE.text[i] : "text-ink-2")}>
                {name}
                {on && <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide">most likely</span>}
              </span>
              <span className="tnum font-semibold text-ink">{pct(p, 1)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className={clsx("h-full rounded-full transition-[width] duration-500", TONE.bg[i], !on && "opacity-50")} style={{ width: `${p * 100}%` }} />
            </div>
            {compare && (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-muted/60" style={{ width: `${compare[name] * 100}%` }} />
                </div>
                <span className="tnum w-24 text-right">{compareLabel} {pct(compare[name], 1)}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ confidence */
export function ConfidenceBanner({ a, extraReasons = [] }: { a: Assessment; extraReasons?: string[] }) {
  const reasons = [...a.confidence.reasons, ...extraReasons];
  const refer = reasons.length > 0;
  return (
    <div className="space-y-2">
      {refer ? (
        <div className="rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" /> Uncertain — refer for senior review
          </div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-[13px]">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-accent-soft px-4 py-3 text-sm font-medium text-accent">
          <CheckCircle2 className="size-4" /> Confident estimate — inputs are sufficient and one outcome is clearly favoured
        </div>
      )}
      {a.confidence.safety_message && (
        <div className="flex items-start gap-2 rounded-xl border border-c2/30 bg-c2-soft px-4 py-3 text-sm font-medium text-c2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {a.confidence.safety_message}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ explanation */
export function ExplanationBars({ a }: { a: Assessment }) {
  const items = a.explanation;
  const maxAbs = Math.max(...items.map((e) => Math.abs(e.effect)), 1e-6);
  return (
    <div>
      <p className="mb-3 text-[13px] text-muted">
        Factors pushing the estimate towards or away from <strong className="text-ink-2">{a.prediction.predicted_class}</strong>{" "}
        (exact SHAP values of the clinical model).
      </p>
      <div className="space-y-2">
        {items.map((e) => {
          const up = e.effect > 0;
          const w = (Math.abs(e.effect) / maxAbs) * 100;
          return (
            <div key={e.field} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-3 text-sm sm:grid-cols-[minmax(0,1fr)_88px_minmax(0,1.2fr)]">
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{e.feature}</div>
                <div className="truncate text-xs text-muted sm:hidden">{e.value}</div>
              </div>
              <div className="tnum hidden truncate text-right text-xs text-muted sm:block">{e.value}</div>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className={clsx("h-full rounded-full", up ? "bg-c2" : "bg-accent")} style={{ width: `${Math.max(w, 3)}%` }} />
                </div>
                <span className={clsx("flex w-14 items-center justify-end gap-0.5 text-xs font-semibold", up ? "text-c2" : "text-accent")}>
                  {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                  {Math.abs(e.effect).toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-c2" /> towards {a.prediction.predicted_class}</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" /> away from it</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ value of information */
export function NextTests({ a }: { a: Assessment }) {
  if (!a.next_tests.length)
    return <p className="text-sm text-muted">No pending test is expected to change the estimate noticeably.</p>;
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">
        For tests not yet entered, the model tried plausible results to see how far complicated risk could move.
      </p>
      {a.next_tests.map((t) => {
        const [lo, hi] = t.complicated_range;
        return (
          <div key={t.field} className="rounded-xl border border-line px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <FlaskConical className="size-4 text-accent" /> {t.test}
              </div>
              {t.could_change_outcome ? <Badge tone="warn">May change the outcome</Badge> : <Badge>Refines risk</Badge>}
            </div>
            <div className="relative mt-3 h-2 rounded-full bg-surface-2">
              <div className="absolute inset-y-0 rounded-full bg-c2/70" style={{ left: `${lo * 100}%`, width: `${Math.max((hi - lo) * 100, 1.2)}%` }} />
            </div>
            <div className="tnum mt-1.5 text-xs text-muted">
              Complicated risk could range <strong className="text-ink-2">{pct(lo)} – {pct(hi)}</strong> · appendicitis{" "}
              {pct(t.appendicitis_range[0])} – {pct(t.appendicitis_range[1])}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ stage trajectory */
export function Trajectory({ a, classes }: { a: Assessment; classes: string[] }) {
  if (!a.trajectory.length) return <p className="text-sm text-muted">Enter symptoms and examination findings to see the trajectory.</p>;
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">How the estimate changed as each step of information was added.</p>
      {a.trajectory.map((s) => (
        <div key={s.stage}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-ink-2">+ {s.title}</span>
            <span className="text-muted">
              {s.inputs} inputs{!s.reliable && <span className="ml-1 text-warn">· early estimate</span>}
            </span>
          </div>
          <div className="flex h-6 overflow-hidden rounded-lg">
            {classes.map((c, i) => {
              const p = s.probabilities[c];
              return (
                <div
                  key={c}
                  className={clsx("tnum flex items-center justify-center text-[11px] font-semibold text-white", TONE.bg[i])}
                  style={{ width: `${p * 100}%` }}
                  title={`${c}: ${pct(p, 1)}`}
                >
                  {p >= 0.12 ? pct(p) : ""}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted">
        {classes.map((c, i) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className={clsx("size-2 rounded-full", TONE.bg[i])} /> {c}
          </span>
        ))}
      </div>
    </div>
  );
}
