import Link from "next/link";
import { analyticsEvents } from "@/lib/analytics";
import { siteConfig } from "@/lib/site";
import { statHighlights } from "@/lib/site";

export function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <p className="eyebrow">Verifiable / Operable Memory Kernel</p>
        <h1>Memory infrastructure for production agents.</h1>
        <p className="hero-copy">
          Built on audit-first source-of-record commits, derived async processing, and memory → policy execution
          for agent systems that need to be verifiable, operable, and evidence-driven.
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

        {/* Stat pills inline */}
        <div className="hero-pills">
          {statHighlights.map((item) => (
            <div key={item.label} className="hero-pill">
              <span className="hero-pill-value">{item.value}</span>
              <span className="hero-pill-label">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
