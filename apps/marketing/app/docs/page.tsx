import type { Metadata } from "next";
import Link from "next/link";
import { docsCatalog, docsJourneys, docsLinks, docsOperations, docsRoleTracks, resolveDocsUrl, siteConfig } from "@/lib/site";
import { SectionLead } from "@/components/marketing/section-lead";
import { analyticsEvents } from "@/lib/analytics";

export const metadata: Metadata = {
  title: "Aionis Docs | Production-ready documentation gateway",
  description:
    "Find onboarding, API contracts, packaging narrative standards, operations gates, and release evidence references for Aionis.",
};

export default function DocsPage() {
  const docsHref = (path: string) => resolveDocsUrl(path);
  const registries = siteConfig.registries;

  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Documentation</p>
        <h1>One docs portal from first run to production packaging</h1>
        <p className="hero-copy">
          This is the canonical gateway for onboarding, API integration, release narrative packaging, and production operations.
        </p>
        <div className="hero-cta">
          <a
            className="btn btn-solid"
            href={docsHref("README.md")}
            target="_blank"
            rel="noreferrer"
            data-analytics-event={analyticsEvents.DOCS_OPEN_CLICK}
          >
            Open Docs Index
          </a>
          <a
            className="btn btn-ghost"
            href={docsHref("ONBOARDING_5MIN.md")}
            target="_blank"
            rel="noreferrer"
            data-analytics-event={analyticsEvents.QUICKSTART_COMPLETE}
          >
            Start 5-Min Onboarding
          </a>
          <Link className="btn btn-ghost" href="/changelog" data-analytics-event={analyticsEvents.CHANGELOG_OPEN_CLICK}>
            View Changelog
          </Link>
        </div>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Track model"
            title="Docs map to OSS, Cloud, and Platform tracks"
            copy="Use OSS docs for self-serve integration, Cloud docs for governance and operations, and Platform docs for execution-memory evolution."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>OSS docs</h3>
              <p>Onboarding, API contract, and SDK quickstart.</p>
            </article>
            <article className="card">
              <h3>Cloud docs</h3>
              <p>Security baseline, gates, runbooks, and rollout checklists.</p>
            </article>
            <article className="card">
              <h3>Platform docs</h3>
              <p>Execution substrate plans and governance progression.</p>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Narrative canon"
            title="One public story across product and engineering"
            copy="Aionis messaging follows one structure: Problem, Architecture Principles, Evidence, Boundaries, and Next Step."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Core framing</h3>
              <ul className="list">
                <li>Verifiable / Operable Memory Kernel</li>
                <li>Audit-first, Derived async, Memory to Policy</li>
                <li>Token compression treated as evidence layer</li>
              </ul>
            </article>
            <article className="card">
              <h3>Reference docs</h3>
              <ul className="list">
                <li>
                  <a href={docsHref("NARRATIVE_CANON.md")} target="_blank" rel="noreferrer">
                    Narrative Canon
                  </a>
                </li>
                <li>
                  <a href={docsHref("PACKAGING_PLAN.md")} target="_blank" rel="noreferrer">
                    Packaging Plan
                  </a>
                </li>
                <li>
                  <a href={docsHref("RELEASE_NARRATIVE_TEMPLATE.md")} target="_blank" rel="noreferrer">
                    Release Narrative Template
                  </a>
                </li>
                <li>
                  <a href={docsHref("COMMERCIAL_STRATEGY.md")} target="_blank" rel="noreferrer">
                    Commercial Strategy
                  </a>
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Compression evidence"
            title="Token efficiency is measured, not hand-waved"
            copy="Compression is positioned as an efficiency layer with reproducible KPI and gate integration."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Required KPI</h3>
              <ul className="list">
                <li>compression_ratio</li>
                <li>items_retain_ratio</li>
                <li>citations_retain_ratio</li>
              </ul>
            </article>
            <article className="card">
              <h3>Runbook references</h3>
              <ul className="list">
                <li>
                  <a href={docsHref("PRODUCTION_CORE_GATE.md")} target="_blank" rel="noreferrer">
                    Production Core Gate
                  </a>
                </li>
                <li>
                  <a href={docsHref("PERFORMANCE_BASELINE.md")} target="_blank" rel="noreferrer">
                    Performance Baseline
                  </a>
                </li>
                <li>
                  <a href={docsHref("ADAPTIVE_COMPRESSION_PLAN.md")} target="_blank" rel="noreferrer">
                    Adaptive Compression Plan
                  </a>
                </li>
              </ul>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Guided path"
            title="Recommended journeys"
            copy="Use the shortest route for your immediate objective, then expand into domain references."
          />
          <div className="grid-cards">
            {docsJourneys.map((journey) => (
              <article key={journey.title} className="card">
                <h3>{journey.title}</h3>
                <p>{journey.copy}</p>
                <ul className="list" style={{ marginTop: 12 }}>
                  {journey.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
                <div className="chip-row">
                  <a
                    className="btn btn-solid"
                    href={docsHref(journey.primaryDoc.path)}
                    target="_blank"
                    rel="noreferrer"
                    data-analytics-event={analyticsEvents.DOCS_OPEN_CLICK}
                  >
                    {journey.primaryDoc.label}
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Quick access"
            title="Most opened documents"
            copy="The shortest path from onboarding to production operation."
          />
          <div className="grid-cards" style={{ marginTop: 16 }}>
            {docsLinks.map((item) => (
              <article key={item.path} className="card" id={item.path.replace(/\./g, "-")}>
                <h3>{item.label}</h3>
                <p>Open the source document in the repository docs tree.</p>
                <a
                  className="btn btn-solid"
                  href={docsHref(item.path)}
                  target="_blank"
                  rel="noreferrer"
                  data-analytics-event={analyticsEvents.DOCS_OPEN_CLICK}
                >
                  Read doc
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="By role"
            title="Role-based entry points"
            copy="Pick the track that matches your ownership area and execution responsibility."
          />
          <div className="grid-cards">
            {docsRoleTracks.map((track) => (
              <article key={track.title} className="card">
                <h3>{track.title}</h3>
                <p>{track.copy}</p>
                <ul className="list" style={{ marginTop: 12 }}>
                  {track.items.map((item) => (
                    <li key={item.path}>
                      <a href={docsHref(item.path)} target="_blank" rel="noreferrer">
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Catalog"
            title="Documentation by domain"
            copy="Navigate by concern: onboarding, contract, integrations, and operations."
          />
          <div className="grid-cards">
            {docsCatalog.map((group) => (
              <article key={group.title} className="card">
                <h3>{group.title}</h3>
                <ul className="list">
                  {group.items.map((item) => (
                    <li key={item.path}>
                      <a href={docsHref(item.path)} target="_blank" rel="noreferrer">
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <SectionLead
            eyebrow="Release and operations"
            title="Production release references"
            copy="Keep release commands and gate docs aligned with currently published artifacts."
          />
          <div className="grid-cards">
            {docsOperations.map((group) => (
              <article key={group.title} className="card">
                <h3>{group.title}</h3>
                <ul className="list">
                  {group.items.map((item) => (
                    <li key={item.path}>
                      <a href={docsHref(item.path)} target="_blank" rel="noreferrer">
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
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
                <li>Tag: {registries.dockerTag}</li>
                <li>
                  <a href={registries.dockerUrl} target="_blank" rel="noreferrer">
                    Open image
                  </a>
                </li>
              </ul>
            </article>
          </div>
          <pre className="code-block">{`npm i ${registries.npmPackage}@${registries.npmVersion}
pip install ${registries.pypiPackage}==${registries.pypiVersion}
docker pull ${registries.dockerImage}:${registries.dockerTag}`}</pre>
        </section>
      </div>
    </section>
  );
}
