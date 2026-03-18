#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

import { buildHandoffStoreRequestFromRuntimeHandoff } from "./handoff-store.js";

class CliUsageError extends Error {}

type CliFlags = {
  out: string | null;
  compact: boolean;
  help: boolean;
  scope: string | null;
  tenantId: string | null;
  actor: string | null;
  memoryLane: "private" | "shared" | null;
  title: string | null;
  tags: string[];
};

function printHelp(): void {
  process.stdout.write(
    [
      "build-aionis-doc-handoff-store-request",
      "",
      "Usage:",
      "  build-aionis-doc-handoff-store-request <runtime-handoff.json> [--scope <scope>] [--tenant-id <tenant>]",
      "                                       [--actor <actor>] [--memory-lane private|shared] [--title <title>]",
      "                                       [--tag <tag>] [--out <path>] [--compact]",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): { inputPath: string | null; flags: CliFlags } {
  let inputPath: string | null = null;
  const flags: CliFlags = {
    out: null,
    compact: false,
    help: false,
    scope: null,
    tenantId: null,
    actor: null,
    memoryLane: null,
    title: null,
    tags: [],
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
    if (token === "--tag") {
      const value = argv[i + 1];
      if (!value) throw new CliUsageError("Missing value for --tag.");
      flags.tags.push(value);
      i += 1;
      continue;
    }
    if (
      token === "--out" ||
      token === "--scope" ||
      token === "--tenant-id" ||
      token === "--actor" ||
      token === "--memory-lane" ||
      token === "--title"
    ) {
      const value = argv[i + 1];
      if (!value) throw new CliUsageError(`Missing value for ${token}.`);
      switch (token) {
        case "--out":
          flags.out = value;
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

async function writeOutput(pathname: string, contents: string): Promise<void> {
  await mkdir(dirname(pathname), { recursive: true });
  await writeFile(pathname, contents, "utf8");
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
  const handoff = JSON.parse(await readFile(resolvedInput, "utf8"));
  const request = buildHandoffStoreRequestFromRuntimeHandoff({
    handoff,
    scope: flags.scope ?? undefined,
    tenantId: flags.tenantId ?? undefined,
    actor: flags.actor ?? undefined,
    memoryLane: flags.memoryLane ?? undefined,
    title: flags.title ?? undefined,
    tags: flags.tags,
  });
  const rendered = flags.compact ? JSON.stringify(request) : `${JSON.stringify(request, null, 2)}\n`;

  if (flags.out) {
    await writeOutput(resolve(process.cwd(), flags.out), rendered);
  } else {
    process.stdout.write(rendered);
  }
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
