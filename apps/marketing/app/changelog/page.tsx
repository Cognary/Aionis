import type { Metadata } from "next";
import { SectionLead } from "@/components/marketing/section-lead";
import { analyticsEvents } from "@/lib/analytics";
import { resolveDocsUrl, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Aionis Changelog | Artifact release timeline",
  description: "Track SDK and Docker artifact milestones and release-quality progression for Aionis.",
};

export default function ChangelogPage() {
  const registries = siteConfig.registries;

  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Changelog</p>
        <h1>Public release timeline</h1>
        <p className="hero-copy">Major artifact milestones for OSS, Cloud readiness, SDKs, Docker image, and release-quality gates.</p>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Track progression"
            title="How changelog milestones map to product tracks"
            copy="OSS milestones show kernel progress. Cloud milestones show governance and reliability maturity. Platform milestones show execution-memory evolution."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>OSS milestones</h3>
              <p>Core API, commit-chain, graph memory, and baseline rules.</p>
            </article>
            <article className="card">
              <h3>Cloud milestones</h3>
              <p>Gate maturity, SLO evidence, and managed-operations readiness.</p>
            </article>
            <article className="card">
              <h3>Platform milestones</h3>
              <p>Execution loop gates and policy-governed memory controls.</p>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Current artifacts"
            title="Published package set"
            copy="Use these references to verify installation sources and runtime parity."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>NPM</h3>
              <ul className="list">
                <li>{registries.npmPackage}</li>
                <li>Version: {registries.npmVersion}</li>
                <li>
                  <a href={registries.npmUrl} target="_blank" rel="noreferrer">
                    Open registry
                  </a>
                </li>
              </ul>
            </article>
            <article className="card">
              <h3>PyPI</h3>
              <ul className="list">
                <li>{registries.pypiPackage}</li>
                <li>Version: {registries.pypiVersion}</li>
                <li>
                  <a href={registries.pypiUrl} target="_blank" rel="noreferrer">
                    Open registry
                  </a>
                </li>
              </ul>
            </article>
            <article className="card">
              <h3>Docker (GHCR)</h3>
              <ul className="list">
                <li>{registries.dockerImage}</li>
                <li>Tag: {registries.dockerTag}, latest</li>
                <li>
                  <a href={registries.dockerUrl} target="_blank" rel="noreferrer">
                    Open image
                  </a>
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Release narrative standard"
            title="How each release is communicated"
            copy="Aionis uses one narrative structure for technical and business clarity: problem, principles, evidence, boundaries, and next step."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>Problem</h3>
              <p>What production issue is solved and why current behavior is insufficient.</p>
            </article>
            <article className="card">
              <h3>Architecture principles</h3>
              <p>How the change maps to Audit-first, Derived async, and Memory to Policy.</p>
            </article>
            <article className="card">
              <h3>Evidence</h3>
              <p>Which gates passed and where artifacts can be verified.</p>
            </article>
          </div>
          <div className="hero-cta" style={{ marginTop: 16 }}>
            <a
              className="btn btn-ghost"
              href={resolveDocsUrl("RELEASE_NARRATIVE_TEMPLATE.md")}
              target="_blank"
              rel="noreferrer"
              data-analytics-event={analyticsEvents.DOCS_OPEN_CLICK}
            >
              Open release template
            </a>
            <a
              className="btn btn-ghost"
              href={resolveDocsUrl("NARRATIVE_CANON.md")}
              target="_blank"
              rel="noreferrer"
              data-analytics-event={analyticsEvents.DOCS_OPEN_CLICK}
            >
              Open narrative canon
            </a>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Stability progression"
            title="What changed in go-to-market hardening"
            copy="Recent work focused on release quality gates, runtime safety defaults, and integration readiness."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Gate maturity</h3>
              <p>Regression + health gate + Gate C are available for release readiness checks.</p>
            </article>
            <article className="card">
              <h3>Artifact maturity</h3>
              <p>SDKs and Docker image are published and verifiable through public registries.</p>
            </article>
          </div>
        </section>

        <section className="section">
          <SectionLead
            eyebrow="Verification commands"
            title="Evidence commands used in release workflow"
            copy="These checks are the minimum baseline for public artifact updates."
          />
          <pre className="code-block">{`npm run -s build
npm run -s test:contract
npm run -s docs:check
npm run -s sdk:release-check
npm run -s sdk:py:release-check
npm run -s job:health-gate -- --strict-warnings`}</pre>
        </section>
      </div>
    </section>
  );
}
