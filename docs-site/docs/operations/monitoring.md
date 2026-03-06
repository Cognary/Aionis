# Monitoring and SLO

Use this page to define the minimum signals operators should watch after deployment.

## What to monitor first

If you are building dashboards for the first time, start with:

1. Health and request success rate
2. Write and recall latency
3. Policy selection success and decision linkage
4. Replay success on critical validation workflows

## Core metrics

1. Request throughput and error rate.
2. Write and recall p95 latency.
3. Policy decision coverage and feedback coverage.
4. Replay success ratio for validation runs.

## SLO starting point

Use a simple first SLO model:

1. Availability of the public API surface
2. Latency for write and recall on the primary tenant or scope
3. Error budget burn during deployment windows
4. Replay success on a small set of known-good workflows

## Alert recommendations

1. Sustained 5xx spike above release threshold.
2. Recall latency regression beyond SLO target.
3. Missing decision linkage in policy-critical flows.
4. Replay failure bursts after deployment.

## Red flags that deserve immediate investigation

1. `write` succeeds but `recall_text` quality drops sharply.
2. `tools/select` responses lose `decision_id` linkage.
3. Replay failures spike right after a deployment or rule change.
4. One tenant or scope degrades while global health remains green.

## Practical review cadence

1. Daily: health + latency + error trends.
2. Weekly: SLO trend + replay quality + governance drift.
