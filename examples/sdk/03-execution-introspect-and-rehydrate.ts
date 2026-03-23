import { randomUUID } from "node:crypto";
import { buildExecutionWritePayload, createExampleClient, isMain, printHeading, printJson, printStep, runExample } from "./shared.js";

async function main() {
  const aionis = createExampleClient();
  const exampleTag = randomUUID().slice(0, 8);
  const taskBrief = `Fix export failure in node tests [sdk-introspect-${exampleTag}]`;
  const scope = `sdk-example-introspect-${exampleTag}`;
  const filePath = "src/routes/export.ts";

  printHeading("Execution Introspect And Rehydrate");
  printStep("Writing two continuity events so a stable workflow anchor exists.");
  await aionis.memory.write(
    buildExecutionWritePayload({
      title: "SDK introspect export repair run one",
      inputText: "seed execution introspection example run one",
      taskBrief,
      filePath,
      scope,
    }),
  );
  await aionis.memory.write(
    buildExecutionWritePayload({
      title: "SDK introspect export repair run two",
      inputText: "seed execution introspection example run two",
      taskBrief,
      filePath,
      scope,
    }),
  );

  const introspect = await aionis.memory.executionIntrospect({
    tenant_id: "default",
    scope,
    limit: 12,
  }) as Record<string, any>;

  const matchingWorkflow = Array.isArray(introspect?.recommended_workflows)
    ? introspect.recommended_workflows.find((entry: any) => entry?.title === taskBrief)
    : null;
  const anchorId = matchingWorkflow?.anchor_id ?? introspect?.action_packet_summary?.workflow_anchor_ids?.[0] ?? null;
  if (typeof anchorId !== "string" || anchorId.length === 0) {
    throw new Error("executionIntrospect did not surface a workflow anchor id");
  }

  printJson("Execution introspection", {
    workflow_signal_summary: introspect?.workflow_signal_summary ?? null,
    matched_workflow: matchingWorkflow ?? null,
    recommended_workflows: introspect?.recommended_workflows ?? [],
    workflow_anchor_ids: introspect?.action_packet_summary?.workflow_anchor_ids ?? [],
  });

  printStep(`Rehydrating workflow anchor ${anchorId}.`);
  const rehydrated = await aionis.memory.anchors.rehydratePayload({
    tenant_id: "default",
    scope,
    anchor_id: anchorId,
    mode: "partial",
  }) as Record<string, any>;

  printJson("Rehydrated anchor payload", {
    anchor: rehydrated?.anchor ?? null,
    summary: rehydrated?.rehydrated?.summary ?? null,
    nodes: rehydrated?.rehydrated?.nodes ?? [],
    decisions: rehydrated?.rehydrated?.decisions ?? [],
  });
}

if (isMain(import.meta.url)) {
  await runExample(main);
}
