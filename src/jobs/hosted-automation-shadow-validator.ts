import "dotenv/config";

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function setDefaultFlag(flag: string, value: string) {
  if (hasFlag(flag)) return;
  process.argv.push(flag, value);
}

if (!hasFlag("--watch")) {
  process.argv.push("--watch");
}

if (!process.env.HOSTED_AUTOMATION_SHADOW_VALIDATOR_INTERVAL_MS) {
  process.env.HOSTED_AUTOMATION_SHADOW_VALIDATOR_INTERVAL_MS = "5000";
}

setDefaultFlag("--interval-ms", process.env.HOSTED_AUTOMATION_SHADOW_VALIDATOR_INTERVAL_MS);

await import("./automation-shadow-validator.js");
