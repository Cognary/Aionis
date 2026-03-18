#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import {
  publishAionisDocSource,
  publishHandoffStoreRequest,
  publishRuntimeHandoff,
  type PublishInputKind,
} from "./publish.js";

class CliUsageError extends Error {}

type CliFlags = {
  inputKind: PublishInputKind;
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
  allowCompileErrors: boolean;
  timeoutMs: number;
  apiKey: string | null;
  authBearer: string | null;
  adminToken: string | null;
  requestId: string | null;
  compact: boolean;
  help: boolean;
};

function printHelp(): void {
  process.stdout.write(
    [
      "publish-aionis-doc-handoff",
      "",
      "Usage:",
      "  publish-aionis-doc-handoff <input-file> [--input-kind source|runtime-handoff|handoff-store-request]",
      "                             [--base-url http://127.0.0.1:3001] [--scope <scope>] [--tenant-id <tenant>]",
      "                             [--actor <actor>] [--memory-lane private|shared] [--title <title>] [--tag <tag>]",
      "                             [--repo-root <path>] [--file-path <path>] [--symbol <name>]",
      "                             [--current-stage triage|patch|review|resume] [--active-role orchestrator|triage|patch|review|resume]",
      "                             [--allow-compile-errors] [--timeout-ms <ms>] [--api-key <key>] [--auth-bearer <token>]",
      "                             [--admin-token <token>] [--request-id <id>] [--compact]",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): { inputPath: string | null; flags: CliFlags } {
  let inputPath: string | null = null;
  const flags: CliFlags = {
    inputKind: "source",
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
    allowCompileErrors: false,
    timeoutMs: Number(process.env.AIONIS_TIMEOUT_MS || 10_000),
    apiKey: process.env.API_KEY?.trim() || process.env.PERF_API_KEY?.trim() || null,
    authBearer: process.env.AUTH_BEARER?.trim() || process.env.PERF_AUTH_BEARER?.trim() || null,
    adminToken: process.env.ADMIN_TOKEN?.trim() || null,
    requestId: null,
    compact: false,
    help: false,
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
    if (token === "--tag") {
      const value = argv[i + 1];
      if (!value) throw new CliUsageError("Missing value for --tag.");
      flags.tags.push(value);
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
      token === "--timeout-ms" ||
      token === "--api-key" ||
      token === "--auth-bearer" ||
      token === "--admin-token" ||
      token === "--request-id"
    ) {
      const value = argv[i + 1];
      if (!value) throw new CliUsageError(`Missing value for ${token}.`);
      switch (token) {
        case "--input-kind":
          if (value !== "source" && value !== "runtime-handoff" && value !== "handoff-store-request") {
            throw new CliUsageError(`Unsupported input kind '${value}'.`);
          }
          flags.inputKind = value;
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
          if (value !== "private" && value !== "shared") {
            throw new CliUsageError(`Unsupported memory lane '${value}'.`);
          }
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
        default:
          break;
      }
      i += 1;
      continue;
    }
    if (token.startsWith("--")) {
      throw new CliUsageError(`Unknown flag '${token}'.`);
    }
    if (inputPath) {
      throw new CliUsageError("Only one input file may be provided.");
    }
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
  if (!inputPath) {
    throw new CliUsageError("An input file path is required.");
  }

  const resolvedInput = resolve(process.cwd(), inputPath);
  const inputText = await readFile(resolvedInput, "utf8");

  const result =
    flags.inputKind === "source"
      ? await publishAionisDocSource({
          source: inputText,
          inputPath: resolvedInput,
          baseUrl: flags.baseUrl,
          scope: flags.scope ?? undefined,
          tenantId: flags.tenantId ?? undefined,
          actor: flags.actor ?? undefined,
          memoryLane: flags.memoryLane ?? undefined,
          title: flags.title ?? undefined,
          tags: flags.tags,
          repoRoot: flags.repoRoot,
          filePath: flags.filePath,
          symbol: flags.symbol,
          currentStage: flags.currentStage ?? undefined,
          activeRole: flags.activeRole ?? undefined,
          allowCompileErrors: flags.allowCompileErrors,
          timeoutMs: flags.timeoutMs,
          apiKey: flags.apiKey ?? undefined,
          authBearer: flags.authBearer ?? undefined,
          adminToken: flags.adminToken ?? undefined,
          requestId: flags.requestId ?? undefined,
        })
      : flags.inputKind === "runtime-handoff"
        ? await publishRuntimeHandoff({
            runtimeHandoff: JSON.parse(inputText),
            baseUrl: flags.baseUrl,
            scope: flags.scope ?? undefined,
            tenantId: flags.tenantId ?? undefined,
            actor: flags.actor ?? undefined,
            memoryLane: flags.memoryLane ?? undefined,
            title: flags.title ?? undefined,
            tags: flags.tags,
            repoRoot: flags.repoRoot,
            filePath: flags.filePath,
            symbol: flags.symbol,
            currentStage: flags.currentStage ?? undefined,
            activeRole: flags.activeRole ?? undefined,
            allowCompileErrors: flags.allowCompileErrors,
            timeoutMs: flags.timeoutMs,
            apiKey: flags.apiKey ?? undefined,
            authBearer: flags.authBearer ?? undefined,
            adminToken: flags.adminToken ?? undefined,
            requestId: flags.requestId ?? undefined,
          })
        : await publishHandoffStoreRequest({
            baseUrl: flags.baseUrl,
            handoffStoreRequest: JSON.parse(inputText),
            inputKind: "handoff-store-request",
            timeoutMs: flags.timeoutMs,
            apiKey: flags.apiKey ?? undefined,
            authBearer: flags.authBearer ?? undefined,
            adminToken: flags.adminToken ?? undefined,
            requestId: flags.requestId ?? undefined,
          });

  const rendered = flags.compact ? JSON.stringify(result) : `${JSON.stringify(result, null, 2)}\n`;
  process.stdout.write(rendered);
}

main().catch((error: unknown) => {
  if (error instanceof CliUsageError) {
    process.stderr.write(`${error.message}\n`);
    printHelp();
    process.exitCode = 2;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
