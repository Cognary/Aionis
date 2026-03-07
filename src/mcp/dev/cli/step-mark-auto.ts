import { loadEnv } from "../client.js";
import { reserveSessionStepIndex } from "../orchestration/session.js";
import { DevMarkStepArgsSchema, markRecordedStep, readJsonFile, toPrintableJson } from "../orchestration/workflow.js";
import { getBoolean, getOne, parseArgs } from "./args.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runId = getOne(args, "run-id") ?? process.env.AIONIS_RUN_ID;
  const root = getOne(args, "root") ?? process.env.AIONIS_SESSION_ROOT;
  const toolName = getOne(args, "tool-name");
  const status = getOne(args, "status");

  if (!runId || !toolName || !status) {
    throw new Error(
      "usage: tsx src/mcp/dev/cli/step-mark-auto.ts --tool-name <name> --status <success|failed|partial|skipped> [--run-id <uuid>] [--root <dir>]",
    );
  }

  const reserved = await reserveSessionStepIndex(root, runId);
  const env = loadEnv();
  const input = DevMarkStepArgsSchema.parse({
    tenant_id: getOne(args, "tenant-id"),
    scope: getOne(args, "scope") ?? reserved.session.scope,
    actor: getOne(args, "actor") ?? reserved.session.actor,
    run_id: runId,
    step_id: getOne(args, "step-id"),
    decision_id: getOne(args, "decision-id"),
    step_index: reserved.step_index,
    tool_name: toolName,
    safety_level: getOne(args, "safety-level"),
    metadata: getOne(args, "metadata-file") ? (readJsonFile(getOne(args, "metadata-file")!) as Record<string, unknown>) : undefined,
    tool_input: getOne(args, "tool-input-file") ? readJsonFile(getOne(args, "tool-input-file")!) : {},
    expected_output_signature: getOne(args, "expected-file") ? readJsonFile(getOne(args, "expected-file")!) : undefined,
    status,
    output_signature: getOne(args, "output-file") ? readJsonFile(getOne(args, "output-file")!) : undefined,
    repair_applied: getBoolean(args, "repair-applied"),
    repair_note: getOne(args, "repair-note"),
    error: getOne(args, "error"),
  });

  const result = await markRecordedStep(env, input);
  process.stdout.write(`${toPrintableJson(result, env.AIONIS_MAX_TOOL_TEXT_CHARS)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String((error as Error).message)}\n`);
  process.exit(1);
});
