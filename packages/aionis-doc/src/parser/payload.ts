import type { Diagnostic, SourceRange } from "../diagnostics/types.js";
import type { AionisObject, AionisValue } from "../ir/types.js";

class PayloadSyntaxError extends Error {
  readonly index: number;

  constructor(message: string, index: number) {
    super(message);
    this.name = "PayloadSyntaxError";
    this.index = index;
  }
}

class PayloadParser {
  private readonly text: string;
  private index = 0;

  constructor(text: string) {
    this.text = text;
  }

  parse(): AionisValue {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();
    if (!this.isAtEnd()) {
      throw new PayloadSyntaxError("Unexpected trailing content in directive payload.", this.index);
    }
    return value;
  }

  private parseValue(): AionisValue {
    const char = this.peek();
    if (char === "{") return this.parseObject();
    if (char === "[") return this.parseArray();
    if (char === "\"" || char === "'") return this.parseString();
    if (char === "-" || this.isDigit(char)) return this.parseNumber();
    if (this.isIdentifierStart(char)) return this.parseLiteral();
    throw new PayloadSyntaxError(`Unexpected token '${char ?? "EOF"}' in payload.`, this.index);
  }

  private parseObject(): AionisObject {
    this.expect("{");
    this.skipWhitespace();
    const out: AionisObject = {};
    if (this.peek() === "}") {
      this.index += 1;
      return out;
    }

    while (!this.isAtEnd()) {
      const key = this.parseKey();
      this.skipWhitespace();
      this.expect(":");
      this.skipWhitespace();
      out[key] = this.parseValue();
      this.skipWhitespace();

      if (this.peek() === ",") {
        this.index += 1;
        this.skipWhitespace();
      }

      if (this.peek() === "}") {
        this.index += 1;
        return out;
      }
    }

    throw new PayloadSyntaxError("Expected closing brace for object payload.", this.index);
  }

  private parseArray(): AionisValue[] {
    this.expect("[");
    this.skipWhitespace();
    const out: AionisValue[] = [];
    if (this.peek() === "]") {
      this.index += 1;
      return out;
    }

    while (!this.isAtEnd()) {
      out.push(this.parseValue());
      this.skipWhitespace();
      if (this.peek() === ",") {
        this.index += 1;
        this.skipWhitespace();
        continue;
      }
      if (this.peek() === "]") {
        this.index += 1;
        return out;
      }
      throw new PayloadSyntaxError("Expected ',' or ']' inside array payload.", this.index);
    }

    throw new PayloadSyntaxError("Expected closing bracket for array payload.", this.index);
  }

  private parseKey(): string {
    const char = this.peek();
    if (char === "\"" || char === "'") {
      return this.parseString();
    }
    if (!this.isIdentifierStart(char)) {
      throw new PayloadSyntaxError("Expected an object key.", this.index);
    }
    const start = this.index;
    this.index += 1;
    while (!this.isAtEnd() && this.isIdentifierPart(this.peek())) {
      this.index += 1;
    }
    return this.text.slice(start, this.index);
  }

  private parseString(): string {
    const quote = this.peek();
    if (quote !== "\"" && quote !== "'") {
      throw new PayloadSyntaxError("Expected a quoted string.", this.index);
    }
    this.index += 1;
    let out = "";
    while (!this.isAtEnd()) {
      const char = this.text[this.index];
      if (char === "\\") {
        const next = this.text[this.index + 1];
        if (next === undefined) {
          throw new PayloadSyntaxError("String ends with a dangling escape.", this.index);
        }
        const escapes: Record<string, string> = {
          "\"": "\"",
          "'": "'",
          "\\": "\\",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        out += escapes[next] ?? next;
        this.index += 2;
        continue;
      }
      if (char === quote) {
        this.index += 1;
        return out;
      }
      out += char;
      this.index += 1;
    }
    throw new PayloadSyntaxError("Expected closing quote for string.", this.index);
  }

  private parseNumber(): number {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.text.slice(this.index));
    if (!match) {
      throw new PayloadSyntaxError("Invalid numeric literal.", this.index);
    }
    this.index += match[0].length;
    return Number(match[0]);
  }

  private parseLiteral(): AionisValue {
    const start = this.index;
    this.index += 1;
    while (!this.isAtEnd() && this.isIdentifierPart(this.peek())) {
      this.index += 1;
    }
    const literal = this.text.slice(start, this.index);
    if (literal === "true") return true;
    if (literal === "false") return false;
    if (literal === "null") return null;
    throw new PayloadSyntaxError(`Unsupported bare literal '${literal}'. Use quoted strings for stability.`, start);
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd() && /\s/.test(this.text[this.index])) {
      this.index += 1;
    }
  }

  private expect(char: string): void {
    if (this.peek() !== char) {
      throw new PayloadSyntaxError(`Expected '${char}' but found '${this.peek() ?? "EOF"}'.`, this.index);
    }
    this.index += 1;
  }

  private peek(): string | undefined {
    return this.text[this.index];
  }

  private isAtEnd(): boolean {
    return this.index >= this.text.length;
  }

  private isDigit(char: string | undefined): boolean {
    return !!char && /[0-9]/.test(char);
  }

  private isIdentifierStart(char: string | undefined): boolean {
    return !!char && /[A-Za-z_]/.test(char);
  }

  private isIdentifierPart(char: string | undefined): boolean {
    return !!char && /[A-Za-z0-9_.-]/.test(char);
  }
}

export function parseAionisPayload(raw: string, loc: SourceRange): { value: AionisValue | null; diagnostics: Diagnostic[] } {
  try {
    const parser = new PayloadParser(raw);
    return {
      value: parser.parse(),
      diagnostics: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown payload parse failure.";
    return {
      value: null,
      diagnostics: [
        {
          severity: "error",
          code: "INVALID_PAYLOAD",
          message,
          loc,
          hint: "Check directive braces, quoted strings, and array separators.",
        },
      ],
    };
  }
}
