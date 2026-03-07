export type ParsedArgs = {
  values: Record<string, string[]>;
  positionals: string[];
};

export function parseArgs(argv: string[]): ParsedArgs {
  const values: Record<string, string[]> = {};
  const positionals: string[] = [];
  let positionalOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (positionalOnly) {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      positionalOnly = true;
      continue;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    if (!key) continue;

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      values[key] = [...(values[key] ?? []), "true"];
      continue;
    }

    values[key] = [...(values[key] ?? []), next];
    index += 1;
  }

  return { values, positionals };
}

export function getOne(args: ParsedArgs, key: string): string | undefined {
  return args.values[key]?.[0];
}

export function getMany(args: ParsedArgs, key: string): string[] {
  return args.values[key] ?? [];
}

export function getBoolean(args: ParsedArgs, key: string): boolean | undefined {
  const value = getOne(args, key);
  if (value === undefined) return undefined;
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return undefined;
}

export function getInteger(args: ParsedArgs, key: string): number | undefined {
  const value = getOne(args, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}
