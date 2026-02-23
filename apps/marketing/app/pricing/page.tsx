import Link from "next/link";
import { SectionLead } from "@/components/marketing/section-lead";
import { analyticsEvents } from "@/lib/analytics";
import { resolveDocsUrl, siteConfig } from "@/lib/site";

export default function PricingPage() {
  const registries = siteConfig.registries;

  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Pricing</p>
        <h1>Choose OSS, Cloud, or Enterprise rollout</h1>
        <p className="hero-copy">
          Start with OSS for immediate integration. Upgrade to Cloud when governance depth, reliability ownership, and
          cross-team controls become mandatory.
        </p>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Package lineup"
            title="One kernel, four operating tracks"
            copy="All tracks share the same memory contract. Paid tracks add scale, governance, and managed operations depth."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>OSS</h3>
              <p>Free self-hosted memory kernel for builders and product teams.</p>
              <ul className="list" style={{ marginTop: 10 }}>
                <li>Write/recall/rules baseline</li>
                <li>TypeScript + Python SDKs</li>
                <li>Docker and docs-first onboarding</li>
              </ul>
              <div className="hero-cta" style={{ marginTop: 16 }}>
                <Link className="btn btn-solid" href="/product/personal" data-analytics-event={analyticsEvents.CTA_START_OSS_CLICK}>
                  Start OSS
                </Link>
              </div>
            </article>

            <article className="card">
              <h3>Cloud Builder</h3>
              <p>Managed path for small teams that need speed without operating infrastructure.</p>
              <ul className="list" style={{ marginTop: 10 }}>
                <li>Managed runtime baseline</li>
                <li>Higher quotas than OSS default</li>
                <li>Builder support channel</li>
              </ul>
              <div className="hero-cta" style={{ marginTop: 16 }}>
                <Link className="btn btn-ghost" href="/contact" data-analytics-event={analyticsEvents.CTA_TALK_TO_SALES_CLICK}>
                  Talk to Sales
                </Link>
              </div>
            </article>

            <article className="card">
              <h3>Cloud Team</h3>
              <p>Team-grade governance and rollout controls for product organizations.</p>
              <ul className="list" style={{ marginTop: 10 }}>
                <li>Tenant-agent-team policy model</li>
                <li>Operational visibility and controls</li>
                <li>SLO-oriented deployment support</li>
              </ul>
              <div className="hero-cta" style={{ marginTop: 16 }}>
                <Link className="btn btn-ghost" href="/contact" data-analytics-event={analyticsEvents.CTA_START_CLOUD_CLICK}>
                  Talk to Sales
                </Link>
              </div>
            </article>

            <article className="card">
              <h3>Enterprise</h3>
              <p>Custom governance, compliance, and formal reliability ownership.</p>
              <ul className="list" style={{ marginTop: 10 }}>
                <li>Compliance and security alignment</li>
                <li>Release gate and runbook standardization</li>
                <li>Dedicated onboarding and architecture review</li>
              </ul>
              <div className="hero-cta" style={{ marginTop: 16 }}>
                <Link className="btn btn-ghost" href="/contact" data-analytics-event={analyticsEvents.CTA_TALK_TO_SALES_CLICK}>
                  Schedule discovery
                </Link>
              </div>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Boundary matrix"
            title="What is open versus hosted"
            copy="Hosted value is governance and operations depth. Core kernel truth remains open."
          />
          <table className="compare-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th>OSS</th>
                <th>Cloud / Enterprise</th>
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
                <td>Managed HA/SLO operations</td>
                <td>Not included</td>
                <td>Included</td>
              </tr>
              <tr>
                <td>Multi-tenant isolation</td>
                <td>Not included</td>
                <td>Included</td>
              </tr>
              <tr>
                <td>Compliance tooling</td>
                <td>Not included</td>
                <td>Included</td>
              </tr>
            </tbody>
          </table>
          <div className="hero-cta" style={{ marginTop: 16 }}>
            <a className="btn btn-solid" href={resolveDocsUrl("OPEN_CORE_BOUNDARY.md")} target="_blank" rel="noreferrer">
              Open boundary spec
            </a>
            <Link className="btn btn-ghost" href="/open-core" data-analytics-event={analyticsEvents.OSS_TO_CLOUD_INTENT}>
              Open model page
            </Link>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Included technical baseline"
            title="Same API and artifact baseline"
            copy="All tracks are built on the same kernel APIs and published package artifacts."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Core API and SDK</h3>
              <ul className="list">
                <li>APIs: `health`, `write`, `recall_text`</li>
                <li>NPM: {registries.npmPackage}@{registries.npmVersion}</li>
                <li>PyPI: {registries.pypiPackage}=={registries.pypiVersion}</li>
              </ul>
            </article>
            <article className="card">
              <h3>Operational baseline</h3>
              <ul className="list">
                <li>Docker image: {registries.dockerImage}:{registries.dockerTag}</li>
                <li>Health gate and consistency-check scripts</li>
                <li>Runbook-backed release process</li>
              </ul>
            </article>
          </div>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Upgrade triggers"
            title="When to move to paid tracks"
            copy="Use operating risk and governance complexity as the transition signal, not feature curiosity."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Stay on OSS if</h3>
              <p>You are one team shipping quickly with lightweight operational risk and direct developer ownership.</p>
            </article>
            <article className="card">
              <h3>Move to Cloud Builder if</h3>
              <p>You need managed runtime and higher limits but do not yet require formal enterprise governance.</p>
            </article>
            <article className="card">
              <h3>Move to Cloud Team if</h3>
              <p>You need tenant-aware controls, team-level ownership, and shared operational visibility.</p>
            </article>
            <article className="card">
              <h3>Move to Enterprise if</h3>
              <p>You need compliance commitments, stricter reliability guarantees, and cross-department rollout support.</p>
            </article>
          </div>
        </section>

        <section className="section">
          <SectionLead
            eyebrow="Platform track"
            title="Execution Memory Platform (Design Partner)"
            copy="For teams pursuing memory-governed execution loops and verifiable policy effects, Aionis offers limited design-partner programs."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Best fit</h3>
              <p>Organizations building multi-agent systems with strict policy, governance, and execution-history requirements.</p>
            </article>
            <article className="card">
              <h3>Entry path</h3>
              <p>Discovery -&gt; bounded pilot -&gt; gated production rollout with shared evidence packs.</p>
            </article>
          </div>
          <div className="hero-cta" style={{ marginTop: 16 }}>
            <Link className="btn btn-solid" href="/contact" data-analytics-event={analyticsEvents.CTA_TALK_TO_SALES_CLICK}>
              Talk to Sales
            </Link>
            <Link className="btn btn-ghost" href="/product/enterprise" data-analytics-event={analyticsEvents.CTA_START_CLOUD_CLICK}>
              See Cloud capabilities
            </Link>
          </div>
        </section>
      </div>
    </section>
  );
}
