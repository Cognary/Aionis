import { basename } from "node:path";

const script = basename(process.argv[1] ?? "hosted-job");

// Hosted implementation has moved to the private repository.
console.error(
  JSON.stringify(
    {
      ok: false,
      error: "hosted_feature_moved",
      job: script,
      message:
        "This hosted automation job has moved to the private repository: https://github.com/Cognary/aionis-hosted",
      next_step:
        "Run this job from the aionis-hosted repository with hosted environment and secrets.",
    },
    null,
    2,
  ),
);
process.exitCode = 1;
