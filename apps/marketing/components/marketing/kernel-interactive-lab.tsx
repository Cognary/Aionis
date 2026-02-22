"use client";

import { useMemo, useState } from "react";

type ScenarioId = "write" | "recall" | "policy";
type LoadBand = "canary" | "steady" | "peak";

type Scenario = {
  id: ScenarioId;
  label: string;
  title: string;
  description: string;
  base: {
    recallP95Ms: number;
    writeP95Ms: number;
    errorRate: number;
    compressionRatio: number;
    itemsRetain: number;
    citationsRetain: number;
  };
  flow: string[];
};

const scenarios: Scenario[] = [
  {
    id: "write",
    label: "Write Path",
    title: "Source-of-record write under async derivation",
    description:
      "Core writes remain available while embeddings and derived artifacts are processed asynchronously with outbox semantics.",
    base: {
      recallP95Ms: 54,
      writeP95Ms: 18,
      errorRate: 0.006,
      compressionRatio: 0.42,
      itemsRetain: 0.97,
      citationsRetain: 0.98,
    },
    flow: ["write request accepted", "commit-chain persisted", "outbox enqueue", "derived async workers"],
  },
  {
    id: "recall",
    label: "Recall Path",
    title: "Budget-aware recall with traceable context",
    description:
      "Recall uses seed + graph expansion + budget controls, then compacts context text while preserving items and citations.",
    base: {
      recallP95Ms: 86,
      writeP95Ms: 24,
      errorRate: 0.012,
      compressionRatio: 0.47,
      itemsRetain: 0.96,
      citationsRetain: 0.97,
    },
    flow: ["seed retrieval", "graph diffusion", "budget apply", "context compaction + citation retention"],
  },
  {
    id: "policy",
    label: "Policy Loop",
    title: "Memory to policy with feedback closure",
    description:
      "Rules transform memory into planner/tool constraints and feed outcomes back into governance and release gate evidence.",
    base: {
      recallP95Ms: 92,
      writeP95Ms: 26,
      errorRate: 0.015,
      compressionRatio: 0.44,
      itemsRetain: 0.95,
      citationsRetain: 0.96,
    },
    flow: ["rule evaluate", "tool select", "feedback ingest", "governance weekly gate"],
  },
];

const loadBands: Array<{ id: LoadBand; label: string; factor: number; saturation: number }> = [
  { id: "canary", label: "Canary", factor: 0.9, saturation: 0.35 },
  { id: "steady", label: "Steady", factor: 1, saturation: 0.62 },
  { id: "peak", label: "Peak", factor: 1.32, saturation: 0.9 },
];

function percent(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

export function KernelInteractiveLab() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("recall");
  const [loadBand, setLoadBand] = useState<LoadBand>("steady");

  const scenario = useMemo(() => scenarios.find((item) => item.id === scenarioId) ?? scenarios[1], [scenarioId]);
  const load = useMemo(() => loadBands.find((item) => item.id === loadBand) ?? loadBands[1], [loadBand]);

  const kpi = useMemo(() => {
    const recallP95Ms = Math.round(scenario.base.recallP95Ms * load.factor);
    const writeP95Ms = Math.round(scenario.base.writeP95Ms * load.factor);
    const errorRate = Math.min(0.04, scenario.base.errorRate * (1 + (load.factor - 1) * 1.8));
    const compressionRatio = Math.max(0.2, scenario.base.compressionRatio - Math.max(0, load.factor - 1) * 0.04);
    const itemsRetain = Math.max(0.9, scenario.base.itemsRetain - Math.max(0, load.factor - 1) * 0.02);
    const citationsRetain = Math.max(0.9, scenario.base.citationsRetain - Math.max(0, load.factor - 1) * 0.02);
    return { recallP95Ms, writeP95Ms, errorRate, compressionRatio, itemsRetain, citationsRetain };
  }, [load.factor, scenario.base]);

  const trace = useMemo(
    () =>
      JSON.stringify(
        {
          scenario: scenario.id,
          load: load.id,
          gate_snapshot: {
            recall_p95_ms: kpi.recallP95Ms,
            write_p95_ms: kpi.writeP95Ms,
            error_rate: Number(kpi.errorRate.toFixed(4)),
          },
          compression_snapshot: {
            compression_ratio: Number(kpi.compressionRatio.toFixed(3)),
            items_retain_ratio: Number(kpi.itemsRetain.toFixed(3)),
            citations_retain_ratio: Number(kpi.citationsRetain.toFixed(3)),
          },
          flow: scenario.flow,
        },
        null,
        2,
      ),
    [kpi, load.id, scenario.flow, scenario.id],
  );

  return (
    <section className="section">
      <div className="container">
        <div className="interactive-shell">
          <div className="interactive-head">
            <p className="eyebrow">Interactive Runtime</p>
            <h2>Explore kernel behavior by scenario and load</h2>
            <p className="section-copy">
              Switch runtime scenario and traffic band to see how Aionis surfaces operability, latency, and compression evidence.
            </p>
            <p className="interactive-note">
              This panel is a product-model simulation for architecture communication. Release decisions must use real gate artifacts.
            </p>
          </div>

          <div className="interactive-controls">
            <div className="segment-row">
              {scenarios.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`segment-btn ${item.id === scenario.id ? "is-active" : ""}`}
                  onClick={() => setScenarioId(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="segment-row">
              {loadBands.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`segment-btn ${item.id === load.id ? "is-active" : ""}`}
                  onClick={() => setLoadBand(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="interactive-grid">
            <article className="card interactive-card">
              <h3>{scenario.title}</h3>
              <p>{scenario.description}</p>
              <div className="kpi-grid">
                <div className="kpi-tile">
                  <p className="kpi-label">Recall p95</p>
                  <p className="kpi-value">{kpi.recallP95Ms}ms</p>
                </div>
                <div className="kpi-tile">
                  <p className="kpi-label">Write p95</p>
                  <p className="kpi-value">{kpi.writeP95Ms}ms</p>
                </div>
                <div className="kpi-tile">
                  <p className="kpi-label">Error rate</p>
                  <p className="kpi-value">{percent(kpi.errorRate)}</p>
                </div>
                <div className="kpi-tile">
                  <p className="kpi-label">Compression ratio</p>
                  <p className="kpi-value">{percent(kpi.compressionRatio)}</p>
                </div>
              </div>

              <div className="signal-stack">
                <div>
                  <p className="kpi-label">Items retain</p>
                  <div className="signal-bar">
                    <span style={{ width: `${Math.round(kpi.itemsRetain * 100)}%` }} />
                  </div>
                </div>
                <div>
                  <p className="kpi-label">Citations retain</p>
                  <div className="signal-bar">
                    <span style={{ width: `${Math.round(kpi.citationsRetain * 100)}%` }} />
                  </div>
                </div>
                <div>
                  <p className="kpi-label">Queue saturation ({load.label})</p>
                  <div className="signal-bar">
                    <span style={{ width: `${Math.round(load.saturation * 100)}%` }} />
                  </div>
                </div>
              </div>
            </article>

            <article className="card interactive-card">
              <p className="panel-kicker">Runtime snapshot</p>
              <pre className="code-block interactive-code">{trace}</pre>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
