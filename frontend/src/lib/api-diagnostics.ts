export const API_DIAGNOSTICS_KEY = "clinic:request-diagnostics:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOURCES = new Set([
  "patients",
  "visits",
  "prescriptions",
  "appointments",
  "inventory",
  "pharmacy",
  "drugs",
  "auth",
]);
export type DiagnosticCode =
  | "success"
  | "http_error"
  | "network_error"
  | "timeout"
  | "invalid_response";
export interface ApiDiagnostic {
  timestamp: string;
  requestId: string;
  resource: string;
  method: string;
  status: number;
  code: DiagnosticCode;
  durationMs: number;
  attempts: number;
}

export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function validRequestId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function safeEntry(value: ApiDiagnostic): ApiDiagnostic | null {
  if (!value || !validRequestId(value.requestId)) return null;
  return {
    timestamp: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value.timestamp)
      ? value.timestamp
      : new Date().toISOString(),
    requestId: value.requestId,
    resource: RESOURCES.has(value.resource) ? value.resource : "other",
    method: [
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ].includes(value.method)
      ? value.method
      : "OTHER",
    status:
      Number.isInteger(value.status) && value.status >= 0 && value.status <= 599
        ? value.status
        : 0,
    code: [
      "success",
      "http_error",
      "network_error",
      "timeout",
      "invalid_response",
    ].includes(value.code)
      ? value.code
      : "network_error",
    durationMs: Number.isFinite(value.durationMs)
      ? Math.max(0, Math.round(value.durationMs))
      : 0,
    attempts: Number.isInteger(value.attempts)
      ? Math.max(1, Math.min(3, value.attempts))
      : 1,
  };
}

/**
 * @cc [owner:nareshshah139,label:security] browser-diagnostic-privacy
 * Keep at most 100 allowlisted request summaries per browser tab, with no payloads, messages,
 * patient IDs, full URLs, tokens or headers. Storage and console failures MUST NOT affect saving.
 */
export function recordApiDiagnostic(entry: ApiDiagnostic): void {
  const safe = safeEntry(entry);
  if (!safe) return;
  try {
    const existing = JSON.parse(
      sessionStorage.getItem(API_DIAGNOSTICS_KEY) || "[]",
    );
    const previous = Array.isArray(existing)
      ? existing.slice(-99).map(safeEntry).filter(Boolean)
      : [];
    sessionStorage.setItem(
      API_DIAGNOSTICS_KEY,
      JSON.stringify([...previous, safe]),
    );
  } catch {
    /* Private browsing, quota limits and invalid cached data cannot block a save. */
  }
  if (safe.code !== "success") {
    try {
      console.warn(JSON.stringify({ event: "api.request_failed", ...safe }));
    } catch {}
  }
}

/**
 * @cc [owner:nareshshah139,label:security] diagnostic-resource-categories
 * Inventory, pharmacy and drug requests retain their fixed resource category. Unknown paths
 * return other; identifiers, query strings and payload data MUST NOT enter the category.
 */
export function diagnosticResource(endpoint: string): string {
  const resource = endpoint.split(/[/?#]/)[1];
  return RESOURCES.has(resource) ? resource : "other";
}
