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
