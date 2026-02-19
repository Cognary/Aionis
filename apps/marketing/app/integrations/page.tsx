import Link from "next/link";
import { SectionLead } from "@/components/marketing/section-lead";
import { resolveDocsUrl } from "@/lib/site";

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
            eyebrow="Integration pattern"
            title="Same kernel, different runtime boundaries"
            copy="All integrations map to the same core contract: write source-of-record memory, derive asynchronously, then recall under policy constraints."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Step 1: Capture</h3>
              <p>Call `write` from your runtime boundary where important state transitions happen.</p>
            </article>
            <article className="card">
              <h3>Step 2: Derive</h3>
              <p>Run outbox workers for embeddings and derived features with retry and dead-letter control.</p>
            </article>
            <article className="card">
              <h3>Step 3: Apply</h3>
              <p>Use `recall_text` and rules to influence planner and tool selection behavior.</p>
            </article>
            <article className="card">
              <h3>Step 4: Learn</h3>
              <p>Feed evaluation results back into rules and quality checks to tighten policy over releases.</p>
            </article>
          </div>
        </section>

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
            <article className="card">
              <h3>Phase 3</h3>
              <p>Enforce release gates, consistency checks, and tenant-level quota policy for stable scale.</p>
            </article>
            <article className="card">
              <h3>Phase 4</h3>
              <p>Operationalize evidence packs so product and platform teams share one deploy decision process.</p>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Reference docs"
            title="Implementation guides by adapter"
            copy="Use these runbooks as the source of truth for concrete integration details."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>OpenWork guide</h3>
              <p>Desktop workflow integration and local operator path.</p>
              <a className="btn btn-ghost" href={resolveDocsUrl("OPENWORK_INTEGRATION.md")} target="_blank" rel="noreferrer">
                Open guide
              </a>
            </article>
            <article className="card">
              <h3>LangGraph guide</h3>
              <p>Graph-runtime integration with memory context continuity.</p>
              <a className="btn btn-ghost" href={resolveDocsUrl("LANGGRAPH_INTEGRATION.md")} target="_blank" rel="noreferrer">
                Open guide
              </a>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Risk control"
            title="Operational checks for integration owners"
            copy="Integrations are only production-ready when they pass both contract and operational gates."
          />
          <pre className="code-block">{`npm run -s test:contract
npm run -s job:health-gate -- --strict-warnings
npm run -s job:consistency-check:scope -- --strict-warnings`}</pre>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Boundaries"
            title="What an integration layer should not do"
            copy="Keep runtime adapters thin. Let Aionis own memory invariants and keep orchestration logic in your application layer."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Recommended</h3>
              <p>Map domain events to memory writes and consume recall/policy outputs as stable interfaces.</p>
            </article>
            <article className="card">
              <h3>Avoid</h3>
              <p>Reimplementing memory invariants in adapter code or coupling app logic directly to internal storage details.</p>
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
