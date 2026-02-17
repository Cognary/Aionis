// pgvector uses a textual input format for parameter binding: '[1,2,3]'.
export function toVectorLiteral(vec: number[]): string {
  // Keep it compact; Postgres will parse floats.
  return `[${vec.join(",")}]`;
}

export function assertDim(vec: number[], dim = 1536): void {
  if (!Array.isArray(vec) || vec.length !== dim) {
    throw new Error(`embedding must be length ${dim}; got ${Array.isArray(vec) ? vec.length : "non-array"}`);
  }
  for (const v of vec) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error("embedding must contain only finite numbers");
    }
  }
}

