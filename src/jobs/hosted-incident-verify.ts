import "dotenv/config";
import { createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { formatError } from "../util/error-format.js";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) return null;
  return v;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function sha256Hex(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function main() {
  const bundleDir = path.resolve(argValue("--bundle-dir") ?? ".");
  const indexFile = path.resolve(argValue("--index-file") ?? path.join(bundleDir, "evidence_index.json"));
  const signatureFile = path.resolve(argValue("--signature-file") ?? path.join(bundleDir, "evidence_index.sig.json"));
  const signingKey = argValue("--signing-key") ?? process.env.INCIDENT_BUNDLE_SIGNING_KEY ?? "";
  const strict = hasFlag("--strict");

  if (!existsSync(indexFile)) {
    throw new Error(`index file not found: ${indexFile}`);
  }

  const indexRaw = readFileSync(indexFile);
  const index = JSON.parse(indexRaw.toString("utf8")) as {
    files?: Array<{ path?: string; sha256?: string; size_bytes?: number }>;
  };
  const rows = Array.isArray(index.files) ? index.files : [];

  const missing: any[] = [];
  const digestMismatch: any[] = [];
  const sizeMismatch: any[] = [];
  for (const row of rows) {
    const rel = String(row.path ?? "");
    const expectedDigest = String(row.sha256 ?? "");
    const expectedSize = Number(row.size_bytes ?? 0);
    const filePath = path.resolve(bundleDir, rel);
    if (!rel || !existsSync(filePath)) {
      missing.push({ path: rel });
      continue;
    }
    const raw = readFileSync(filePath);
    const actualDigest = sha256Hex(raw);
    if (expectedDigest && actualDigest !== expectedDigest) {
      digestMismatch.push({ path: rel, expected: expectedDigest, actual: actualDigest });
    }
    if (Number.isFinite(expectedSize) && expectedSize >= 0 && raw.length !== expectedSize) {
      sizeMismatch.push({ path: rel, expected: expectedSize, actual: raw.length });
    }
  }

  let signature = {
    checked: false,
    file_present: existsSync(signatureFile),
    valid: null as boolean | null,
    error: null as string | null,
  };
  if (signingKey) {
    signature.checked = true;
    if (!existsSync(signatureFile)) {
      signature.valid = false;
      signature.error = "signature file missing";
    } else {
      try {
        const sigObj = JSON.parse(readFileSync(signatureFile, "utf8")) as { signature_hex?: string };
        const expected = String(sigObj.signature_hex ?? "");
        const actual = createHmac("sha256", signingKey).update(indexRaw).digest("hex");
        signature.valid = expected.length > 0 && expected === actual;
        if (!signature.valid) signature.error = "signature mismatch";
      } catch (err: any) {
        signature.valid = false;
        signature.error = formatError(err);
      }
    }
  }

  const ok =
    missing.length === 0 &&
    digestMismatch.length === 0 &&
    sizeMismatch.length === 0 &&
    (!signature.checked || signature.valid === true);
  const summary = {
    ok,
    strict,
    checked_at: new Date().toISOString(),
    bundle_dir: bundleDir,
    index_file: indexFile,
    files_indexed: rows.length,
    missing_count: missing.length,
    digest_mismatch_count: digestMismatch.length,
    size_mismatch_count: sizeMismatch.length,
    missing,
    digest_mismatch: digestMismatch,
    size_mismatch: sizeMismatch,
    signature,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));

  if (!ok && strict) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ ok: false, error: formatError(err) }, null, 2));
  process.exitCode = 1;
});
