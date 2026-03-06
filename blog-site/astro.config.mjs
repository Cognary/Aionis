import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

const site = (process.env.BLOG_SITE_ORIGIN || 'https://blog.aionisos.com').replace(/\/+$/, '')

export default defineConfig({
  site,
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default'
    }
  }
})
