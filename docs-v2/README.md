# Aionis External Docs V2

This folder is a parallel draft for a new external-facing Aionis documentation set.

It does not replace the current public docs tree and it is not wired into the existing docs site.

Goals:

1. Lead with product value before technical taxonomy.
2. Make the first 60 seconds answer "why should I care?"
3. Make the next 10 minutes answer "what does Aionis actually do?"
4. Make the next 30 minutes answer "how do I get a working integration?"
5. Keep deep reference and operations material available without making it the first thing new readers see.

Draft structure:

1. `external/en/01-why-aionis`
2. `external/en/02-what-is-aionis`
3. `external/en/03-how-to-use-aionis`
4. `external/en/04-reference-and-operations`

Supporting map:

1. `external/en/IA_MAP.md`
2. `external/en/CLAIMS_BACKING.md`

Current high-value entry points:

1. `external/en/index.md`
2. `external/en/01-why-aionis/index.md`
3. `external/en/03-how-to-use-aionis/quickstart.md`
4. `external/en/03-how-to-use-aionis/complete-flow.md`

Standalone site draft:

1. `package.json` runs VitePress directly against `external/en`
2. `external/en/.vitepress/config.ts` defines the draft nav, sidebar, and site metadata
3. `external/en/.vitepress/theme/custom.css` adds minimal landing-page styling

Run locally:

```bash
cd docs-v2
npm install
npm run dev
```
