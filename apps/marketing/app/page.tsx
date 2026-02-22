import Link from "next/link";
import { CtaBand } from "@/components/marketing/cta-band";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { Hero } from "@/components/marketing/hero";
import { SectionLead } from "@/components/marketing/section-lead";
import { StatStrip } from "@/components/marketing/stat-strip";
import { analyticsEvents } from "@/lib/analytics";
import { siteConfig } from "@/lib/site";

export default function HomePage() {
  const registries = siteConfig.registries;

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
              copy="Use the OSS path to run write -> recall_text without custom orchestration. Keep your focus on agent value, not memory plumbing."
            />
            <div className="chip-row">
              <span className="chip">Single command startup</span>
              <span className="chip">Deterministic smoke flow</span>
              <span className="chip">LLM-ready recall context</span>
            </div>
            <pre className="code-block">{`git clone https://github.com/Cognary/Aionis
cd Aionis
make quickstart`}</pre>
            <div className="hero-cta" style={{ marginTop: 24 }}>
              <Link className="btn btn-ghost" href="/playground" data-analytics-event={analyticsEvents.CTA_OPEN_PLAYGROUND_CLICK}>
                Open Playground
              </Link>
            </div>
          </div>

          <div className="card">
            <SectionLead
              eyebrow="Open deployment model"
              title="Public OSS lane + managed Cloud lane"
              copy="OSS is open now for immediate shipping. Cloud focuses on governance depth, rollout controls, and organizational adoption."
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
                  <td>OSS</td>
                  <td>Self-serve</td>
                  <td>Fast time-to-value</td>
                </tr>
                <tr>
                  <td>Cloud</td>
                  <td>Sales-led</td>
                  <td>Production governance</td>
                </tr>
              </tbody>
            </table>
            <div className="hero-cta" style={{ marginTop: 32 }}>
              <Link className="btn btn-solid" href="/product/personal" data-analytics-event={analyticsEvents.CTA_START_OSS_CLICK}>
                Start OSS
              </Link>
              <Link className="btn btn-ghost" href="/contact" data-analytics-event={analyticsEvents.CTA_TALK_TO_SALES_CLICK}>
                Talk to Sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionLead
            eyebrow="Problem"
            title="Why memory systems fail in production"
            copy="Most teams can demo retrieval, but struggle to keep memory auditable, available, and controllable under real traffic."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Audit gaps</h3>
              <p>Vector-only flows make it hard to trace what was written, when it changed, and why a recall result appeared.</p>
            </article>
            <article className="card">
              <h3>Operational coupling</h3>
              <p>When embedding pipelines fail, write paths often degrade and break user-facing product behavior.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionLead
            eyebrow="Architecture principles"
            title="Three kernel pillars"
            copy="Aionis standardizes memory around Audit-first source records, Derived async processing, and Memory to Policy execution."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>Audit-first</h3>
              <p>Persist facts as nodes, edges, and commits so every change is replayable and verifiable.</p>
            </article>
            <article className="card">
              <h3>Derived async</h3>
              <p>Outbox workers handle embedding backfill and derivation jobs without blocking write availability.</p>
            </article>
            <article className="card">
              <h3>Memory -&gt; Policy</h3>
              <p>Rules and feedback flows convert memory into actionable planner and tool-routing policy.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionLead
            eyebrow="Operating model"
            title="Three-layer release motion"
            copy="Aionis ships one consistent model: OSS for kernel standards, Cloud for revenue and governance depth, and Platform for execution-memory control."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>Layer 1: OSS Kernel</h3>
              <p>Open commit-chain, graph memory, recall, and baseline rules to drive adoption and standards.</p>
            </article>
            <article className="card">
              <h3>Layer 2: Cloud</h3>
              <p>Managed tenancy, reliability, governance, and compliance controls for production teams.</p>
            </article>
            <article className="card">
              <h3>Layer 3: Platform</h3>
              <p>Execution-memory substrate for policy-governed multi-agent operations and verifiable execution history.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionLead
            eyebrow="Evidence"
            title="Signals you can verify now"
            copy="Aionis release quality is backed by reproducible checks, public artifacts, and operator runbooks."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Production checks</h3>
              <ul className="list">
                <li>Contract smoke and docs checks</li>
                <li>Health gate and consistency-check sets</li>
                <li>Regression scripts for release validation</li>
              </ul>
            </article>
            <article className="card">
              <h3>Published artifacts</h3>
              <ul className="list">
                <li>{registries.npmPackage}@{registries.npmVersion}</li>
                <li>{registries.pypiPackage}=={registries.pypiVersion}</li>
                <li>{registries.dockerImage}:{registries.dockerTag}</li>
              </ul>
            </article>
          </div>
          <pre className="code-block">{`npm run -s test:contract
npm run -s docs:check
npm run -s job:health-gate -- --strict-warnings
npm run -s job:consistency-check:scope -- --strict-warnings`}</pre>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionLead
            eyebrow="Boundaries"
            title="What Aionis is and is not"
            copy="Aionis is memory infrastructure for agents. It is not an app orchestrator and it does not replace product-level evaluation design."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Kernel scope</h3>
              <p>Use Aionis for durable memory writes, recall context, and policy execution surfaces.</p>
            </article>
            <article className="card">
              <h3>Application scope</h3>
              <p>Product teams still define prompts, business metrics, and user experience logic on top.</p>
            </article>
          </div>
        </div>
      </section>

      <CtaBand
        title="Build product value with technical confidence"
        copy="Start fast on OSS, scale to Cloud with the same kernel, then extend toward Platform capabilities."
        primary={{ label: "Start OSS", href: "/product/personal", event: analyticsEvents.CTA_START_OSS_CLICK }}
        secondary={{ label: "See Cloud", href: "/product/enterprise", event: analyticsEvents.CTA_START_CLOUD_CLICK }}
      />
    </>
  );
}
