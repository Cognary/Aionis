import Link from "next/link";
import { SectionLead } from "@/components/marketing/section-lead";
import { siteConfig } from "@/lib/site";

export default function PricingPage() {
  const registries = siteConfig.registries;

  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Pricing</p>
        <h1>Choose your rollout and operating model</h1>
        <p className="hero-copy">
          Start with Personal for fast shipping. Move to Enterprise when governance, identity boundaries, and production
          rollout rigor become mandatory.
        </p>

        <div className="two-col">
          <article className="card">
            <h3>Personal (Public)</h3>
            <p>Self-serve path for individual builders and small product teams.</p>
            <ul className="list" style={{ marginTop: 10 }}>
              <li>5-minute onboarding</li>
              <li>TypeScript and Python SDKs</li>
              <li>Docker image for quick self-host</li>
              <li>Docs-first implementation model</li>
              <li>Fast iteration with direct builder control</li>
            </ul>
            <div className="hero-cta" style={{ marginTop: 16 }}>
              <Link className="btn btn-solid" href="/product/personal">
                Start Personal
              </Link>
            </div>
          </article>

          <article className="card">
            <h3>Enterprise (Consultation)</h3>
            <p>Joint execution model for teams with stricter security and ops constraints.</p>
            <ul className="list" style={{ marginTop: 10 }}>
              <li>Tenant/agent/team strategy</li>
              <li>Rule governance and conflict policy</li>
              <li>SLO baseline and release gate design</li>
              <li>Operational runbook and rollout support</li>
              <li>Cross-team onboarding and architecture review</li>
            </ul>
            <div className="hero-cta" style={{ marginTop: 16 }}>
              <Link className="btn btn-ghost" href="/contact">
                Talk to Enterprise
              </Link>
            </div>
          </article>
        </div>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="What changes as you scale"
            title="A practical transition path"
            copy="Personal and Enterprise share the same memory kernel. Enterprise adds governance depth, operating controls, and rollout collaboration."
          />
          <table className="compare-table">
            <thead>
              <tr>
                <th>Dimension</th>
                <th>Personal</th>
                <th>Enterprise</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Onboarding</td>
                <td>Self-serve</td>
                <td>Consultative</td>
              </tr>
              <tr>
                <td>Identity model</td>
                <td>Single user / simple setup</td>
                <td>Tenant-agent-team policy</td>
              </tr>
              <tr>
                <td>Release governance</td>
                <td>Lightweight</td>
                <td>SLO + health gate driven</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Included technical baseline"
            title="Same kernel, same core contract"
            copy="Both tracks use the same API surface and published artifacts. Enterprise adds governance, rollout, and operating collaboration."
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

        <section className="section">
          <SectionLead
            eyebrow="Commercial boundary"
            title="How to decide when to switch tracks"
            copy="Switch to Enterprise when your risk profile requires formal ownership, governance controls, and cross-team execution support."
          />
          <div className="grid-cards">
            <article className="card">
              <h3>Stay on Personal if</h3>
              <p>You are optimizing for speed with one product team and lightweight operational risk.</p>
            </article>
            <article className="card">
              <h3>Move to Enterprise if</h3>
              <p>You need strict tenancy governance, release accountability, and coordinated production rollout.</p>
            </article>
          </div>
        </section>
      </div>
    </section>
  );
}
