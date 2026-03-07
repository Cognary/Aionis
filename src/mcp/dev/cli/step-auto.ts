import { loadEnv } from "../client.js";
import { reserveSessionStepIndex } from "../orchestration/session.js";
import { DevCommandStepArgsSchema, executeRecordedCommandStep, readJsonFile, toPrintableJson } from "../orchestration/workflow.js";
import { getInteger, getOne, parseArgs } from "./args.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runId = getOne(args, "run-id") ?? process.env.AIONIS_RUN_ID;
  const root = getOne(args, "root") ?? process.env.AIONIS_SESSION_ROOT;
  const toolName = getOne(args, "tool-name");
  const command = args.positionals;

  if (!runId || !toolName || command.length === 0) {
    throw new Error(
      "usage: tsx src/mcp/dev/cli/step-auto.ts --tool-name <name> [--run-id <uuid>] [--root <dir>] [--cwd <dir>] -- <command...>",
    );
  }

  const reserved = await reserveSessionStepIndex(root, runId);
  const env = loadEnv();
  const metadataFile = getOne(args, "metadata-file");
  const expectedFile = getOne(args, "expected-file");

  const input = DevCommandStepArgsSchema.parse({
    tenant_id: getOne(args, "tenant-id"),
    scope: getOne(args, "scope") ?? reserved.session.scope,
    actor: getOne(args, "actor") ?? reserved.session.actor,
    run_id: runId,
    step_id: getOne(args, "step-id"),
    decision_id: getOne(args, "decision-id"),
    step_index: reserved.step_index,
    tool_name: toolName,
    cwd: getOne(args, "cwd"),
    argv: command,
    timeout_ms: getInteger(args, "timeout-ms"),
    safety_level: getOne(args, "safety-level"),
    retry_policy: undefined,
    metadata: metadataFile ? (readJsonFile(metadataFile) as Record<string, unknown>) : undefined,
    expected_output_signature: expectedFile ? readJsonFile(expectedFile) : undefined,
  });

  const result = await executeRecordedCommandStep(env, input);
  process.stdout.write(`\n${toPrintableJson(result, env.AIONIS_MAX_TOOL_TEXT_CHARS)}\n`);

  const rawExitCode =
    result.execution && typeof result.execution === "object" ? (result.execution as { exit_code?: unknown }).exit_code : undefined;
  process.exitCode = Number.isInteger(rawExitCode) ? (rawExitCode as number) : 1;
}

main().catch((error) => {
  process.stderr.write(`${String((error as Error).message)}\n`);
  process.exit(1);
});
