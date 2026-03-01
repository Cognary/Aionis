import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import { siteConfig } from "@/app/lib";
import "./globals.css";
import Link from "next/link";

const headline = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-headline"
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
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
              <p className="eyebrow">Aionis Internal Ops</p>
              <p className="title">Control Console</p>
              <p className="env-pill" aria-label="app environment">env: {appEnv}</p>
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
