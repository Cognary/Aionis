import { statHighlights } from "@/lib/site";

export function StatStrip() {
  return (
    <section className="section" style={{ paddingTop: 16 }}>
      <div className="container stat-strip">
        {statHighlights.map((item) => (
          <article key={item.label} className="stat-item">
            <p className="stat-value">{item.value}</p>
            <p className="stat-label">{item.label}</p>
            <p className="stat-note">{item.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
