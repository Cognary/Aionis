export type EmbeddingProvider = {
  name: string;
  dim: number;
  embed(texts: string[]): Promise<number[][]>;
};

