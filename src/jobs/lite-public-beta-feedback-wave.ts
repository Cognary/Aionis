import "dotenv/config";
import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCb);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_REPO = "Cognary/Aionis";

type GhIssue = {
  number: number;
  title: string;
  state: string;
  createdAt?: string;
  closedAt?: string | null;
  url: string;
  body?: string;
  labels?: Array<{ name?: string }>;
};

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

function dateTag(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

function parseSection(body: string | undefined, heading: string): string | null {
  if (!body) return null;
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^### ${escaped}\\s*\\n([\\s\\S]*?)(?=^### |\\Z)`, "m");
  const match = body.match(re);
  if (!match) return null;
  return match[1].trim() || null;
}

function normalizeSingleLine(value: string | null): string | null {
  if (!value) return null;
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim() || null;
}

function mdTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const [header, ...rest] = rows;
  const separator = header.map(() => "---");
  return [header, separator, ...rest].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

async function loadIssues(repo: string, inputJson: string | null, limit: number, cwd: string): Promise<GhIssue[]> {
  if (inputJson) {
    return JSON.parse(await fs.readFile(inputJson, "utf8")) as GhIssue[];
  }

  const { stdout } = await execFile("gh", [
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "all",
    "--limit",
    String(limit),
    "--label",
    "lite",
    "--label",
    "beta-feedback",
    "--json",
    "number,title,state,createdAt,closedAt,url,body,labels",
  ], {
    cwd,
    env: process.env,
  });

  return JSON.parse(stdout) as GhIssue[];
}

async function main() {
  const generatedAt = new Date().toISOString();
  const repo = argValue("--repo") ?? DEFAULT_REPO;
  const inputJson = argValue("--input-json");
  const limit = Number(argValue("--limit") ?? "100");
  const rootDir = path.resolve(argValue("--root-dir") ?? ROOT);
  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error("--limit must be a positive integer");
  }

  const artifactsDir = path.resolve(rootDir, "artifacts", "lite");
  await fs.mkdir(artifactsDir, { recursive: true });

  const outputJson = path.resolve(
    argValue("--output-json") ?? path.join(artifactsDir, `LITE_PUBLIC_BETA_FEEDBACK_WAVE_1_${dateTag(generatedAt)}.json`),
  );
  const outputMd = path.resolve(
    argValue("--output") ?? path.join(artifactsDir, `LITE_PUBLIC_BETA_FEEDBACK_WAVE_1_${dateTag(generatedAt)}.md`),
  );
  const progressDoc = path.resolve(rootDir, "docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_FEEDBACK_WAVE_1_2026-03-12.md");

  const issues = await loadIssues(repo, inputJson, limit, rootDir);
  const normalized = issues.map((issue) => {
    const area = normalizeSingleLine(parseSection(issue.body, "Problem area")) ?? "unknown";
    const dogfood = normalizeSingleLine(parseSection(issue.body, "lite:dogfood result")) ?? "unknown";
    const env = normalizeSingleLine(parseSection(issue.body, "Environment"));
    return {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      created_at: issue.createdAt ?? null,
      closed_at: issue.closedAt ?? null,
      url: issue.url,
      labels: (issue.labels ?? []).map((label) => label.name).filter(Boolean),
      area,
      dogfood,
      environment: env,
    };
  });

  const byArea = Object.entries(
    normalized.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.area] = (acc[issue.area] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([area, count]) => ({ area, count }));

  const stateCounts = normalized.reduce<Record<string, number>>((acc, issue) => {
    const key = issue.state.toLowerCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const output = {
    generated_at: generatedAt,
    repo,
    total_issues: normalized.length,
    state_counts: stateCounts,
    by_area: byArea,
    issues: normalized,
  };

  const issueRows = [
    ["Issue", "State", "Area", "Dogfood", "Link"],
    ...normalized.slice(0, 20).map((issue) => [
      `#${issue.number}`,
      issue.state,
      issue.area,
      issue.dogfood,
      issue.url,
    ]),
  ];
  const areaRows = [
    ["Area", "Count"],
    ...byArea.map((row) => [row.area, String(row.count)]),
  ];

  const md = `# Lite Public Beta Feedback Wave 1

Date: \`${generatedAt.slice(0, 10)}\`  
Repo: \`${repo}\`

## Summary

1. total feedback issues: \`${normalized.length}\`
2. open issues: \`${stateCounts.open ?? 0}\`
3. closed issues: \`${stateCounts.closed ?? 0}\`

## Area Breakdown

${byArea.length ? mdTable(areaRows) : "No Lite beta feedback issues were found yet."}

## Issues

${normalized.length ? mdTable(issueRows) : "No Lite beta feedback issues were found yet."}
`;

  const progress = `# Aionis Lite Public Beta Feedback Wave 1

Date: \`${generatedAt.slice(0, 10)}\`  
Status: \`${normalized.length ? "active" : "awaiting_external_feedback"}\`

Related:

1. [AIONIS_LITE_PUBLIC_BETA_DECISION_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/progress/AIONIS_LITE_PUBLIC_BETA_DECISION_2026-03-12.md)
2. [AIONIS_LITE_POST_PUBLIC_BETA_PLAN_2026-03-12.md](/Users/lucio/Desktop/Aionis/docs/internal/plans/AIONIS_LITE_POST_PUBLIC_BETA_PLAN_2026-03-12.md)
3. [Lite Troubleshooting and Feedback (EN)](/Users/lucio/Desktop/Aionis/docs/public/en/getting-started/06-lite-troubleshooting-and-feedback.md)
4. [Lite 排障与反馈 (ZH)](/Users/lucio/Desktop/Aionis/docs/public/zh/getting-started/06-lite-troubleshooting-and-feedback.md)
5. [LITE_PUBLIC_BETA_FEEDBACK_WAVE_1_${dateTag(generatedAt)}.md](/Users/lucio/Desktop/Aionis/artifacts/lite/LITE_PUBLIC_BETA_FEEDBACK_WAVE_1_${dateTag(generatedAt)}.md)

## Current Snapshot

1. total feedback issues: \`${normalized.length}\`
2. open issues: \`${stateCounts.open ?? 0}\`
3. closed issues: \`${stateCounts.closed ?? 0}\`

## Interpretation

${normalized.length
    ? `The first public beta feedback wave has started. The main recurring areas so far are:\n\n${byArea.map((row, idx) => `${idx + 1}. \`${row.area}\` (${row.count})`).join("\n")}`
    : "No Lite beta feedback issues were found yet. This is a baseline scan, not a failure. The intake path is now live and ready for the first external reports."}

## Next Step

1. rerun the feedback wave job after new beta reports arrive
2. convert recurring issue classes into operator UX fixes or documentation clarifications
3. keep Lite boundary and troubleshooting links stable while feedback accumulates
`;

  await fs.mkdir(path.dirname(progressDoc), { recursive: true });
  await fs.writeFile(outputJson, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await fs.writeFile(outputMd, md, "utf8");
  await fs.writeFile(progressDoc, progress, "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
