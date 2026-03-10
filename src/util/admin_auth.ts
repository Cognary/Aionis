import { timingSafeEqual } from "node:crypto";
import { HttpError } from "./http.js";

function firstHeaderValue(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v) && v.length > 0) return firstHeaderValue(v[0]);
  return "";
}

export function secretTokensEqual(leftRaw: string | undefined, rightRaw: string | undefined): boolean {
  const left = String(leftRaw ?? "");
  const right = String(rightRaw ?? "");
  if (!left || !right) return false;
  const leftBuf = Buffer.from(left, "utf8");
  const rightBuf = Buffer.from(right, "utf8");
  if (leftBuf.length !== rightBuf.length) return false;
  return timingSafeEqual(leftBuf, rightBuf);
}

export function requireAdminTokenHeader(
  headers: Record<string, unknown> | undefined,
  configuredTokenValue: string | undefined,
): void {
  const configured = String(configuredTokenValue ?? "").trim();
  if (!configured) {
    throw new HttpError(503, "admin_not_configured", "ADMIN_TOKEN is not configured");
  }

  const provided = firstHeaderValue(headers?.["x-admin-token"]);
  if (!secretTokensEqual(provided, configured)) {
    throw new HttpError(401, "unauthorized_admin", "valid X-Admin-Token is required");
  }
}
