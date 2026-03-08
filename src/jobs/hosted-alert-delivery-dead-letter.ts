import "dotenv/config";

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function setDefaultFlag(flag: string, value: string) {
  if (hasFlag(flag)) return;
  process.argv.push(flag, value);
}

if (!process.env.HOSTED_ALERT_DELIVERY_REPLAY_BACKLOG) {
  process.env.HOSTED_ALERT_DELIVERY_REPLAY_BACKLOG = "dead_letter";
}

setDefaultFlag("--backlog", "dead_letter");

await import("./hosted-alert-delivery-replay.js");
