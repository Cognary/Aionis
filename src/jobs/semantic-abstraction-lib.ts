import { normalizeText } from "../util/normalize.js";

export type SemanticAbstractionKind = "pattern" | "decision" | "risk" | "constraint" | "lesson";

export type SemanticAbstractionInput = {
  topicTitle: string | null;
  sourceSummaryText: string | null;
  sourceEventSummaries?: string[];
  sourceEventCount: number;
  maxTextLen: number;
};

export type SemanticAbstractionDraft = {
  abstraction_kind: SemanticAbstractionKind;
  title: string;
  text_summary: string;
  quality: {
    faithfulness: number;
    coverage: number;
    contradiction_risk: number;
  };
};

const DECISION_TERMS = [
  "decide",
  "decision",
  "choose",
  "chose",
  "switch",
  "switched",
  "migrate",
  "migrated",
  "rollback",
  "rolled back",
  "adopt",
  "adopted",
  "ship",
  "shipped",
];

const RISK_TERMS = [
  "risk",
  "outage",
  "incident",
  "error",
  "failure",
  "failed",
  "latency",
  "degraded",
  "degradation",
  "timeout",
  "bug",
  "regression",
];

const CONSTRAINT_TERMS = [
  "must",
  "limit",
  "quota",
  "budget",
  "policy",
  "blocked",
  "cannot",
  "can't",
  "cap",
  "threshold",
  "guardrail",
  "require",
];

const LESSON_TERMS = [
  "lesson",
  "learned",
  "requires",
  "check",
  "checks",
  "verify",
  "verification",
  "ensure",
  "guardrail",
  "follow-up",
  "post-deploy",
];

function includesAny(input: string, terms: string[]): boolean {
  const lower = input.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function parseKeyPoints(sourceSummaryText: string | null): string[] {
  const lines = String(sourceSummaryText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const bullets = lines
    .filter((line) => line.startsWith("- "))
    .map((line) => normalizeText(line.slice(2), 180))
    .filter(Boolean);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const bullet of bullets) {
    const key = bullet.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(bullet);
  }
  return unique;
}

function parseEventPoints(sourceEventSummaries: string[] | undefined): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const summary of Array.isArray(sourceEventSummaries) ? sourceEventSummaries : []) {
    const normalized = normalizeText(summary, 180);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }
  return unique;
}

function buildPatternSummary(topicLabel: string, points: string[], sourceEventCount: number, maxTextLen: number): string {
  const fragments = points.slice(0, 2).join("; ");
  const text =
    fragments.length > 0
      ? `Pattern for ${topicLabel}: across ${sourceEventCount} supporting events, the recurring themes are ${fragments}.`
      : `Pattern for ${topicLabel}: recurring evidence is present across ${sourceEventCount} supporting events.`;
  return normalizeText(text, maxTextLen);
}

function buildKindSummary(prefix: string, topicLabel: string, points: string[], maxTextLen: number): string {
  const fragments = points.slice(0, 2).join("; ");
  const text =
    fragments.length > 0
      ? `${prefix} for ${topicLabel}: ${fragments}.`
      : `${prefix} for ${topicLabel}: evidence exists but the current summary is too sparse for a richer abstraction.`;
  return normalizeText(text, maxTextLen);
}

export function buildSemanticAbstractions(input: SemanticAbstractionInput): SemanticAbstractionDraft[] {
  const topicLabel = normalizeText(input.topicTitle ?? "Untitled topic", 80) || "Untitled topic";
  const sourceEventCount = Math.max(0, Math.trunc(input.sourceEventCount || 0));
  const maxTextLen = Math.max(120, Math.trunc(input.maxTextLen || 700));
  const summaryPoints = parseKeyPoints(input.sourceSummaryText);
  const eventPoints = parseEventPoints(input.sourceEventSummaries);
  const points = summaryPoints.length > 0 ? summaryPoints : eventPoints;
  const allPoints = [...summaryPoints];
  for (const point of eventPoints) {
    if (allPoints.some((existing) => existing.toLowerCase() === point.toLowerCase())) continue;
    allPoints.push(point);
  }

  const drafts: SemanticAbstractionDraft[] = [];
  const baseCoverage = clamp01(sourceEventCount > 0 ? Math.min(allPoints.length, sourceEventCount) / sourceEventCount : 0);

  drafts.push({
    abstraction_kind: "pattern",
    title: normalizeText(`Pattern: ${topicLabel}`, 180) || `Pattern: ${topicLabel}`,
    text_summary: buildPatternSummary(topicLabel, allPoints, sourceEventCount, maxTextLen),
    quality: {
      faithfulness: allPoints.length > 0 ? 0.98 : 0.9,
      coverage: baseCoverage,
      contradiction_risk: 0.02,
    },
  });

  const candidates: Array<{ kind: SemanticAbstractionKind; prefix: string; terms: string[]; contradictionRisk: number }> = [
    { kind: "decision", prefix: "Decision path", terms: DECISION_TERMS, contradictionRisk: 0.08 },
    { kind: "risk", prefix: "Risk surface", terms: RISK_TERMS, contradictionRisk: 0.12 },
    { kind: "constraint", prefix: "Constraint", terms: CONSTRAINT_TERMS, contradictionRisk: 0.05 },
    { kind: "lesson", prefix: "Lesson learned", terms: LESSON_TERMS, contradictionRisk: 0.04 },
  ];

  for (const candidate of candidates) {
    const matchingPoints = allPoints.filter((point) => includesAny(point, candidate.terms));
    if (matchingPoints.length === 0) continue;
    drafts.push({
      abstraction_kind: candidate.kind,
      title: normalizeText(`${candidate.prefix}: ${topicLabel}`, 180) || `${candidate.prefix}: ${topicLabel}`,
      text_summary: buildKindSummary(candidate.prefix, topicLabel, matchingPoints, maxTextLen),
      quality: {
        faithfulness: 0.95,
        coverage: clamp01(sourceEventCount > 0 ? matchingPoints.length / sourceEventCount : 0),
        contradiction_risk: candidate.contradictionRisk,
      },
    });
  }

  return drafts;
}
