import Link from "next/link";
import { siteConfig } from "@/lib/site";

export function Hero() {
  return (
    <section className="hero">
      <div className="container">
        <p className="eyebrow">Verifiable / Operable Memory Kernel</p>
        <h1>Aionis is a Verifiable / Operable Memory Kernel for agents.</h1>
        <p className="hero-copy">
          Built on Audit-first source-of-record commits, Derived async processing, and Memory -&gt; Policy execution for
          production agent systems.
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
