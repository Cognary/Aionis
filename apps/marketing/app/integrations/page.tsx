import Link from "next/link";
import { SectionLead } from "@/components/marketing/section-lead";

export default function IntegrationsPage() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Integrations</p>
        <h1>Plug Aionis into your existing AI runtime</h1>
        <p className="hero-copy">
          Use Aionis as a memory backend while keeping your preferred orchestration stack. Integrations are API-first,
          so you can adopt incrementally.
        </p>

        <div className="grid-cards-3">
          <article className="card">
            <h3>OpenWork</h3>
            <p>Connect desktop coding and operations workflows to durable memory recall.</p>
            <p className="copy" style={{ marginTop: 10 }}>
              Best when you want memory continuity inside day-to-day dev operations.
            </p>
          </article>
          <article className="card">
            <h3>LangGraph</h3>
            <p>Persist graph-native memory context across graph executions.</p>
            <p className="copy" style={{ marginTop: 10 }}>
              Useful for multi-step planners that need cross-run context retention.
            </p>
          </article>
          <article className="card">
            <h3>MCP Tooling</h3>
            <p>Expose memory operations through model context protocol interfaces.</p>
            <p className="copy" style={{ marginTop: 10 }}>
              Fit for tool-rich agent environments that standardize on MCP.
            </p>
          </article>
        </div>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Adoption pattern"
            title="Start narrow, expand by use case"
            copy="Most teams start with write + recall_text in one flow, then add rules, quality loops, and policy-driven selection."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Phase 1</h3>
              <p>Integrate the three core endpoints in one production path.</p>
            </article>
            <article className="card">
              <h3>Phase 2</h3>
              <p>Add rule evaluation and tool selection constraints where failures are expensive.</p>
            </article>
          </div>
        </section>

        <div className="hero-cta" style={{ marginTop: 28 }}>
          <Link className="btn btn-solid" href="/developers">
            Open developer docs
          </Link>
          <Link className="btn btn-ghost" href="/contact">
            Discuss integration plan
          </Link>
        </div>
      </div>
    </section>
  );
}
