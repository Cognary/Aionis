import type { Metadata } from "next";
import { SectionLead } from "@/components/marketing/section-lead";
import { siteConfig } from "@/lib/site";

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
        <p className="hero-copy">Major artifact milestones for SDKs, Docker image, and release quality gates.</p>

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
      </div>
    </section>
  );
}
