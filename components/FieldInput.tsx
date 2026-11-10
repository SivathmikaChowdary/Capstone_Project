"use client";

import clsx from "clsx";
import { Info } from "lucide-react";
import type { FieldDef, Value } from "@/lib/api";

const ORDER: Record<string, string[]> = {
  yesno: ["yes", "no"],
  urine: ["no", "+", "++", "+++"],
  Peritonitis: ["no", "local", "generalized"],
  Sex: ["female", "male"],
};

function orderedOptions(name: string, def: FieldDef) {
  const opts = def.options ?? [];
  const values = opts.map((o) => o.value);
  const key = ORDER[name]
    ? name
    : values.length === 2 && values.includes("yes") && values.includes("no")
      ? "yesno"
      : values.includes("+++")
        ? "urine"
        : null;
  if (!key) return opts;
  const order = ORDER[key];
  return [...opts].sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value));
}

export function FieldInput({
  name,
  def,
  value,
  onChange,
  computed,
}: {
  name: string;
  def: FieldDef;
  value: Value;
  onChange: (v: Value) => void;
  computed?: number | null;
}) {
  const id = `f-${name}`;
  const label = (
    <div className="mb-1.5 flex items-center gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {def.label}
      </label>
      {def.help && (
        <span className="group relative">
          <Info className="size-3.5 text-muted" aria-hidden />
          <span className="pointer-events-none absolute bottom-5 left-1/2 z-20 hidden w-52 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] leading-snug text-bg shadow-lg group-hover:block">
            {def.help}
          </span>
        </span>
      )}
    </div>
  );

  if (def.type === "number") {
    const v = typeof value === "number" ? value : null;
    const shown = computed != null && v == null ? computed : v;
    const ref = def.reference;
    const outOfRef = shown != null && ref && (shown < ref[0] || shown > ref[1]);
    const outOfTrain = shown != null && def.min != null && def.max != null && (shown < def.min || shown > def.max);
    return (
      <div>
        {label}
        <div
          className={clsx(
            "flex h-10 items-center rounded-xl border bg-surface transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20",
            outOfTrain ? "border-c2" : outOfRef ? "border-warn-line" : "border-line",
          )}
        >
          <input
            id={id}
            type="number"
            inputMode="decimal"
            step="any"
            value={v ?? ""}
            placeholder={computed != null ? computed.toFixed(1) : "—"}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            className="tnum h-full w-full min-w-0 rounded-xl bg-transparent px-3 text-sm text-ink outline-none placeholder:text-muted/70"
          />
          {def.unit && <span className="shrink-0 pr-3 text-xs text-muted">{def.unit}</span>}
        </div>
        <div className="mt-1 min-h-4 text-[11px]">
          {outOfTrain ? (
            <span className="text-c2">Outside the training range ({def.min}–{def.max})</span>
          ) : outOfRef ? (
            <span className="text-warn">{shown! > ref![1] ? "Above" : "Below"} typical range {ref![0]}–{ref![1]}</span>
          ) : computed != null && v == null ? (
            <span className="text-muted">Calculated from height and weight</span>
          ) : ref ? (
            <span className="text-muted">Typical {ref[0]}–{ref[1]}</span>
          ) : null}
        </div>
      </div>
    );
  }

  const opts = orderedOptions(name, def);
  const segmented = opts.length <= 4 && opts.every((o) => o.label.length <= 12);
  return (
    <div>
      {label}
      {segmented ? (
        <div role="radiogroup" aria-label={def.label} id={id} className="flex h-10 rounded-xl border border-line bg-surface-2 p-1">
          {opts.map((o) => {
            const on = value === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(on ? null : o.value)}
                className={clsx(
                  "flex-1 rounded-lg text-[13px] font-medium transition",
                  on ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink-2",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      ) : (
        <select
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        >
          <option value="">Not recorded</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <div className="mt-1 min-h-4 text-[11px] text-muted">{segmented && value == null ? "Not recorded" : ""}</div>
    </div>
  );
}
