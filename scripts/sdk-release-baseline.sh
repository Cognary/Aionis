#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK_DIR="${ROOT_DIR}/packages/sdk"
WORKDIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workdir)
      WORKDIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${WORKDIR}" ]]; then
  WORKDIR="$(mktemp -d /tmp/aionis_sdk_release_baseline_XXXXXX)"
else
  rm -rf "${WORKDIR}"
  mkdir -p "${WORKDIR}"
fi

PACK_DIR="${WORKDIR}/pack"
CONSUMER_DIR="${WORKDIR}/consumer"
CACHE_DIR="${WORKDIR}/npm-cache"
mkdir -p "${PACK_DIR}" "${CONSUMER_DIR}" "${CACHE_DIR}"

echo "[sdk-release] workdir: ${WORKDIR}"
echo "[sdk-release] building sdk"
npm --prefix "${SDK_DIR}" run build

echo "[sdk-release] testing sdk"
npm --prefix "${SDK_DIR}" run test

echo "[sdk-release] packing sdk tarball"
PACK_JSON="$(
  cd "${SDK_DIR}"
  npm pack --pack-destination "${PACK_DIR}" --json --cache "${CACHE_DIR}"
)"

TARBALL_NAME="$(printf '%s' "${PACK_JSON}" | node -e 'let raw="";process.stdin.on("data",(d)=>raw+=d);process.stdin.on("end",()=>{const parsed=JSON.parse(raw);const first=Array.isArray(parsed)?parsed[0]:parsed;process.stdout.write(first.filename);});')"
TARBALL_PATH="${PACK_DIR}/${TARBALL_NAME}"

if [[ ! -f "${TARBALL_PATH}" ]]; then
  echo "Expected tarball not found: ${TARBALL_PATH}" >&2
  exit 1
fi

cat > "${CONSUMER_DIR}/package.json" <<'EOF'
{
  "name": "aionis-sdk-release-baseline-consumer",
  "private": true,
  "type": "module"
}
EOF

echo "[sdk-release] installing tarball into isolated consumer"
npm install --prefix "${CONSUMER_DIR}" "${TARBALL_PATH}" --cache "${CACHE_DIR}" --no-fund --no-audit >/dev/null

cat > "${CONSUMER_DIR}/verify.mjs" <<'EOF'
import { createAionisClient, AionisSdkHttpError } from "@aionis/sdk";

const client = createAionisClient({
  baseUrl: "http://127.0.0.1:3001",
});

if (typeof createAionisClient !== "function") {
  throw new Error("createAionisClient export missing");
}

if (!(AionisSdkHttpError.prototype instanceof Error)) {
  throw new Error("AionisSdkHttpError does not extend Error");
}

if (typeof client.memory.write !== "function") {
  throw new Error("memory.write export missing");
}

if (typeof client.memory.planningContext !== "function") {
  throw new Error("memory.planningContext export missing");
}

if (typeof client.memory.contextAssemble !== "function") {
  throw new Error("memory.contextAssemble export missing");
}

if (typeof client.memory.executionIntrospect !== "function") {
  throw new Error("memory.executionIntrospect export missing");
}

if (typeof client.memory.tools.select !== "function") {
  throw new Error("memory.tools.select export missing");
}

if (typeof client.memory.tools.feedback !== "function") {
  throw new Error("memory.tools.feedback export missing");
}

if (typeof client.memory.replay.repairReview !== "function") {
  throw new Error("memory.replay.repairReview export missing");
}

if (typeof client.memory.anchors.rehydratePayload !== "function") {
  throw new Error("memory.anchors.rehydratePayload export missing");
}

console.log(JSON.stringify({
  ok: true,
  package_name: "@aionis/sdk",
  exports_checked: [
    "createAionisClient",
    "AionisSdkHttpError",
    "memory.write",
    "memory.planningContext",
    "memory.contextAssemble",
    "memory.executionIntrospect",
    "memory.tools.select",
    "memory.tools.feedback",
    "memory.replay.repairReview",
    "memory.anchors.rehydratePayload"
  ]
}, null, 2));
EOF

echo "[sdk-release] verifying clean import"
VERIFY_OUTPUT="$(node "${CONSUMER_DIR}/verify.mjs")"

SUMMARY_PATH="${WORKDIR}/release-summary.md"
{
  echo "# Aionis SDK Release Baseline"
  echo
  echo "- Workdir: \`${WORKDIR}\`"
  echo "- Tarball: \`${TARBALL_PATH}\`"
  echo "- Consumer: \`${CONSUMER_DIR}\`"
  echo "- Verification: \`ok\`"
  echo
  echo "## Import Smoke"
  echo
  echo '```json'
  printf '%s\n' "${VERIFY_OUTPUT}"
  echo '```'
} > "${SUMMARY_PATH}"

echo "[sdk-release] summary: ${SUMMARY_PATH}"
