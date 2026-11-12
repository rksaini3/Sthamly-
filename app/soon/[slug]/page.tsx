import Link from "next/link";
import { notFound } from "next/navigation";

// v1 में जो हिस्से अभी नहीं हैं, उनका "जल्द आएगा" पन्ना
const SOON: Record<string, { title: string; text: string }> = {
  projects: {
    title: "प्रोजेक्ट",
    text: "किसी त्योहार या सेल के सारे पोस्टर और कैप्शन एक जगह जमा करने की सुविधा जल्द आएगी।",
  },
  scheduled: {
    title: "शेड्यूल",
    text: "पोस्टर को तय समय पर पोस्ट करने की सुविधा जल्द आएगी।",
  },
  plugins: {
    title: "प्लगइन",
    text: "WhatsApp, Instagram और Google Sheets जैसे ऐप जोड़ने की सुविधा जल्द आएगी।",
  },
};

export default async function SoonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = SOON[slug];
  if (!item) notFound();

  return (
    <main className="page stack">
      <h1 style={{ margin: 0 }}>{item.title}</h1>
      <div className="card stack">
        <p style={{ margin: 0 }}>{item.text}</p>
        <p className="muted" style={{ margin: 0 }}>
          अभी यह सुविधा बन रही है।
        </p>
        <Link href="/voice" className="btn btn-primary btn-block">
          असिस्टेंट पर लौटें
        </Link>
      </div>
    </main>
  );
}