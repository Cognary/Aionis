import { basename } from "node:path";

const script = basename(process.argv[1] ?? "hosted-job");

// Hosted implementation is maintained outside this repository.
console.error(
  JSON.stringify(
    {
      ok: false,
      error: "hosted_feature_moved",
      job: script,
      message:
        "This hosted governance job is maintained outside this repository.",
      next_step:
        "Run this job from the private aionis-cloud control-plane repository with the required environment and secrets.",
    },
    null,
    2,
  ),
);
process.exitCode = 1;
