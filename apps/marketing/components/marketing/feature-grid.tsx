import { productHighlights } from "@/lib/site";

export function FeatureGrid() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Core capabilities</p>
        <h2>From memory writes to production recall</h2>
        <div className="bento-grid">
          {productHighlights.map((item, i) => (
            <article
              key={item.title}
              className={`card ${i === 0 ? "bento-hero card-accent" : ""}`}
            >
              <span className="card-number">{String(i + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
