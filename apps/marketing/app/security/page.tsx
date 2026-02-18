import { SectionLead } from "@/components/marketing/section-lead";

export default function SecurityPage() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Security & Operations</p>
        <h1>Production baseline for memory systems</h1>
        <p className="hero-copy">
          Aionis includes controls for authentication, rate limiting, tenancy boundaries, and release quality checks.
        </p>

        <div className="grid-cards">
          <article className="card">
            <h3>Auth and identity</h3>
            <ul className="list">
              <li>`MEMORY_AUTH_MODE`: off / api_key / jwt / api_key_or_jwt</li>
              <li>Tenant-agent-team identity propagation</li>
              <li>Lane-aware visibility controls</li>
            </ul>
          </article>
          <article className="card">
            <h3>Abuse and load controls</h3>
            <ul className="list">
              <li>Endpoint-level rate limiting</li>
              <li>Debug path throttling to avoid abuse spikes</li>
              <li>Quota strategy per tenant</li>
            </ul>
          </article>
          <article className="card">
            <h3>Data consistency controls</h3>
            <ul className="list">
              <li>Consistency-check job with strict mode</li>
              <li>Health gate integration in release pipeline</li>
              <li>Outbox dead-letter and replay tooling</li>
            </ul>
          </article>
          <article className="card">
            <h3>Operational posture</h3>
            <ul className="list">
              <li>Regression one-click script</li>
              <li>Perf matrix and gate profiles</li>
              <li>Runbook for deployment and incident handling</li>
            </ul>
          </article>
        </div>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Recommended baseline"
            title="Minimum production settings"
            copy="Keep auth on, enforce loopback policy, run quality gates, and operate with explicit SLO/error budgets."
          />
          <div className="card">
            <ul className="list">
              <li>`MEMORY_AUTH_MODE=api_key` or `api_key_or_jwt`</li>
              <li>`RATE_LIMIT_BYPASS_LOOPBACK=false`</li>
              <li>`npm run job:health-gate -- --strict-warnings` in release flow</li>
              <li>Gate C with realistic `GATEC_SLO_MAX_ERROR_RATE` budget</li>
            </ul>
          </div>
        </section>
      </div>
    </section>
  );
}
