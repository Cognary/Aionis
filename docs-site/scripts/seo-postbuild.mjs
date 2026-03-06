import fs from 'node:fs'
import path from 'node:path'

const siteOrigin = (process.env.DOCS_SITE_ORIGIN || 'https://doc.aionisos.com').replace(/\/+$/, '')
const rawBasePath = process.env.DOCS_SITE_BASE_PATH || '/'
const normalizedBasePath = rawBasePath.replace(/^\/+|\/+$/g, '')
const siteBasePath = normalizedBasePath ? `/${normalizedBasePath}/` : '/'
const siteBaseWithoutTrailingSlash = siteBasePath === '/' ? '' : siteBasePath.slice(0, -1)
const distDir = path.resolve(process.cwd(), 'docs/.vitepress/dist')
const sitemapPath = path.join(distDir, 'sitemap.xml')
const robotsPath = path.join(distDir, 'robots.txt')

function withDocsBase(pathname) {
  let value = pathname || '/'
  if (!value.startsWith('/')) value = `/${value}`

  if (siteBaseWithoutTrailingSlash) {
    const hasBase =
      value === siteBaseWithoutTrailingSlash || value.startsWith(`${siteBaseWithoutTrailingSlash}/`)
    if (!hasBase) {
      value = value === '/' ? siteBasePath : `${siteBaseWithoutTrailingSlash}${value}`
    }
  }

  return value.replace(/\/{2,}/g, '/')
}

if (fs.existsSync(sitemapPath)) {
  const xml = fs.readFileSync(sitemapPath, 'utf8')
  const rewrittenXml = xml.replace(/<loc>([^<]+)<\/loc>/g, (_match, loc) => {
    let pathname = '/'
    try {
      const parsed = new URL(loc)
      pathname = parsed.pathname || '/'
    } catch {
      pathname = loc
    }

    const nextLoc = `${siteOrigin}${withDocsBase(pathname)}`
    return `<loc>${nextLoc}</loc>`
  })

  fs.writeFileSync(sitemapPath, rewrittenXml)
}

const sitemapUrl = `${siteOrigin}${siteBasePath}sitemap.xml`
const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`

fs.writeFileSync(robotsPath, robotsTxt)
