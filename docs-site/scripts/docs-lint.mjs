#!/usr/bin/env node

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const siteRoot = path.resolve(__dirname, '..')
const docsRoot = path.join(siteRoot, 'docs')
const apiSourceFile = path.resolve(siteRoot, '..', 'src', 'index.ts')

async function walkMarkdownFiles(dir) {
  const out = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      if (entry.name !== '.vitepress') continue
    }
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walkMarkdownFiles(abs)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.md')) out.push(abs)
  }
  return out
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function normalizeRoute(route) {
  if (!route || route === '/') return '/'
  const withLeading = route.startsWith('/') ? route : `/${route}`
  return withLeading.replace(/\/+$/, '') || '/'
}

function markdownPathToRoute(fileAbs) {
  const rel = toPosix(path.relative(docsRoot, fileAbs))
  if (rel === 'index.md') return '/'
  if (rel.endsWith('/index.md')) return `/${rel.slice(0, -'/index.md'.length)}/`
  return `/${rel.slice(0, -'.md'.length)}`
}

function parseMarkdownLinks(content) {
  const links = []
  const re = /\[[^\]]*\]\(([^)]+)\)/g
  let m
  while ((m = re.exec(content)) !== null) {
    const raw = m[1].trim()
    if (!raw) continue
    const target = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw.split(/\s+/)[0]
    links.push(target)
  }
  return links
}

function sanitizeLinkTarget(target) {
  return target.split('#')[0].split('?')[0]
}

function isExternalLink(target) {
  return (
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.startsWith('mailto:') ||
    target.startsWith('tel:') ||
    target.startsWith('data:')
  )
}

function resolveRelativeMarkdownTarget(fileAbs, target) {
  const baseDir = path.dirname(fileAbs)
  const abs = path.resolve(baseDir, target)
  const ext = path.extname(abs)

  const candidates = []
  if (ext === '.md') {
    candidates.push(abs)
  } else if (!ext) {
    candidates.push(`${abs}.md`, path.join(abs, 'index.md'), abs)
  } else {
    candidates.push(abs)
  }

  for (const c of candidates) {
    if (existsSync(c)) return true
  }
  return false
}

function routeExists(routeSet, target) {
  const normalized = normalizeRoute(target)
  if (routeSet.has(normalized)) return true
  if (normalized !== '/' && routeSet.has(`${normalized}/`)) return true
  return false
}

function collectDocEndpoints(content) {
  const endpoints = new Set()

  const componentRe = /<Endpoint\s+[^>]*path="(\/v1\/memory\/[^"]+)"/g
  const codeRe = /`(\/v1\/memory\/[A-Za-z0-9_/:.-]+)`/g

  let m
  while ((m = componentRe.exec(content)) !== null) {
    endpoints.add(m[1])
  }
  while ((m = codeRe.exec(content)) !== null) {
    endpoints.add(m[1])
  }

  return endpoints
}

function collectSourceEndpoints(source) {
  const endpoints = new Set()
  const routeRe = /app\.(?:get|post|put|delete|patch)\(\s*"([^"]+)"\s*,/g

  let m
  while ((m = routeRe.exec(source)) !== null) {
    const p = m[1]
    if (p.startsWith('/v1/memory/')) endpoints.add(p)
  }

  return endpoints
}

function printList(title, items) {
  if (items.length === 0) return
  console.error(`\n${title}`)
  for (const item of items) console.error(`- ${item}`)
}

async function run() {
  const mdFiles = await walkMarkdownFiles(docsRoot)

  const routes = new Set()
  for (const file of mdFiles) {
    routes.add(normalizeRoute(markdownPathToRoute(file)))
  }

  const brokenLinks = []
  const docsEndpoints = new Set()

  for (const file of mdFiles) {
    const content = await fs.readFile(file, 'utf8')

    for (const endpoint of collectDocEndpoints(content)) {
      docsEndpoints.add(endpoint)
    }

    const links = parseMarkdownLinks(content)
    for (const raw of links) {
      if (!raw || raw.startsWith('#') || isExternalLink(raw)) continue
      const target = sanitizeLinkTarget(raw)
      if (!target) continue

      if (target.startsWith('/')) {
        const ext = path.extname(target)
        if (ext === '.md') {
          const mdPath = path.join(docsRoot, target.slice(1))
          if (!existsSync(mdPath)) {
            brokenLinks.push(`${toPosix(path.relative(siteRoot, file))} -> ${target}`)
          }
          continue
        }

        if (ext && ext !== '.html') {
          const staticPath = path.join(docsRoot, target.slice(1))
          if (!existsSync(staticPath)) {
            brokenLinks.push(`${toPosix(path.relative(siteRoot, file))} -> ${target}`)
          }
          continue
        }

        if (!routeExists(routes, target)) {
          brokenLinks.push(`${toPosix(path.relative(siteRoot, file))} -> ${target}`)
        }
        continue
      }

      const ok = resolveRelativeMarkdownTarget(file, target)
      if (!ok) {
        brokenLinks.push(`${toPosix(path.relative(siteRoot, file))} -> ${target}`)
      }
    }
  }

  const srcIndex = await fs.readFile(apiSourceFile, 'utf8')
  const sourceEndpoints = collectSourceEndpoints(srcIndex)
  const invalidDocEndpoints = [...docsEndpoints].filter((ep) => !sourceEndpoints.has(ep)).sort()

  const weakGuideStructure = []
  const guideFiles = mdFiles.filter((f) => toPosix(path.relative(docsRoot, f)).startsWith('guide/'))
  for (const file of guideFiles) {
    const content = await fs.readFile(file, 'utf8')
    const hasSectionHeading = /^##\s+/m.test(content)
    const hasHeroBlock = /<div class="doc-hero"|<div class="mint-header"/.test(content)
    if (!hasSectionHeading && !hasHeroBlock) weakGuideStructure.push(toPosix(path.relative(siteRoot, file)))
  }

  const hasErrors = brokenLinks.length > 0 || invalidDocEndpoints.length > 0 || weakGuideStructure.length > 0

  if (hasErrors) {
    printList('Broken markdown links:', brokenLinks)
    printList('Documented endpoints not found in src/index.ts:', invalidDocEndpoints)
    printList('Guide pages missing section structure:', weakGuideStructure)
    process.exit(1)
  }

  console.log(
    `docs-lint passed: ${mdFiles.length} markdown files, ${docsEndpoints.size} documented /v1/memory endpoints validated, ${guideFiles.length} guide pages checked.`,
  )
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
