import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { inBrowser, onContentUpdated } from 'vitepress'
import { h, nextTick } from 'vue'
import {
  CodeBrackets,
  Github,
  Globe,
  JournalPage,
  MultiplePages,
  OpenBook,
  Play,
  ShieldCheck
} from '@iconoir/vue'
import mermaid from 'mermaid'
import Tabs from './components/Tabs.vue'
import Callout from './components/Callout.vue'
import Endpoint from './components/Endpoint.vue'
import AnimatedFlow from './components/AnimatedFlow.vue'
import DragScroller from './components/DragScroller.vue'
import SiteFooter from './components/SiteFooter.vue'
import './custom.css'

let mermaidInitialized = false

async function renderMermaidDiagrams() {
  if (!inBrowser) return

  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'neutral'
    })
    mermaidInitialized = true
  }

  const nodes = Array.from(document.querySelectorAll('pre.mermaid')) as HTMLElement[]
  if (!nodes.length) return

  await mermaid.run({ nodes })
}

const theme: Theme = {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-bottom': () => h(SiteFooter)
    })
  },
  enhanceApp({ app, router }) {
    app.component('Tabs', Tabs)
    app.component('Callout', Callout)
    app.component('Endpoint', Endpoint)
    app.component('AnimatedFlow', AnimatedFlow)
    app.component('DragScroller', DragScroller)
    app.component('SiteFooter', SiteFooter)
    app.component('IoJournalPage', JournalPage)
    app.component('IoPlay', Play)
    app.component('IoCodeBrackets', CodeBrackets)
    app.component('IoOpenBook', OpenBook)
    app.component('IoShieldCheck', ShieldCheck)
    app.component('IoMultiplePages', MultiplePages)
    app.component('IoGithub', Github)
    app.component('IoGlobe', Globe)

    if (inBrowser) {
      const rerender = async () => {
        await nextTick()
        await renderMermaidDiagrams()
      }

      router.onAfterRouteChange = rerender
      onContentUpdated(rerender)
      void rerender()
    }
  }
}

export default theme
