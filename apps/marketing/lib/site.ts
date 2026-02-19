export const siteConfig = {
  name: "Aionis",
  tagline: "Aionis is a Verifiable / Operable Memory Kernel for agents.",
  ctaPrimary: { label: "Start Personal", href: "/product/personal" },
  ctaSecondary: { label: "Talk to Enterprise", href: "/contact" },
  docsBase: process.env.NEXT_PUBLIC_DOCS_BASE ?? "https://cognary.github.io/Aionis",
  repoUrl: "https://github.com/Cognary/Aionis",
  registries: {
    npmPackage: "@aionis/sdk",
    npmVersion: process.env.NEXT_PUBLIC_AIONIS_NPM_VERSION ?? "0.1.0",
    npmUrl: "https://www.npmjs.com/package/@aionis/sdk",
    pypiPackage: "aionis-sdk",
    pypiVersion: process.env.NEXT_PUBLIC_AIONIS_PYPI_VERSION ?? "0.1.0",
    pypiUrl: "https://pypi.org/project/aionis-sdk/",
    dockerImage: process.env.NEXT_PUBLIC_AIONIS_DOCKER_IMAGE ?? "ghcr.io/cognary/aionis",
    dockerTag: process.env.NEXT_PUBLIC_AIONIS_DOCKER_TAG ?? "v0.1.1",
    dockerUrl: process.env.NEXT_PUBLIC_AIONIS_DOCKER_URL ?? "https://github.com/orgs/cognary/packages/container/package/aionis",
  },
};

const trimSlash = (value: string) => value.replace(/\/+$/g, "");

export function resolveDocsUrl(path: string) {
  const base = trimSlash(siteConfig.docsBase);
  const normalizedPath = path.replace(/^\/+/, "");
  const isGitHubRepoPath = /github\.com\/.+\/(tree|blob)\//.test(base);
  if (isGitHubRepoPath) {
    return `${base}/${normalizedPath}`;
  }
  return `${base}/${normalizedPath.replace(/\.md$/i, "")}`;
}

export const navLinks = [
  { label: "Product", href: "/product/personal" },
  { label: "Enterprise", href: "/product/enterprise" },
  { label: "Developers", href: "/developers" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
];

export const productHighlights = [
  {
    title: "Graph Memory Core",
    desc: "Write nodes and relations with commit lineage for auditable memory evolution.",
  },
  {
    title: "Recall That Ships",
    desc: "Return compact recall context text for prompt assembly, not just vector IDs.",
  },
  {
    title: "Rule-Aware Tooling",
    desc: "Apply active and shadow policies to planner/tool selection with feedback loops.",
  },
  {
    title: "Production Guardrails",
    desc: "Outbox worker, consistency checks, rate limits, and regression gates in one stack.",
  },
];

export const statHighlights = [
  { value: "3", label: "Core APIs", note: "health, write, recall_text" },
  { value: "2", label: "Published SDKs", note: "TypeScript + Python" },
  { value: "1", label: "Unified memory kernel", note: "personal now, enterprise path ready" },
  { value: "24/7", label: "Operator posture", note: "runbook + regression + health gate" },
];

export const docsLinks = [
  { label: "5-Minute Onboarding", path: "ONBOARDING_5MIN.md" },
  { label: "API Contract", path: "API_CONTRACT.md" },
  { label: "SDK Guide", path: "SDK.md" },
  { label: "Operator Runbook", path: "OPERATOR_RUNBOOK.md" },
  { label: "Performance Baseline", path: "PERFORMANCE_BASELINE.md" },
];

export const docsJourneys = [
  {
    title: "3-minute path to first memory write",
    copy: "Start with local startup, issue one write, and verify recall response.",
    steps: ["Read onboarding prerequisites", "Run Docker startup path", "Execute write + recall smoke"],
    primaryDoc: { label: "Open onboarding", path: "ONBOARDING_5MIN.md" },
  },
  {
    title: "Contract-first API integration",
    copy: "Lock request and response fields before wiring agent tools into production flows.",
    steps: ["Review API contract", "Map planner context fields", "Validate with SDK smoke"],
    primaryDoc: { label: "Open API contract", path: "API_CONTRACT.md" },
  },
  {
    title: "Production readiness checks",
    copy: "Verify health gates, consistency checks, and regression criteria prior to release.",
    steps: ["Review operator runbook", "Run E2E regression checklist", "Track baseline performance"],
    primaryDoc: { label: "Open runbook", path: "OPERATOR_RUNBOOK.md" },
  },
];

export const docsRoleTracks = [
  {
    title: "Application Engineer",
    copy: "Build agent flows quickly with onboarding and SDK references.",
    items: [
      { label: "5-Minute Onboarding", path: "ONBOARDING_5MIN.md" },
      { label: "SDK Guide", path: "SDK.md" },
      { label: "SDK Compatibility Matrix", path: "SDK_COMPATIBILITY_MATRIX.md" },
    ],
  },
  {
    title: "Platform / API Owner",
    copy: "Own API correctness, planner fields, and rule lifecycle governance.",
    items: [
      { label: "API Contract", path: "API_CONTRACT.md" },
      { label: "Planner Context", path: "PLANNER_CONTEXT.md" },
      { label: "Rule Lifecycle", path: "RULE_LIFECYCLE.md" },
    ],
  },
  {
    title: "SRE / Operations",
    copy: "Operate the service with reproducible checks and incident-ready runbooks.",
    items: [
      { label: "Operator Runbook", path: "OPERATOR_RUNBOOK.md" },
      { label: "E2E Regression", path: "E2E_REGRESSION.md" },
      { label: "Performance Baseline", path: "PERFORMANCE_BASELINE.md" },
    ],
  },
  {
    title: "Release Manager",
    copy: "Publish SDK and Docker artifacts with auditable release checklists.",
    items: [
      { label: "SDK Release", path: "SDK_RELEASE.md" },
      { label: "Docker Release", path: "DOCKER_RELEASE.md" },
      { label: "Docs Index", path: "README.md" },
    ],
  },
];

export const docsOperations = [
  {
    title: "Release runbooks",
    items: [
      { label: "SDK Release", path: "SDK_RELEASE.md" },
      { label: "Docker Release", path: "DOCKER_RELEASE.md" },
    ],
  },
  {
    title: "Quality gates",
    items: [
      { label: "E2E Regression", path: "E2E_REGRESSION.md" },
      { label: "Stability Roadmap", path: "STABILITY_ROADMAP.md" },
      { label: "Performance Baseline", path: "PERFORMANCE_BASELINE.md" },
    ],
  },
];

export const docsCatalog = [
  {
    title: "Getting Started",
    items: [
      { label: "5-Minute Onboarding", path: "ONBOARDING_5MIN.md" },
      { label: "Architecture", path: "ARCHITECTURE.md" },
      { label: "Docs Index", path: "README.md" },
    ],
  },
  {
    title: "Developer Contract",
    items: [
      { label: "API Contract", path: "API_CONTRACT.md" },
      { label: "Planner Context", path: "PLANNER_CONTEXT.md" },
      { label: "Rule Lifecycle", path: "RULE_LIFECYCLE.md" },
    ],
  },
  {
    title: "SDK and Integrations",
    items: [
      { label: "SDK Guide", path: "SDK.md" },
      { label: "SDK Compatibility Matrix", path: "SDK_COMPATIBILITY_MATRIX.md" },
      { label: "OpenWork Integration", path: "OPENWORK_INTEGRATION.md" },
      { label: "LangGraph Integration", path: "LANGGRAPH_INTEGRATION.md" },
    ],
  },
  {
    title: "Operations and Quality",
    items: [
      { label: "Operator Runbook", path: "OPERATOR_RUNBOOK.md" },
      { label: "E2E Regression", path: "E2E_REGRESSION.md" },
      { label: "Performance Baseline", path: "PERFORMANCE_BASELINE.md" },
      { label: "Stability Roadmap", path: "STABILITY_ROADMAP.md" },
    ],
  },
];
