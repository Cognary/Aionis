import type { Metadata } from 'next'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import 'nextra-theme-docs/style.css'
import './global.css'

export const metadata: Metadata = {
  title: {
    absolute: 'Aionis Docs',
    template: '%s | Aionis Docs'
  },
  description: 'Execution memory for agents that continue work instead of rediscovering it.'
}

const navbar = (
  <Navbar
    logo={
      <span className="site-logo">
        <span className="site-logo-mark" aria-hidden="true" />
        <span className="site-logo-wordmark">Aionis</span>
      </span>
    }
    projectLink="https://github.com/Cognary/Aionis"
  />
)

const footer = (
  <Footer>Aionis documentation for memory, handoff, replay, policy, and verified integration surfaces.</Footer>
)

export default async function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head>
        <meta name="theme-color" content="#2d4038" />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
      <body>
        <Layout
          navbar={navbar}
          footer={footer}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/Cognary/Aionis/tree/main/docs-v3-nextra/content"
          sidebar={{ autoCollapse: true, defaultMenuCollapseLevel: 1 }}
          darkMode={false}
          copyPageButton={false}
          editLink={null}
          feedback={{ content: null }}
          toc={{ title: 'On This Page', backToTop: 'Back to top' }}
          nextThemes={{ defaultTheme: 'light', forcedTheme: 'light' }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
