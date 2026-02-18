import Link from "next/link";

type Props = {
  title: string;
  copy: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
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
          <Link className="btn btn-solid" href={primary.href}>
            {primary.label}
          </Link>
          {secondary ? (
            <Link className="btn btn-ghost" href={secondary.href}>
              {secondary.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
