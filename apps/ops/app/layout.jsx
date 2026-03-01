import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { siteConfig } from "@/app/lib";
import "./globals.css";
import Link from "next/link";

const headline = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-headline"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono"
});

export const metadata = {
  title: siteConfig.title,
  description: siteConfig.description,
  robots: {
    index: false,
    follow: false
  }
};

export default function RootLayout({ children }) {
  const appEnv = process.env.APP_ENV?.trim() || "local";
  return (
    <html lang="en" className={`${headline.variable} ${mono.variable}`}>
      <body>
        <div className="ambient" aria-hidden="true" />
        <header className="topbar">
          <div className="shell topbar-inner">
            <div className="brand-block">
              <div className="brand-mark" aria-hidden="true">A</div>
              <div className="brand-copy">
                <p className="eyebrow">Aionis Ops</p>
                <p className="title">Control Surface</p>
                <p className="env-pill" aria-label="app environment">env: {appEnv}</p>
              </div>
            </div>
            <nav className="appnav" aria-label="Ops pages">
              <Link href="/">Dashboard</Link>
              <Link href="/governance">Governance</Link>
              <Link href="/actions">Actions</Link>
              <Link href="/audit">Audit</Link>
            </nav>
            <a className="docs-link" href={siteConfig.docsUrl} target="_blank" rel="noreferrer">Open Docs</a>
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
