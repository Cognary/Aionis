import type { EmbeddingProvider } from "./types.js";

export const EMBEDDING_ALLOWED_SURFACES = [
  "write_auto_embed",
  "recall_text",
  "planning_context",
  "context_assemble",
  "topic_cluster",
] as const;

export const EMBEDDING_FORBIDDEN_SURFACES = [
  "handoff_recover",
  "replay_deterministic_gate",
  "execution_loop_gate",
  "sandbox_budget_gate",
] as const;

export type EmbeddingAllowedSurface = (typeof EMBEDDING_ALLOWED_SURFACES)[number];
export type EmbeddingForbiddenSurface = (typeof EMBEDDING_FORBIDDEN_SURFACES)[number];
export type EmbeddingSurface = EmbeddingAllowedSurface | EmbeddingForbiddenSurface;

export const DEFAULT_ENABLED_EMBEDDING_SURFACES: readonly EmbeddingAllowedSurface[] = [
  "write_auto_embed",
  "recall_text",
  "planning_context",
  "context_assemble",
  "topic_cluster",
];

const ALLOWED_SET = new Set<string>(EMBEDDING_ALLOWED_SURFACES);
const FORBIDDEN_SET = new Set<string>(EMBEDDING_FORBIDDEN_SURFACES);

function dedupeSurfaces(input: readonly EmbeddingAllowedSurface[]): EmbeddingAllowedSurface[] {
  return Array.from(new Set(input));
}

export function isEmbeddingAllowedSurface(value: string): value is EmbeddingAllowedSurface {
  return ALLOWED_SET.has(value);
}

export function isEmbeddingForbiddenSurface(value: string): value is EmbeddingForbiddenSurface {
  return FORBIDDEN_SET.has(value);
}

export function parseEmbeddingEnabledSurfacesJson(raw: string): EmbeddingAllowedSurface[] {
  const input = String(raw ?? "").trim();
  if (!input) return [...DEFAULT_ENABLED_EMBEDDING_SURFACES];

  const candidates = [input];
  if (
    (input.startsWith("'") && input.endsWith("'") && input.length >= 2)
    || (input.startsWith("\"") && input.endsWith("\"") && input.length >= 2)
  ) {
    candidates.push(input.slice(1, -1).trim());
  }

  let parsed: unknown = [];
  let parsedOk = false;
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      parsedOk = true;
      break;
    } catch {
      continue;
    }
  }
  if (!parsedOk) {
    throw new Error("EMBEDDING_ENABLED_SURFACES_JSON must be a valid JSON array");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("EMBEDDING_ENABLED_SURFACES_JSON must be a JSON array");
  }

  const out: EmbeddingAllowedSurface[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") {
      throw new Error("EMBEDDING_ENABLED_SURFACES_JSON entries must be strings");
    }
    const surface = item.trim();
    if (!surface) continue;
    if (isEmbeddingForbiddenSurface(surface)) {
      throw new Error(`EMBEDDING_ENABLED_SURFACES_JSON cannot enable forbidden surface: ${surface}`);
    }
    if (!isEmbeddingAllowedSurface(surface)) {
      throw new Error(`EMBEDDING_ENABLED_SURFACES_JSON contains unknown surface: ${surface}`);
    }
    out.push(surface);
  }
  return dedupeSurfaces(out);
}

export function assertEmbeddingSurfaceForbidden(surface: EmbeddingForbiddenSurface): void {
  if (!FORBIDDEN_SET.has(surface)) {
    throw new Error(`embedding forbidden-surface assertion failed: ${surface}`);
  }
}

export type EmbeddingSurfacePolicy = {
  provider_configured: boolean;
  enabled_surfaces: EmbeddingAllowedSurface[];
  isEnabled(surface: EmbeddingAllowedSurface): boolean;
  providerFor<T extends EmbeddingProvider | { name: string } | null>(surface: EmbeddingAllowedSurface, provider: T): T | null;
  assertForbidden(surface: EmbeddingForbiddenSurface): void;
};

export function createEmbeddingSurfacePolicy(args: {
  providerConfigured: boolean;
  enabledSurfaces?: readonly EmbeddingAllowedSurface[] | null;
}): EmbeddingSurfacePolicy {
  const enabledSurfaces = dedupeSurfaces((args.enabledSurfaces ?? DEFAULT_ENABLED_EMBEDDING_SURFACES) as EmbeddingAllowedSurface[]);
  const enabledSet = new Set<string>(enabledSurfaces);

  return {
    provider_configured: args.providerConfigured,
    enabled_surfaces: enabledSurfaces,
    isEnabled(surface) {
      return enabledSet.has(surface);
    },
    providerFor(surface, provider) {
      if (!provider) return null;
      return enabledSet.has(surface) ? provider : null;
    },
    assertForbidden(surface) {
      assertEmbeddingSurfaceForbidden(surface);
      if (enabledSet.has(surface)) {
        throw new Error(`embedding forbidden surface was marked enabled: ${surface}`);
      }
    },
  };
}
