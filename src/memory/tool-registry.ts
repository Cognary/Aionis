export type ToolQualityTier = "experimental" | "supported" | "preferred" | "deprecated";
export type ToolRegistryStatus = "active" | "disabled" | "shadow_only";

export type ToolRegistryRecord = {
  tool_name: string;
  capability_family: string;
  capability_tags: string[];
  quality_tier: ToolQualityTier;
  status: ToolRegistryStatus;
  replacement_for: string[];
  replaced_by: string[];
};

export type ToolRegistryCandidateMetadata = {
  tool_name: string;
  capability_family: string | null;
  quality_tier: ToolQualityTier | null;
  status: ToolRegistryStatus | null;
  replacement_for: string[];
  replaced_by: string[];
};

export type ToolRegistryIndex = Map<string, ToolRegistryRecord>;

export const DEFAULT_TOOL_REGISTRY_RECORDS: ToolRegistryRecord[] = [
  {
    tool_name: "read-source-focused-v2",
    capability_family: "focused_repo_read",
    capability_tags: ["repo_read", "file_targeted", "source"],
    quality_tier: "preferred",
    status: "active",
    replacement_for: ["read-markdown-impl"],
    replaced_by: [],
  },
  {
    tool_name: "read-markdown-impl",
    capability_family: "focused_repo_read",
    capability_tags: ["repo_read", "file_targeted", "markdown"],
    quality_tier: "supported",
    status: "active",
    replacement_for: [],
    replaced_by: ["read-source-focused-v2"],
  },
];

export const DEFAULT_TOOL_REGISTRY_INDEX = buildToolRegistryIndex(DEFAULT_TOOL_REGISTRY_RECORDS);

export function buildToolRegistryIndex(records: ToolRegistryRecord[]): ToolRegistryIndex {
  const out: ToolRegistryIndex = new Map();
  for (const record of records) out.set(record.tool_name, record);
  return out;
}

export function getToolRegistryRecord(index: ToolRegistryIndex, toolName: string): ToolRegistryRecord | null {
  return index.get(toolName) ?? null;
}

export function mapCandidatesToFamilies(
  index: ToolRegistryIndex,
  candidates: string[],
): ToolRegistryCandidateMetadata[] {
  return candidates.map((toolName) => {
    const record = getToolRegistryRecord(index, toolName);
    if (!record) {
      return {
        tool_name: toolName,
        capability_family: null,
        quality_tier: null,
        status: null,
        replacement_for: [],
        replaced_by: [],
      };
    }

    return {
      tool_name: record.tool_name,
      capability_family: record.capability_family,
      quality_tier: record.quality_tier,
      status: record.status,
      replacement_for: [...record.replacement_for],
      replaced_by: [...record.replaced_by],
    };
  });
}

function tierRank(tier: ToolQualityTier | null): number {
  switch (tier) {
    case "preferred":
      return 0;
    case "supported":
      return 1;
    case "experimental":
      return 2;
    case "deprecated":
      return 3;
    default:
      return 4;
  }
}

export function applyFamilyAwareOrdering(
  candidates: string[],
  metadata: ToolRegistryCandidateMetadata[],
  explicitPreferred: string[] = [],
): string[] {
  const out = [...candidates];
  const explicitPreferredSet = new Set(explicitPreferred);
  const families = new Map<string, Array<{ index: number; meta: ToolRegistryCandidateMetadata }>>();

  metadata.forEach((meta, index) => {
    if (!meta.capability_family) return;
    const list = families.get(meta.capability_family) ?? [];
    list.push({ index, meta });
    families.set(meta.capability_family, list);
  });

  for (const members of families.values()) {
    if (members.length < 2) continue;
    if (members.some((entry) => explicitPreferredSet.has(entry.meta.tool_name))) continue;

    const reordered = [...members].sort((a, b) => {
      const rankDelta = tierRank(a.meta.quality_tier) - tierRank(b.meta.quality_tier);
      if (rankDelta !== 0) return rankDelta;
      return a.index - b.index;
    });

    members
      .map((entry) => entry.index)
      .sort((a, b) => a - b)
      .forEach((slotIndex, idx) => {
        out[slotIndex] = reordered[idx]!.meta.tool_name;
      });
  }

  return out;
}
