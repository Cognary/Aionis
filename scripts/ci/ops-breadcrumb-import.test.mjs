import assert from "node:assert/strict";
import test from "node:test";

import {
  BREADCRUMB_SCHEMA_VERSION,
  BREADCRUMB_IMPORT_MAX_BYTES,
  BREADCRUMB_IMPORT_MAX_ITEMS,
  buildBreadcrumbExport,
  normalizeBreadcrumbRow,
  parseImportedBreadcrumbEnvelope,
  parseImportedBreadcrumbs,
} from "../../apps/ops/app/lib/breadcrumbs.mjs";

const FIXED_NOW = "2026-03-01T00:00:00.000Z";

function fixedNow() {
  return FIXED_NOW;
}

test("parseImportedBreadcrumbs accepts array payload", () => {
  const parsed = parseImportedBreadcrumbs(
    JSON.stringify([
      {
        at: "2026-02-28T10:00:00.000Z",
        op: "incident_replay",
        status: 200,
        request_id: "req-1",
        payload: { tenant_id: "default", dry_run: true },
      },
    ]),
    { now: fixedNow },
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].op, "incident_replay");
  assert.equal(parsed[0].status, 200);
  assert.equal(parsed[0].ok, true);
});

test("parseImportedBreadcrumbs accepts {items: []} payload", () => {
  const parsed = parseImportedBreadcrumbs(
    JSON.stringify({
      items: [{ op: "tenant_quota_upsert", status: 500, payload: { tenant_id: "a" } }],
    }),
    { now: fixedNow },
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].at, FIXED_NOW);
  assert.equal(parsed[0].ok, false);
});

test("parseImportedBreadcrumbs accepts current schema_version envelope", () => {
  const parsed = parseImportedBreadcrumbs(
    JSON.stringify({
      schema_version: BREADCRUMB_SCHEMA_VERSION,
      items: [{ op: "alert_route_create", status: 201, payload: { tenant_id: "a" } }],
    }),
    { now: fixedNow },
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].status, 201);
  assert.equal(parsed[0].ok, true);
});

test("parseImportedBreadcrumbEnvelope returns source format + schema metadata", () => {
  const out = parseImportedBreadcrumbEnvelope(
    JSON.stringify({
      schema_version: BREADCRUMB_SCHEMA_VERSION,
      items: [{ op: "incident_replay", status: 200, payload: { tenant_id: "default" } }],
    }),
    { now: fixedNow },
  );
  assert.equal(out.source_format, "versioned_object");
  assert.equal(out.schema_version, BREADCRUMB_SCHEMA_VERSION);
  assert.equal(out.items.length, 1);
});

test("parseImportedBreadcrumbEnvelope marks legacy array format", () => {
  const out = parseImportedBreadcrumbEnvelope(
    JSON.stringify([{ op: "incident_replay", payload: { tenant_id: "default" } }]),
    { now: fixedNow },
  );
  assert.equal(out.source_format, "array");
  assert.equal(out.schema_version, null);
  assert.equal(out.items.length, 1);
});

test("parseImportedBreadcrumbs rejects unsupported future schema_version", () => {
  assert.throws(
    () =>
      parseImportedBreadcrumbs(
        JSON.stringify({
          schema_version: BREADCRUMB_SCHEMA_VERSION + 1,
          items: [{ op: "alert_route_create", payload: {} }],
        }),
        { now: fixedNow },
      ),
    /unsupported breadcrumb schema_version/,
  );
});

test("parseImportedBreadcrumbs rejects invalid schema_version type", () => {
  assert.throws(
    () =>
      parseImportedBreadcrumbs(
        JSON.stringify({
          schema_version: "abc",
          items: [{ op: "alert_route_create", payload: {} }],
        }),
        { now: fixedNow },
      ),
    /schema_version must be a positive integer/,
  );
});

test("buildBreadcrumbExport stamps schema_version and count", () => {
  const out = buildBreadcrumbExport(
    [{ op: "incident_replay", status: 200, payload: {}, request_id: "r", at: FIXED_NOW }],
    { op: "incident_replay", status: "ok" },
    fixedNow,
  );
  assert.equal(out.schema_version, BREADCRUMB_SCHEMA_VERSION);
  assert.equal(out.count, 1);
  assert.equal(out.exported_at, FIXED_NOW);
  assert.equal(out.filters.op, "incident_replay");
  assert.equal(out.filters.status, "ok");
  assert.equal(Array.isArray(out.items), true);
});

test("parseImportedBreadcrumbs rejects oversized import file", () => {
  const tooLargeText = `[${" ".repeat(BREADCRUMB_IMPORT_MAX_BYTES)}]`;
  assert.throws(
    () => parseImportedBreadcrumbs(tooLargeText),
    /import file too large/,
  );
});

test("parseImportedBreadcrumbs rejects too many items", () => {
  const items = Array.from({ length: BREADCRUMB_IMPORT_MAX_ITEMS + 1 }, () => ({
    op: "alert_route_create",
    payload: {},
  }));
  assert.throws(
    () => parseImportedBreadcrumbs(JSON.stringify(items), { now: fixedNow }),
    /too many breadcrumb items/,
  );
});

test("parseImportedBreadcrumbs rejects unknown op", () => {
  assert.throws(
    () =>
      parseImportedBreadcrumbs(JSON.stringify([{ op: "unknown_op", payload: {} }]), {
        now: fixedNow,
      }),
    /unsupported op\/action/,
  );
});

test("normalizeBreadcrumbRow rejects invalid status/date/payload/request_id", () => {
  assert.throws(
    () => normalizeBreadcrumbRow({ op: "incident_replay", status: "abc" }, 0, fixedNow),
    /status must be numeric/,
  );
  assert.throws(
    () => normalizeBreadcrumbRow({ op: "incident_replay", at: "not-a-date" }, 0, fixedNow),
    /invalid at\/created_at/,
  );
  assert.throws(
    () => normalizeBreadcrumbRow({ op: "incident_replay", payload: [] }, 0, fixedNow),
    /payload must be object/,
  );
  assert.throws(
    () =>
      normalizeBreadcrumbRow(
        { op: "incident_replay", request_id: "r".repeat(257) },
        0,
        fixedNow,
      ),
    /request_id too long/,
  );
});
