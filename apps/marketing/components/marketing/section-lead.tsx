type Props = {
  eyebrow?: string;
  title: string;
  copy?: string;
};

export function SectionLead({ eyebrow, title, copy }: Props) {
  return (
    <div>
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {copy ? <p className="hero-copy">{copy}</p> : null}
    </div>
  );
}
