"use client";

import { useMemo, useState } from "react";

function buildAbsoluteHref(relativeHref) {
  if (!relativeHref) return "";
  if (typeof window === "undefined") return relativeHref;
  try {
    return new URL(relativeHref, window.location.origin).toString();
  } catch {
    return relativeHref;
  }
}

async function copyText(text) {
  const value = String(text || "");
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export default function AuditCopyActions({ requestId = "", relativeHref = "" }) {
  const [note, setNote] = useState("");
  const absoluteHref = useMemo(() => buildAbsoluteHref(relativeHref), [relativeHref]);

  async function onCopyRequestId() {
    const ok = await copyText(requestId);
    setNote(ok ? "Copied request_id." : "Copy failed.");
  }

  async function onCopyAuditLink() {
    const ok = await copyText(absoluteHref);
    setNote(ok ? "Copied audit link." : "Copy failed.");
  }

  return (
    <div className="copy-actions">
      <button type="button" onClick={onCopyRequestId} disabled={!requestId}>
        Copy request_id
      </button>
      <button type="button" onClick={onCopyAuditLink} disabled={!absoluteHref}>
        Copy audit link
      </button>
      {note ? <p className="copy-actions-note">{note}</p> : null}
    </div>
  );
}
