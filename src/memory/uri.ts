import { badRequest } from "../util/http.js";

const URI_SCHEME = "aionis://";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NODE_TYPES = new Set([
  "event",
  "entity",
  "topic",
  "rule",
  "evidence",
  "concept",
  "procedure",
  "self_model",
]);

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

  if (!NODE_TYPES.has(type)) {
    badRequest("invalid_aionis_uri", "URI type is not a supported node type", { type });
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
  return `${URI_SCHEME}${encodeURIComponent(tenant_id)}/${encodeURIComponent(scope)}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
}
