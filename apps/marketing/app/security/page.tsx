import { SectionLead } from "@/components/marketing/section-lead";
import { resolveDocsUrl } from "@/lib/site";

export default function SecurityPage() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Security & Operations</p>
        <h1>Security and operations baseline for production memory</h1>
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
            eyebrow="Threat model assumptions"
            title="Default assumptions before go-live"
            copy="Plan for untrusted clients, noisy traffic, and cross-tenant isolation risk. Design controls and release gates accordingly."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Identity trust</h3>
              <p>Never rely on client-supplied identity without API key or JWT enforcement and downstream scope validation.</p>
            </article>
            <article className="card">
              <h3>Traffic trust</h3>
              <p>Assume bursty or adversarial traffic and enforce per-endpoint limits with strict loopback bypass policy.</p>
            </article>
            <article className="card">
              <h3>Data trust</h3>
              <p>Treat derived artifacts as non-authoritative; source-of-record commit chains remain the canonical audit base.</p>
            </article>
            <article className="card">
              <h3>Operational trust</h3>
              <p>Require release gates on every deploy path so correctness and safety checks are not optional.</p>
            </article>
          </div>
        </section>

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

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Operations evidence"
            title="Command set for security-aware releases"
            copy="Run these commands as a minimum operational evidence pack before promoting to production."
          />
          <pre className="code-block">{`npm run -s preflight:prod
npm run -s gate:core:prod
npm run -s job:health-gate -- --strict-warnings
npm run -s job:consistency-check:scope -- --strict-warnings`}</pre>
        </section>

        <section className="section">
          <SectionLead
            eyebrow="Runbook linkage"
            title="Source-of-truth operating guides"
            copy="Security decisions should map to documented runbooks, not tribal knowledge."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Operator runbook</h3>
              <p>Deployment, incident, and recovery procedures for day-two operations.</p>
              <a className="btn btn-ghost" href={resolveDocsUrl("OPERATOR_RUNBOOK.md")} target="_blank" rel="noreferrer">
                Open runbook
              </a>
            </article>
            <article className="card">
              <h3>Production core gate</h3>
              <p>Standardized release acceptance checks and strict warning posture.</p>
              <a className="btn btn-ghost" href={resolveDocsUrl("PRODUCTION_CORE_GATE.md")} target="_blank" rel="noreferrer">
                Open gate doc
              </a>
            </article>
          </div>
        </section>
      </div>
    </section>
  );
}
