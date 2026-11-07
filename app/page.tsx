import Link from "next/link";
import { redirect } from "next/navigation";

const STEPS = [
  { title: "दुकान की फोटो भेजें", text: "WhatsApp पर एक साफ फोटो।" },
  { title: "ऑफर लिखें", text: "जैसे: 1 किलो काजू कतली ₹600।" },
  { title: "पोस्टर और कैप्शन पाएं", text: "कुछ ही मिनट में, हिंग्लिश कैप्शन के साथ।" },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  // Google/Supabase login के बाद कभी-कभी code यहीं आ जाता है।
  // उसे सही callback रास्ते पर भेजें, ताकि session बन सके।
  const params = await searchParams;
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  if (code) {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=/dashboard`);
  }

  return (
    <main className="page stack" style={{ paddingTop: 40 }}>
      <p className="brand">Sthamly</p>

      <section className="stack">
        <h1>दुकान का पोस्टर और रील, बिना डिज़ाइनर के</h1>
        <p className="muted">
          फोटो और ऑफर भेजें। पोस्टर और कैप्शन WhatsApp पर मिलेंगे।
        </p>
        <Link href="/onboarding" className="btn btn-primary btn-block">
          शुरू करें
        </Link>
        <Link href="/login" className="btn btn-ghost btn-block">
          पहले से खाता है? लॉग-इन
        </Link>
      </section>

      <section className="card">
        <ol className="steps stack">
          {STEPS.map((step, index) => (
            <li key={step.title} className="step">
              <span className="step-num">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p className="muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="muted footer">
        <Link href="/privacy">प्राइवेसी</Link> · <Link href="/terms">शर्तें</Link>
        <br />
        अभी pilot चल रहा है।
      </p>
    </main>
  );
}