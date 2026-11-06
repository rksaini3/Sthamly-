import Link from "next/link";

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
}

interface LegalDocProps {
  title: string;
  updated: string;
  sections: LegalSection[];
}

export function LegalDoc({ title, updated, sections }: LegalDocProps) {
  return (
    <main className="page stack">
      <p className="brand">
        <Link href="/">Sthamly</Link>
      </p>

      <div className="stack" style={{ gap: 6 }}>
        <h1>{title}</h1>
        <p className="muted">आखिरी बदलाव: {updated}</p>
      </div>

      <p className="alert alert-draft">
        यह draft है। Launch से पहले वकील से समीक्षा होगी।
      </p>

      {sections.map((section) => (
        <section key={section.heading} className="card stack">
          <h2>{section.heading}</h2>

          {section.paragraphs?.map((text) => (
            <p key={text}>{text}</p>
          ))}

          {section.items && (
            <ul className="legal-list">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="muted footer">
        <Link href="/privacy">प्राइवेसी</Link> · <Link href="/terms">शर्तें</Link>
      </p>
    </main>
  );
}