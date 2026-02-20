import Link from "next/link";
import { SectionLead } from "@/components/marketing/section-lead";
import { analyticsEvents } from "@/lib/analytics";
import { resolveDocsUrl } from "@/lib/site";

export default function EnterpriseProductPage() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Product / Cloud</p>
        <h1>Cloud and Enterprise memory architecture for production AI systems</h1>
        <p className="hero-copy">
          Cloud onboarding focuses on governance, tenancy strategy, and operational reliability for teams running
          memory-backed agents at organizational scale.
        </p>

        <div className="chip-row">
          <span className="chip">Managed rollout</span>
          <span className="chip">Governance-first rollout</span>
          <span className="chip">SLO and quality gates</span>
        </div>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Capability focus"
            title="What Cloud onboarding optimizes"
            copy="The goal is stable, auditable operation under real organizational constraints."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Identity and tenancy</h3>
              <ul className="list">
                <li>Tenant/agent/team identity mapping</li>
                <li>Lane visibility policies (shared/private)</li>
                <li>Cross-tenant safety checks</li>
              </ul>
            </article>
            <article className="card">
              <h3>Policy and control plane</h3>
              <ul className="list">
                <li>Rule lifecycle governance (draft/shadow/active)</li>
                <li>Conflict handling and feedback loops</li>
                <li>Planner/tool routing guardrails</li>
              </ul>
            </article>
            <article className="card">
              <h3>Reliability and operations</h3>
              <ul className="list">
                <li>Health gate and consistency pipelines</li>
                <li>Rate limiting and quota strategy</li>
                <li>Regression and release gates</li>
              </ul>
            </article>
            <article className="card">
              <h3>Performance and rollout</h3>
              <ul className="list">
                <li>SLO baseline and perf matrix</li>
                <li>Cutover and rollback playbooks</li>
                <li>Progressive rollout by scope</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Architecture commitments"
            title="Cloud and Enterprise implementation principles"
            copy="Cloud and Enterprise engagements keep the kernel model fixed: audit-first writes, async derivation pipelines, and memory-driven policy control."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>Audit-first</h3>
              <p>Change history is traceable through commits, scope constraints, and replayable write lineage.</p>
            </article>
            <article className="card">
              <h3>Derived async</h3>
              <p>Embedding and derivation jobs are isolated from critical write paths and managed with retry/dead-letter controls.</p>
            </article>
            <article className="card">
              <h3>Memory -&gt; Policy</h3>
              <p>Rules and feedback connect memory to planner and tool decisions with explicit governance states.</p>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Engagement model"
            title="Typical implementation phases"
            copy="A practical sequence for teams moving from evaluation to production."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>Phase 1: Fit</h3>
              <p>Clarify use case boundaries, data sensitivity, and integration points.</p>
            </article>
            <article className="card">
              <h3>Phase 2: Pilot</h3>
              <p>Deploy controlled scope, validate recall quality and operational metrics.</p>
            </article>
            <article className="card">
              <h3>Phase 3: Production</h3>
              <p>Finalize policies, rollout strategy, and runbook ownership across teams.</p>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Release governance"
            title="Cloud release evidence baseline"
            copy="Production promotion requires hard evidence from contract, quality, and operational checks."
          />
          <pre className="code-block">{`npm run -s gate:core:prod
npm run -s gtm:phase3:gatec
npm run -s job:health-gate -- --strict-warnings
npm run -s job:consistency-check:scope -- --strict-warnings`}</pre>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Decision checklist"
            title="Signals you should engage Cloud onboarding"
            copy="When these conditions appear, consultation usually accelerates and de-risks rollout."
          />
          <div className="card">
            <ul className="list">
              <li>Multiple teams or products sharing memory infrastructure</li>
              <li>Need for strict identity and governance boundaries</li>
              <li>Formal reliability targets and release controls</li>
              <li>Complex integration with existing internal systems</li>
            </ul>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Platform extension"
            title="Execution Memory Platform track"
            copy="For teams beyond managed memory operations, Aionis offers a design-partner path toward execution-memory control."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>What it adds</h3>
              <p>Memory -&gt; Planner -&gt; Execution lineage, policy memory, and verifiable execution history.</p>
            </article>
            <article className="card">
              <h3>Who should join</h3>
              <p>Organizations building multi-agent systems with strict governance and audit requirements.</p>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Reference docs"
            title="Implementation and operation sources"
            copy="Use these docs to anchor rollout design and gate criteria."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Operator runbook</h3>
              <p>Deployment standards, operational controls, and incident handling practices.</p>
              <a className="btn btn-ghost" href={resolveDocsUrl("OPERATOR_RUNBOOK.md")} target="_blank" rel="noreferrer">
                Open runbook
              </a>
            </article>
            <article className="card">
              <h3>Production gate doc</h3>
              <p>Core gate criteria and release acceptance structure for high-confidence rollouts.</p>
              <a className="btn btn-ghost" href={resolveDocsUrl("PROD_GO_LIVE_GATE.md")} target="_blank" rel="noreferrer">
                Open gate docs
              </a>
            </article>
          </div>
        </section>

        <div className="hero-cta" style={{ marginTop: 26 }}>
          <Link className="btn btn-solid" href="/contact" data-analytics-event={analyticsEvents.CTA_TALK_TO_SALES_CLICK}>
            Talk to Sales
          </Link>
          <Link className="btn btn-ghost" href="/security">
            Security and operations
          </Link>
          <Link className="btn btn-ghost" href="/pricing" data-analytics-event={analyticsEvents.CTA_START_CLOUD_CLICK}>
            Compare tracks
          </Link>
        </div>
      </div>
    </section>
  );
}
