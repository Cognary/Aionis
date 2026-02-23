function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

const MAX_REGEX_PATTERN_CHARS = 256;
const MAX_REGEX_GROUPS = 32;
const MAX_REGEX_QUANTIFIERS = 24;

function scrubRegexPattern(pattern: string): string {
  let out = "";
  let escaped = false;
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (escaped) {
      out += "_";
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += "_";
      escaped = true;
      continue;
    }
    if (inClass) {
      out += "_";
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") {
      out += "_";
      inClass = true;
      continue;
    }
    out += ch;
  }
  return out;
}

function isQuantifierStart(ch: string | undefined): boolean {
  return ch === "*" || ch === "+" || ch === "?" || ch === "{";
}

function hasNestedQuantifier(scrubbed: string): boolean {
  const groupHasQuantifier: boolean[] = [];
  for (let i = 0; i < scrubbed.length; i++) {
    const ch = scrubbed[i];
    if (ch === "(") {
      groupHasQuantifier.push(false);
      continue;
    }
    if (ch === ")") {
      const hadInnerQuantifier = groupHasQuantifier.pop() ?? false;
      if (hadInnerQuantifier && isQuantifierStart(scrubbed[i + 1])) return true;
      continue;
    }
    if (isQuantifierStart(ch)) {
      if (groupHasQuantifier.length > 0) groupHasQuantifier[groupHasQuantifier.length - 1] = true;
      if (ch === "{") {
        const close = scrubbed.indexOf("}", i + 1);
        if (close === -1) return true;
        i = close;
      }
    }
  }
  return false;
}

function isSafeRegexPattern(pattern: string): boolean {
  if (!pattern || pattern.length > MAX_REGEX_PATTERN_CHARS) return false;
  if (/\\(?:[1-9][0-9]*|k<[^>]+>)/.test(pattern)) return false; // backreferences
  if (/\(\?(?:=|!|<=|<!)/.test(pattern)) return false; // lookarounds

  const scrubbed = scrubRegexPattern(pattern);
  const groupCount = (scrubbed.match(/\(/g) ?? []).length;
  if (groupCount > MAX_REGEX_GROUPS) return false;

  const quantifierCount = (scrubbed.match(/[*+?]|\{[^}]*\}/g) ?? []).length;
  if (quantifierCount > MAX_REGEX_QUANTIFIERS) return false;

  if (hasNestedQuantifier(scrubbed)) return false;
  if (/\([^)]*\|[^)]*\)[*+{]/.test(scrubbed)) return false; // quantified alternation groups
  if (/(\.\*|\.\+).*(\.\*|\.\+)/.test(scrubbed)) return false; // repeated broad wildcards
  return true;
}

function getByPath(obj: any, path: string): any {
  if (!path) return undefined;
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (!isPlainObject(cur) && !Array.isArray(cur)) return undefined;
    cur = (cur as any)[p];
  }
  return cur;
}

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length) return false;
    for (let i = 0; i < ak.length; i++) {
      if (ak[i] !== bk[i]) return false;
      if (!deepEqual(a[ak[i]], b[bk[i]])) return false;
    }
    return true;
  }
  return false;
}

function opEval(opObj: Record<string, any>, value: any): boolean {
  if ("$eq" in opObj) return deepEqual(value, opObj["$eq"]);
  if ("$ne" in opObj) return !deepEqual(value, opObj["$ne"]);
  if ("$exists" in opObj) return (opObj["$exists"] ? value !== undefined : value === undefined);
  if ("$in" in opObj) return Array.isArray(opObj["$in"]) && opObj["$in"].some((x: any) => deepEqual(value, x));
  if ("$nin" in opObj) return Array.isArray(opObj["$nin"]) && !opObj["$nin"].some((x: any) => deepEqual(value, x));

  if ("$gt" in opObj) return typeof value === "number" && value > Number(opObj["$gt"]);
  if ("$gte" in opObj) return typeof value === "number" && value >= Number(opObj["$gte"]);
  if ("$lt" in opObj) return typeof value === "number" && value < Number(opObj["$lt"]);
  if ("$lte" in opObj) return typeof value === "number" && value <= Number(opObj["$lte"]);

  if ("$contains" in opObj) {
    const needle = opObj["$contains"];
    if (typeof value === "string" && typeof needle === "string") return value.includes(needle);
    if (Array.isArray(value)) return value.some((x: any) => deepEqual(x, needle));
    return false;
  }

  if ("$regex" in opObj) {
    if (typeof value !== "string") return false;
    const pat = String(opObj["$regex"] ?? "");
    if (!isSafeRegexPattern(pat)) return false;
    try {
      const re = new RegExp(pat);
      return re.test(value);
    } catch {
      return false;
    }
  }

  return false;
}

function matchPattern(pattern: any, ctx: any): boolean {
  // Boolean logic operators (top-level)
  if (isPlainObject(pattern) && ("$and" in pattern || "$or" in pattern || "$not" in pattern)) {
    if ("$and" in pattern) {
      const arr = pattern["$and"];
      return Array.isArray(arr) && arr.every((p: any) => matchPattern(p, ctx));
    }
    if ("$or" in pattern) {
      const arr = pattern["$or"];
      return Array.isArray(arr) && arr.some((p: any) => matchPattern(p, ctx));
    }
    if ("$not" in pattern) return !matchPattern(pattern["$not"], ctx);
  }

  // Leaf operator object: {"$in":[...]} etc.
  if (isPlainObject(pattern)) {
    const keys = Object.keys(pattern);
    if (keys.length === 1 && keys[0].startsWith("$")) return opEval(pattern, ctx);
  }

  // Array subset match (all elements in pattern must appear in ctx array)
  if (Array.isArray(pattern)) {
    if (!Array.isArray(ctx)) return false;
    for (const p of pattern) {
      const ok = ctx.some((x: any) => deepEqual(x, p));
      if (!ok) return false;
    }
    return true;
  }

  // Object match: every key in pattern must match in ctx.
  if (isPlainObject(pattern)) {
    for (const [k, v] of Object.entries(pattern)) {
      const actual = k.includes(".") ? getByPath(ctx, k) : (ctx ? (ctx as any)[k] : undefined);
      if (!matchPattern(v, actual)) return false;
    }
    return true;
  }

  // Primitive equality
  return deepEqual(ctx, pattern);
}

export function ruleMatchesContext(ifJson: any, exceptionsJson: any, ctx: any): boolean {
  const ifOk = !ifJson || (isPlainObject(ifJson) && Object.keys(ifJson).length === 0) ? true : matchPattern(ifJson, ctx);
  if (!ifOk) return false;

  if (Array.isArray(exceptionsJson)) {
    for (const ex of exceptionsJson) {
      if (matchPattern(ex, ctx)) return false;
    }
  }

  return true;
}
