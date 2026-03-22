# Lite Replay Repair Review Governance Preview Plan

1. add failing repair-review route coverage for an optional governance preview
2. add response schema support for the preview surface
3. build a bounded `promote_memory` review packet inside `replayPlaybookRepairReview`
4. attach it only on approved review paths with learning projection enabled
5. run the focused replay-governed route test
6. run `npx tsc --noEmit`
7. run `npm run -s test:lite`
