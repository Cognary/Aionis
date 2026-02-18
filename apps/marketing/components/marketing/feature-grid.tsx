import { productHighlights } from "@/lib/site";

export function FeatureGrid() {
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">Core capabilities</p>
        <h2>From memory writes to production recall</h2>
        <div className="grid-cards">
          {productHighlights.map((item) => (
            <article key={item.title} className="card">
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
