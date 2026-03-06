# FAQ

Use this page for the recurring questions that come up during integration and operations.

## Why does write succeed but recall return weak context?

Most often `nodes` were missing in write payload or embedding configuration is not set for semantic retrieval.

## Which fields should I always log?

`request_id`, `run_id`, `decision_id`, and `commit_uri`.

## What is the minimum useful write payload?

At minimum, send explicit `tenant_id`, `scope`, and at least one recallable node in `nodes[]`. `input_text` alone is not enough if you expect later retrieval.

## Can I use Aionis without policy loop?

Yes. Start with memory APIs, then add policy APIs when execution governance is needed.

## Do I need embeddings on day one?

No. You can start with deterministic writes and basic recall flows. Add production embedding configuration when you need stronger semantic retrieval quality.

## When should I introduce replay?

As soon as you have a workflow that matters in production. Replay is most useful once you need incident debugging, release evidence, or decision provenance.

## Can I keep auth off in development?

Yes for strictly local evaluation, but turn auth on before shared staging or production. Do not let `MEMORY_AUTH_MODE=off` leak into any environment used by other people or automation.

## What is the difference between API Guide and API Reference?

Use [API Guide](/guide/api-guide) for integration strategy, auth expectations, retries, and operational behavior. Use [API Reference](/api/) when you need endpoint groups, contracts, and request or response details.

## Is sandbox production-ready?

Sandbox APIs are experimental. Gate usage with strict policy and isolated execution settings.

## Where should I start if production errors spike?

Run core gate, check request-level error patterns, then replay a failing chain end-to-end.

## Where should a new team start?

Start with [Overview](/guide/overview), then [Quickstart](/guide/quickstart), then [API Guide](/guide/api-guide) or [SDK Guide](/guide/sdk-guide) depending on your integration style.
