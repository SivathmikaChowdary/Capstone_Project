import { ArrowRight, BrainCircuit, FileText, FlaskConical, Layers, ScanLine, ShieldCheck, Stethoscope, Waves } from "lucide-react";
import Link from "next/link";

const FEATURES = [
  {
    icon: Layers,
    title: "Three-level severity triage",
    text: "Estimates no appendicitis, uncomplicated or complicated appendicitis, with calibrated probabilities instead of a yes/no label.",
  },
  {
    icon: ShieldCheck,
    title: "Knows when it is unsure",
    text: "Flags low-confidence cases for senior review and raises a safety net when complicated disease cannot be ruled out.",
  },
  {
    icon: BrainCircuit,
    title: "Explains every estimate",
    text: "Exact SHAP contributions for clinical findings and Grad-CAM heatmaps for ultrasound images.",
  },
  {
    icon: FlaskConical,
    title: "Suggests the next useful test",
    text: "Shows which pending test, such as CRP or an ultrasound, could actually change the decision.",
  },
  {
    icon: ScanLine,
    title: "Clinical + ultrasound fusion",
    text: "Combines routine findings with ultrasound views through a ResNet18-based fusion model.",
  },
  {
    icon: FileText,
    title: "One-click PDF report",
    text: "A printable summary for case notes and handover, with space for the reviewing clinician.",
  },
];

const FLOW = [
  { icon: Stethoscope, title: "Symptoms & exam", text: "History and bedside signs" },
  { icon: FlaskConical, title: "Laboratory", text: "WBC, CRP, neutrophils, urine" },
  { icon: Waves, title: "Ultrasound", text: "Structured report and images" },
  { icon: ShieldCheck, title: "Decision support", text: "Risk, confidence, next test" },
];

export default function Home() {
  return (
    <div>
      {/* hero */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-ink-2">
              <span className="size-1.5 rounded-full bg-accent" /> Explainable · uncertainty-aware · multimodal
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">
              Decision support for children with suspected appendicitis
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
              AppendixAi follows the emergency-department pathway step by step and estimates whether a child has
              appendicitis and how severe it is — with the reasons, the uncertainty, and the test most worth doing next.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/assess"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-ink transition hover:brightness-110"
              >
                Start an assessment <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/evidence"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold text-ink transition hover:bg-surface-2"
              >
                See the evidence
              </Link>
            </div>
            <p className="mt-6 text-xs text-muted">Research prototype · not a medical device · supports clinical judgement, never replaces it</p>
          </div>

          {/* preview card */}
          <div className="rounded-3xl border border-line bg-bg p-4 shadow-card">
            <div className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-muted">Most likely outcome</div>
                  <div className="text-xl font-semibold text-c1">Uncomplicated appendicitis</div>
                </div>
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">Confident</span>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ["No appendicitis", 4, "bg-c0"],
                  ["Uncomplicated", 82, "bg-c1"],
                  ["Complicated", 14, "bg-c2"],
                ].map(([n, v, c]) => (
                  <div key={n as string}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-ink-2">{n}</span>
                      <span className="tnum font-semibold">{v}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-2">
                      <div className={`h-full rounded-full ${c}`} style={{ width: `${v}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-xl border border-line px-3.5 py-3 text-sm">
                <div className="font-medium text-ink">Next most useful test</div>
                <div className="mt-0.5 text-muted">Ultrasound free fluid could move complicated risk 7% – 31%</div>
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-muted">Illustrative example</p>
          </div>
        </div>
      </section>

      {/* flow */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Built around the clinical pathway</h2>
        <p className="mt-2 max-w-2xl text-ink-2">
          Information is entered in the order it becomes available, and the estimate updates after each step — so you
          can see what each test adds.
        </p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((f, i) => (
            <li key={f.title} className="relative rounded-2xl border border-line bg-surface p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
                  <f.icon className="size-4" />
                </span>
                <span className="text-xs font-semibold text-muted">Step {i + 1}</span>
              </div>
              <div className="mt-4 font-semibold text-ink">{f.title}</div>
              <div className="mt-1 text-sm text-muted">{f.text}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* features */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">What it gives the clinician</h2>
          <div className="mt-8 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <f.icon className="size-5 text-accent" />
                <h3 className="mt-3 font-semibold text-ink">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* numbers */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Evaluated on held-out patients</h2>
            <p className="mt-2 text-ink-2">
              Trained on the Regensburg Pediatric Appendicitis Dataset (780 children, 1,709 ultrasound images). Test
              patients were locked away before training and model selection.
            </p>
            <Link href="/evidence" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent">
              Full results and limitations <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["0.94", "ROC-AUC (macro)"],
              ["95.7%", "Appendicitis sensitivity"],
              ["90.5%", "Appendicitis specificity"],
              ["85.9%", "Accuracy, 3 classes"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-2xl border border-line bg-surface p-4">
                <div className="tnum text-2xl font-semibold tracking-tight text-ink">{v}</div>
                <div className="mt-1 text-xs text-muted">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
