"use client";

import clsx from "clsx";
import { ImagePlus, Layers, ScanLine, Trash2, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import type { Assessment, ImagingResult, ImagingStatus } from "@/lib/api";
import { pct } from "@/lib/api";
import { OutcomeBars } from "./results";
import { Badge, Button, Spinner, TONE } from "./ui";

export interface UploadItem {
  id: string;
  file: File;
  preview: string;
}

export function ImagingStep({
  status,
  maxImages,
  items,
  setItems,
  result,
  busy,
  error,
  stale,
  onAnalyze,
  clinical,
}: {
  status: ImagingStatus;
  maxImages: number;
  items: UploadItem[];
  setItems: (fn: (prev: UploadItem[]) => UploadItem[]) => void;
  result: ImagingResult | null;
  busy: boolean;
  error: string | null;
  stale: boolean;
  onAnalyze: () => void;
  clinical: Assessment | null;
}) {
  const [view, setView] = useState<"gradcam" | "original">("gradcam");
  const onDrop = useCallback(
    (accepted: File[]) =>
      setItems((prev) =>
        [
          ...prev,
          ...accepted.map((file) => ({ id: `${file.name}-${file.size}-${Math.random()}`, file, preview: URL.createObjectURL(file) })),
        ].slice(0, maxImages),
      ),
    [maxImages, setItems],
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/png": [], "image/jpeg": [], "image/bmp": [], "image/webp": [] },
    maxFiles: maxImages,
    disabled: items.length >= maxImages,
  });

  return (
    <div className="space-y-5">
      {!status.available && (
        <div className="rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn">
          <div className="font-semibold">Imaging model not installed on this deployment</div>
          <p className="mt-1 text-[13px]">
            The clinical assessment works fully. To enable ultrasound analysis, run{" "}
            <code className="rounded bg-surface/60 px-1">research/export_imaging_for_app.py</code> in the Kaggle notebook and add
            its three files to <code className="rounded bg-surface/60 px-1">api/_appendix/model/imaging/</code>.
          </p>
        </div>
      )}

      <div
        {...getRootProps()}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
          isDragActive ? "border-accent bg-accent-soft" : "border-line bg-surface-2/50 hover:border-accent/60",
          items.length >= maxImages && "cursor-not-allowed opacity-60",
        )}
      >
        <input {...getInputProps()} />
        <div className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
          <ImagePlus className="size-5" />
        </div>
        <p className="mt-3 text-sm font-medium text-ink">
          {isDragActive ? "Drop the images here" : "Drag ultrasound images here, or click to choose"}
        </p>
        <p className="mt-1 text-xs text-muted">
          PNG or JPEG · up to {maxImages} views per patient · images are processed for this request only and not stored
        </p>
      </div>

      {items.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-ink-2">
              {items.length} image{items.length > 1 ? "s" : ""} selected
            </span>
            <button
              type="button"
              onClick={() => setItems(() => [])}
              className="flex items-center gap-1 text-xs font-medium text-muted hover:text-c2"
            >
              <Trash2 className="size-3.5" /> Remove all
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {items.map((it) => (
              <div key={it.id} className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.preview} alt={it.file.name} className="size-full object-contain" />
                <button
                  type="button"
                  aria-label={`Remove ${it.file.name}`}
                  onClick={() => setItems((prev) => prev.filter((p) => p.id !== it.id))}
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={onAnalyze} disabled={!status.available || busy || !items.length}>
              {busy ? <Spinner /> : <ScanLine className="size-4" />}
              {busy ? "Analysing images…" : result && !stale ? "Re-analyse" : "Analyse with images"}
            </Button>
            {stale && result && <Badge tone="warn">Inputs changed since the last analysis</Badge>}
          </div>
        </div>
      )}

      {error && <div className="rounded-xl border border-c2/30 bg-c2-soft px-4 py-3 text-sm text-c2">{error}</div>}

      {result && (
        <div className="space-y-5 rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-accent" />
              <h4 className="text-[15px] font-semibold text-ink">Clinical + ultrasound fusion</h4>
            </div>
            {clinical && (
              <Badge tone={clinical.prediction.predicted_class === result.predicted_class ? "accent" : "warn"}>
                {clinical.prediction.predicted_class === result.predicted_class
                  ? "Agrees with the clinical model"
                  : "Disagrees with the clinical model"}
              </Badge>
            )}
          </div>
          <OutcomeBars
            probabilities={result.probabilities}
            predicted={result.predicted_class}
            compare={clinical?.prediction.probabilities}
            compareLabel="clinical"
          />
          {result.domain_warning && (
            <div className="rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn">{result.domain_warning}</div>
          )}
          {result.without_images && (
            <p className="text-[13px] text-muted">
              Effect of the images on complicated risk:{" "}
              <strong className="text-ink-2">
                {result.complicated_probability - result.without_images["Complicated"] >= 0 ? "+" : ""}
                {pct(result.complicated_probability - result.without_images["Complicated"], 1)}
              </strong>{" "}
              (compared with the same patient using average training-set images).
            </p>
          )}

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h5 className="text-sm font-semibold text-ink">Where the model looked (Grad-CAM)</h5>
              <div className="flex rounded-lg border border-line bg-surface-2 p-0.5 text-xs">
                {(["gradcam", "original"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={clsx("rounded-md px-2.5 py-1 font-medium", view === v ? "bg-surface text-ink shadow-sm" : "text-muted")}
                  >
                    {v === "gradcam" ? "Heatmap" : "Original"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {result.images.map((img) => (
                <figure key={img.name} className="overflow-hidden rounded-xl border border-line bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={view === "gradcam" ? img.gradcam : img.original} alt={img.name} className="aspect-square w-full object-contain" />
                  <figcaption className="space-y-0.5 bg-surface px-2.5 py-2 text-[11px]">
                    <div className="truncate font-medium text-ink-2">{img.name}</div>
                    {img.unfamiliar && <div className="text-warn">Unlike the training scans</div>}
                    {img.peak_activation === 0 ? (
                      <div className="text-muted">No evidence towards {result.explained_class}</div>
                    ) : (
                      img.influence != null && (
                        <div className={clsx(img.influence >= 0 ? TONE.text[result.predicted_index] : "text-muted")}>
                          {img.influence >= 0 ? "+" : ""}
                          {pct(img.influence, 1)} towards {result.explained_class}
                        </div>
                      )
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted">
              Heatmaps show model attention for “{result.explained_class}”. They are explanations of the model, not anatomical or
              pathological localisation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
