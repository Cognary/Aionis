<script setup lang="ts">
import { Github, Globe } from '@iconoir/vue'
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer-inner">
      <div class="site-footer-brand">
        <a href="/" class="site-footer-logo">Aionis Docs</a>
      </div>

      <nav class="site-footer-links" aria-label="Footer">
        <div class="site-footer-column">
          <div class="site-footer-title">Docs</div>
          <a href="/guide/overview">Overview</a>
          <a href="/guide/quickstart">Quickstart</a>
          <a href="/api/">API Reference</a>
          <a href="https://blog.aionisos.com" target="_blank" rel="noreferrer">Blog</a>
        </div>

        <div class="site-footer-column">
          <div class="site-footer-title">Operations</div>
          <a href="/operations/go-live">Go-live</a>
          <a href="/operations/incident-response">Incident Response</a>
          <a href="/reference/faq">FAQ</a>
        </div>

        <div class="site-footer-column">
          <div class="site-footer-title">Tutorials</div>
          <a href="/guide/tutorials/agent-integration">Agent Integration</a>
          <a href="/guide/tutorials/incident-replay">Incident Replay</a>
          <a href="/guide/tutorials/release-gate">Release Gate</a>
        </div>
      </nav>

      <div class="site-footer-socials">
        <a href="https://github.com/Cognary/Aionis" target="_blank" rel="noreferrer" aria-label="GitHub">
          <Github width="20" height="20" stroke-width="1.8" />
        </a>
        <a href="https://doc.aionisos.com" target="_blank" rel="noreferrer" aria-label="Website">
          <Globe width="20" height="20" stroke-width="1.8" />
        </a>
      </div>
    </div>
    <div class="site-footer-bottom">
      <span>&copy; 2026 Aionis Docs</span>
      <span>Execution memory and replay infrastructure for production AI agents</span>
    </div>
  </footer>
</template>
