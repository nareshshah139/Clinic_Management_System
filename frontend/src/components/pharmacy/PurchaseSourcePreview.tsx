"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ScanLine, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { getErrorMessage } from "@/lib/utils";
import {
  sourceRegion,
  sourceValueChanged,
  type PurchaseSourceMap,
  type SourceTarget,
} from "@/lib/purchase-invoice-source";

export const PurchaseSourceContext = createContext<{
  enabled: boolean;
  fieldIds?: string[];
  selectedId?: string;
  select: (id: string) => void;
}>({ enabled: false, select: () => {} });
export function SourceFieldLink({ id, label }: { id: string; label: string }) {
  const context = useContext(PurchaseSourceContext);
  return context.enabled &&
    (!context.fieldIds || context.fieldIds.includes(id)) ? (
    <a
      href="#purchase-source-preview"
      role="button"
      onClick={(event) => {
        event.preventDefault();
        context.select(id);
      }}
      onKeyDown={(event) => {
        if (event.key === " ") {
          event.preventDefault();
          context.select(id);
        }
      }}
      aria-pressed={context.selectedId === id}
      aria-label={`Show source for ${label}`}
      title="Show on original invoice"
      className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-primary hover:bg-muted focus-visible:outline-2"
    >
      <ScanLine className="h-4 w-4" />
    </a>
  ) : null;
}

type Document = { id: string; fileName: string; mimeType: string };
/**
 * @cc [owner:nareshshah139,label:product;target] purchase-source-links-honest
 * A source link MUST navigate to the matching retained page and estimated region; missing or
 * ambiguous geometry MUST say that no reliable location is available, and MUST NOT replace
 * invoice values.
 * Acceptance: INV-12. Validation and open gaps:
 * docs/qa/inventory-workflow-contract-review.md. This is a target obligation, not a pass claim.
 */
export function PurchaseSourcePreview({
  document: doc,
  targets,
  selectedId,
  onSelect,
  canLocate,
}: {
  document: Document;
  targets: SourceTarget[];
  selectedId: string;
  onSelect: (id: string) => void;
  canLocate: boolean;
}) {
  const [map, setMap] = useState<PurchaseSourceMap | null>(null);
  const [pageCount, setPageCount] = useState(1),
    [locateFailed, setLocateFailed] = useState(false);
  const [loading, setLoading] = useState(true),
    [locating, setLocating] = useState(false),
    [error, setError] = useState("");
  const [page, setPage] = useState(1),
    [rotation, setRotation] = useState(0),
    [zoom, setZoom] = useState(1),
    [showAll, setShowAll] = useState(false);
  const [imageUrl, setImageUrl] = useState(""),
    [imageError, setImageError] = useState(""),
    [dimensions, setDimensions] = useState({ width: 1000, height: 1400 });
  const [retry, setRetry] = useState(0);
  const mounted = useRef(true),
    job = useRef(false),
    viewport = useRef<HTMLDivElement>(null),
    selectedBox = useRef<SVGRectElement>(null);
  const selected = targets.find((target) => target.id === selectedId),
    region = sourceRegion(map, selected, doc.id);
  const pageInfo = map?.pages.find((item) => item.page === page);
  const width = pageInfo?.width || dimensions.width,
    height = pageInfo?.height || dimensions.height;
  const rotated = rotation === 90 || rotation === 270,
    viewWidth = rotated ? height : width,
    viewHeight = rotated ? width : height;
  const transform =
    rotation === 90
      ? `translate(${height} 0) rotate(90)`
      : rotation === 180
        ? `translate(${width} ${height}) rotate(180)`
        : rotation === 270
          ? `translate(0 ${width}) rotate(270)`
          : undefined;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiClient
      .get<{ sourceMap: PurchaseSourceMap | null; pageCount?: number }>(
        `/pharmacy/purchase-invoices/documents/${doc.id}/source-map`,
      )
      .then((result) => {
        if (active) {
          setMap(result?.sourceMap?.version === 1 ? result.sourceMap : null);
          setPageCount(
            Math.min(
              50,
              Math.max(
                1,
                result?.pageCount || result?.sourceMap?.pages.length || 1,
              ),
            ),
          );
        }
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [doc.id, retry]);
  useEffect(() => {
    if (region) setPage(region.box[0]);
  }, [region?.box[0], selectedId]);
  useEffect(() => {
    setRotation(pageInfo?.rotation || 0);
    setZoom(1);
  }, [page, pageInfo?.rotation]);
  useEffect(() => {
    let active = true,
      url = "";
    const controller = new AbortController();
    setImageUrl("");
    setImageError("");
    fetch(`/api/pharmacy/purchase-invoices/documents/${doc.id}/pages/${page}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Could not load this invoice page. Retry or download the original.",
          );
        const blob = await response.blob();
        if (!active) return;
        url = URL.createObjectURL(blob);
        setImageUrl(url);
      })
      .catch((err) => {
        if (active) setImageError(getErrorMessage(err));
      });
    return () => {
      active = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc.id, page, retry]);
  useEffect(() => {
    if (!viewport.current || !selectedBox.current) return;
    const box = selectedBox.current.getBoundingClientRect(),
      frame = viewport.current.getBoundingClientRect();
    viewport.current.scrollTop +=
      box.top - frame.top - frame.height / 2 + box.height / 2;
    viewport.current.scrollLeft +=
      box.left - frame.left - frame.width / 2 + box.width / 2;
  }, [selectedId, imageUrl, rotation, zoom]);
  const locate = async () => {
    if (job.current) return;
    job.current = true;
    setLocating(true);
    setError("");
    setLocateFailed(false);
    try {
      const result = await apiClient.post<PurchaseSourceMap>(
        `/pharmacy/purchase-invoices/documents/${doc.id}/source-map`,
        {},
      );
      if (mounted.current) setMap(result);
    } catch (err) {
      if (mounted.current) {
        setError(getErrorMessage(err));
        setLocateFailed(true);
      }
    } finally {
      job.current = false;
      if (mounted.current) setLocating(false);
    }
  };
  const visible = targets.flatMap((target) => {
    const evidence = sourceRegion(map, target, doc.id);
    return evidence?.box[0] === page && (showAll || target.id === selectedId)
      ? [{ target, ...evidence }]
      : [];
  });
  return (
    <section
      id="purchase-source-preview"
      aria-label="Original invoice and captured sources"
      className="min-w-0 space-y-3 rounded-lg border bg-background p-3 sm:p-4 xl:sticky xl:top-20"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold">Original invoice</h4>
          <p className="text-xs text-muted-foreground">
            Select a field to see its source. Highlights are OCR estimates.
          </p>
        </div>
        <a
          className="shrink-0 text-sm underline underline-offset-4"
          href={`/api/pharmacy/purchase-invoices/documents/${doc.id}`}
          download={doc.fileName}
        >
          Download
        </a>
      </div>
      {loading ? (
        <p role="status" className="text-sm">
          Loading source locations…
        </p>
      ) : !map && !error ? (
        <div className="space-y-2 text-sm">
          <p>This upload has no saved source locations yet.</p>
          {canLocate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={locating}
              onClick={locate}
            >
              {locating ? "Locating fields…" : "Locate source fields"}
            </Button>
          ) : (
            <p>
              A staff member with invoice creation access can locate its fields.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Locating fields keeps invoice values and stock unchanged.
          </p>
        </div>
      ) : null}
      {error && (
        <div role="alert" className="text-sm text-destructive">
          <p>{error}</p>
          <Button
            size="sm"
            variant="outline"
            disabled={locating}
            onClick={() =>
              locateFailed ? locate() : setRetry((value) => value + 1)
            }
          >
            {locating ? "Locating fields…" : "Retry source locations"}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">
          Page{" "}
          <select
            aria-label="Invoice source page"
            value={page}
            onChange={(event) => setPage(Number(event.target.value))}
            className="rounded border bg-background p-1"
          >
            {Array.from(
              { length: Math.max(pageCount, map?.pages.length || 1) },
              (_, index) => ({ page: index + 1 }),
            ).map((item) => (
              <option key={item.page} value={item.page}>
                {item.page}
              </option>
            ))}
          </select>
          {` of ${Math.max(pageCount, map?.pages.length || 1)}`}
        </label>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Rotate original clockwise"
          onClick={() => setRotation((value) => (value + 90) % 360)}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Zoom out original"
          disabled={zoom <= 1}
          onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Zoom in original"
          disabled={zoom >= 4}
          onClick={() => setZoom((value) => Math.min(4, value + 0.5))}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <span className="text-xs">{Math.round(zoom * 100)}%</span>
        <label className="ml-auto flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(event) => setShowAll(event.target.checked)}
          />
          Show all fields
        </label>
      </div>
      <label className="block text-sm">
        Captured field
        <select
          aria-label="Captured field"
          className="mt-1 block w-full min-w-0 rounded border bg-background p-2"
          value={selectedId}
          onChange={(event) => onSelect(event.target.value)}
        >
          <option value="">Choose a field or click in the form</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.label}
            </option>
          ))}
        </select>
      </label>
      <div role="status" aria-live="polite" className="min-h-12 text-sm">
        {selected ? (
          region ? (
            <>
              <p>
                <strong>{selected.label}</strong> · captured: {region.value}
              </p>
              {sourceValueChanged(region.value, selected.value) && (
                <p className="text-amber-800 dark:text-amber-300">
                  Edited value: {selected.value || "Blank"}. The highlight still
                  refers to the original reading.
                </p>
              )}
            </>
          ) : (
            <p>
              <strong>{selected.label}</strong>: No reliable printed location
              recorded. Check the original; this value may be entered manually
              or calculated.
            </p>
          )
        ) : (
          <p className="text-muted-foreground">
            Click a source icon beside a field, or enable “Show all fields” to
            select a highlighted value.
          </p>
        )}
      </div>
      <div
        ref={viewport}
        className="h-[52vh] min-h-64 max-h-[720px] overflow-auto rounded border bg-muted"
        aria-label="Invoice image viewport"
      >
        {imageError ? (
          <div role="alert" className="p-4 text-sm">
            <p>{imageError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRetry((value) => value + 1)}
            >
              Retry image
            </Button>
          </div>
        ) : !imageUrl ? (
          <p className="p-4 text-sm" role="status">
            Loading invoice image…
          </p>
        ) : (
          <svg
            role="group"
            aria-label={`Original invoice page ${page} with source highlights`}
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            style={{
              width: `${zoom * 100}%`,
              maxWidth: "none",
              height: "auto",
            }}
          >
            <g transform={transform}>
              <image
                href={imageUrl}
                width={width}
                height={height}
                onLoad={() => {
                  const image = new Image();
                  image.onload = () => {
                    if (mounted.current)
                      setDimensions({
                        width: image.naturalWidth,
                        height: image.naturalHeight,
                      });
                  };
                  image.src = imageUrl;
                }}
              />
              {visible.map(({ target, box, value }) => (
                <rect
                  key={target.id}
                  ref={target.id === selectedId ? selectedBox : undefined}
                  x={(box[1] * width) / 1000}
                  y={(box[2] * height) / 1000}
                  width={((box[3] - box[1]) * width) / 1000}
                  height={((box[4] - box[2]) * height) / 1000}
                  fill={
                    target.id === selectedId
                      ? "rgba(250,204,21,.28)"
                      : "rgba(59,130,246,.08)"
                  }
                  stroke={target.id === selectedId ? "#a16207" : "#2563eb"}
                  strokeWidth={target.id === selectedId ? 3 : 1}
                  vectorEffect="non-scaling-stroke"
                  role="button"
                  tabIndex={0}
                  aria-label={`Show field ${target.label}: ${value}`}
                  className="cursor-pointer focus:stroke-[5px]"
                  onClick={() => onSelect(target.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(target.id);
                    }
                  }}
                >
                  <title>
                    {target.label}: {value}
                  </title>
                </rect>
              ))}
            </g>
          </svg>
        )}
      </div>
    </section>
  );
}
