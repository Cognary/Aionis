import { defineConfig } from 'vitepress'

const siteOrigin = (process.env.DOCS_SITE_ORIGIN || 'https://doc.aionisos.com').replace(/\/+$/, '')
const rawBasePath = process.env.DOCS_SITE_BASE_PATH || '/'
const normalizedBasePath = rawBasePath.replace(/^\/+|\/+$/g, '')
const siteBasePath = normalizedBasePath ? `/${normalizedBasePath}/` : '/'
const siteBaseWithoutTrailingSlash = siteBasePath === '/' ? '' : siteBasePath.slice(0, -1)
const siteUrl = `${siteOrigin}${siteBasePath === '/' ? '' : siteBasePath.slice(0, -1)}`
const defaultDescription = 'Execution memory for agents that continue work instead of rediscovering it'
const defaultSocialImage = `${siteOrigin}${siteBasePath}og-image.svg`
const blogSiteUrl = (process.env.BLOG_SITE_ORIGIN || 'https://blog.aionisos.com').replace(/\/+$/, '')
const pageDescriptionOverrides: Record<string, string> = {
  '/': 'Execution memory for agents that continue work instead of rediscovering it.',
  '/guide/overview': 'Understand why Aionis exists, how it preserves execution continuity, and when to use Lite or Server.',
  '/guide/quickstart': 'Try Aionis quickly with Lite or Server and validate write, recall, and replayable identifiers.',
  '/guide/choose-lite-or-server': 'Choose Lite for the fastest local path or Server for the self-hosted production path.',
  '/guide/lite-public-beta': 'Run Aionis Lite as a local SQLite-backed public beta with clear boundaries and troubleshooting.',
  '/guide/evidence': 'See the public evidence behind continuity, token reduction, replay, and Lite public beta readiness.',
  '/guide/core-concepts': 'Learn the core concepts behind events, memory lanes, replay execution, and decision provenance.',
  '/guide/memory-policy-loop': 'Implement the memory-policy-action loop with replayability and operational guardrails.',
  '/guide/api-guide': 'Integrate Aionis through REST APIs for memory write, recall, policy, and replay operations.',
  '/guide/sdk-guide': 'Use Aionis SDK patterns for production agent workflows and integration ergonomics.',
  '/guide/integrations': 'Connect Aionis to common agent frameworks, tooling stacks, and platform integrations.',
  '/guide/codex-local-profile': 'Run Codex with Aionis Lite or the tracked standalone profile and keep execution continuity across sessions.',
  '/guide/operations-and-gates': 'Operate Aionis reliably with policy gates, incident debugging, and replay diagnostics.',
  '/guide/deploy': 'Deploy Aionis in production with environment setup, rollout strategy, and reliability controls.',
  '/guide/troubleshooting': 'Diagnose and fix common Aionis integration and runtime issues quickly.',
  '/guide/tutorials/feature-bundles': 'Apply copy-ready Aionis feature bundles for conservative local use, experiments, shared environments, and approved high-risk windows.',
  '/api': 'Aionis API reference for memory, policy loop, replay, and sandbox endpoints.',
  '/operations': 'Operations handbook for Aionis go-live, monitoring, incident response, and runbooks.',
  '/reference': 'Reference docs for configuration, security, FAQ, changelog, and roadmap.'
}

function buildCanonicalPath(relativePath: string): string {
  if (!relativePath || relativePath === 'index.md') return '/'

  let path = relativePath
    .replace(/(^|\/)index\.md$/, '$1')
    .replace(/\.md$/, '')

  if (!path.startsWith('/')) path = `/${path}`
  if (!path.endsWith('/')) path = `${path}/`
  return path.replace(/\/{2,}/g, '/')
}

export default defineConfig({
  title: 'Aionis Docs',
  description: defaultDescription,
  lang: 'en-US',
  base: siteBasePath,
  cleanUrls: true,
  sitemap: {
    hostname: siteOrigin,
    transformItems(items) {
      if (!siteBaseWithoutTrailingSlash) return items

      return items.map((item) => {
        let url = item.url
        if (!url.startsWith('/')) url = `/${url}`

        const hasBasePrefix =
          url === siteBaseWithoutTrailingSlash || url.startsWith(`${siteBaseWithoutTrailingSlash}/`)

        if (!hasBasePrefix) {
          url = url === '/' ? siteBasePath : `${siteBaseWithoutTrailingSlash}${url}`
        }

        return { ...item, url }
      })
    }
  },
  head: [
    ['meta', { name: 'application-name', content: 'Aionis Docs' }],
    ['meta', { name: 'apple-mobile-web-app-title', content: 'Aionis Docs' }],
    ['meta', { name: 'theme-color', content: '#18e299' }],
    ['meta', { name: 'keywords', content: 'Aionis, AI agents, execution memory, Lite, replay infrastructure, replay execution, policy loop, developer docs' }],
    ['meta', { name: 'robots', content: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1' }],
    ['meta', { property: 'og:site_name', content: 'Aionis Docs' }],
    ['meta', { property: 'og:locale', content: 'en_US' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:image', content: defaultSocialImage }],
    ['meta', { property: 'og:image:alt', content: 'Aionis Docs - Execution memory for agents that continue work instead of rediscovering it' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: defaultSocialImage }],
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Aionis Docs',
      url: siteUrl,
      description: defaultDescription,
      inLanguage: 'en-US'
    })]
  ],
  transformHead({ pageData }) {
    const canonicalPath = buildCanonicalPath(pageData.relativePath)
    const canonicalBase = siteBaseWithoutTrailingSlash
    const canonicalUrl =
      canonicalPath === '/'
        ? `${siteOrigin}${siteBasePath}`
        : `${siteOrigin}${canonicalBase}${canonicalPath}`
    const pageTitle = pageData.title ? `${pageData.title} | Aionis Docs` : 'Aionis Docs'
    const normalizedPathForDescription = canonicalPath === '/' ? '/' : canonicalPath.replace(/\/$/, '')
    const rawPageDescription = typeof pageData.description === 'string' ? pageData.description.trim() : ''
    const hasSpecificPageDescription = rawPageDescription.length > 0 && rawPageDescription !== defaultDescription
    const pageDescription = hasSpecificPageDescription
      ? rawPageDescription
      : pageDescriptionOverrides[normalizedPathForDescription] || defaultDescription
    const pageType = canonicalPath === '/' ? 'website' : 'article'

    return [
      ['link', { rel: 'canonical', href: canonicalUrl }],
      ['meta', { property: 'og:url', content: canonicalUrl }],
      ['meta', { property: 'og:type', content: pageType }],
      ['meta', { property: 'og:title', content: pageTitle }],
      ['meta', { property: 'og:description', content: pageDescription }],
      ['meta', { name: 'twitter:title', content: pageTitle }],
      ['meta', { name: 'twitter:description', content: pageDescription }],
      ['meta', { name: 'description', content: pageDescription }]
    ]
  },
  markdown: {
    config(md) {
      const originalFence = md.renderer.rules.fence
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        if (token.info.trim() === 'mermaid') {
          const escaped = md.utils.escapeHtml(token.content)
          return `<div class="vp-mermaid"><pre class="mermaid">${escaped}</pre></div>`
        }
        return originalFence ? originalFence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
      }
    }
  },
  themeConfig: {
    outline: {
      level: [2, 3],
      label: 'On this page'
    },
    search: {
      provider: 'local'
    },
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Try Lite', link: '/guide/lite-public-beta' },
      { text: 'Choose Lite or Server', link: '/guide/choose-lite-or-server' },
      { text: 'See the Evidence', link: '/guide/evidence' },
      { text: 'Use with Codex', link: '/guide/codex-local-profile' },
      { text: 'Blog', link: blogSiteUrl },
      {
        text: 'Docs',
        items: [
          { text: 'Overview', link: '/guide/overview' },
          { text: 'Quickstart', link: '/guide/quickstart' },
          { text: 'API Reference', link: '/api/' },
          { text: 'Operations', link: '/operations/' },
          { text: 'Reference', link: '/reference/' }
        ]
      },
      { text: 'GitHub', link: 'https://github.com/Cognary/Aionis' }
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Start Here',
          collapsed: false,
          items: [
            { text: 'Home', link: '/' },
            { text: 'Overview', link: '/guide/overview' },
            { text: 'Choose Lite or Server', link: '/guide/choose-lite-or-server' },
            { text: 'Lite Public Beta', link: '/guide/lite-public-beta' },
            { text: 'Evidence', link: '/guide/evidence' },
            { text: 'Quickstart', link: '/guide/quickstart' },
            { text: 'Role-based Paths', link: '/guide/role-based-paths' }
          ]
        },
        {
          text: 'Build and Integrate',
          collapsed: false,
          items: [
            { text: 'Codex + Aionis', link: '/guide/codex-local-profile' },
            { text: 'Integrations', link: '/guide/integrations' },
            { text: 'API Guide', link: '/guide/api-guide' },
            { text: 'SDK Guide', link: '/guide/sdk-guide' },
            { text: 'Core Concepts', link: '/guide/core-concepts' },
            { text: 'Memory and Policy Loop', link: '/guide/memory-policy-loop' },
            { text: 'Tutorials', link: '/guide/tutorials/' }
          ]
        },
        {
          text: 'Operate Server',
          collapsed: false,
          items: [
            { text: 'Operations and Gates', link: '/guide/operations-and-gates' },
            { text: 'Deploy', link: '/guide/deploy' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' }
          ]
        },
        {
          text: 'Tutorials',
          collapsed: true,
          items: [
            { text: 'Tutorials Overview', link: '/guide/tutorials/' },
            { text: 'Environment Template', link: '/guide/tutorials/env-template' },
            { text: 'Feature Bundles', link: '/guide/tutorials/feature-bundles' },
            { text: 'Agent Integration', link: '/guide/tutorials/agent-integration' },
            { text: 'Incident Replay', link: '/guide/tutorials/incident-replay' },
            { text: 'Release Gate', link: '/guide/tutorials/release-gate' },
            { text: 'Policy Tuning', link: '/guide/tutorials/policy-tuning' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'Core APIs',
          collapsed: false,
          items: [
            { text: 'API Reference', link: '/api/' },
            { text: 'Authentication', link: '/api/authentication' },
            { text: 'Memory APIs', link: '/api/memory' },
            { text: 'Policy APIs', link: '/api/policy' },
            { text: 'Replay APIs', link: '/api/replay' },
            { text: 'Automation APIs', link: '/api/automation' },
            { text: 'Sandbox APIs', link: '/api/sandbox' },
            { text: 'Error Model', link: '/api/errors' }
          ]
        },
        {
          text: 'Endpoint Reference',
          collapsed: false,
          items: [
            { text: 'Endpoint Reference', link: '/api/endpoints/' },
            { text: 'POST /v1/memory/write', link: '/api/endpoints/write' },
            { text: 'POST /v1/memory/recall_text', link: '/api/endpoints/recall-text' },
            { text: 'POST /v1/memory/context/assemble', link: '/api/endpoints/context-assemble' },
            { text: 'POST /v1/memory/rules/evaluate', link: '/api/endpoints/rules-evaluate' },
            { text: 'POST /v1/memory/tools/select', link: '/api/endpoints/tools-select' },
            { text: 'POST /v1/memory/resolve', link: '/api/endpoints/resolve' },
            { text: 'POST /v1/memory/replay/runs/get', link: '/api/endpoints/replay-runs-get' }
          ]
        }
      ],
      '/operations/': [
        {
          text: 'Operations',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/operations/' },
            { text: 'Go-live Checklist', link: '/operations/go-live' },
            { text: 'Monitoring and SLO', link: '/operations/monitoring' },
            { text: 'Incident Response and Replay', link: '/operations/incident-response' },
            { text: 'Runbooks', link: '/operations/runbooks' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/reference/' },
            { text: 'Configuration', link: '/reference/configuration' },
            { text: 'Security', link: '/reference/security' },
            { text: 'FAQ', link: '/reference/faq' },
            { text: 'Changelog', link: '/reference/changelog' },
            { text: 'Roadmap', link: '/reference/roadmap' }
          ]
        }
      ]
    }
  }
})
