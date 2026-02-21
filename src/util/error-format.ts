function safeJson(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    const text = JSON.stringify(
      value,
      (_key, v) => {
        if (!v || typeof v !== "object") return v;
        if (seen.has(v as object)) return "[circular]";
        seen.add(v as object);
        return v;
      },
      2,
    );
    return text ?? String(value);
  } catch {
    return String(value);
  }
}

export function formatError(err: unknown): string {
  if (typeof err === "string") {
    const s = err.trim();
    return s.length > 0 ? s : "unknown_error";
  }

  if (err instanceof Error) {
    const msg = String(err.message ?? "").trim();
    if (msg.length > 0) return msg;
    const anyErr = err as any;
    const nested = Array.isArray(anyErr?.errors)
      ? anyErr.errors.map((e: unknown) => formatError(e)).filter((x: string) => x.length > 0)
      : [];
    if (nested.length > 0) return nested.join(" | ");
    const code = typeof anyErr?.code === "string" ? anyErr.code.trim() : "";
    if (code.length > 0) return code;
    return err.name || "unknown_error";
  }

  if (err && typeof err === "object") {
    const anyErr = err as any;
    const nested = Array.isArray(anyErr?.errors)
      ? anyErr.errors.map((e: unknown) => formatError(e)).filter((x: string) => x.length > 0)
      : [];
    if (nested.length > 0) return nested.join(" | ");
    const code = typeof anyErr?.code === "string" ? anyErr.code.trim() : "";
    if (code.length > 0) {
      const msg = typeof anyErr?.message === "string" ? anyErr.message.trim() : "";
      if (msg.length > 0) return `${code}: ${msg}`;
      return code;
    }
    const json = safeJson(anyErr);
    return json.trim().length > 0 ? json : "unknown_error";
  }

  const s = String(err ?? "").trim();
  return s.length > 0 ? s : "unknown_error";
}
