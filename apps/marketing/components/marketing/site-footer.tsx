import Link from "next/link";
import { docsLinks, siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <p className="footer-brand">{siteConfig.name}</p>
          <p className="footer-muted">{siteConfig.tagline}</p>
        </div>
        <div>
          <p className="footer-title">Product</p>
          <ul>
            <li>
              <Link href="/product/personal">OSS</Link>
            </li>
            <li>
              <Link href="/product/enterprise">Cloud</Link>
            </li>
            <li>
              <Link href="/pricing">Pricing</Link>
            </li>
            <li>
              <Link href="/playground">Playground</Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="footer-title">Developers</p>
          <ul>
            {docsLinks.map((doc) => (
              <li key={doc.path}>
                <Link href={`/docs#${doc.path.replace(/\./g, "-")}`}>{doc.label}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="footer-title">Company</p>
          <ul>
            <li>
              <Link href="/contact">Contact</Link>
            </li>
            <li>
              <a href="https://github.com/Cognary/Aionis" target="_blank" rel="noreferrer">
                GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
