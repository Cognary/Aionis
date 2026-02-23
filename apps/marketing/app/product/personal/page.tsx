import type { Metadata } from "next";
import Link from "next/link";
import { SectionLead } from "@/components/marketing/section-lead";
import { analyticsEvents } from "@/lib/analytics";
import { resolveDocsUrl, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Aionis OSS | Self-hosted memory kernel quickstart",
  description:
    "Run the Aionis open-source memory kernel locally or self-hosted. Start with write + recall_text, then add rules, tool selection, and operational gates.",
};

export default function OssProductPage() {
  const registries = siteConfig.registries;

  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">OSS</p>
        <h1>Ship durable agent memory without building a control plane</h1>
        <p className="hero-copy">
          Aionis OSS is a verifiable, operable memory kernel: source-of-record writes, derived async processing, and policy-aware recall.
        </p>

        <div className="hero-cta">
          <a
            className="btn btn-solid"
            href={resolveDocsUrl("ONBOARDING_5MIN.md")}
            target="_blank"
            rel="noreferrer"
            data-analytics-event={analyticsEvents.QUICKSTART_COMPLETE}
          >
            Start in 5 minutes
          </a>
          <a className="btn btn-ghost" href={siteConfig.repoUrl} target="_blank" rel="noreferrer">
            View GitHub
          </a>
          <Link className="btn btn-ghost" href="/playground" data-analytics-event={analyticsEvents.CTA_OPEN_PLAYGROUND_CLICK}>
            Open Playground
          </Link>
        </div>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Quickstart"
            title="Local stack in one command"
            copy="This brings up DB + API + worker and runs a deterministic value demo."
          />
          <pre className="code-block">{`git clone ${siteConfig.repoUrl}
cd Aionis
make quickstart
curl -fsS http://localhost:3001/health`}</pre>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Developer contract"
            title="Three endpoints most teams start with"
            copy="Start narrow, then grow into rules, tools, and feedback."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>GET /health</h3>
              <p>Runtime liveness and database target hash for safe deploy gating.</p>
            </article>
            <article className="card">
              <h3>POST /v1/memory/write</h3>
              <p>Write facts to a commit-chained memory graph with stable idempotency.</p>
            </article>
            <article className="card">
              <h3>POST /v1/memory/recall_text</h3>
              <p>Fetch compact, LLM-ready context text from ranked subgraphs.</p>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="SDKs"
            title="TypeScript + Python are published"
            copy="Same request model, same error semantics, two runtimes."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>TypeScript</h3>
              <ul className="list">
                <li>NPM: {registries.npmPackage}@{registries.npmVersion}</li>
                <li>Methods: `write`, `recallText`, `rulesEvaluate`, `toolsSelect`, `toolsFeedback`</li>
              </ul>
              <a className="btn btn-ghost" href={registries.npmUrl} target="_blank" rel="noreferrer">
                Open NPM
              </a>
            </article>
            <article className="card">
              <h3>Python</h3>
              <ul className="list">
                <li>PyPI: {registries.pypiPackage}=={registries.pypiVersion}</li>
                <li>Methods: `write`, `recall_text`, `rules_evaluate`, `tools_select`, `tools_feedback`</li>
              </ul>
              <a className="btn btn-ghost" href={registries.pypiUrl} target="_blank" rel="noreferrer">
                Open PyPI
              </a>
            </article>
          </div>
        </section>

        <section className="section">
          <SectionLead
            eyebrow="Docs"
            title="Everything is documented as contracts and runbooks"
            copy="Use these as the source of truth when shipping memory-backed features."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Onboarding</h3>
              <p>From zero to first recall result.</p>
              <a className="btn btn-ghost" href={resolveDocsUrl("ONBOARDING_5MIN.md")} target="_blank" rel="noreferrer">
                Open onboarding
              </a>
            </article>
            <article className="card">
              <h3>API Contract</h3>
              <p>Request/response truth for every endpoint.</p>
              <a className="btn btn-ghost" href={resolveDocsUrl("API_CONTRACT.md")} target="_blank" rel="noreferrer">
                Open contract
              </a>
            </article>
            <article className="card">
              <h3>Operator Runbook</h3>
              <p>Quality gates and day-two operations.</p>
              <a className="btn btn-ghost" href={resolveDocsUrl("OPERATOR_RUNBOOK.md")} target="_blank" rel="noreferrer">
                Open runbook
              </a>
            </article>
            <article className="card">
              <h3>Boundary</h3>
              <p>What is open versus what is hosted.</p>
              <a className="btn btn-ghost" href={resolveDocsUrl("OPEN_CORE_BOUNDARY.md")} target="_blank" rel="noreferrer">
                Open boundary
              </a>
            </article>
          </div>
        </section>
      </div>
    </section>
  );
}

