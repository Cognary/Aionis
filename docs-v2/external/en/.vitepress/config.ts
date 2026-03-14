import { defineConfig } from "vitepress";

const siteOrigin = (process.env.DOCS_V2_SITE_ORIGIN || "https://doc.aionisos.com").replace(/\/+$/, "");
const draftBase = process.env.DOCS_V2_BASE_PATH || "/";

export default defineConfig({
  title: "Aionis Docs",
  description: "Execution memory for agents that continue work instead of rediscovering it.",
  lang: "en-US",
  cleanUrls: true,
  base: draftBase,
  srcExclude: [
    "**/.DS_Store",
    "**/.vitepress/cache/**",
    "**/.vitepress/dist/**",
    "**/IA_MAP.md",
    "**/CLAIMS_BACKING.md",
  ],
  head: [
    ["meta", { name: "theme-color", content: "#0b1514" }],
    ["meta", { name: "robots", content: "noindex, nofollow" }],
    ["meta", { property: "og:site_name", content: "Aionis Docs" }],
    ["meta", { property: "og:title", content: "Aionis Docs" }],
    ["meta", { property: "og:description", content: "Execution memory for agents that continue work instead of rediscovering it." }],
    ["meta", { property: "og:image", content: `${siteOrigin}/og-image.svg` }],
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
  ],
  themeConfig: {
    logo: "/favicon.svg",
    nav: [
      { text: "Home", link: "/" },
      { text: "Why", link: "/01-why-aionis/" },
      { text: "What", link: "/02-what-is-aionis/" },
      { text: "How", link: "/03-how-to-use-aionis/" },
      { text: "Reference", link: "/04-reference-and-operations/" },
      { text: "GitHub", link: "https://github.com/Cognary/Aionis" },
    ],
    sidebar: {
      "/01-why-aionis/": [
        {
          text: "Why Aionis",
          items: [
            { text: "Why Aionis", link: "/01-why-aionis/" },
          ],
        },
      ],
      "/02-what-is-aionis/": [
        {
          text: "What Aionis Is",
          items: [
            { text: "Overview", link: "/02-what-is-aionis/" },
            { text: "Memory and Context", link: "/02-what-is-aionis/memory-context" },
            { text: "Handoff", link: "/02-what-is-aionis/handoff" },
            { text: "Replay", link: "/02-what-is-aionis/replay" },
            { text: "Policy", link: "/02-what-is-aionis/policy" },
            { text: "Framework-Agnostic", link: "/02-what-is-aionis/framework-agnostic" },
            { text: "Editions", link: "/02-what-is-aionis/editions" },
          ],
        },
      ],
      "/03-how-to-use-aionis/": [
        {
          text: "How To Use Aionis",
          items: [
            { text: "Overview", link: "/03-how-to-use-aionis/" },
            { text: "Quickstart", link: "/03-how-to-use-aionis/quickstart" },
            { text: "Complete Flow", link: "/03-how-to-use-aionis/complete-flow" },
            { text: "Memory and Context", link: "/03-how-to-use-aionis/memory-context" },
            { text: "Handoff", link: "/03-how-to-use-aionis/handoff" },
            { text: "Replay", link: "/03-how-to-use-aionis/replay" },
            { text: "Policy", link: "/03-how-to-use-aionis/policy" },
            { text: "SDK and HTTP", link: "/03-how-to-use-aionis/sdk-and-http" },
          ],
        },
        {
          text: "Integrations",
          items: [
            { text: "Integrations Overview", link: "/03-how-to-use-aionis/integrations" },
            { text: "Codex", link: "/03-how-to-use-aionis/codex" },
            { text: "MCP", link: "/03-how-to-use-aionis/mcp" },
            { text: "LangGraph", link: "/03-how-to-use-aionis/langgraph" },
          ],
        },
      ],
      "/04-reference-and-operations/": [
        {
          text: "Reference and Operations",
          items: [
            { text: "Overview", link: "/04-reference-and-operations/" },
            { text: "API Contract", link: "/04-reference-and-operations/api-contract" },
            { text: "Common Errors", link: "/04-reference-and-operations/common-errors" },
            { text: "Endpoint Reference", link: "/04-reference-and-operations/endpoints/" },
            { text: "Production Operations", link: "/04-reference-and-operations/production-ops" },
            { text: "Governance", link: "/04-reference-and-operations/governance" },
            { text: "Benchmarks and SLO", link: "/04-reference-and-operations/benchmarks-and-slo" },
            { text: "Verified Test Data", link: "/04-reference-and-operations/verified-test-data" },
            { text: "Verification Status", link: "/04-reference-and-operations/verification-status" },
            { text: "Memory Layers", link: "/04-reference-and-operations/memory-layers" },
          ],
        },
        {
          text: "Verified Endpoints",
          items: [
            { text: "Endpoints Overview", link: "/04-reference-and-operations/endpoints/" },
            { text: "POST /v1/memory/write", link: "/04-reference-and-operations/endpoints/write" },
            { text: "POST /v1/memory/recall_text", link: "/04-reference-and-operations/endpoints/recall-text" },
            { text: "POST /v1/memory/planning/context", link: "/04-reference-and-operations/endpoints/planning-context" },
            { text: "POST /v1/memory/context/assemble", link: "/04-reference-and-operations/endpoints/context-assemble" },
            { text: "POST /v1/memory/rules/state", link: "/04-reference-and-operations/endpoints/rules-state" },
            { text: "POST /v1/memory/rules/evaluate", link: "/04-reference-and-operations/endpoints/rules-evaluate" },
            { text: "POST /v1/memory/find", link: "/04-reference-and-operations/endpoints/find" },
            { text: "POST /v1/memory/resolve", link: "/04-reference-and-operations/endpoints/resolve" },
            { text: "POST /v1/memory/tools/select", link: "/04-reference-and-operations/endpoints/tools-select" },
            { text: "POST /v1/memory/tools/decision", link: "/04-reference-and-operations/endpoints/tools-decision" },
            { text: "POST /v1/memory/tools/run", link: "/04-reference-and-operations/endpoints/tools-run" },
            { text: "POST /v1/memory/tools/feedback", link: "/04-reference-and-operations/endpoints/tools-feedback" },
            { text: "Handoff Store and Recover", link: "/04-reference-and-operations/endpoints/handoff" },
          ],
        },
        {
          text: "Replay Reference",
          items: [
            { text: "POST /replay/runs/get", link: "/04-reference-and-operations/endpoints/replay-run-get" },
            { text: "POST /replay/playbooks/get", link: "/04-reference-and-operations/endpoints/replay-playbook-get" },
            { text: "POST /replay/playbooks/candidate", link: "/04-reference-and-operations/endpoints/replay-playbook-candidate" },
            { text: "POST /replay/playbooks/compile_from_run", link: "/04-reference-and-operations/endpoints/replay-compile-from-run" },
            { text: "POST /replay/playbooks/run", link: "/04-reference-and-operations/endpoints/replay-run" },
            { text: "POST /replay/playbooks/dispatch", link: "/04-reference-and-operations/endpoints/replay-dispatch" },
            { text: "Replay Candidate and Dispatch", link: "/04-reference-and-operations/endpoints/replay-candidate-dispatch" },
            { text: "POST /replay/playbooks/repair/review", link: "/04-reference-and-operations/endpoints/replay-repair-review" },
          ],
        },
      ],
      "/": [
        {
          text: "Start Here",
          items: [
            { text: "Home", link: "/" },
            { text: "Why Aionis", link: "/01-why-aionis/" },
            { text: "What Aionis Is", link: "/02-what-is-aionis/" },
            { text: "How To Use Aionis", link: "/03-how-to-use-aionis/" },
            { text: "Reference and Operations", link: "/04-reference-and-operations/" },
            { text: "Verification Status", link: "/04-reference-and-operations/verification-status" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/Cognary/Aionis" }],
    search: {
      provider: "local",
    },
    outline: {
      level: [2, 3],
      label: "On this page",
    },
    footer: {
      message: "External documentation for Aionis",
      copyright: "Built from current repository surfaces and verification notes.",
    },
  },
});
