import type { Metadata } from "next";
import Link from "next/link";
import { SectionLead } from "@/components/marketing/section-lead";
import { PlaygroundConsole } from "@/components/marketing/playground-console";
import { analyticsEvents } from "@/lib/analytics";
import { resolveDocsUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Aionis Playground | write / recall_text / rules evaluate",
  description:
    "Use Aionis playground to run write, recall_text, and rules/evaluate with live response, latency, and reproducible curl output.",
};

export default function PlaygroundPage() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Playground</p>
        <h1>Run write, recall_text, and rules/evaluate in one screen</h1>
        <p className="hero-copy">
          This playground is an OSS developer validation tool. It helps you verify API behavior quickly before integrating into
          production workflows.
        </p>
        <div className="chip-row">
          <span className="chip">OSS dev tool</span>
          <span className="chip">Live latency + response</span>
          <span className="chip">Copy reproducible curl</span>
        </div>

        <section className="section" style={{ paddingBottom: 0 }}>
          <SectionLead
            eyebrow="Use this first"
            title="Fastest path to first memory proof"
            copy="Write one memory fact, run recall_text on the same concept, and validate rule behavior with planner context."
          />
          <div className="hero-cta">
            <a
              className="btn btn-ghost"
              href={resolveDocsUrl("API_CONTRACT.md")}
              target="_blank"
              rel="noreferrer"
              data-analytics-event={analyticsEvents.DOCS_OPEN_CLICK}
            >
              Open API contract
            </a>
            <Link className="btn btn-ghost" href="/pricing" data-analytics-event={analyticsEvents.OSS_TO_CLOUD_INTENT}>
              Compare OSS vs Cloud
            </Link>
          </div>
        </section>

        <PlaygroundConsole />

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="grid-cards">
            <article className="card">
              <h3>Boundary</h3>
              <p>This page is not a production control plane. Use it for API validation and quick integration debugging only.</p>
            </article>
            <article className="card">
              <h3>Next step</h3>
              <p>After successful runs, move your payloads into SDK code paths and enforce release gates before shipping.</p>
            </article>
          </div>
        </section>
      </div>
    </section>
  );
}
