import Link from "next/link";
import { analyticsEvents } from "@/lib/analytics";
import { navLinks, siteConfig } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" href="/">
          <span className="brand-dot" />
          {siteConfig.name}
        </Link>
        <nav className="nav" aria-label="Main">
          {navLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="header-cta">
          <Link
            className="btn btn-ghost"
            href={siteConfig.ctaSecondary.href}
            data-analytics-event={analyticsEvents.CTA_TALK_TO_SALES_CLICK}
          >
            {siteConfig.ctaSecondary.label}
          </Link>
          <Link
            className="btn btn-solid"
            href={siteConfig.ctaPrimary.href}
            data-analytics-event={analyticsEvents.CTA_START_OSS_CLICK}
          >
            {siteConfig.ctaPrimary.label}
          </Link>
        </div>

        <details className="nav-drawer">
          <summary className="nav-drawer-trigger" aria-label="Open menu">Menu</summary>
          <div className="nav-drawer-panel">
            <nav className="nav-drawer-links" aria-label="Mobile">
              {navLinks.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="nav-drawer-cta">
              <Link className="btn btn-ghost" href={siteConfig.ctaSecondary.href} data-analytics-event={analyticsEvents.CTA_TALK_TO_SALES_CLICK}>
                {siteConfig.ctaSecondary.label}
              </Link>
              <Link className="btn btn-solid" href={siteConfig.ctaPrimary.href} data-analytics-event={analyticsEvents.CTA_START_OSS_CLICK}>
                {siteConfig.ctaPrimary.label}
              </Link>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
