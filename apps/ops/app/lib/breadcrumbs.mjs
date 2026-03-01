export const BREADCRUMB_KEY = "aionis_ops_action_breadcrumbs_v1";
export const BREADCRUMB_LIMIT = 30;
export const BREADCRUMB_IMPORT_MAX_BYTES = 256 * 1024;
export const BREADCRUMB_IMPORT_MAX_ITEMS = 500;
export const BREADCRUMB_SCHEMA_VERSION = 1;

export const KNOWN_CONTROL_OPS = Object.freeze([
  "alert_route_create",
  "incident_replay",
  "tenant_quota_upsert",
  "tenant_quota_delete",
]);

const KNOWN_CONTROL_OPS_SET = new Set(KNOWN_CONTROL_OPS);

export function nowIso() {
  return new Date().toISOString();
}

function parseSchemaVersion(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error("invalid breadcrumb JSON: schema_version must be a positive integer");
  }
  return n;
}

export function buildBreadcrumbExport(items, filters = {}, now = nowIso) {
  const safeItems = Array.isArray(items) ? items : [];
  const opFilter = String(filters.op || "all");
  const statusFilter = String(filters.status || "all");
  return {
    schema_version: BREADCRUMB_SCHEMA_VERSION,
    exported_at: now(),
    count: safeItems.length,
    filters: {
      op: opFilter,
      status: statusFilter,
    },
    items: safeItems,
  };
}

function extractParsedItems(parsed) {
  if (Array.isArray(parsed)) {
    return {
      source_format: "array",
      schema_version: null,
      items: parsed,
    };
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) {
    return {
      source_format:
        parsed.schema_version !== undefined || parsed.schemaVersion !== undefined
          ? "versioned_object"
          : "object_items",
      schema_version: parseSchemaVersion(parsed.schema_version ?? parsed.schemaVersion),
      items: parsed.items,
    };
  }
  throw new Error("invalid breadcrumb JSON: expected array or { items: [] }");
}

export function normalizeBreadcrumbRow(row, idx = 0, now = nowIso) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`invalid breadcrumb item #${idx + 1}: expected object`);
  }
  const at = String(row.at || row.created_at || "").trim();
  const op = String(row.op || row.action || "").trim();
  if (!op) {
    throw new Error(`invalid breadcrumb item #${idx + 1}: missing op/action`);
  }
  if (op.length > 80) {
    throw new Error(`invalid breadcrumb item #${idx + 1}: op/action too long`);
  }
  if (!KNOWN_CONTROL_OPS_SET.has(op)) {
    throw new Error(`invalid breadcrumb item #${idx + 1}: unsupported op/action "${op}"`);
  }

  const statusNum = Number(row.status);
  const hasStatus = row.status !== undefined && row.status !== null && String(row.status).trim() !== "";
  if (hasStatus && !Number.isFinite(statusNum)) {
    throw new Error(`invalid breadcrumb item #${idx + 1}: status must be numeric`);
  }
  const status = hasStatus ? Math.max(0, Math.trunc(statusNum)) : 0;
  const ok = row.ok === true || (status >= 200 && status < 400);

  const requestId = String(row.request_id || row.requestId || "").trim();
  if (requestId.length > 256) {
    throw new Error(`invalid breadcrumb item #${idx + 1}: request_id too long`);
  }

  if (at) {
    const parsed = Date.parse(at);
    if (Number.isNaN(parsed)) {
      throw new Error(`invalid breadcrumb item #${idx + 1}: invalid at/created_at`);
    }
  }

  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  if (Array.isArray(payload)) {
    throw new Error(`invalid breadcrumb item #${idx + 1}: payload must be object`);
  }

  return { at: at || now(), op, status, ok, request_id: requestId, payload };
}

export function parseImportedBreadcrumbs(text, opts = {}) {
  return parseImportedBreadcrumbEnvelope(text, opts).items;
}

export function parseImportedBreadcrumbEnvelope(text, opts = {}) {
  const now = typeof opts.now === "function" ? opts.now : nowIso;
  const rawText = String(text || "");
  const size = new TextEncoder().encode(rawText).length;
  if (size > BREADCRUMB_IMPORT_MAX_BYTES) {
    throw new Error(`import file too large: max ${BREADCRUMB_IMPORT_MAX_BYTES} bytes`);
  }

  const parsed = JSON.parse(rawText);
  const envelope = extractParsedItems(parsed);
  const parsedSchemaVersion = envelope.schema_version;
  if (parsedSchemaVersion !== null && parsedSchemaVersion > BREADCRUMB_SCHEMA_VERSION) {
    throw new Error(
      `unsupported breadcrumb schema_version ${parsedSchemaVersion}; max supported ${BREADCRUMB_SCHEMA_VERSION}`,
    );
  }
  const items = envelope.items;

  if (items.length > BREADCRUMB_IMPORT_MAX_ITEMS) {
    throw new Error(`too many breadcrumb items: max ${BREADCRUMB_IMPORT_MAX_ITEMS}`);
  }

  return {
    source_format: envelope.source_format,
    schema_version: parsedSchemaVersion,
    items: items.map((row, idx) => normalizeBreadcrumbRow(row, idx, now)),
  };
}
