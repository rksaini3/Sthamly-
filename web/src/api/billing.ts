// Sthamly AI web: billing ka API aur Razorpay Checkout (subscription aur booster).
// Worker order ya subscription banata hai, Razorpay ka popup yahin khulta hai.
// Payment ho jaane ka matlab client par credits nahi: credits sirf webhook (Worker) jorta hai.
// Client sirf balance dobara padhta hai. Card ya UPI ki detail web ko kabhi nahi dikhti; Razorpay ka apna popup sambhalta hai.

import { requestJson } from "./client";

const RAZORPAY_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

export type PaidTierId = "basic" | "pro" | "super";
export type TopupPackId = "quick_try" | "mini" | "growth" | "vip";

export interface BillingStatus {
  plan: string;
  subscription_status: "none" | "active" | "past_due" | "cancelled";
  current_period_end: string | null;
  credits: { plan: number; topup: number; total: number };
  quick_try_available: boolean;
}

interface SubscriptionOrder {
  subscription_id: string;
  key_id: string;
  tier: PaidTierId;
}

interface TopupOrder {
  order_id: string;
  key_id: string;
  amount: number;
  currency: string;
  pack: TopupPackId;
}

// Razorpay popup ka 'paid' sirf itna batata hai ki user ne payment poori ki. Credits webhook ke baad aate hain.
export type CheckoutResult = "paid" | "dismissed";

const PAYMENT_FAILED_MESSAGE = "भुगतान नहीं हो पाया। दोबारा कोशिश करें।";
const SCRIPT_FAILED_MESSAGE = "भुगतान की स्क्रीन नहीं खुल पाई। इंटरनेट जांचें और दोबारा कोशिश करें।";

export const TIER_LABEL: Record<PaidTierId, string> = {
  basic: "बेसिक प्लान",
  pro: "प्रो प्लान",
  super: "सुपर प्लान",
};

export const PACK_LABEL: Record<TopupPackId, string> = {
  quick_try: "क्विक ट्राई पैक",
  mini: "मिनी बूस्टर",
  growth: "ग्रोथ बूस्टर",
  vip: "VIP बूस्टर",
};

export function fetchBillingStatus(token: string): Promise<BillingStatus> {
  return requestJson<BillingStatus>("/api/billing/status", { token, method: "GET" });
}

function createSubscription(token: string, tier: PaidTierId): Promise<SubscriptionOrder> {
  return requestJson<SubscriptionOrder>("/api/billing/checkout", {
    token,
    method: "POST",
    body: { tier },
  });
}

function createTopupOrder(token: string, pack: TopupPackId): Promise<TopupOrder> {
  return requestJson<TopupOrder>("/api/billing/topup", {
    token,
    method: "POST",
    body: { pack },
  });
}

// Razorpay Checkout script ek hi baar load hoti hai, aur ek hi promise saajha rehta hai.
type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", handler: () => void) => void;
};
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

let scriptPromise: Promise<void> | null = null;

function currentRazorpay(): RazorpayCtor | undefined {
  return (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
}

function loadRazorpay(): Promise<RazorpayCtor> {
  const ready = currentRazorpay();
  if (ready) return Promise.resolve(ready);

  if (scriptPromise === null) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = RAZORPAY_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        scriptPromise = null;
        reject(new Error(SCRIPT_FAILED_MESSAGE));
      };
      document.head.appendChild(script);
    });
  }

  return scriptPromise.then(() => {
    const ctor = currentRazorpay();
    if (!ctor) throw new Error(SCRIPT_FAILED_MESSAGE);
    return ctor;
  });
}

// Razorpay ka popup. 'paid' aur 'dismissed' dono normal jawab hain; payment fail par error.
function openCheckout(options: Record<string, unknown>): Promise<CheckoutResult> {
  return loadRazorpay().then(
    (Ctor) =>
      new Promise<CheckoutResult>((resolve, reject) => {
        const instance = new Ctor({
          ...options,
          name: "Sthamly AI",
          handler: () => resolve("paid"),
          modal: { ondismiss: () => resolve("dismissed") },
        });
        instance.on("payment.failed", () => reject(new Error(PAYMENT_FAILED_MESSAGE)));
        instance.open();
      }),
  );
}

// Paid plan kharidna: pehle Worker se subscription, phir Razorpay popup.
export async function buySubscription(token: string, tier: PaidTierId): Promise<CheckoutResult> {
  const order = await createSubscription(token, tier);
  return openCheckout({
    key: order.key_id,
    subscription_id: order.subscription_id,
    description: TIER_LABEL[tier],
  });
}

// Booster kharidna: pehle Worker se order (amount server tay karta hai), phir Razorpay popup.
export async function buyTopup(token: string, pack: TopupPackId): Promise<CheckoutResult> {
  const order = await createTopupOrder(token, pack);
  return openCheckout({
    key: order.key_id,
    order_id: order.order_id,
    amount: order.amount,
    currency: order.currency,
    description: PACK_LABEL[pack],
  });
}