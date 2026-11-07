import { PlanCard, type PlanInfo } from "@/components/pricing/PlanCard";

// दो ही प्लान: मुफ़्त और वीआईपी पास। भुगतान Razorpay चालू होने पर शुरू होगा।
const PLANS: PlanInfo[] = [
  {
    name: "मुफ़्त",
    price: 0,
    outputs: 5,
    note: "वॉटरमार्क के साथ। रील शामिल नहीं।",
  },
  {
    name: "वीआईपी पास",
    price: 99,
    outputs: 60,
    note: "बिना वॉटरमार्क, पोस्टर पर दुकान का नाम व लोगो, हर महीने 10 रील।",
    featured: true,
  },
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
        वीआईपी पास का भुगतान जल्द शुरू होगा। तब तक मुफ़्त प्लान इस्तेमाल करें।
      </p>
    </main>
  );
}