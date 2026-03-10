import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const CONTRACT_SMOKE_PATH = path.join(ROOT, "src/dev/contract-smoke.ts");

const REQUIRED_PATTERNS = [
  {
    name: "write prepare/apply coverage",
    patterns: [/\bprepareMemoryWrite\(/, /\bapplyMemoryWrite\(/],
  },
  {
    name: "recall coverage",
    patterns: [/\bmemoryRecallParsed\(/],
  },
  {
    name: "planning/context schema coverage",
    patterns: [/\bPlanningContextRequest\.parse\(/, /\bContextAssembleRequest\.parse\(/],
  },
  {
    name: "rule evaluation coverage",
    patterns: [/\bevaluateRules\(/, /\bevaluateRulesAppliedOnly\(/],
  },
  {
    name: "tool policy and feedback coverage",
    patterns: [/\bapplyToolPolicy\(/, /\bcomputeEffectiveToolPolicy\(/, /\btoolSelectionFeedback\(/],
  },
  {
    name: "session and resolve coverage",
    patterns: [/\blistSessionEvents\(/, /\bwriteSessionEvent\(/, /\bmemoryResolve\(/],
  },
  {
    name: "pack import/export schema coverage",
    patterns: [/\bMemoryPackExportRequest\.parse\(/, /\bMemoryPackImportRequest\.parse\(/],
  },
  {
    name: "replay playbook coverage",
    patterns: [/\breplayPlaybookGet\(/, /\breplayPlaybookRun\(/, /\breplayPlaybookRepairReview\(/],
  },
  {
    name: "replay request schema coverage",
    patterns: [/\bReplayPlaybookRunRequest\.parse\(/, /\bReplayPlaybookRepairReviewRequest\.parse\(/],
  },
  {
    name: "replay playbook write-flow coverage",
    patterns: [/\breplayPlaybookCompileFromRun\(/, /\breplayPlaybookPromote\(/, /\breplayPlaybookRepair\(/],
  },
  {
    name: "replay playbook write-flow request schema coverage",
    patterns: [/\bReplayPlaybookCompileRequest\.parse\(/, /\bReplayPlaybookPromoteRequest\.parse\(/, /\bReplayPlaybookRepairRequest\.parse\(/],
  },
  {
    name: "replay lifecycle coverage",
    patterns: [/\breplayRunStart\(/, /\breplayStepBefore\(/, /\breplayStepAfter\(/, /\breplayRunEnd\(/, /\breplayRunGet\(/],
  },
  {
    name: "replay lifecycle request schema coverage",
    patterns: [
      /\bReplayRunStartRequest\.parse\(/,
      /\bReplayStepBeforeRequest\.parse\(/,
      /\bReplayStepAfterRequest\.parse\(/,
      /\bReplayRunEndRequest\.parse\(/,
      /\bReplayRunGetRequest\.parse\(/,
    ],
  },
];

test("kernel contract smoke covers the current minimum kernel surface set", async () => {
  const source = await readFile(CONTRACT_SMOKE_PATH, "utf8");
  const missing = [];

  for (const requirement of REQUIRED_PATTERNS) {
    const unmet = requirement.patterns.filter((pattern) => !pattern.test(source)).map((pattern) => pattern.toString());
    if (unmet.length > 0) {
      missing.push(`${requirement.name}: ${unmet.join(", ")}`);
    }
  }

  assert.deepEqual(
    missing,
    [],
    [
      "Kernel contract coverage guard failed.",
      "The following minimum kernel surfaces are no longer represented in src/dev/contract-smoke.ts:",
      ...missing,
    ].join("\n"),
  );
});
