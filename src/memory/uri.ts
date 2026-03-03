import { badRequest } from "../util/http.js";

const URI_SCHEME = "aionis://";
// Accept canonical UUID text shape without enforcing RFC variant/version bits,
// so older/backfilled IDs remain URI-addressable.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const AIONIS_URI_NODE_TYPES = [
  "event",
  "entity",
  "topic",
  "rule",
  "evidence",
  "concept",
  "procedure",
  "self_model",
] as const;

export const AIONIS_URI_OBJECT_TYPES = [
  ...AIONIS_URI_NODE_TYPES,
  "edge",
  "commit",
  "decision",
] as const;

const URI_OBJECT_TYPES = new Set<string>(AIONIS_URI_OBJECT_TYPES);

export type AionisUriParts = {
  tenant_id: string;
  scope: string;
  type: string;
  id: string;
};

function decodeUriSegment(raw: string, field: string): string {
  try {
    const v = decodeURIComponent(raw).trim();
    if (!v) badRequest("invalid_aionis_uri", `URI ${field} must be non-empty`);
    return v;
  } catch {
    badRequest("invalid_aionis_uri", `URI ${field} has invalid encoding`);
  }
}

export function parseAionisUri(uri: string): AionisUriParts {
  const raw = String(uri ?? "").trim();
  if (!raw.startsWith(URI_SCHEME)) {
    badRequest("invalid_aionis_uri", "URI must start with aionis://");
  }

  const rest = raw.slice(URI_SCHEME.length);
  const parts = rest.split("/");
  if (parts.length !== 4) {
    badRequest("invalid_aionis_uri", "URI must be aionis://tenant/scope/type/id");
  }

  const tenant_id = decodeUriSegment(parts[0] ?? "", "tenant_id");
  const scope = decodeUriSegment(parts[1] ?? "", "scope");
  const type = decodeUriSegment(parts[2] ?? "", "type");
  const id = decodeUriSegment(parts[3] ?? "", "id");

  if (!URI_OBJECT_TYPES.has(type)) {
    badRequest("invalid_aionis_uri", "URI type is not supported", { type });
  }
  if (!UUID_RE.test(id)) {
    badRequest("invalid_aionis_uri", "URI id must be a UUID", { id });
  }

  return { tenant_id, scope, type, id };
}

export function buildAionisUri(input: AionisUriParts): string {
  const tenant_id = String(input.tenant_id ?? "").trim();
  const scope = String(input.scope ?? "").trim();
  const type = String(input.type ?? "").trim();
  const id = String(input.id ?? "").trim();
  if (!tenant_id || !scope || !type || !id) {
    badRequest("invalid_aionis_uri_parts", "tenant_id, scope, type, id are required for URI generation");
  }
  if (!URI_OBJECT_TYPES.has(type)) {
    badRequest("invalid_aionis_uri_parts", "type is not supported for URI generation", { type });
  }
  if (!UUID_RE.test(id)) {
    badRequest("invalid_aionis_uri_parts", "id must be a UUID for URI generation", { id });
  }
  return `${URI_SCHEME}${encodeURIComponent(tenant_id)}/${encodeURIComponent(scope)}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
}
