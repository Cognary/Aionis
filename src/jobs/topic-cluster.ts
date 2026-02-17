import "dotenv/config";
import { loadEnv } from "../config.js";
import { closeDb, createDb, withTx } from "../db.js";
import { findUnassignedEventIds, runTopicClusterForEventIds } from "./topicClusterLib.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

async function run() {
  const scope = env.MEMORY_SCOPE;

  const out = await withTx(db, async (client) => {
    const eventIds = await findUnassignedEventIds(client, scope, env.TOPIC_CLUSTER_BATCH_SIZE);
    if (eventIds.length === 0) {
      return {
        ok: true,
        scope,
        topic_commit_id: null,
        topic_commit_hash: null,
        processed_events: 0,
        assigned: 0,
        created_topics: 0,
        promoted: 0,
      };
    }

    const res = await runTopicClusterForEventIds(client, {
      scope,
      eventIds,
      simThreshold: env.TOPIC_SIM_THRESHOLD,
      minEventsPerTopic: env.TOPIC_MIN_EVENTS_PER_TOPIC,
      maxCandidatesPerEvent: env.TOPIC_MAX_CANDIDATES_PER_EVENT,
      maxTextLen: env.MAX_TEXT_LEN,
      piiRedaction: env.PII_REDACTION,
      strategy: env.TOPIC_CLUSTER_STRATEGY,
    });

    return { ok: true, scope, ...res };
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
}

run()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb(db);
  });
