import Link from "next/link";
import { analyticsEvents } from "@/lib/analytics";
import { siteConfig } from "@/lib/site";
import { statHighlights } from "@/lib/site";

export function Hero() {
  return (
    <section className="hero">
      <div className="container hero-grid">
        <div className="reveal">
          <p className="eyebrow">Verifiable / Operable Memory Kernel</p>
          <h1>Memory infrastructure for production agents.</h1>
          <p className="hero-copy">
            Audit-first writes, derived async processing, and memory to policy execution. Built for systems that must be
            traceable under real traffic.
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

          <div className="hero-pills" aria-label="Highlights">
            {statHighlights.map((item) => (
              <div key={item.label} className="hero-pill">
                <span className="hero-pill-value">{item.value}</span>
                <span className="hero-pill-label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="card hero-demo reveal delay-1" aria-label="Kernel loop preview">
          <p className="demo-kicker">Field manual</p>
          <p className="demo-title">A minimal kernel loop</p>
          <div className="demo-rail">
            <div className="demo-step">
              <span className="demo-dot" aria-hidden="true" />
              <p>
                <code>write</code> source-of-record facts as nodes + edges with commit lineage.
              </p>
            </div>
            <div className="demo-step">
              <span className="demo-dot" aria-hidden="true" />
              <p>
                <code>recall_text</code> retrieves compact, LLM-ready context with budget + citation retention.
              </p>
            </div>
            <div className="demo-step">
              <span className="demo-dot" aria-hidden="true" />
              <p>
                <code>rules/evaluate</code> converts memory into planner and tool-routing policy.
              </p>
            </div>
          </div>
          <p className="hero-footnote" style={{ textAlign: "left" }}>
            This is the public kernel surface. Managed control-plane features stay outside the Open Core boundary.
          </p>
        </aside>
      </div>
    </section>
  );
}
