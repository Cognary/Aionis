import { SectionLead } from "@/components/marketing/section-lead";

export function ArchitectureDiagram() {
  return (
    <section className="section architecture-section">
      <div className="container">
        <SectionLead
          eyebrow="System architecture"
          title="Aionis End-to-End Memory Kernel Architecture"
          copy="From source-of-record writes to async derivation, budgeted recall, policy execution, and production governance in one unified path."
        />

        <figure className="architecture-figure">
          <img
            src="/visuals/aionis-architecture.svg"
            alt="Aionis architecture diagram showing ingress API, memory kernel source-of-record, async derived pipeline, recall and policy engine, and production control-plane."
          />
          <figcaption>
            Core flow: Ingress/API to source-of-record commit chain, to derived async lane, to recall plus policy execution, to ops and governance gates.
          </figcaption>
        </figure>

        <div className="architecture-tags">
          <span className="architecture-tag">Audit-first SoR + commit lineage</span>
          <span className="architecture-tag">Derived async (embedding, clustering, compression)</span>
          <span className="architecture-tag">Recall trajectory (L0/L1/L2 + budget)</span>
          <span className="architecture-tag">Memory to policy (rules + tool selection)</span>
          <span className="architecture-tag">Control-plane quotas, SLO and replay ops</span>
        </div>
      </div>
    </section>
  );
}
