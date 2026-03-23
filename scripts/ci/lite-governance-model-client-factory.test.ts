import test from "node:test";
import assert from "node:assert/strict";
import { buildLiteGovernanceModelClient } from "../../src/memory/governance-model-client-factory.ts";

test("lite governance model client factory returns empty client when all modes are off", () => {
  const client = buildLiteGovernanceModelClient({});
  assert.deepEqual(client, {});
});

test("lite governance model client factory can build promote_memory mock resolver", () => {
  const client = buildLiteGovernanceModelClient({
    promoteMemory: {
      mode: "mock",
    },
  });

  const review = client.reviewPromoteMemory?.({
    reviewPacket: {
      deterministic_gate: { gate_satisfied: true },
      requested_target_kind: "workflow",
      requested_target_level: "L2",
      candidate_examples: [{ workflow_signature: "wf:test" }],
    } as any,
    suppliedReviewResult: null,
  });

  assert.equal(review?.adjudication.reason, "mock model found workflow-signature evidence");
});

test("lite governance model client factory can build promote_memory builtin resolver", () => {
  const client = buildLiteGovernanceModelClient({
    promoteMemory: {
      mode: "builtin",
    },
  });

  const review = client.reviewPromoteMemory?.({
    reviewPacket: {
      deterministic_gate: { gate_satisfied: true },
      requested_target_kind: "workflow",
      requested_target_level: "L2",
      candidate_examples: [{ workflow_signature: "wf:test" }],
    } as any,
    suppliedReviewResult: null,
  });

  assert.equal(review?.adjudication.reason, "mock model found workflow-signature evidence");
});

test("lite governance model client factory can build form_pattern mock resolver", () => {
  const client = buildLiteGovernanceModelClient({
    formPattern: {
      mode: "mock",
    },
  });

  const review = client.reviewFormPattern?.({
    reviewPacket: {
      deterministic_gate: { gate_satisfied: true },
    } as any,
    suppliedReviewResult: null,
  });

  assert.equal(review?.adjudication.reason, "mock model found grouped signature evidence");
});

test("lite governance model client factory can build form_pattern builtin resolver", () => {
  const client = buildLiteGovernanceModelClient({
    formPattern: {
      mode: "builtin",
    },
  });

  const review = client.reviewFormPattern?.({
    reviewPacket: {
      deterministic_gate: { gate_satisfied: true },
    } as any,
    suppliedReviewResult: null,
  });

  assert.equal(review?.adjudication.reason, "mock model found grouped signature evidence");
});

test("lite governance model client factory can build combined mock client", () => {
  const client = buildLiteGovernanceModelClient({
    promoteMemory: {
      mode: "mock",
    },
    formPattern: {
      mode: "mock",
    },
  });

  assert.equal(typeof client.reviewPromoteMemory, "function");
  assert.equal(typeof client.reviewFormPattern, "function");
});

test("lite governance model client factory can use injected custom factory", () => {
  const client = buildLiteGovernanceModelClient({
    promoteMemory: {
      mode: "custom",
    },
  }, {
    modelClientFactory: ({ operation }) =>
      operation === "promote_memory"
        ? {
            reviewPromoteMemory: () => ({
              review_version: "promote_memory_semantic_review_v1",
              adjudication: {
                operation: "promote_memory",
                disposition: "recommend",
                target_kind: "workflow",
                target_level: "L2",
                reason: "custom factory",
                confidence: 0.99,
                strategic_value: "high",
              },
            }),
          }
        : undefined,
  });

  const review = client.reviewPromoteMemory?.({
    reviewPacket: {} as any,
    suppliedReviewResult: null,
  });

  assert.equal(review?.adjudication.reason, "custom factory");
});
