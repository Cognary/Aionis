import Link from "next/link";
import { SectionLead } from "@/components/marketing/section-lead";
import { analyticsEvents } from "@/lib/analytics";
import { resolveDocsUrl, siteConfig } from "@/lib/site";

export default function PersonalProductPage() {
  const registries = siteConfig.registries;

  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Product / OSS</p>
        <h1>OSS memory kernel track for fast product delivery</h1>
        <p className="hero-copy">
          The OSS lane is designed for individual builders and small teams that need durable memory now, without waiting
          for procurement cycles.
        </p>

        <div className="chip-row">
          <span className="chip">Open source</span>
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
            eyebrow="Technical baseline"
            title="What is production-real in OSS"
            copy="OSS is self-serve, but still uses the same auditable kernel primitives used in Cloud and Enterprise deployments."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Core contract</h3>
              <ul className="list">
                <li>`POST /v1/memory/write` source-of-record writes</li>
                <li>`POST /v1/memory/recall_text` LLM-ready retrieval</li>
                <li>Commit lineage for traceability and replay</li>
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
        </section>

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
            copy="OSS lane is optimized for speed. You should be able to verify value quickly with reproducible smoke steps."
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
            eyebrow="Release evidence"
            title="Checks to run before shipping to users"
            copy="Even small teams should keep a lightweight, repeatable production gate."
          />
          <pre className="code-block">{`npm run -s test:contract
npm run -s docs:check
npm run -s job:health-gate -- --strict-warnings`}</pre>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="FAQ"
            title="Common onboarding questions"
            copy="Short answers for the most frequent setup friction points."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Can I start without Cloud setup?</h3>
              <p>Yes. OSS lane is open and self-serve.</p>
            </article>
            <article className="card">
              <h3>Do I need real embedding provider on day one?</h3>
              <p>No. You can start with fake provider for plumbing validation, then switch to real embeddings.</p>
            </article>
            <article className="card">
              <h3>Can I later move to Cloud?</h3>
              <p>Yes. Same memory kernel, with governance and rollout hardening added in Cloud and Enterprise paths.</p>
            </article>
            <article className="card">
              <h3>Where is the full contract?</h3>
              <p>Use the API Contract and SDK docs for source-of-truth behavior.</p>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Boundaries"
            title="When OSS is not enough"
            copy="If your rollout needs multi-team governance, strict tenancy policy, or formal reliability ownership, use Cloud onboarding."
          />
          <div className="card">
            <ul className="list">
              <li>Multiple departments sharing one memory backbone</li>
              <li>Regulated environments with strict audit and release controls</li>
              <li>Formal SLO ownership across platform and application teams</li>
            </ul>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Upgrade path"
            title="OSS -> Cloud -> Platform"
            copy="The recommended path is OSS for fast adoption, Cloud for managed operations, and Platform for execution-memory design-partner scenarios."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Cloud trigger</h3>
              <p>Adopt Cloud when governance depth and operating ownership exceed what one team can safely run.</p>
            </article>
            <article className="card">
              <h3>Platform trigger</h3>
              <p>Adopt Platform when you need policy-governed execution history and multi-agent memory governance.</p>
            </article>
          </div>
        </section>

        <div className="hero-cta" style={{ marginTop: 26 }}>
          <a
            className="btn btn-solid"
            href={resolveDocsUrl("ONBOARDING_5MIN.md")}
            target="_blank"
            rel="noreferrer"
            data-analytics-event={analyticsEvents.QUICKSTART_COMPLETE}
          >
            Open 5-minute onboarding
          </a>
          <Link className="btn btn-ghost" href="/developers">
            Developer docs
          </Link>
          <Link className="btn btn-ghost" href="/pricing" data-analytics-event={analyticsEvents.OSS_TO_CLOUD_INTENT}>
            Compare OSS vs Cloud
          </Link>
        </div>
      </div>
    </section>
  );
}
