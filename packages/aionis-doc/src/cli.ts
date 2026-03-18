#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";

import { compileAionisDoc } from "./compile.js";
import { buildCompileEnvelope, type EmitMode } from "./contracts.js";

class CliUsageError extends Error {}

type CliFlags = {
  emit: EmitMode;
  out: string | null;
  strict: boolean;
  compact: boolean;
  help: boolean;
};

function printHelp(): void {
  process.stdout.write(
    [
      "compile-aionis-doc",
      "",
      "Usage:",
      "  compile-aionis-doc <input-file> [--emit all|ast|ir|graph|diagnostics] [--out <path>] [--strict] [--compact]",
      "",
      "Options:",
      "  --emit <mode>   Select which compiler artifact to print. Default: all",
      "  --out <path>    Write output JSON to a file instead of stdout",
      "  --strict        Exit with code 1 when error diagnostics are present",
      "  --compact       Print compact JSON instead of pretty JSON",
      "  --help          Show this message",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): { inputPath: string | null; flags: CliFlags } {
  let inputPath: string | null = null;
  const flags: CliFlags = {
    emit: "all",
    out: null,
    strict: false,
    compact: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") {
      flags.help = true;
      continue;
    }
    if (token === "--strict") {
      flags.strict = true;
      continue;
    }
    if (token === "--compact") {
      flags.compact = true;
      continue;
    }
    if (token === "--emit") {
      const next = argv[i + 1];
      if (!next) throw new CliUsageError("Missing value for --emit.");
      if (!["all", "ast", "ir", "graph", "diagnostics"].includes(next)) {
        throw new CliUsageError(`Unsupported emit mode '${next}'.`);
      }
      flags.emit = next as EmitMode;
      i += 1;
      continue;
    }
    if (token === "--out") {
      const next = argv[i + 1];
      if (!next) throw new CliUsageError("Missing value for --out.");
      flags.out = next;
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

function hasErrorDiagnostics(result: ReturnType<typeof compileAionisDoc>): boolean {
  return result.diagnostics.some((diagnostic) => diagnostic.severity === "error");
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
  const source = await readFile(resolvedInput, "utf8");
  const result = compileAionisDoc(source);
  const envelope = buildCompileEnvelope({
    inputPath: resolvedInput,
    emit: flags.emit,
    result,
  });
  const rendered = flags.compact ? JSON.stringify(envelope) : `${JSON.stringify(envelope, null, 2)}\n`;

  if (flags.out) {
    await writeOutput(resolve(process.cwd(), flags.out), rendered);
  } else {
    process.stdout.write(rendered);
  }

  if (flags.strict && hasErrorDiagnostics(result)) {
    process.exitCode = 1;
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
