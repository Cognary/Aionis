import Link from "next/link";
import { SectionLead } from "@/components/marketing/section-lead";
import { resolveDocsUrl } from "@/lib/site";

export default function PersonalProductPage() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Product / Personal</p>
        <h1>Personal agent memory that ships fast</h1>
        <p className="hero-copy">
          The Personal lane is designed for individual builders and small teams that need durable memory now, without
          waiting for enterprise procurement cycles.
        </p>

        <div className="chip-row">
          <span className="chip">Public now</span>
          <span className="chip">SDK + Docker ready</span>
          <span className="chip">3-minute quickstart</span>
        </div>

        <div className="grid-cards" style={{ marginTop: 20 }}>
          <article className="card">
            <h3>What you get</h3>
            <ul className="list">
              <li>Write and recall APIs with context text output</li>
              <li>TypeScript and Python SDKs</li>
              <li>Docker self-host path and local smoke flow</li>
              <li>Rule-aware tool selection primitives</li>
            </ul>
          </article>
          <article className="card">
            <h3>Best for</h3>
            <ul className="list">
              <li>Solo founders shipping agent products</li>
              <li>Internal copilots that need memory continuity</li>
              <li>MVPs moving from demo to real usage</li>
            </ul>
          </article>
        </div>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Quick install"
            title="Two SDKs, same memory API"
            copy="Use TypeScript or Python with the same write -> recall_text flow."
          />
          <pre className="code-block">{`npm i @aionis/sdk
# or
pip install aionis-sdk`}</pre>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="What to expect"
            title="Practical outcomes in the first week"
            copy="Personal lane is optimized for speed. You should be able to verify value quickly with reproducible smoke steps."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>Day 1</h3>
              <p>Run quickstart and verify write + recall_text response shape.</p>
            </article>
            <article className="card">
              <h3>Day 3</h3>
              <p>Integrate SDK into your agent runtime and capture memory from real sessions.</p>
            </article>
            <article className="card">
              <h3>Day 7</h3>
              <p>Define first recall quality baseline and operating checks.</p>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="FAQ"
            title="Common onboarding questions"
            copy="Short answers for the most frequent setup friction points."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Can I start without enterprise setup?</h3>
              <p>Yes. Personal lane is public and self-serve.</p>
            </article>
            <article className="card">
              <h3>Do I need real embedding provider on day one?</h3>
              <p>No. You can start with fake provider for plumbing validation, then switch to real embeddings.</p>
            </article>
            <article className="card">
              <h3>Can I later move to enterprise?</h3>
              <p>Yes. Same memory kernel, with governance and rollout hardening added in enterprise path.</p>
            </article>
            <article className="card">
              <h3>Where is the full contract?</h3>
              <p>Use the API Contract and SDK docs for source-of-truth behavior.</p>
            </article>
          </div>
        </section>

        <div className="hero-cta" style={{ marginTop: 26 }}>
          <a
            className="btn btn-solid"
            href={resolveDocsUrl("ONBOARDING_5MIN.md")}
            target="_blank"
            rel="noreferrer"
          >
            Open 5-minute onboarding
          </a>
          <Link className="btn btn-ghost" href="/developers">
            Developer docs
          </Link>
          <Link className="btn btn-ghost" href="/pricing">
            Compare plans
          </Link>
        </div>
      </div>
    </section>
  );
}
