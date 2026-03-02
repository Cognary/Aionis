import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

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
  title: "Aionis Playground",
  description: "Interactive playground for write/recall/policy-loop and decision replay APIs.",
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
            <div className="topbar-brand">
              <span className="brand-dot" aria-hidden="true" />
              <div>
                <p className="eyebrow">Aionis Playground</p>
                <p className="title-en">Memory + Policy Loop Lab</p>
                <p className="title-zh">记忆与策略实验台</p>
              </div>
            </div>
            <div className="topbar-center">
              <span className="topbar-pill">Product Console / 产品控制台</span>
            </div>
            <div className="top-links">
              <a href="https://doc.aionisos.com" target="_blank" rel="noreferrer">Docs</a>
              <a href="https://github.com/Cognary/Aionis" target="_blank" rel="noreferrer">GitHub</a>
            </div>
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
