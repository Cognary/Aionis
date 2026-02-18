import Link from "next/link";
import { CtaBand } from "@/components/marketing/cta-band";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { Hero } from "@/components/marketing/hero";
import { SectionLead } from "@/components/marketing/section-lead";
import { StatStrip } from "@/components/marketing/stat-strip";

export default function HomePage() {
  return (
    <>
      <Hero />
      <StatStrip />
      <FeatureGrid />

      <section className="section">
        <div className="container two-col">
          <div className="card">
            <SectionLead
              eyebrow="3-minute path"
              title="From zero to first recall in minutes"
              copy="Use the Personal path to run write -> recall_text without custom orchestration. Keep your focus on agent value, not memory plumbing."
            />
            <div className="chip-row">
              <span className="chip">Single command startup</span>
              <span className="chip">Deterministic smoke flow</span>
              <span className="chip">LLM-ready recall context</span>
            </div>
            <pre className="code-block">{`git clone https://github.com/Cognary/Aionis
cd Aionis
make quickstart`}</pre>
          </div>

          <div className="card">
            <SectionLead
              eyebrow="Open deployment model"
              title="Public Personal lane + consultative Enterprise lane"
              copy="Personal is open now for immediate shipping. Enterprise focuses on stricter governance, rollout controls, and organizational adoption."
            />
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Track</th>
                  <th>Access</th>
                  <th>Primary outcome</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Personal</td>
                  <td>Self-serve</td>
                  <td>Fast time-to-value</td>
                </tr>
                <tr>
                  <td>Enterprise</td>
                  <td>Consultation</td>
                  <td>Production governance</td>
                </tr>
              </tbody>
            </table>
            <div className="hero-cta" style={{ marginTop: 18 }}>
              <Link className="btn btn-solid" href="/product/personal">
                Start Personal
              </Link>
              <Link className="btn btn-ghost" href="/contact">
                Contact enterprise team
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionLead
            eyebrow="How it works"
            title="Memory pipeline designed for real workloads"
            copy="Aionis separates source-of-record writes from derived artifacts, so write availability stays stable while embeddings, clustering, and policy feedback evolve asynchronously."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>1) Write</h3>
              <p>Persist facts as nodes + edges with commit lineage and idempotency controls.</p>
            </article>
            <article className="card">
              <h3>2) Derive</h3>
              <p>Outbox worker handles embedding backfill, topic derivation, and retries without blocking write API.</p>
            </article>
            <article className="card">
              <h3>3) Recall</h3>
              <p>Recall endpoint returns ranked subgraph and compact text context ready for prompt assembly.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionLead
            eyebrow="For technical buyers"
            title="What makes Aionis practical"
            copy="This is not just vector search. It is an operational memory kernel with APIs, SDKs, release artifacts, and health gates."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Engineering confidence</h3>
              <ul className="list">
                <li>TypeScript + Python SDKs published</li>
                <li>Docker image published to GHCR</li>
                <li>Regression + consistency + health gate scripts</li>
              </ul>
            </article>
            <article className="card">
              <h3>Integration flexibility</h3>
              <ul className="list">
                <li>OpenWork integration path</li>
                <li>LangGraph adapter flow</li>
                <li>MCP server mode for toolchains</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <CtaBand
        title="Start with Personal, scale with Enterprise"
        copy="Use the same memory kernel for both lanes. Keep product velocity while you harden policy, tenancy, and ops."
        primary={{ label: "Start Personal", href: "/product/personal" }}
        secondary={{ label: "See Enterprise", href: "/product/enterprise" }}
      />
    </>
  );
}
