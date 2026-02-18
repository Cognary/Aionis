import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section">
      <div className="container card" style={{ textAlign: "center" }}>
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="copy">The page you requested does not exist.</p>
        <div className="hero-cta" style={{ justifyContent: "center" }}>
          <Link className="btn btn-solid" href="/">
            Back to home
          </Link>
        </div>
      </div>
    </section>
  );
}
