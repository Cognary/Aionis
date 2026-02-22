type Props = {
  eyebrow?: string;
  title: string;
  copy?: string;
};

export function SectionLead({ eyebrow, title, copy }: Props) {
  return (
    <div className="section-lead">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {copy ? <p className="section-copy">{copy}</p> : null}
    </div>
  );
}
