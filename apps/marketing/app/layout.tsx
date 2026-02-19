import type { Metadata } from "next";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { Providers } from "@/components/shared/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aionis | Verifiable / Operable Memory Kernel",
  description:
    "Aionis is a Verifiable / Operable Memory Kernel for agents with Audit-first commits, Derived async processing, and Memory -> Policy execution.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
