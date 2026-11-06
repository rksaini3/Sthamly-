import { PlanCard, type PlanInfo } from "@/components/pricing/PlanCard";

// प्रस्तावित प्लान (docs/MVP_BRIEF.md), pilot में टेस्ट होंगे
const PLANS: PlanInfo[] = [
  { name: "Free", price: 0, outputs: 3, note: "वॉटरमार्क के साथ, जीवन भर के लिए 3 पोस्टर" },
  { name: "Starter", price: 99, outputs: 10 },
  {
    name: "Growth",
    price: 249,
    outputs: 30,
    note: "बिना वॉटरमार्क, ब्रांड कलर सेव",
    featured: true,
  },
  { name: "Shop-Pro", price: 499, outputs: 80, note: "3 दुकानों तक" },
];

export default function PricingPage() {
  return (
    <main className="page stack">
      <div className="stack" style={{ gap: 6 }}>
        <p className="brand">Sthamly</p>
        <h1>प्लान</h1>
        <p className="muted">pilot के दौरान ये कीमतें बदल सकती हैं।</p>
      </div>

      {PLANS.map((plan) => (
        <PlanCard key={plan.name} plan={plan} />
      ))}

      <p className="muted footer">
        ज़रूरत पड़ने पर अलग से top-up भी मिलेगा।
      </p>
    </main>
  );
}