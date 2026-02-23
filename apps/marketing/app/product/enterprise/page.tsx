import type { Metadata } from "next";
import Link from "next/link";
import { SectionLead } from "@/components/marketing/section-lead";
import { analyticsEvents } from "@/lib/analytics";
import { resolveDocsUrl, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Aionis Cloud | Managed governance and operability",
  description:
    "Aionis Cloud adds multi-tenant isolation, governance workflows, observability, quotas, and managed reliability on the same open kernel contract.",
};

export default function CloudProductPage() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Cloud / Enterprise</p>
        <h1>Same kernel contract, managed governance and reliability depth</h1>
        <p className="hero-copy">
          Cloud deployments keep the OSS API and evidence gates, then add tenant-level controls, managed operations, and organizational governance.
        </p>

        <div className="hero-cta">
          <Link className="btn btn-solid" href="/contact" data-analytics-event={analyticsEvents.CTA_TALK_TO_SALES_CLICK}>
            Talk to Sales
          </Link>
          <Link className="btn btn-ghost" href="/pricing" data-analytics-event={analyticsEvents.OSS_TO_CLOUD_INTENT}>
            Compare packages
          </Link>
          <a className="btn btn-ghost" href={siteConfig.repoUrl} target="_blank" rel="noreferrer">
            Start with OSS
          </a>
        </div>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Why cloud"
            title="Upgrade when operating risk becomes real"
            copy="Cloud is for teams that cannot treat memory infrastructure as a best-effort sidecar."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Multi-tenant isolation</h3>
              <p>Tenant separation, identity propagation, and auditability at organizational scale.</p>
            </article>
            <article className="card">
              <h3>Governance workflows</h3>
              <p>Rule lifecycle promotion, approvals, and evidence packs tied to release gates.</p>
            </article>
            <article className="card">
              <h3>Operability control plane</h3>
              <p>Quotas, key rotation, diagnostics dashboards, and replay tooling.</p>
            </article>
            <article className="card">
              <h3>Managed SLO ownership</h3>
              <p>Performance, incident response, and reliability commitments.</p>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Boundary"
            title="What stays open vs what is managed"
            copy="Cloud differentiates on scale and governance depth, not by hiding kernel truth."
          />
          <div className="hero-cta" style={{ marginTop: 16 }}>
            <a className="btn btn-solid" href={resolveDocsUrl("OPEN_CORE_BOUNDARY.md")} target="_blank" rel="noreferrer">
              Open boundary spec
            </a>
            <a className="btn btn-ghost" href={resolveDocsUrl("PROD_GO_LIVE_GATE.md")} target="_blank" rel="noreferrer">
              Production baseline
            </a>
          </div>
        </section>

        <section className="section">
          <SectionLead
            eyebrow="Getting started"
            title="Start with OSS, then migrate cleanly"
            copy="Most teams start by integrating OSS locally, then keep the same request/response contract in managed deployments."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Step 1</h3>
              <p>Integrate `write` + `recall_text` in one production flow.</p>
            </article>
            <article className="card">
              <h3>Step 2</h3>
              <p>Add `rules/evaluate` and `tools/select` where policy matters.</p>
            </article>
            <article className="card">
              <h3>Step 3</h3>
              <p>Operationalize release gates and quota policy.</p>
            </article>
            <article className="card">
              <h3>Step 4</h3>
              <p>Migrate to Cloud for managed reliability and governance depth.</p>
            </article>
          </div>
        </section>
      </div>
    </section>
  );
}

