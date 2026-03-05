# Aionis Mintlify Docs

This directory contains a Mintlify-ready documentation set generated from the current VitePress docs.

## Structure

- `docs.json`: Mintlify site configuration
- `index.mdx`: homepage
- `guide/`: onboarding and implementation docs
- `api-reference/`: API docs (renamed from `api/` for Mintlify compatibility)
- `operations/`: production operations docs
- `reference/`: configuration and support docs

## Deploy to Mintlify

1. Create a Mintlify project and connect this repository.
2. In Mintlify project settings, set the docs root to this folder: `docs-mintlify`.
3. Set custom domain to `doc.aionisos.com` in Mintlify dashboard.
4. Add DNS CNAME record:
   - host: `doc`
   - value: `cname.mintlify-dns.com`
5. Push changes to trigger deployment.

## Local preview

```bash
npm i -g mint
cd docs-mintlify
mint dev
```

