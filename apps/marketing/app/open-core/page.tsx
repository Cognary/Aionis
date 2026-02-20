import type { Metadata } from "next";
import Link from "next/link";
import { SectionLead } from "@/components/marketing/section-lead";
import { analyticsEvents } from "@/lib/analytics";
import { resolveDocsUrl, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Aionis Model | Open Core + Hosted + Kernel Control",
  description:
    "Aionis commercial model: open memory kernel standard, hosted enterprise operations, and long-term execution memory control plane.",
};

export default function OpenCorePage() {
  const registries = siteConfig.registries;

  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Model</p>
        <h1>Open Core + Hosted + Kernel Control</h1>
        <p className="hero-copy">
          Aionis separates standard-setting kernel capabilities from managed enterprise operations, then extends toward an
          execution memory control plane.
        </p>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Strategic decision"
            title="Three-layer operating model"
            copy="Layer 1 drives adoption and standards. Layer 2 drives recurring revenue. Layer 3 builds long-term control-plane moat."
          />
          <div className="grid-cards-3">
            <article className="card">
              <h3>Layer 1: Open Source Kernel</h3>
              <ul className="list">
                <li>Single-tenant memory kernel and graph core</li>
                <li>Commit-chain and replayable history</li>
                <li>Basic recall and derived async pipeline</li>
                <li>Baseline rules and production single-tenant essentials</li>
              </ul>
            </article>
            <article className="card">
              <h3>Layer 2: Hosted Cloud</h3>
              <ul className="list">
                <li>Multi-tenant isolation and enterprise identity</li>
                <li>HA/SLO operations and managed reliability</li>
                <li>Scale recall, governance, and observability control plane</li>
                <li>Compliance and lifecycle operations</li>
              </ul>
            </article>
            <article className="card">
              <h3>Layer 3: Execution Platform</h3>
              <ul className="list">
                <li>Memory -&gt; Planner -&gt; Execution substrate</li>
                <li>Policy memory and verifiable execution history</li>
                <li>Multi-agent shared memory governance</li>
                <li>Autonomous memory evolution with strict guardrails</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Product boundary"
            title="What stays open vs what is hosted"
            copy="Hosted differentiation is scale and governance depth, not artificial restriction of kernel truth."
          />
          <table className="compare-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th>OSS</th>
                <th>Cloud</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Write/recall contract</td>
                <td>Included</td>
                <td>Included</td>
              </tr>
              <tr>
                <td>Commit-chain invariants</td>
                <td>Included</td>
                <td>Included</td>
              </tr>
              <tr>
                <td>Rules baseline</td>
                <td>Included</td>
                <td>Extended governance workflows</td>
              </tr>
              <tr>
                <td>Multi-tenant isolation</td>
                <td>Not included</td>
                <td>Included</td>
              </tr>
              <tr>
                <td>Managed HA/SLO operations</td>
                <td>Not included</td>
                <td>Included</td>
              </tr>
              <tr>
                <td>Compliance control plane</td>
                <td>Not included</td>
                <td>Included</td>
              </tr>
            </tbody>
          </table>
          <div className="hero-cta" style={{ marginTop: 16 }}>
            <a className="btn btn-solid" href={resolveDocsUrl("EXTERNAL_RELEASE_PRODUCT_PLAN.md")} target="_blank" rel="noreferrer">
              Open boundary matrix
            </a>
            <a className="btn btn-ghost" href={resolveDocsUrl("COMMERCIAL_STRATEGY.md")} target="_blank" rel="noreferrer">
              Open strategy source
            </a>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Evidence standard"
            title="How releases are validated"
            copy="Commercial claims are tied to explicit architecture principles and reproducible evidence bundles."
          />
          <pre className="code-block">{`npm run -s test:contract
npm run -s docs:check
npm run -s job:health-gate -- --strict-warnings
npm run -s job:consistency-check:scope -- --strict-warnings`}</pre>
          <div className="grid-cards">
            <article className="card">
              <h3>Published artifacts</h3>
              <ul className="list">
                <li>{registries.npmPackage}@{registries.npmVersion}</li>
                <li>{registries.pypiPackage}=={registries.pypiVersion}</li>
                <li>{registries.dockerImage}:{registries.dockerTag}</li>
              </ul>
            </article>
            <article className="card">
              <h3>Narrative format</h3>
              <p>Problem -&gt; Architecture Principles -&gt; Evidence -&gt; Boundaries -&gt; Next Step.</p>
            </article>
          </div>
        </section>

        <section className="section">
          <SectionLead
            eyebrow="Execution plan"
            title="Near-term operating priorities"
            copy="Use one model across product, engineering, and GTM so boundary decisions are repeatable."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Now</h3>
              <ul className="list">
                <li>Keep Layer 1 production-real for single-tenant adoption</li>
                <li>Package Hosted around governance and operations depth</li>
                <li>Standardize release evidence for all market communication</li>
              </ul>
            </article>
            <article className="card">
              <h3>Next</h3>
              <ul className="list">
                <li>Expand multi-agent governance primitives</li>
                <li>Link policy memory with execution history proofs</li>
                <li>Build execution substrate milestones for Layer 3</li>
              </ul>
            </article>
          </div>
          <div className="hero-cta" style={{ marginTop: 18 }}>
            <a className="btn btn-solid" href={resolveDocsUrl("COMMERCIAL_STRATEGY.md")} target="_blank" rel="noreferrer">
              Open commercial strategy doc
            </a>
            <Link className="btn btn-ghost" href="/pricing" data-analytics-event={analyticsEvents.OSS_TO_CLOUD_INTENT}>
              Compare OSS vs Cloud packages
            </Link>
          </div>
        </section>
      </div>
    </section>
  );
}
