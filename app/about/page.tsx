import type { Metadata } from "next";

export const metadata: Metadata = { title: "About" };

const PIPELINE = [
  { title: "Clinical branch", items: ["32 routine variables", "Median imputation + missingness flags", "One-hot encoding", "CatBoost (3 classes)", "Exact TreeSHAP"] },
  { title: "Ultrasound branch", items: ["Letterbox to 224 × 224", "ResNet18 (ImageNet)", "512-D features per view", "Mean + max pooling per patient", "Grad-CAM per view"] },
  { title: "Decision layer", items: ["Fusion MLP (clinical + 1024-D)", "Confidence check → refer", "Complicated safety net", "Value-of-information tests", "Stage-wise trajectory"] },
];

const STACK = [
  ["Frontend", "Next.js 15, React 19, TypeScript, Tailwind CSS 4, Recharts"],
  ["Backend", "FastAPI on Vercel Python functions, Pydantic validation"],
  ["Inference", "NumPy (clinical model, fusion MLP, Grad-CAM), ONNX Runtime (ResNet18)"],
  ["Training", "scikit-learn, CatBoost, XGBoost, LightGBM, PyTorch (Kaggle GPU)"],
  ["Explainability", "TreeSHAP (exact, path-dependent), Grad-CAM (exact analytic gradients)"],
  ["Reporting", "ReportLab PDF"],
];

const TEAM = [
  "Tarigopula Sivathmika Chowdary",
  "Kolla Hari Chandana",
  "Musaib Hamid",
  "Nalluri Aruna Sree",
];

export default function About() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">About</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">AppendixAi</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">
          Explainable, uncertainty-aware decision support for pediatric appendicitis severity, combining routine clinical
          data with ultrasound. Built as a capstone research project to study when each source of information actually
          helps the decision.
        </p>
      </div>

      <section>
        <h2 className="text-xl font-semibold tracking-tight text-ink">Method</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {PIPELINE.map((p, i) => (
            <div key={p.title} className="rounded-2xl border border-line bg-surface p-5">
              <div className="text-xs font-semibold text-muted">0{i + 1}</div>
              <div className="mt-1 font-semibold text-ink">{p.title}</div>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
                {p.items.map((it) => (
                  <li key={it} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-accent" />
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-2">
          Target: three classes — no appendicitis, uncomplicated and complicated appendicitis. Variables recorded after
          diagnosis (management, length of stay, perforation, presumptive diagnosis) and clinical scores derived from the
          inputs were removed to avoid leakage. Test patients were split off before any training or model selection.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold tracking-tight text-ink">Technology</h2>
        <dl className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
          {STACK.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[160px_1fr]">
              <dt className="text-sm font-medium text-ink">{k}</dt>
              <dd className="text-sm text-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-ink">Team</h2>
          <ul className="mt-4 space-y-2">
            {TEAM.map((t) => (
              <li key={t} className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink">
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-ink-2">
            Guide: <strong className="text-ink">Dr. Priyanka Singh</strong>, School of Computer Science and Engineering
            (SCOPE), VIT-AP University.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-ink">Data</h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-2">
            Regensburg Pediatric Appendicitis Dataset (Marcinkevičs et al.): 780 children admitted with abdominal pain to
            a single paediatric hospital in Regensburg, Germany, with clinical, laboratory and ultrasound data and 1,709
            ultrasound images. The full dataset is not redistributed with this app; only nine anonymised test patients
            are included as samples.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-warn-line bg-warn-soft p-6 text-warn">
        <h2 className="text-lg font-semibold">Responsible use</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
          <li>Research prototype — not a medical device and not approved for clinical use.</li>
          <li>Trained on single-centre retrospective data; performance elsewhere is unknown until externally validated.</li>
          <li>Outputs support, and never replace, the judgement of a qualified clinician.</li>
          <li>Patient data and images are processed only to answer each request and are not stored.</li>
        </ul>
      </section>
    </div>
  );
}
