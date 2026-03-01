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
  return (
    <html lang="en" className={`${headline.variable} ${mono.variable}`}>
      <body>
        <div className="ambient" aria-hidden="true" />
        <header className="topbar">
          <div className="shell topbar-inner">
            <div>
              <p className="eyebrow">Aionis Internal Ops</p>
              <p className="title">Control & Observability Console</p>
            </div>
            <nav className="appnav" aria-label="Ops pages">
              <Link href="/">Dashboard</Link>
              <Link href="/actions">Actions</Link>
              <Link href="/audit">Audit</Link>
            </nav>
            <nav className="toplinks" aria-label="Top links">
              <a href={siteConfig.websiteUrl} target="_blank" rel="noreferrer">Website</a>
              <a href={siteConfig.docsUrl} target="_blank" rel="noreferrer">Docs</a>
              <a href={siteConfig.apiContractUrl} target="_blank" rel="noreferrer">API Contract</a>
            </nav>
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
