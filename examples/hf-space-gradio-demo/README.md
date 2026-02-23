---
title: Aionis Demo Panel
emoji: 🧠
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Aionis HF Space Demo (Docker + Gradio)

This template runs:

1. Aionis standalone API internally on `127.0.0.1:3001`
2. A Gradio demo panel on external Space port `7860`

## Files to copy to your HF Space repo root

1. `Dockerfile`
2. `entrypoint.sh`
3. `app.py`
4. `requirements.txt`
5. `README.md` (this file)

## Optional Space Variables / Secrets

Default mode uses fake embeddings and no auth, which is fine for demos.

Optional runtime env vars:

1. `APP_ENV=dev`
2. `MEMORY_AUTH_MODE=off`
3. `EMBEDDING_PROVIDER=fake`
4. `MEMORY_SCOPE=demo`
5. `MEMORY_TENANT_ID=default`
6. `CORS_ALLOW_ORIGINS=*`

For real embedding demo:

1. `EMBEDDING_PROVIDER=minimax`
2. `MINIMAX_API_KEY` (Secret)
3. `MINIMAX_GROUP_ID`
4. `MINIMAX_EMBED_MODEL=embo-01`

## Validate after deploy

1. Open Space URL and ensure Gradio UI loads.
2. Health tab should return `ok=true`.
3. Run `write` then `recall_text` using same `scope`.
