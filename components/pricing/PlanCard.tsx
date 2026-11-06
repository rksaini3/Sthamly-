import { Card } from "@/components/ui/Card";

export interface PlanInfo {
  name: string;
  price: number;
  outputs: number;
  note?: string;
  featured?: boolean;
}

export function PlanCard({ plan }: { plan: PlanInfo }) {
  return (
    <Card className={plan.featured ? "plan-featured" : ""}>
      <div className="stack" style={{ gap: 6 }}>
        <h2>{plan.name}</h2>
        <p className="plan-price">
          ₹{plan.price} <small>/ महीना</small>
        </p>
        <p>{plan.outputs} पोस्टर हर महीने</p>
        {plan.note && <p className="muted">{plan.note}</p>}
      </div>
    </Card>
  );
}