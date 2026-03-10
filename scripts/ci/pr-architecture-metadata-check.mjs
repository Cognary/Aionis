import process from "node:process";

const LAYER_LABELS = ["Kernel", "Runtime Services", "Control & Extensions"];

export function parseSelectedLayers(body) {
  const text = String(body ?? "");
  return LAYER_LABELS.filter((label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^- \\[(x|X)\\] \`${escaped}\`$`, "m");
    return pattern.test(text);
  });
}

export function validatePrArchitectureMetadata(input) {
  const title = String(input?.title ?? "").trim();
  const body = String(input?.body ?? "");

  if (!title) {
    return { ok: false, message: "PR title is required for architecture metadata validation." };
  }

  if (!body.trim()) {
    return {
      ok: false,
      message: "PR body is empty. Fill in the pull request template, including Architecture Layer.",
    };
  }

  if (!body.includes("## Architecture Layer")) {
    return {
      ok: false,
      message: "PR body is missing the 'Architecture Layer' section from the template.",
    };
  }

  const selectedLayers = parseSelectedLayers(body);
  if (selectedLayers.length !== 1) {
    return {
      ok: false,
      message: `Select exactly one primary architecture layer. Current selection count: ${selectedLayers.length}.`,
    };
  }

  return {
    ok: true,
    selectedLayer: selectedLayers[0],
  };
}

function main() {
  const result = validatePrArchitectureMetadata({
    title: process.env.PR_TITLE ?? "",
    body: process.env.PR_BODY ?? "",
  });
  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error(result.message);
    process.exitCode = 1;
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`pr-architecture-metadata: ok (${result.selectedLayer})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
