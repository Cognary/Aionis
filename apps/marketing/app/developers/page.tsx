import { docsCatalog, docsLinks, resolveDocsUrl } from "@/lib/site";
import { SectionLead } from "@/components/marketing/section-lead";

export default function DevelopersPage() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Developers</p>
        <h1>Build on Aionis with API-first primitives</h1>
        <p className="hero-copy">Start with health, write, recall_text. Expand into rule evaluation and tool selection.</p>

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
            eyebrow="Quick sample"
            title="Write then recall in one flow"
            copy="This is the smallest loop that proves product value in real agent calls."
          />
          <pre className="code-block">{`curl -sS http://localhost:3001/v1/memory/write \\
  -H 'content-type: application/json' \\
  -d '{"input_text":"quickstart","nodes":[{"client_id":"evt_1","type":"event","text_summary":"hello"}]}'

curl -sS http://localhost:3001/v1/memory/recall_text \\
  -H 'content-type: application/json' \\
  -d '{"query_text":"hello","limit":5}'`}</pre>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="SDK and docs"
            title="Source-of-truth docs for implementation"
            copy="Open the exact docs used by runtime scripts and release checks."
          />
          <div className="grid-cards" style={{ marginTop: 16 }}>
            {docsLinks.map((item) => (
              <article key={item.path} className="card" id={item.path.replace(/\./g, "-")}>
                <h3>{item.label}</h3>
                <p>Open the source-of-truth document in the repository docs.</p>
                <a className="btn btn-ghost" href={resolveDocsUrl(item.path)} target="_blank" rel="noreferrer">
                  Open doc
                </a>
              </article>
            ))}
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
