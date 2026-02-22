import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "en-US",
  site: "https://doc.aionisos.com",
  title: "Aionis Docs",
  description: "A verifiable, operable memory kernel for agent systems.",
  base: "/",
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: [
    "**/_site/**",
    "**/_layouts/**",
    "_config.yml",
    "_config.local.yml",
    "**/.vitepress/cache/**",
    "**/.vitepress/dist/**",
    "**/.DS_Store",
  ],
  head: [
    ["meta", { name: "theme-color", content: "#0f172a" }],
    ["meta", { property: "og:title", content: "Aionis Docs" }],
    ["meta", { property: "og:description", content: "Verifiable / Operable Memory Kernel documentation." }],
  ],
  themeConfig: {
    logo: "/logo.svg",
    nav: [
      { text: "Start", link: "/ONBOARDING_5MIN" },
      { text: "API & SDK", link: "/API_CONTRACT" },
      { text: "Ops", link: "/OPERATOR_RUNBOOK" },
      { text: "Narrative", link: "/NARRATIVE_CANON" },
      { text: "GitHub", link: "https://github.com/Cognary/Aionis" },
    ],
    sidebar: [
      {
        text: "Get Started",
        items: [
          { text: "Docs Home", link: "/index" },
          { text: "Docs Index", link: "/README" },
          { text: "5-Minute Onboarding", link: "/ONBOARDING_5MIN" },
          { text: "Architecture", link: "/ARCHITECTURE" },
          { text: "Open Core Boundary", link: "/OPEN_CORE_BOUNDARY" },
        ],
      },
      {
        text: "Developer Contract",
        items: [
          { text: "API Contract", link: "/API_CONTRACT" },
          { text: "SDK Guide", link: "/SDK" },
          { text: "SDK Compatibility", link: "/SDK_COMPATIBILITY_MATRIX" },
          { text: "Planner Context", link: "/PLANNER_CONTEXT" },
          { text: "Rule Lifecycle", link: "/RULE_LIFECYCLE" },
          { text: "Execution Loop Gate", link: "/EXECUTION_LOOP_GATE" },
          { text: "Policy Adaptation Gate", link: "/POLICY_ADAPTATION_GATE" },
        ],
      },
      {
        text: "Operations",
        items: [
          { text: "Operator Runbook", link: "/OPERATOR_RUNBOOK" },
          { text: "Production Core Gate", link: "/PRODUCTION_CORE_GATE" },
          { text: "E2E Regression", link: "/E2E_REGRESSION" },
          { text: "Performance Baseline", link: "/PERFORMANCE_BASELINE" },
          { text: "Recall Tail Latency Plan", link: "/RECALL_TAIL_LATENCY_PLAN" },
          { text: "Adaptive Compression Plan", link: "/ADAPTIVE_COMPRESSION_PLAN" },
          { text: "Governance Weekly Report", link: "/GOVERNANCE_WEEKLY_REPORT" },
          { text: "Docker Release", link: "/DOCKER_RELEASE" },
        ],
      },
      {
        text: "Narrative",
        items: [
          { text: "Narrative Canon", link: "/NARRATIVE_CANON" },
          { text: "Packaging Plan", link: "/PACKAGING_PLAN" },
          { text: "Release Narrative Template", link: "/RELEASE_NARRATIVE_TEMPLATE" },
          { text: "Technical Release Material", link: "/RELEASE_MATERIAL_TECHNICAL" },
          { text: "Product Release Material", link: "/RELEASE_MATERIAL_PRODUCT" },
          { text: "Business Release Material", link: "/RELEASE_MATERIAL_BUSINESS" },
        ],
      },
      {
        text: "Integrations",
        items: [
          { text: "OpenWork", link: "/OPENWORK_INTEGRATION" },
          { text: "LangGraph", link: "/LANGGRAPH_INTEGRATION" },
        ],
      },
    ],
    editLink: {
      pattern: "https://github.com/Cognary/Aionis/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    socialLinks: [{ icon: "github", link: "https://github.com/Cognary/Aionis" }],
    footer: {
      message: "Aionis Open Core Documentation",
      copyright: "Copyright © Cognary",
    },
    search: {
      provider: "local",
    },
    outline: {
      level: [2, 3],
    },
  },
});
