import Link from "next/link";

type Props = {
  title: string;
  copy: string;
  primary: { label: string; href: string; event?: string };
  secondary?: { label: string; href: string; event?: string };
};

export function CtaBand({ title, copy, primary, secondary }: Props) {
  return (
    <section className="section">
      <div className="container cta-band">
        <div>
          <h2>{title}</h2>
          <p>{copy}</p>
        </div>
        <div className="hero-cta">
          <Link className="btn btn-solid" href={primary.href} data-analytics-event={primary.event}>
            {primary.label}
          </Link>
          {secondary ? (
            <Link className="btn btn-ghost" href={secondary.href} data-analytics-event={secondary.event}>
              {secondary.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
