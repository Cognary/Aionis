#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import {
  resumeAionisDocSource,
  resumeHandoffStoreRequest,
  resumePublishedAionisDoc,
  resumeRecoveredAionisDoc,
  resumeRuntimeHandoff,
  type ResumeInputKind,
} from "./resume.js";

class CliUsageError extends Error {}

type CliFlags = {
  inputKind: ResumeInputKind;
  baseUrl: string;
  scope: string | null;
  tenantId: string | null;
  actor: string | null;
  memoryLane: "private" | "shared" | null;
  title: string | null;
  tags: string[];
  repoRoot: string | null;
  filePath: string | null;
  symbol: string | null;
  currentStage: "triage" | "patch" | "review" | "resume" | null;
  activeRole: "orchestrator" | "triage" | "patch" | "review" | "resume" | null;
  handoffKind: "patch_handoff" | "review_handoff" | "task_handoff" | null;
  limit: number | null;
  allowCompileErrors: boolean;
  timeoutMs: number;
  apiKey: string | null;
  authBearer: string | null;
  adminToken: string | null;
  requestId: string | null;
  compact: boolean;
  help: boolean;
  outPath: string | null;
  queryText: string | null;
  runId: string | null;
  candidates: string[];
  strict: boolean;
  includeShadow: boolean;
  rulesLimit: number | null;
  includeRules: boolean;
  feedbackOutcome: "positive" | "negative" | "neutral" | null;
  feedbackTarget: "tool" | "all";
  feedbackNote: string | null;
  feedbackInputText: string | null;
  feedbackSelectedTool: string | null;
  feedbackActor: string | null;
};

function printHelp(): void {
  process.stdout.write(
    [
      "resume-aionis-doc-runtime",
      "",
      "Usage:",
      "  resume-aionis-doc-runtime <input-file> [--input-kind source|runtime-handoff|handoff-store-request|publish-result|recover-result]",
      "                             [--base-url http://127.0.0.1:3001] [--scope <scope>] [--tenant-id <tenant>]",
      "                             [--candidate <tool>]... [--query-text <text>] [--run-id <id>] [--include-rules]",
      "                             [--strict|--no-strict] [--include-shadow] [--rules-limit <n>]",
      "                             [--feedback-outcome positive|negative|neutral] [--feedback-target tool|all]",
      "                             [--feedback-note <text>] [--feedback-input-text <text>]",
      "                             [--feedback-selected-tool <tool>] [--feedback-actor <actor>]",
      "                             [--actor <actor>] [--memory-lane private|shared] [--title <title>] [--tag <tag>]",
      "                             [--repo-root <path>] [--file-path <path>] [--symbol <name>]",
      "                             [--current-stage triage|patch|review|resume] [--active-role orchestrator|triage|patch|review|resume]",
      "                             [--handoff-kind patch_handoff|review_handoff|task_handoff] [--limit <n>]",
      "                             [--allow-compile-errors] [--timeout-ms <ms>] [--api-key <key>] [--auth-bearer <token>]",
      "                             [--admin-token <token>] [--request-id <id>] [--out <path>] [--compact]",
      "",
      "Notes:",
      "  recover-result mode resumes directly from an existing recover-aionis-doc-handoff JSON result.",
      "  source/runtime-handoff/handoff-store-request/publish-result modes recover first, then call",
      "  /v1/memory/context/assemble, /v1/memory/tools/select, /v1/memory/tools/decision,",
      "  and /v1/memory/tools/run with recovered continuity.",
      "  If --feedback-outcome is set, the command also writes one /v1/memory/tools/feedback record.",
      "  At least one --candidate is required.",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): { inputPath: string | null; flags: CliFlags } {
  let inputPath: string | null = null;
  const flags: CliFlags = {
    inputKind: "recover-result",
    baseUrl: process.env.AIONIS_BASE_URL?.trim() || "http://127.0.0.1:3001",
    scope: process.env.AIONIS_SCOPE?.trim() || null,
    tenantId: null,
    actor: null,
    memoryLane: null,
    title: null,
    tags: [],
    repoRoot: null,
    filePath: null,
    symbol: null,
    currentStage: null,
    activeRole: null,
    handoffKind: null,
    limit: null,
    allowCompileErrors: false,
    timeoutMs: Number(process.env.AIONIS_TIMEOUT_MS || 10_000),
    apiKey: process.env.API_KEY?.trim() || process.env.PERF_API_KEY?.trim() || null,
    authBearer: process.env.AUTH_BEARER?.trim() || process.env.PERF_AUTH_BEARER?.trim() || null,
    adminToken: process.env.ADMIN_TOKEN?.trim() || null,
    requestId: null,
    compact: false,
    help: false,
    outPath: null,
    queryText: null,
    runId: null,
    candidates: [],
    strict: true,
    includeShadow: false,
    rulesLimit: null,
    includeRules: false,
    feedbackOutcome: null,
    feedbackTarget: "tool",
    feedbackNote: null,
    feedbackInputText: null,
    feedbackSelectedTool: null,
    feedbackActor: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      flags.help = true;
      continue;
    }
    if (token === "--compact") {
      flags.compact = true;
      continue;
    }
    if (token === "--allow-compile-errors") {
      flags.allowCompileErrors = true;
      continue;
    }
    if (token === "--include-shadow") {
      flags.includeShadow = true;
      continue;
    }
    if (token === "--include-rules") {
      flags.includeRules = true;
      continue;
    }
    if (token === "--no-strict") {
      flags.strict = false;
      continue;
    }
    if (token === "--strict") {
      flags.strict = true;
      continue;
    }
    if (token === "--tag") {
      const value = argv[i + 1];
      if (!value) throw new CliUsageError("Missing value for --tag.");
      flags.tags.push(value);
      i += 1;
      continue;
    }
    if (token === "--candidate") {
      const value = argv[i + 1];
      if (!value) throw new CliUsageError("Missing value for --candidate.");
      flags.candidates.push(value);
      i += 1;
      continue;
    }
    if (
      token === "--input-kind" ||
      token === "--base-url" ||
      token === "--scope" ||
      token === "--tenant-id" ||
      token === "--actor" ||
      token === "--memory-lane" ||
      token === "--title" ||
      token === "--repo-root" ||
      token === "--file-path" ||
      token === "--symbol" ||
      token === "--current-stage" ||
      token === "--active-role" ||
      token === "--handoff-kind" ||
      token === "--limit" ||
      token === "--timeout-ms" ||
      token === "--api-key" ||
      token === "--auth-bearer" ||
      token === "--admin-token" ||
      token === "--request-id" ||
      token === "--out" ||
      token === "--query-text" ||
      token === "--run-id" ||
      token === "--rules-limit" ||
      token === "--feedback-outcome" ||
      token === "--feedback-target" ||
      token === "--feedback-note" ||
      token === "--feedback-input-text" ||
      token === "--feedback-selected-tool" ||
      token === "--feedback-actor"
    ) {
      const value = argv[i + 1];
      if (!value) throw new CliUsageError(`Missing value for ${token}.`);
      switch (token) {
        case "--input-kind":
          if (!["source", "runtime-handoff", "handoff-store-request", "publish-result", "recover-result"].includes(value)) {
            throw new CliUsageError(`Unsupported input kind '${value}'.`);
          }
          flags.inputKind = value as ResumeInputKind;
          break;
        case "--base-url":
          flags.baseUrl = value;
          break;
        case "--scope":
          flags.scope = value;
          break;
        case "--tenant-id":
          flags.tenantId = value;
          break;
        case "--actor":
          flags.actor = value;
          break;
        case "--memory-lane":
          if (value !== "private" && value !== "shared") throw new CliUsageError(`Unsupported memory lane '${value}'.`);
          flags.memoryLane = value;
          break;
        case "--title":
          flags.title = value;
          break;
        case "--repo-root":
          flags.repoRoot = value;
          break;
        case "--file-path":
          flags.filePath = value;
          break;
        case "--symbol":
          flags.symbol = value;
          break;
        case "--current-stage":
          if (!["triage", "patch", "review", "resume"].includes(value)) {
            throw new CliUsageError(`Unsupported current stage '${value}'.`);
          }
          flags.currentStage = value as CliFlags["currentStage"];
          break;
        case "--active-role":
          if (!["orchestrator", "triage", "patch", "review", "resume"].includes(value)) {
            throw new CliUsageError(`Unsupported active role '${value}'.`);
          }
          flags.activeRole = value as CliFlags["activeRole"];
          break;
        case "--handoff-kind":
          if (!["patch_handoff", "review_handoff", "task_handoff"].includes(value)) {
            throw new CliUsageError(`Unsupported handoff kind '${value}'.`);
          }
          flags.handoffKind = value as CliFlags["handoffKind"];
          break;
        case "--limit":
          flags.limit = Number(value);
          break;
        case "--timeout-ms":
          flags.timeoutMs = Number(value);
          break;
        case "--api-key":
          flags.apiKey = value;
          break;
        case "--auth-bearer":
          flags.authBearer = value;
          break;
        case "--admin-token":
          flags.adminToken = value;
          break;
        case "--request-id":
          flags.requestId = value;
          break;
        case "--out":
          flags.outPath = value;
          break;
        case "--query-text":
          flags.queryText = value;
          break;
        case "--run-id":
          flags.runId = value;
          break;
        case "--rules-limit":
          flags.rulesLimit = Number(value);
          break;
        case "--feedback-outcome":
          if (!["positive", "negative", "neutral"].includes(value)) {
            throw new CliUsageError(`Unsupported feedback outcome '${value}'.`);
          }
          flags.feedbackOutcome = value as CliFlags["feedbackOutcome"];
          break;
        case "--feedback-target":
          if (value !== "tool" && value !== "all") throw new CliUsageError(`Unsupported feedback target '${value}'.`);
          flags.feedbackTarget = value;
          break;
        case "--feedback-note":
          flags.feedbackNote = value;
          break;
        case "--feedback-input-text":
          flags.feedbackInputText = value;
          break;
        case "--feedback-selected-tool":
          flags.feedbackSelectedTool = value;
          break;
        case "--feedback-actor":
          flags.feedbackActor = value;
          break;
        default:
          break;
      }
      i += 1;
      continue;
    }
    if (token.startsWith("--")) throw new CliUsageError(`Unknown flag '${token}'.`);
    if (inputPath) throw new CliUsageError("Only one input file may be provided.");
    inputPath = token;
  }

  return { inputPath, flags };
}

async function main(): Promise<void> {
  const { inputPath, flags } = parseArgs(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    return;
  }
  if (!inputPath) throw new CliUsageError("An input file path is required.");
  if (flags.candidates.length === 0) throw new CliUsageError("At least one --candidate is required.");

  const resolvedInput = resolve(process.cwd(), inputPath);
  const inputText = await readFile(resolvedInput, "utf8");
  const baseArgs = {
    baseUrl: flags.baseUrl,
    scope: flags.scope ?? undefined,
    tenantId: flags.tenantId ?? undefined,
    queryText: flags.queryText ?? undefined,
    runId: flags.runId ?? undefined,
    candidates: flags.candidates,
    includeRules: flags.includeRules,
    strict: flags.strict,
    includeShadow: flags.includeShadow,
    rulesLimit: flags.rulesLimit ?? undefined,
    feedbackOutcome: flags.feedbackOutcome ?? undefined,
    feedbackTarget: flags.feedbackTarget,
    feedbackNote: flags.feedbackNote ?? undefined,
    feedbackInputText: flags.feedbackInputText ?? undefined,
    feedbackSelectedTool: flags.feedbackSelectedTool ?? undefined,
    feedbackActor: flags.feedbackActor ?? undefined,
    timeoutMs: flags.timeoutMs,
    apiKey: flags.apiKey ?? undefined,
    authBearer: flags.authBearer ?? undefined,
    adminToken: flags.adminToken ?? undefined,
    requestId: flags.requestId ?? undefined,
  };

  let result;
  switch (flags.inputKind) {
    case "source":
      result = await resumeAionisDocSource({
        ...baseArgs,
        source: inputText,
        inputPath: resolvedInput,
        actor: flags.actor ?? undefined,
        memoryLane: flags.memoryLane ?? undefined,
        title: flags.title ?? undefined,
        tags: flags.tags,
        repoRoot: flags.repoRoot,
        filePath: flags.filePath,
        symbol: flags.symbol,
        currentStage: flags.currentStage ?? undefined,
        activeRole: flags.activeRole ?? undefined,
        handoffKind: flags.handoffKind ?? undefined,
        limit: flags.limit ?? undefined,
        allowCompileErrors: flags.allowCompileErrors,
      });
      break;
    case "runtime-handoff":
      result = await resumeRuntimeHandoff({
        ...baseArgs,
        runtimeHandoff: JSON.parse(inputText),
        actor: flags.actor ?? undefined,
        memoryLane: flags.memoryLane ?? undefined,
        title: flags.title ?? undefined,
        tags: flags.tags,
        repoRoot: flags.repoRoot,
        filePath: flags.filePath,
        symbol: flags.symbol,
        handoffKind: flags.handoffKind ?? undefined,
        limit: flags.limit ?? undefined,
      });
      break;
    case "handoff-store-request":
      result = await resumeHandoffStoreRequest({
        ...baseArgs,
        handoffStoreRequest: JSON.parse(inputText),
        repoRoot: flags.repoRoot,
        filePath: flags.filePath,
        symbol: flags.symbol,
        handoffKind: flags.handoffKind ?? undefined,
        limit: flags.limit ?? undefined,
      });
      break;
    case "publish-result":
      result = await resumePublishedAionisDoc({
        ...baseArgs,
        publishResult: JSON.parse(inputText),
      });
      break;
    case "recover-result":
    default:
      result = await resumeRecoveredAionisDoc({
        ...baseArgs,
        recoverResult: JSON.parse(inputText),
      });
      break;
  }

  const output = JSON.stringify(result, null, flags.compact ? 0 : 2);
  if (flags.outPath) {
    const resolvedOut = resolve(process.cwd(), flags.outPath);
    await writeFile(resolvedOut, `${output}\n`, "utf8");
  } else {
    process.stdout.write(`${output}\n`);
  }
}

main().catch((error) => {
  const message = error instanceof CliUsageError ? error.message : error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(error instanceof CliUsageError ? 2 : 1);
});
