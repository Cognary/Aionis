import Link from "next/link";
import { SectionLead } from "@/components/marketing/section-lead";

export default function EnterpriseProductPage() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Product / Enterprise</p>
        <h1>Enterprise memory architecture for production AI systems</h1>
        <p className="hero-copy">
          Enterprise onboarding focuses on governance, tenancy strategy, and operational reliability for teams running
          memory-backed agents at organizational scale.
        </p>

        <div className="chip-row">
          <span className="chip">Consultative onboarding</span>
          <span className="chip">Governance-first rollout</span>
          <span className="chip">SLO and quality gates</span>
        </div>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Capability focus"
            title="What enterprise onboarding optimizes"
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
            eyebrow="Decision checklist"
            title="Signals you should engage enterprise onboarding"
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

        <div className="hero-cta" style={{ marginTop: 26 }}>
          <Link className="btn btn-solid" href="/contact">
            Talk to Enterprise
          </Link>
          <Link className="btn btn-ghost" href="/security">
            Security and operations
          </Link>
          <Link className="btn btn-ghost" href="/pricing">
            Compare tracks
          </Link>
        </div>
      </div>
    </section>
  );
}
