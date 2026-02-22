import Link from "next/link";
import { docsCatalog, docsLinks, resolveDocsUrl, siteConfig } from "@/lib/site";
import { SectionLead } from "@/components/marketing/section-lead";
import { analyticsEvents } from "@/lib/analytics";

export default function DevelopersPage() {
  const registries = siteConfig.registries;

  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Developers</p>
        <h1>API-first memory kernel for production agent stacks</h1>
        <p className="hero-copy">
          Start with `health`, `write`, and `recall_text`. Expand into rule evaluation, tool selection, and feedback-driven policy.
        </p>
        <div className="hero-cta">
          <Link className="btn btn-solid" href="/playground" data-analytics-event={analyticsEvents.CTA_OPEN_PLAYGROUND_CLICK}>
            Open Playground
          </Link>
          <a
            className="btn btn-ghost"
            href={resolveDocsUrl("API_CONTRACT.md")}
            target="_blank"
            rel="noreferrer"
            data-analytics-event={analyticsEvents.DOCS_OPEN_CLICK}
          >
            Open API Contract
          </a>
        </div>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Track alignment"
            title="One API across OSS, Cloud, and Platform"
            copy="Developers integrate once on OSS and keep the same contract when teams move to Cloud and Platform tracks."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>OSS</h3>
              <p>Fast self-serve integration and local validation.</p>
            </article>
            <article className="card">
              <h3>Cloud</h3>
              <p>Managed operations with governance and reliability controls.</p>
            </article>
            <article className="card">
              <h3>Platform</h3>
              <p>Execution-memory capabilities for policy-governed agent systems.</p>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Core endpoints"
            title="The three endpoints most teams start with"
            copy="These cover service health, memory ingestion, and LLM-ready recall."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>GET /health</h3>
              <p>Runtime status and service configuration signals.</p>
            </article>
            <article className="card">
              <h3>POST /v1/memory/write</h3>
              <p>Write facts and graph relations with commit lineage.</p>
            </article>
            <article className="card">
              <h3>POST /v1/memory/recall_text</h3>
              <p>Fetch ranked context text for prompt composition.</p>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="SDK quickstart"
            title="TypeScript and Python in one contract"
            copy="Use either SDK with the same request model and response shape."
          />
          <pre className="code-block">{`npm i ${registries.npmPackage}@${registries.npmVersion}
pip install ${registries.pypiPackage}==${registries.pypiVersion}

BASE_URL="http://localhost:\${PORT:-3001}"

curl -sS "$BASE_URL/v1/memory/write" \\
  -H 'content-type: application/json' \\
  -d '{"input_text":"quickstart","nodes":[{"client_id":"evt_1","type":"event","text_summary":"hello"}]}'

curl -sS "$BASE_URL/v1/memory/recall_text" \\
  -H 'content-type: application/json' \\
  -d '{"query_text":"hello","limit":5}'`}</pre>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Production gates"
            title="Minimum checks before release"
            copy="Use these commands as a baseline engineering gate for shipping memory-backed features."
          />
          <pre className="code-block">{`npm run -s test:contract
npm run -s docs:check
npm run -s sdk:release-check
npm run -s sdk:py:release-check
npm run -s job:health-gate -- --strict-warnings
npm run -s job:consistency-check:scope -- --strict-warnings`}</pre>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="SDK and docs"
            title="Source-of-truth references"
            copy="Open the same docs used by runtime scripts and release pipelines."
          />
          <div className="grid-cards" style={{ marginTop: 16 }}>
            {docsLinks.map((item) => (
              <article key={item.path} className="card" id={item.path.replace(/\./g, "-")}>
                <h3>{item.label}</h3>
                <p>Open the source-of-truth document in the repository docs.</p>
                <a
                  className="btn btn-ghost"
                  href={resolveDocsUrl(item.path)}
                  target="_blank"
                  rel="noreferrer"
                  data-analytics-event={analyticsEvents.DOCS_OPEN_CLICK}
                >
                  Open doc
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Boundaries"
            title="What this API surface does not cover"
            copy="Aionis provides memory infrastructure primitives. Product orchestration and business-specific evaluation remain application responsibilities."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Inside scope</h3>
              <ul className="list">
                <li>Durable memory writes with commit lineage</li>
                <li>Recall context retrieval for prompt composition</li>
                <li>Rule and feedback primitives for policy execution</li>
              </ul>
            </article>
            <article className="card">
              <h3>Outside scope</h3>
              <ul className="list">
                <li>End-user app orchestration and workflow UX</li>
                <li>Provider-specific prompt optimization strategy</li>
                <li>Business metric definition for final product KPIs</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="section">
          <SectionLead
            eyebrow="Full catalog"
            title="Documentation categories"
            copy="Use these categories to navigate from onboarding to production operations."
          />
          <div className="grid-cards">
            {docsCatalog.map((group) => (
              <article key={group.title} className="card">
                <h3>{group.title}</h3>
                <ul className="list">
                  {group.items.map((item) => (
                    <li key={item.path}>
                      <a href={resolveDocsUrl(item.path)} target="_blank" rel="noreferrer">
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
