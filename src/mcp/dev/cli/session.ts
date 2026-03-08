import { loadEnv } from "../client.js";
import { endAgentSession, showAgentSession, startAgentSession } from "../orchestration/session.js";
import { toPrintableJson } from "../orchestration/workflow.js";
import { getBoolean, getInteger, getMany, getOne, parseArgs } from "./args.js";

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const env = loadEnv();

  if (subcommand === "start") {
    const title = getOne(args, "title");
    const goal = getOne(args, "goal");
    if (!title || !goal) {
      throw new Error("usage: tsx src/mcp/dev/cli/session.ts start --title <title> --goal <goal> [--query <query>]");
    }

    const out = await startAgentSession(env, {
      root: getOne(args, "root"),
      tenant_id: getOne(args, "tenant-id"),
      scope: getOne(args, "scope"),
      actor: getOne(args, "actor") ?? "agent",
      run_id: getOne(args, "run-id"),
      title,
      goal,
      category: getOne(args, "category") as any,
      query_text: getOne(args, "query"),
      user_request: getOne(args, "user-request"),
      acceptance_criteria: getMany(args, "acceptance"),
      plan_on_start: getBoolean(args, "plan-on-start") ?? Boolean(getOne(args, "query")),
      tool_candidates: getMany(args, "tool-candidate"),
      target_paths: getMany(args, "target"),
      entrypoints: getMany(args, "entrypoint"),
      must_pass: getMany(args, "must-pass"),
      forbidden_tools: getMany(args, "forbidden-tool"),
      preferred_tools: getMany(args, "preferred-tool"),
      risk_level: getOne(args, "risk") as any,
      tests_status: getOne(args, "tests-status") as any,
      lint_status: getOne(args, "lint-status") as any,
      build_status: getOne(args, "build-status") as any,
      failing_paths: getMany(args, "failing-path"),
      include_shadow: getBoolean(args, "include-shadow"),
      rules_limit: getInteger(args, "rules-limit"),
      tool_strict: getBoolean(args, "tool-strict"),
    });
    process.stdout.write(`${toPrintableJson(out, env.AIONIS_MAX_TOOL_TEXT_CHARS)}\n`);
    return;
  }

  if (subcommand === "end") {
    const runId = getOne(args, "run-id");
    const status = getOne(args, "status");
    if (!runId || !status) {
      throw new Error("usage: tsx src/mcp/dev/cli/session.ts end --run-id <uuid> --status <success|failed|partial> [--summary <text>]");
    }

    const out = await endAgentSession(env, {
      root: getOne(args, "root"),
      run_id: runId,
      status: status as any,
      summary: getOne(args, "summary"),
      quality_gate_file: getOne(args, "quality-gate-file"),
      learn_file: getOne(args, "learn-file"),
    });
    process.stdout.write(`${toPrintableJson(out, env.AIONIS_MAX_TOOL_TEXT_CHARS)}\n`);
    return;
  }

  if (subcommand === "show") {
    const runId = getOne(args, "run-id");
    if (!runId) {
      throw new Error("usage: tsx src/mcp/dev/cli/session.ts show --run-id <uuid>");
    }
    process.stdout.write(`${showAgentSession(getOne(args, "root"), runId, 100_000)}\n`);
    return;
  }

  throw new Error("usage: tsx src/mcp/dev/cli/session.ts <start|end|show> ...");
}

main().catch((error) => {
  process.stderr.write(`${String((error as Error).message)}\n`);
  process.exit(1);
});
