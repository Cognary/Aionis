# Aionis Codex Token A/B Test (Click Repo)

Date: 2026-03-12  
Workspace under test: [/Volumes/ziel/click-ab-20260312](/Volumes/ziel/click-ab-20260312)  
GitHub source: [pallets/click](https://github.com/pallets/click)  
Repo revision under test: `cdab890`

## Goal

Test a larger, real repository than the earlier `/Volumes/ziel/Test` experiment and measure whether Aionis reduces cross-session continuation cost for Codex.

The question was not whether Aionis can store memory in principle, but whether a fresh Codex session can continue a real code task with fewer tokens when a precise handoff is available through Aionis.

## Task

Target issue area:

- `src/click/parser.py`
- `src/click/core.py`
- `tests/test_parser.py`
- `tests/test_options.py`

Target task:

- understand Click's optional-value parser behavior with custom prefixes
- reconstruct a concrete patch handoff
- identify the parser branch to change
- identify the regression tests to add

## Method

Two fresh second-session continuations were compared.

### Baseline: no Aionis

A fresh Codex session was started with no Aionis MCP. It was required to reconstruct the patch handoff by reading only the target project files again.

Artifact:

- [/Users/lucio/Desktop/Aionis/artifacts/ab/click_token_ab_20260312/no_aionis_resume_v3.jsonl](/Users/lucio/Desktop/Aionis/artifacts/ab/click_token_ab_20260312/no_aionis_resume_v3.jsonl)

### Treatment: with Aionis

First, an exact handoff artifact was stored once into Aionis for project scope `click-ab-20260312`. Then a fresh Codex session recovered that handoff through Aionis instead of reconstructing it from source files.

Artifacts:

- handoff store: [/Users/lucio/Desktop/Aionis/artifacts/ab/click_token_ab_20260312/with_aionis_store_handoff_exact.jsonl](/Users/lucio/Desktop/Aionis/artifacts/ab/click_token_ab_20260312/with_aionis_store_handoff_exact.jsonl)
- handoff recovery: [/Users/lucio/Desktop/Aionis/artifacts/ab/click_token_ab_20260312/with_aionis_recover_v2.jsonl](/Users/lucio/Desktop/Aionis/artifacts/ab/click_token_ab_20260312/with_aionis_recover_v2.jsonl)

Important:

- the **token comparison below is only for the second session**
- the initial handoff store is a setup cost and is reported separately

## Results

### Second-session comparison

| Mode | Input Tokens | Cached Input Tokens | Output Tokens | Total Tokens |
|---|---:|---:|---:|---:|
| No Aionis | 71,542 | 47,488 | 5,225 | 76,767 |
| With Aionis handoff recovery | 50,056 | 35,968 | 1,191 | 51,247 |

### Savings

- Input tokens reduced by `21,486` (`30.03%`)
- Cached input tokens reduced by `11,520` (`24.26%`)
- Output tokens reduced by `4,034` (`77.21%`)
- Total tokens reduced by `25,520` (`33.24%`)

## What the no-Aionis session had to do

The no-Aionis continuation had to reopen and reconstruct context from:

- [src/click/parser.py](/Volumes/ziel/click-ab-20260312/src/click/parser.py)
- [src/click/core.py](/Volumes/ziel/click-ab-20260312/src/click/core.py)
- [tests/test_parser.py](/Volumes/ziel/click-ab-20260312/tests/test_parser.py)
- [tests/test_options.py](/Volumes/ziel/click-ab-20260312/tests/test_options.py)

It had to rediscover, among other things:

- `_Option.prefixes` behavior
- `_OptionParser.add_option`
- `_OptionParser._get_value_from_state`
- the custom-prefix optional-value regression surface in tests

## What the Aionis session did instead

The Aionis continuation recovered a previously stored exact handoff artifact and got back:

- `handoff_kind = patch_handoff`
- exact parser target
- exact patch plan
- risks
- acceptance checks
- `source_uri`
- `commit_id`

Recovered via Aionis:

- `scope = click-ab-20260312`
- `commit_id = 2f146901-d4cf-59b5-a1ce-bfcc8c57eb28`

This meant the second session did not need to reread the source files to reconstruct the task skeleton.

## Interpretation

This experiment shows real value in a larger repository:

1. Aionis reduced cross-session continuation cost, not by making the model "smarter", but by avoiding repeated context reconstruction.
2. The gain is not only input-token savings. Output-token reduction was much larger because the Aionis session no longer needed to narrate a full rediscovery process.
3. The result is stronger than the earlier small-project continuity test because Click is a real multi-file OSS repository with a non-trivial parser/test surface.

## Caveat

This is not a full end-to-end "first-session total cost" test.

- The handoff store step itself cost tokens once:
  - input: `68,792`
  - output: `1,668`
- The measured savings are specifically for **subsequent continuation sessions**

That is still the right comparison for Aionis's core promise:

- reduce repeated reading
- reduce repeated explanation
- reduce repeated reasoning in later sessions

## Conclusion

For a real larger repository (`pallets/click`), Aionis reduced second-session continuation cost by about:

- `30.03%` on input tokens
- `33.24%` on total tokens

This is direct evidence that Aionis provides practical token-saving value in Codex by turning cross-session continuation from file rediscovery into artifact recovery.
