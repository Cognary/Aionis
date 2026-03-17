import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildExecutionEvalSummaryFromArtifact } from "../../src/eval/summarize.js";

function parseArgs(argv: string[]) {
  let artifactDir = "";
  let outDir = "";
  let suiteId = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--artifact-dir") {
      artifactDir = argv[++i] ?? "";
    } else if (arg === "--out-dir") {
      outDir = argv[++i] ?? "";
    } else if (arg === "--suite-id") {
      suiteId = argv[++i] ?? "";
    } else if (arg === "--help" || arg === "-h") {
      console.log("usage: tsx scripts/eval/execution-eval.ts --artifact-dir <dir> [--out-dir <dir>] [--suite-id <id>]");
      process.exit(0);
    }
  }
  if (!artifactDir.trim()) {
    throw new Error("--artifact-dir is required");
  }
  return {
    artifactDir: path.resolve(artifactDir),
    outDir: path.resolve(outDir || artifactDir),
    suiteId: suiteId.trim() || undefined,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { summary, markdown } = buildExecutionEvalSummaryFromArtifact({
    artifactDir: args.artifactDir,
    suiteId: args.suiteId,
  });
  mkdirSync(args.outDir, { recursive: true });
  const summaryPath = path.join(args.outDir, "execution_eval_summary.json");
  const markdownPath = path.join(args.outDir, "execution_eval_summary.md");
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, markdown, "utf8");
  console.log(JSON.stringify({
    ok: true,
    summary_json: summaryPath,
    summary_md: markdownPath,
    suite_id: summary.suite_id,
    case_group_id: summary.case_group_id,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
