import { createOpenClawSkillFromEnv } from "../integrations/openclaw-skill.js";
import { AionisApiError } from "../sdk/types.js";

function splitCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function firstNonEmpty(...vals: Array<string | undefined>): string | undefined {
  for (const v of vals) {
    if (typeof v === "string") {
      const s = v.trim();
      if (s.length > 0) return s;
    }
  }
  return undefined;
}

async function main(): Promise<number> {
  const skill = createOpenClawSkillFromEnv(process.env);
  const project = firstNonEmpty(process.env.OPENCLAW_PROJECT, process.env.OPENWORK_PROJECT, "demo")!;
  const runId = `oc_run_${Date.now()}`;
  const candidateTools = splitCsv(process.env.OPENCLAW_CANDIDATE_TOOLS).length
    ? splitCsv(process.env.OPENCLAW_CANDIDATE_TOOLS)
    : ["search_docs", "call_crm", "send_email"];

  const plannerContext = {
    intent: "route_customer_followup",
    run: { id: runId },
    agent: {
      id: firstNonEmpty(process.env.AIONIS_AGENT_ID, process.env.AGENT_ID, "clawbot"),
      team_id: firstNonEmpty(process.env.AIONIS_TEAM_ID, process.env.TEAM_ID, "default"),
    },
    customer: {
      id: "cust_demo_01",
      preference: "email",
      urgency: "normal",
    },
  };

  try {
    const write = await skill.write({
      project,
      run_id: runId,
      kind: "event",
      text: "Customer prefers email follow-up and asks for pricing sheet.",
      metadata: { source: "openclaw_smoke", stage: "ingest" },
    });

    let context:
      | {
          ok: true;
          merged_text_chars: number;
          layer_order: string[];
          selected_tool: string | null;
          request_id: string | null;
        }
      | { ok: false; reason: string };

    try {
      const contextOut = await skill.context({
        project,
        run_id: runId,
        query_text: "How should I follow up with this customer?",
        budget: "normal",
        context: plannerContext,
        include_shadow: true,
        tool_candidates: candidateTools,
        tool_strict: false,
      });
      context = {
        ok: true,
        merged_text_chars: contextOut.merged_text.length,
        layer_order: contextOut.layer_order,
        selected_tool: contextOut.selected_tool,
        request_id: contextOut.request_id,
      };
    } catch (err) {
      if (err instanceof AionisApiError && err.code === "no_embedding_provider") {
        context = { ok: false, reason: "no_embedding_provider" };
      } else if (err instanceof AionisApiError && err.status === 404 && /context\/assemble/i.test(err.message)) {
        context = { ok: false, reason: "context_assemble_unavailable" };
      } else {
        throw err;
      }
    }

    const policy = await skill.policy({
      project,
      run_id: runId,
      mode: "tools_select",
      context: plannerContext,
      candidate_tools: candidateTools,
      include_shadow: true,
      strict: false,
    });

    const selectedTool = policy.selected_tool ?? candidateTools[0];
    const feedback = await skill.feedback({
      project,
      run_id: runId,
      decision_id: policy.decision_id ?? undefined,
      decision_uri: policy.decision_uri ?? undefined,
      outcome: "positive",
      context: plannerContext,
      candidate_tools: candidateTools,
      selected_tool: selectedTool,
      target: "tool",
      input_text: `openclaw smoke accepted tool ${selectedTool}`,
    });

    const out = {
      ok: true,
      integration: "openclaw_skill",
      project,
      run_id: runId,
      steps: {
        write: {
          request_id: write.request_id,
          scope: write.scope,
          commit_id: write.commit.id,
          node_id: write.node.id,
        },
        context,
        policy: {
          request_id: policy.request_id,
          selected_tool: policy.selected_tool,
          decision_id: policy.decision_id,
          decision_uri: policy.decision_uri,
          matched_rules: policy.matched_rules,
        },
        feedback: {
          request_id: feedback.request_id,
          updated_rules: feedback.updated_rules,
          decision_link_mode: feedback.decision_link_mode,
          commit_id: feedback.commit_id,
        },
      },
    };

    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return 0;
  } catch (err) {
    if (err instanceof AionisApiError) {
      process.stderr.write(
        `${JSON.stringify(
          {
            ok: false,
            error: err.code,
            status: err.status,
            request_id: err.request_id,
            message: err.message,
            details: err.details,
            issues: err.issues,
          },
          null,
          2,
        )}\n`,
      );
      return 1;
    }

    const e = err as Error;
    process.stderr.write(
      `${JSON.stringify(
        {
          ok: false,
          error: e?.name ?? "Error",
          message: e?.message ?? String(err),
        },
        null,
        2,
      )}\n`,
    );
    return 1;
  }
}

main().then((code) => {
  process.exitCode = code;
});
