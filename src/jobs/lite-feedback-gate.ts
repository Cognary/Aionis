import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_DOC_MARKERS = [
  "Lite Beta Feedback",
  "lite:dogfood",
  "/health",
  "memory_lane",
  "X-Admin-Token",
];
const REQUIRED_TEMPLATE_LABELS = ["lite", "beta-feedback"];
const REQUIRED_TEMPLATE_FIELDS = [
  "environment",
  "startup",
  "health",
  "area",
  "dogfood",
  "reproduce",
  "expected",
  "actual",
];
const REQUIRED_CONFIG_MARKERS = [
  "blank_issues_enabled: false",
  "Lite Public Beta Boundary",
  "Lite Troubleshooting and Feedback",
  "Lite 运维与排障",
];

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function mdTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const [header, ...rest] = rows;
  const separator = header.map(() => "---");
  return [header, separator, ...rest].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

async function main() {
  const generatedAt = new Date().toISOString();
  const dateTag = generatedAt.slice(0, 10).replace(/-/g, "");
  const rootDir = path.resolve(argValue("--root-dir") ?? ROOT);
  const artifactsDir = path.resolve(rootDir, "artifacts", "lite");
  await fs.mkdir(artifactsDir, { recursive: true });

  const output = path.resolve(argValue("--output") ?? path.join(artifactsDir, `LITE_FEEDBACK_GATE_${dateTag}.md`));
  const outputJson = path.resolve(argValue("--output-json") ?? path.join(artifactsDir, `LITE_FEEDBACK_GATE_${dateTag}.json`));
  const issueTemplatePath = path.join(rootDir, ".github/ISSUE_TEMPLATE/lite-beta-feedback.yml");
  const issueConfigPath = path.join(rootDir, ".github/ISSUE_TEMPLATE/config.yml");
  const packageJsonPath = path.join(rootDir, "package.json");
  const troubleshootingDocs = [
    path.join(rootDir, "docs/public/en/getting-started/06-lite-troubleshooting-and-feedback.md"),
    path.join(rootDir, "docs/public/zh/getting-started/06-lite-troubleshooting-and-feedback.md"),
  ];

  const issueTemplateExists = await fileExists(issueTemplatePath);
  const issueConfigExists = await fileExists(issueConfigPath);
  const issueTemplateRaw = issueTemplateExists ? await fs.readFile(issueTemplatePath, "utf8") : "";
  const issueConfigRaw = issueConfigExists ? await fs.readFile(issueConfigPath, "utf8") : "";
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
  const scripts = packageJson.scripts ?? {};
  const troubleshootingDocsRaw = await Promise.all(
    troubleshootingDocs.map(async (file) => {
      try {
        return await fs.readFile(file, "utf8");
      } catch {
        return "";
      }
    }),
  );

  const templateLabels = REQUIRED_TEMPLATE_LABELS.every((label) => issueTemplateRaw.includes(`- ${label}`));
  const templateFields = REQUIRED_TEMPLATE_FIELDS.every((field) => issueTemplateRaw.includes(`id: ${field}`));
  const configMarkers = REQUIRED_CONFIG_MARKERS.every((marker) => issueConfigRaw.includes(marker));
  const troubleshootingMarkers = troubleshootingDocsRaw.every((raw) =>
    REQUIRED_DOC_MARKERS.every((marker) => raw.includes(marker)),
  );

  const gates = {
    lite_dogfood_script_present: Boolean(scripts["lite:dogfood"]),
    lite_feedback_issue_template_present: issueTemplateExists,
    lite_feedback_template_labels_present: templateLabels,
    lite_feedback_template_fields_present: templateFields,
    lite_feedback_issue_config_present: issueConfigExists,
    lite_feedback_issue_config_markers_present: configMarkers,
    lite_troubleshooting_docs_present: troubleshootingDocsRaw.every(Boolean),
    lite_troubleshooting_docs_feedback_markers_present: troubleshootingMarkers,
  };

  const ok = Object.values(gates).every(Boolean);
  const failingGates = Object.entries(gates).filter(([, value]) => !value).map(([key]) => key);

  const json = {
    generated_at: generatedAt,
    ok,
    gates,
    failing_gates: failingGates,
    issue_template_path: issueTemplatePath,
    issue_config_path: issueConfigPath,
    troubleshooting_docs: troubleshootingDocs,
  };

  const rows = [
    ["Gate", "Status"],
    ...Object.entries(gates).map(([name, value]) => [name, value ? "pass" : "fail"]),
  ];

  const recommendations: string[] = [];
  if (!gates.lite_feedback_issue_template_present) {
    recommendations.push("Restore the Lite beta feedback issue template so public beta reports stay structured.");
  }
  if (!gates.lite_feedback_issue_config_present || !gates.lite_feedback_issue_config_markers_present) {
    recommendations.push("Keep ISSUE_TEMPLATE config present with links to the Lite boundary and troubleshooting docs.");
  }
  if (!gates.lite_troubleshooting_docs_feedback_markers_present) {
    recommendations.push("Keep EN/ZH troubleshooting docs explicit about Lite Beta Feedback, lite:dogfood, /health, memory_lane, and X-Admin-Token.");
  }

  const md = `# Lite Feedback Gate

Date: \`${generatedAt.slice(0, 10)}\`  
Status: \`${ok ? "passing" : "failing"}\`

## Purpose

This gate checks whether Lite public beta feedback intake is still operational and discoverable.

It does not judge kernel capability.

It judges whether users can reach the right docs, file structured feedback, and arrive with enough operator context for triage.

## Current Result

${mdTable(rows)}

## Artifact Inputs

1. \`${issueTemplatePath}\`
2. \`${issueConfigPath}\`
3. \`${troubleshootingDocs[0]}\`
4. \`${troubleshootingDocs[1]}\`

## Recommendations

${recommendations.length ? recommendations.map((line, idx) => `${idx + 1}. ${line}`).join("\n") : "1. No action required. Feedback intake surface is intact."}
`;

  await fs.writeFile(outputJson, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  await fs.writeFile(output, md, "utf8");

  if (!ok) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
