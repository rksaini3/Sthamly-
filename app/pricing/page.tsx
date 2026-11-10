"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import {
  FIRST_TOPUP_BONUS_MIN_PAISE,
  FIRST_TOPUP_BONUS_PERCENT,
  PLAN_ALLOWANCES,
  PLAN_PRICE_PAISE,
  PRICE_PAISE,
  TOPUP_PRESETS_PAISE,
  formatRupees,
  type PaidPlan,
  type PricingPlan,
} from "@/lib/pricing";

// चुना हुआ प्लान और सालाना/मासिक चुनाव, ब्राउज़र में याद रहे (सिर्फ़ सुविधा के लिए)
const PLAN_KEY = "sthamly:selected-plan";
const CYCLE_KEY = "sthamly:billing-cycle";

type Cycle = "monthly" | "yearly";

interface PlanCardDef {
  id: PricingPlan;
  title: string;
  points: string[];
}

const free = PLAN_ALLOWANCES.free;
const starter = PLAN_ALLOWANCES.starter;
const premium = PLAN_ALLOWANCES.premium;
const business = PLAN_ALLOWANCES.business;

// कीमतें यहाँ नहीं लिखी जातीं, lib/pricing.ts से आती हैं
const CARDS: PlanCardDef[] = [
  {
    id: "free",
    title: "मुफ़्त",
    points: [`रोज़ ${free.poster.limit} पोस्टर`, `हफ़्ते में ${free.reel.limit} टेम्पलेट रील`, "वॉटरमार्क के साथ"],
  },
  {
    id: "starter",
    title: "स्टार्टर",
    points: [`महीने में ${starter.poster.limit} पोस्टर`, `महीने में ${starter.reel.limit} टेम्पलेट रील`, `${starter.logins} लॉगिन`],
  },
  {
    id: "premium",
    title: "प्रीमियम",
    points: [
      `महीने में ${premium.poster.limit} पोस्टर`,
      `महीने में ${premium.reel.limit} टेम्पलेट रील`,
      "बिना वॉटरमार्क, दुकान का नाम व लोगो",
      `${premium.logins} लॉगिन`,
      `WhatsApp पर महीने में ${premium.whatsappAutoPostPerMonth} ऑटो-पोस्ट`,
    ],
  },
  {
    id: "business",
    title: "बिज़नेस",
    points: [
      `महीने में ${business.poster.limit} पोस्टर`,
      `महीने में ${business.reel.limit} टेम्पलेट रील`,
      "बिना वॉटरमार्क, दुकान का नाम व लोगो",
      `${business.logins} लॉगिन`,
      "WhatsApp पर हर दिन 1 ऑटो-पोस्ट",
    ],
  },
];

const FREE_CARD: PlanCardDef = { id: "free", title: "मुफ़्त", points: [] };

// वॉलेट से एक-एक काम की कीमत (खुद खरीदने पर)
const PER_ITEM: { label: string; paise: number }[] = [
  { label: "AI पोस्टर", paise: PRICE_PAISE.ai_poster },
  { label: "AI बैनर", paise: PRICE_PAISE.ai_banner },
  { label: "स्लाइड-शो रील", paise: PRICE_PAISE.slide_reel },
  { label: "लाइब्रेरी पोस्टर से वॉटरमार्क हटाना", paise: PRICE_PAISE.watermark_removal },
];

const ERROR_TEXT = "कुछ गड़बड़ हुई, दोबारा कोशिश करें।";

const SUBSCRIBE_ERRORS: Record<string, string> = {
  ALREADY_ACTIVE: "आपका प्लान पहले से चालू है।",
  SUBSCRIPTION_FAILED: "भुगतान शुरू नहीं हो सका, थोड़ी देर बाद दोबारा कोशिश करें।",
  INTERNAL: ERROR_TEXT,
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("razorpay script load failed"));
    document.body.appendChild(script);
  });
}

function priceLine(id: PricingPlan, cycle: Cycle): { price: string; unit: string; note?: string } {
  if (id === "free") return { price: "₹0", unit: "/ महीना" };
  const paid = id as PaidPlan;
  if (cycle === "monthly") {
    return { price: formatRupees(PLAN_PRICE_PAISE[paid].monthly), unit: "/ महीना" };
  }
  const yearly = PLAN_PRICE_PAISE[paid].yearly;
  return {
    price: formatRupees(yearly),
    unit: "/ साल",
    note: `लगभग ${formatRupees(Math.round(yearly / 12))} / महीना`,
  };
}

export default function PricingPage() {
  const [selected, setSelected] = useState<PricingPlan>("free");
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [topupPaise, setTopupPaise] = useState<number>(TOPUP_PRESETS_PAISE[1]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // पिछला चुनाव वापस लाएँ (SSR के बाद, ताकि hydration न टूटे)
  useEffect(() => {
    try {
      const savedPlan = window.localStorage.getItem(PLAN_KEY);
      if (savedPlan && CARDS.some((c) => c.id === savedPlan)) setSelected(savedPlan as PricingPlan);
      const savedCycle = window.localStorage.getItem(CYCLE_KEY);
      if (savedCycle === "monthly" || savedCycle === "yearly") setCycle(savedCycle);
    } catch {
      // storage बंद हो तो डिफ़ॉल्ट ही रहेगा
    }
  }, []);

  function choosePlan(id: PricingPlan) {
    setSelected(id);
    setNotice(null);
    try {
      window.localStorage.setItem(PLAN_KEY, id);
    } catch {
      // सेव न हो तो भी चुनाव स्क्रीन पर रहेगा
    }
  }

  function chooseCycle(next: Cycle) {
    setCycle(next);
    try {
      window.localStorage.setItem(CYCLE_KEY, next);
    } catch {
      // ignore
    }
  }

  const current: PlanCardDef = CARDS.find((c) => c.id === selected) ?? FREE_CARD;
  const currentPrice = priceLine(current.id, cycle);
  const isPaid = current.id !== "free";

  async function onSubscribe() {
    if (!isPaid) return;
    setBusy(true);
    setNotice(null);