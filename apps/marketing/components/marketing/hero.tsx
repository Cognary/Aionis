import Link from "next/link";
import { siteConfig } from "@/lib/site";

export function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <p className="eyebrow">Aionis Memory Infrastructure</p>
        <h1>Ship durable memory for AI agents.</h1>
        <p className="hero-copy">
          Move beyond demo memory. Aionis gives you graph recall, policy-aware tool routing, and production guardrails
          in one system.
        </p>
        <div className="hero-cta">
          <Link className="btn btn-solid" href={siteConfig.ctaPrimary.href}>
            {siteConfig.ctaPrimary.label}
          </Link>
          <Link className="btn btn-ghost" href={siteConfig.ctaSecondary.href}>
            {siteConfig.ctaSecondary.label}
          </Link>
        </div>
      </div>
    </section>
  );
}
