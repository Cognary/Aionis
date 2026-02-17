import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "./types.js";

const DIM = 1536;

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fakeEmbed(text: string, dim = DIM): number[] {
  const h = createHash("sha256").update(text).digest();
  const seed = h.readUInt32LE(0);
  const rnd = mulberry32(seed);
  const out: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) out[i] = rnd() * 2 - 1;
  return out;
}

export const FakeEmbeddingProvider: EmbeddingProvider = {
  name: "fake",
  dim: DIM,
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => fakeEmbed(t, DIM));
  },
};

