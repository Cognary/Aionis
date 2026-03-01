"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BREADCRUMB_SCHEMA_VERSION,
  BREADCRUMB_IMPORT_MAX_BYTES,
  BREADCRUMB_IMPORT_MAX_ITEMS,
  BREADCRUMB_KEY,
  BREADCRUMB_LIMIT,
  buildBreadcrumbExport,
  nowIso,
  parseImportedBreadcrumbEnvelope
} from "../lib/breadcrumbs.mjs";
import {
  canReplayNext,
  canReplayPrev,
  importMetaLabel,
  normalizeReplayIndex,
  replayPositionLabel
} from "../lib/replay-ui.mjs";

function jsonPretty(v) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

async function callControl(op, payload) {
  const response = await fetch("/api/control/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op, payload })
  });
  const data = await response.json().catch(() => ({ error: "invalid_json_response" }));
  const requestId = response.headers.get("x-request-id") || "";
  return { ok: response.ok, status: response.status, data, requestId };
}

function inferAuditAction(op, payload) {
  if (op === "alert_route_create") return "alert_route.create";
  if (op === "tenant_quota_upsert") return "tenant_quota.upsert";
  if (op === "tenant_quota_delete") return "tenant_quota.delete";
  if (op === "incident_replay") {
    return payload?.dry_run === false ? "incident_publish.replay" : "incident_publish.replay.preview";
  }
  return "";
}

function inferAuditTenantId(op, payload) {
  if (!payload || typeof payload !== "object") return "";
  if (op === "alert_route_create" || op === "tenant_quota_upsert" || op === "tenant_quota_delete") {
    return String(payload.tenant_id || "").trim();
  }
  if (op === "incident_replay") {
    return String(payload.tenant_id || "").trim();
  }
  return "";
}

function extractRequestId(result) {
  const direct = String(result?.requestId || "").trim();
  if (direct) return direct;
  const fromMeta = String(result?.data?.__ops?.request_id || "").trim();
  if (fromMeta) return fromMeta;
  const fromBody = String(result?.data?.request_id || "").trim();
  if (fromBody) return fromBody;
  return "";
}

function buildAuditHref(op, payload, result) {
  const params = new URLSearchParams();
  params.set("write_only", "1");
  params.set("limit", "100");
  const action = inferAuditAction(op, payload);
  const tenantId = inferAuditTenantId(op, payload);
  const requestId = extractRequestId(result);
  if (action) params.set("action", action);
  if (tenantId) params.set("tenant_id", tenantId);
  if (requestId) params.set("focus_request_id", requestId);
  if (!requestId) params.set("focus_latest", "1");
  return `/audit?${params.toString()}#focus-row`;
}

function loadBreadcrumbs() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BREADCRUMB_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => x && typeof x === "object").slice(0, BREADCRUMB_LIMIT);
  } catch {
    return [];
  }
}

function saveBreadcrumbs(items) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BREADCRUMB_KEY, JSON.stringify(items.slice(0, BREADCRUMB_LIMIT)));
  } catch {}
}

function summarizePayload(op, payload) {
  if (!payload || typeof payload !== "object") return {};
  if (op === "incident_replay") {
    return {
      tenant_id: payload.tenant_id ?? null,
      dry_run: payload.dry_run !== false,
      allow_all_tenants: payload.allow_all_tenants === true,
      limit: Number(payload.limit) || 50
    };
  }
  if (op === "tenant_quota_delete") {
    return {
      tenant_id: String(payload.tenant_id || "").trim()
    };
  }
  if (op === "tenant_quota_upsert") {
    return {
      tenant_id: String(payload.tenant_id || "").trim()
    };
  }
  if (op === "alert_route_create") {
    return {
      tenant_id: String(payload.tenant_id || "").trim(),
      channel: String(payload.channel || "webhook").trim()
    };
  }
  return {};
}

export default function ControlActions({ dangerousActionsEnabled = false }) {
  const [tenantId, setTenantId] = useState("default");
  const [alertChannel, setAlertChannel] = useState("webhook");
  const [alertTarget, setAlertTarget] = useState("");
  const [alertLabel, setAlertLabel] = useState("ops-route");
  const [alertEvents, setAlertEvents] = useState("*");

  const [replayTenantId, setReplayTenantId] = useState("default");
  const [replayStatuses, setReplayStatuses] = useState("failed,dead_letter");
  const [replayLimit, setReplayLimit] = useState(50);
  const [replayDryRun, setReplayDryRun] = useState(true);
  const [replayAllowAll, setReplayAllowAll] = useState(false);

  const [quota, setQuota] = useState({
    tenant_id: "default",
    recall_rps: 100,
    recall_burst: 200,
    write_rps: 80,
    write_burst: 120,
    write_max_wait_ms: 100,
    debug_embed_rps: 5,
    debug_embed_burst: 10,
    recall_text_embed_rps: 30,
    recall_text_embed_burst: 60,
    recall_text_embed_max_wait_ms: 200
  });

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [breadcrumbOpFilter, setBreadcrumbOpFilter] = useState("all");
  const [breadcrumbStatusFilter, setBreadcrumbStatusFilter] = useState("all");
  const [importedBreadcrumbs, setImportedBreadcrumbs] = useState([]);
  const [importMeta, setImportMeta] = useState(null);
  const [importError, setImportError] = useState("");
  const [replayIndex, setReplayIndex] = useState(0);
  const [copyReplayNote, setCopyReplayNote] = useState("");

  const disabled = busy;
  const dangerousHint = "Set OPS_DANGEROUS_ACTIONS_ENABLED=true to enable this operation.";

  const hint = useMemo(() => {
    if (!result) return "No operation yet.";
    return `HTTP ${result.status} ${result.ok ? "OK" : "ERR"}`;
  }, [result]);

  const breadcrumbOps = useMemo(() => {
    const set = new Set();
    for (const row of breadcrumbs) {
      const op = String(row?.op || "").trim();
      if (op) set.add(op);
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [breadcrumbs]);

  const filteredBreadcrumbs = useMemo(() => {
    return breadcrumbs.filter((row) => {
      if (breadcrumbOpFilter !== "all" && String(row?.op || "") !== breadcrumbOpFilter) return false;
      if (breadcrumbStatusFilter === "ok" && row?.ok !== true) return false;
      if (breadcrumbStatusFilter === "err" && row?.ok === true) return false;
      return true;
    });
  }, [breadcrumbs, breadcrumbOpFilter, breadcrumbStatusFilter]);

  const replayItem = useMemo(() => {
    if (importedBreadcrumbs.length === 0) return null;
    const idx = normalizeReplayIndex(replayIndex, importedBreadcrumbs.length);
    return importedBreadcrumbs[idx] ?? null;
  }, [importedBreadcrumbs, replayIndex]);

  const replaySafeIndex = useMemo(
    () => normalizeReplayIndex(replayIndex, importedBreadcrumbs.length),
    [replayIndex, importedBreadcrumbs.length]
  );

  const replayCanPrev = useMemo(
    () => canReplayPrev(replaySafeIndex, importedBreadcrumbs.length),
    [replaySafeIndex, importedBreadcrumbs.length]
  );

  const replayCanNext = useMemo(
    () => canReplayNext(replaySafeIndex, importedBreadcrumbs.length),
    [replaySafeIndex, importedBreadcrumbs.length]
  );

  const replayPosition = useMemo(
    () => replayPositionLabel(replaySafeIndex, importedBreadcrumbs.length),
    [replaySafeIndex, importedBreadcrumbs.length]
  );

  const importMetaText = useMemo(() => importMetaLabel(importMeta), [importMeta]);

  const auditHref = useMemo(() => {
    if (!lastRun || !result) return null;
    return buildAuditHref(lastRun.op, lastRun.payload, result);
  }, [lastRun, result]);

  useEffect(() => {
    setBreadcrumbs(loadBreadcrumbs());
  }, []);

  function appendBreadcrumb(op, payload, out) {
    const nextItem = {
      at: nowIso(),
      op: String(op || ""),
      status: Number(out?.status) || 0,
      ok: out?.ok === true,
      request_id: extractRequestId(out),
      payload: summarizePayload(op, payload)
    };
    setBreadcrumbs((prev) => {
      const next = [nextItem, ...prev].slice(0, BREADCRUMB_LIMIT);
      saveBreadcrumbs(next);
      return next;
    });
  }

  function clearBreadcrumbs() {
    setBreadcrumbs([]);
    saveBreadcrumbs([]);
  }

  function exportBreadcrumbsJson() {
    if (typeof window === "undefined") return;
    const payload = buildBreadcrumbExport(filteredBreadcrumbs, {
      op: breadcrumbOpFilter,
      status: breadcrumbStatusFilter
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aionis-ops-breadcrumbs-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onImportFileChange(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseImportedBreadcrumbEnvelope(text);
      setImportedBreadcrumbs(parsed.items);
      setImportMeta({
        source_format: parsed.source_format,
        schema_version: parsed.schema_version
      });
      setReplayIndex(0);
      setCopyReplayNote("");
      setImportError("");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "import failed");
      setImportedBreadcrumbs([]);
      setImportMeta(null);
      setReplayIndex(0);
    } finally {
      event.target.value = "";
    }
  }

  function clearImportedReplay() {
    setImportedBreadcrumbs([]);
    setImportMeta(null);
    setReplayIndex(0);
    setImportError("");
    setCopyReplayNote("");
  }

  async function copyReplayItem() {
    if (!replayItem || !navigator?.clipboard) return;
    try {
      await navigator.clipboard.writeText(jsonPretty(replayItem));
      setCopyReplayNote("Replay item copied.");
    } catch {
      setCopyReplayNote("Clipboard copy failed.");
    }
  }

  async function run(op, payload) {
    setBusy(true);
    setLastRun({ op, payload });
    try {
      const out = await callControl(op, payload);
      setResult(out);
      appendBreadcrumb(op, payload, out);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid-2">
      <article className="panel">
        <h2>Create Alert Route</h2>
        <p className="muted">POST `/v1/admin/control/alerts/routes`</p>
        <form
          className="action-form"
          onSubmit={async (event) => {
            event.preventDefault();
            await run("alert_route_create", {
              tenant_id: tenantId.trim() || "default",
              channel: alertChannel,
              target: alertTarget.trim(),
              label: alertLabel.trim() || null,
              events: alertEvents
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
            });
          }}
        >
          <label>
            tenant_id
            <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} maxLength={128} required />
          </label>
          <label>
            channel
            <select value={alertChannel} onChange={(e) => setAlertChannel(e.target.value)}>
              <option value="webhook">webhook</option>
              <option value="slack_webhook">slack_webhook</option>
              <option value="pagerduty_events">pagerduty_events</option>
            </select>
          </label>
          <label>
            target
            <input value={alertTarget} onChange={(e) => setAlertTarget(e.target.value)} placeholder="https://..." required />
          </label>
          <label>
            label
            <input value={alertLabel} onChange={(e) => setAlertLabel(e.target.value)} maxLength={256} />
          </label>
          <label>
            events (comma-separated)
            <input value={alertEvents} onChange={(e) => setAlertEvents(e.target.value)} placeholder="*,incident_publish.failed" />
          </label>
          <button type="submit" disabled={disabled}>{busy ? "Running..." : "Create Route"}</button>
        </form>
      </article>

      <article className="panel">
        <h2>Replay Incident Jobs</h2>
        <p className="muted">POST `/v1/admin/control/incident-publish/jobs/replay`</p>
        <form
          className="action-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const statuses = replayStatuses
              .split(",")
              .map((v) => v.trim())
              .filter((v) => v === "failed" || v === "dead_letter");

            if (!dangerousActionsEnabled && (!replayDryRun || replayAllowAll)) {
              window.alert(dangerousHint);
              return;
            }

            if (!replayDryRun) {
              const dangerMsg = replayAllowAll
                ? "Replay for all tenants with dry_run=false. Continue?"
                : `Replay for tenant ${replayTenantId || "(empty)"} with dry_run=false. Continue?`;
              if (!window.confirm(dangerMsg)) return;
            }

            await run("incident_replay", {
              tenant_id: replayAllowAll ? null : replayTenantId.trim() || null,
              statuses,
              limit: replayLimit,
              dry_run: replayDryRun,
              allow_all_tenants: replayAllowAll,
              reset_attempts: true,
              reason: "ops_console"
            });
          }}
        >
          <label>
            tenant_id
            <input value={replayTenantId} onChange={(e) => setReplayTenantId(e.target.value)} maxLength={128} disabled={replayAllowAll} />
          </label>
          <label>
            statuses
            <input value={replayStatuses} onChange={(e) => setReplayStatuses(e.target.value)} placeholder="failed,dead_letter" />
          </label>
          <label>
            limit
            <input type="number" min={1} max={200} value={replayLimit} onChange={(e) => setReplayLimit(Number(e.target.value) || 50)} />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={dangerousActionsEnabled ? replayDryRun : true}
              onChange={(e) => {
                if (!dangerousActionsEnabled && e.target.checked === false) {
                  window.alert(dangerousHint);
                  return;
                }
                setReplayDryRun(e.target.checked);
              }}
            />
            dry_run
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={dangerousActionsEnabled ? replayAllowAll : false}
              disabled={!dangerousActionsEnabled}
              onChange={(e) => setReplayAllowAll(e.target.checked)}
            />
            allow_all_tenants
          </label>
          <button type="submit" disabled={disabled}>{busy ? "Running..." : "Replay Jobs"}</button>
          {!dangerousActionsEnabled ? <p className="muted">{dangerousHint}</p> : null}
        </form>
      </article>

      <article className="panel">
        <h2>Upsert Tenant Quota</h2>
        <p className="muted">PUT `/v1/admin/control/tenant-quotas/:tenant_id`</p>
        <form
          className="action-form"
          onSubmit={async (event) => {
            event.preventDefault();
            await run("tenant_quota_upsert", quota);
          }}
        >
          {Object.keys(quota).map((key) => (
            <label key={key}>
              {key}
              {key === "tenant_id" ? (
                <input
                  value={String(quota[key])}
                  onChange={(e) => setQuota((prev) => ({ ...prev, tenant_id: e.target.value }))}
                  maxLength={128}
                  required
                />
              ) : (
                <input
                  type="number"
                  min={0}
                  value={Number(quota[key])}
                  onChange={(e) =>
                    setQuota((prev) => ({
                      ...prev,
                      [key]: Math.max(0, Number(e.target.value) || 0)
                    }))
                  }
                  required
                />
              )}
            </label>
          ))}
          <button type="submit" disabled={disabled}>{busy ? "Running..." : "Upsert Quota"}</button>
        </form>
      </article>

      <article className="panel">
        <h2>Delete Tenant Quota</h2>
        <p className="muted">DELETE `/v1/admin/control/tenant-quotas/:tenant_id`</p>
        <form
          className="action-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!dangerousActionsEnabled) {
              window.alert(dangerousHint);
              return;
            }
            if (!window.confirm(`Delete quota for tenant ${quota.tenant_id || "(empty)"}?`)) return;
            await run("tenant_quota_delete", {
              tenant_id: quota.tenant_id
            });
          }}
        >
          <label>
            tenant_id
            <input
              value={quota.tenant_id}
              onChange={(e) => setQuota((prev) => ({ ...prev, tenant_id: e.target.value }))}
              maxLength={128}
              required
            />
          </label>
          <button type="submit" disabled={disabled || !dangerousActionsEnabled}>{busy ? "Running..." : "Delete Quota"}</button>
          {!dangerousActionsEnabled ? <p className="muted">{dangerousHint}</p> : null}
        </form>

        <div className="action-result">
          <p className="kicker">Last Result</p>
          <p className="muted" style={{ marginTop: "0.35rem" }}>{hint}</p>
          {auditHref ? (
            <div className="action-links">
              <a href={auditHref}>Open in Audit</a>
            </div>
          ) : null}
          <pre>{jsonPretty(result?.data ?? {})}</pre>
        </div>
      </article>

      <article className="panel" style={{ gridColumn: "1 / -1" }}>
        <div className="panel-head">
          <h2>Local Action Breadcrumbs</h2>
          <div className="row-actions">
            <button type="button" className="secondary-ghost" onClick={exportBreadcrumbsJson} disabled={filteredBreadcrumbs.length === 0}>
              Export JSON
            </button>
            <button type="button" className="danger-ghost" onClick={clearBreadcrumbs} disabled={breadcrumbs.length === 0}>
              Clear
            </button>
          </div>
        </div>
        <p className="muted">
          Browser-local trail for this Ops UI session family (stored in localStorage, max {BREADCRUMB_LIMIT} records).
        </p>
        <p className="muted">
          Import limit: {BREADCRUMB_IMPORT_MAX_ITEMS} items, {BREADCRUMB_IMPORT_MAX_BYTES} bytes, known control ops only.
          Schema version: v{BREADCRUMB_SCHEMA_VERSION} (backward-compatible with legacy array and object-items formats).
        </p>
        <div className="row-filters">
          <label>
            op
            <select value={breadcrumbOpFilter} onChange={(e) => setBreadcrumbOpFilter(e.target.value)}>
              {breadcrumbOps.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </label>
          <label>
            status
            <select value={breadcrumbStatusFilter} onChange={(e) => setBreadcrumbStatusFilter(e.target.value)}>
              <option value="all">all</option>
              <option value="ok">ok</option>
              <option value="err">err</option>
            </select>
          </label>
          <label>
            import replay json
            <input type="file" accept="application/json,.json" onChange={onImportFileChange} />
          </label>
        </div>
        <div className="table-wrap" style={{ marginTop: "0.7rem" }}>
          <table>
            <thead>
              <tr>
                <th>at</th>
                <th>op</th>
                <th>status</th>
                <th>request_id</th>
                <th>payload</th>
              </tr>
            </thead>
            <tbody>
              {filteredBreadcrumbs.map((row, idx) => (
                <tr key={`${row.at || "na"}-${idx}`}>
                  <td>{String(row.at || "-").replace("T", " ").replace("Z", " UTC")}</td>
                  <td>{String(row.op || "-")}</td>
                  <td>{String(row.status || 0)} {row.ok ? "OK" : "ERR"}</td>
                  <td className="mono">{String(row.request_id || "-")}</td>
                  <td className="mono">{JSON.stringify(row.payload || {})}</td>
                </tr>
              ))}
              {filteredBreadcrumbs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">No breadcrumbs</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="replay-block">
          <div className="panel-head">
            <h3>Imported Replay View (Read-only)</h3>
            <div className="row-actions">
              <button
                type="button"
                className="secondary-ghost"
                onClick={() => setReplayIndex((x) => Math.max(0, x - 1))}
                disabled={!replayCanPrev}
              >
                Prev
              </button>
              <button
                type="button"
                className="secondary-ghost"
                onClick={() => setReplayIndex((x) => Math.min(importedBreadcrumbs.length - 1, x + 1))}
                disabled={!replayCanNext}
              >
                Next
              </button>
              <button type="button" className="secondary-ghost" onClick={copyReplayItem} disabled={!replayItem}>
                Copy Current Item
              </button>
              <button type="button" className="danger-ghost" onClick={clearImportedReplay} disabled={importedBreadcrumbs.length === 0}>
                Clear Import
              </button>
            </div>
          </div>
          {importError ? <p className="warn-line">{importError}</p> : null}
          {copyReplayNote ? <p className="muted">{copyReplayNote}</p> : null}
          {importMetaText ? <p className="muted">{importMetaText}</p> : null}
          {replayItem ? (
            <>
              <p className="muted">
                Replay position: {replayPosition}
              </p>
              <pre className="mono replay-pre">{jsonPretty(replayItem)}</pre>
            </>
          ) : (
            <p className="muted">No imported replay data.</p>
          )}
          <div className="table-wrap" style={{ marginTop: "0.7rem" }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>at</th>
                  <th>op</th>
                  <th>status</th>
                  <th>request_id</th>
                </tr>
              </thead>
              <tbody>
                {importedBreadcrumbs.map((row, idx) => (
                  <tr key={`${row.at || "na"}-${idx}`} className={idx === replaySafeIndex ? "focus-row" : undefined}>
                    <td>{idx + 1}</td>
                    <td>{String(row.at || "-").replace("T", " ").replace("Z", " UTC")}</td>
                    <td>{String(row.op || "-")}</td>
                    <td>{String(row.status || 0)} {row.ok ? "OK" : "ERR"}</td>
                    <td className="mono">{String(row.request_id || "-")}</td>
                  </tr>
                ))}
                {importedBreadcrumbs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty">No imported breadcrumbs</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </article>
    </section>
  );
}
