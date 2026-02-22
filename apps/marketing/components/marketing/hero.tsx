import Link from "next/link";
import { analyticsEvents } from "@/lib/analytics";
import { siteConfig } from "@/lib/site";

export function Hero() {
  return (
    <section className="hero">
      <div className="container hero-layout">
        <div className="hero-main">
          <p className="eyebrow">Verifiable / Operable Memory Kernel</p>
          <h1>Aionis is a Verifiable / Operable Memory Kernel for agents.</h1>
          <p className="hero-copy">
            Built on Audit-first source-of-record commits, Derived async processing, and Memory -&gt; Policy execution for
            production agent systems.
          </p>
          <div className="hero-cta">
            <Link
              className="btn btn-solid"
              href={siteConfig.ctaPrimary.href}
              data-analytics-event={analyticsEvents.CTA_START_OSS_CLICK}
            >
              {siteConfig.ctaPrimary.label}
            </Link>
            <Link
              className="btn btn-ghost"
              href={siteConfig.ctaSecondary.href}
              data-analytics-event={analyticsEvents.CTA_TALK_TO_SALES_CLICK}
            >
              {siteConfig.ctaSecondary.label}
            </Link>
          </div>
          <p className="hero-footnote">
            Memory-as-Kernel, not Memory-as-Feature. Open Core for standards, hosted lane for governance depth.
          </p>
        </div>

        <aside className="hero-panel">
          <p className="panel-kicker">Kernel Signals</p>
          <ul className="metric-list">
            <li>
              <span className="metric-value">Audit-first</span>
              <span className="metric-label">SoR writes with commit lineage and replayability</span>
            </li>
            <li>
              <span className="metric-value">Derived async</span>
              <span className="metric-label">Embedding/backfill failures do not block core writes</span>
            </li>
            <li>
              <span className="metric-value">Compression KPI</span>
              <span className="metric-label">ratio + items retain + citations retain tracked in gate evidence</span>
            </li>
          </ul>
          <Link className="btn btn-ghost btn-block" href="/docs" data-analytics-event={analyticsEvents.DOCS_OPEN_CLICK}>
            Read Documentation Gateway
          </Link>
        </aside>
      </div>
    </section>
  );
}
