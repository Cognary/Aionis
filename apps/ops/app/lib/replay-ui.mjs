export function normalizeReplayIndex(index, total) {
  const n = Number(index);
  const safeIndex = Number.isFinite(n) ? Math.trunc(n) : 0;
  const count = Number(total);
  const safeTotal = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (safeTotal <= 0) return 0;
  if (safeIndex < 0) return 0;
  if (safeIndex > safeTotal - 1) return safeTotal - 1;
  return safeIndex;
}

export function canReplayPrev(index, total) {
  const safeIndex = normalizeReplayIndex(index, total);
  return Number(total) > 0 && safeIndex > 0;
}

export function canReplayNext(index, total) {
  const safeIndex = normalizeReplayIndex(index, total);
  const safeTotal = Math.max(0, Math.trunc(Number(total) || 0));
  return safeTotal > 0 && safeIndex < safeTotal - 1;
}

export function replayPositionLabel(index, total) {
  const safeTotal = Math.max(0, Math.trunc(Number(total) || 0));
  if (safeTotal <= 0) return "0 / 0";
  const safeIndex = normalizeReplayIndex(index, safeTotal);
  return `${safeIndex + 1} / ${safeTotal}`;
}

export function importMetaLabel(meta) {
  if (!meta || typeof meta !== "object") return "";
  const source = String(meta.source_format || "").trim();
  if (!source) return "";
  const version = meta.schema_version;
  if (version === null || version === undefined) {
    return `Import format: ${source}, schema_version=legacy`;
  }
  return `Import format: ${source}, schema_version=v${version}`;
}
