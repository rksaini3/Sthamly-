"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

const STORAGE_KEY = "sthamly:selected-plan";

type PlanId = "free" | "micro" | "ai_reel" | "vip" | "premium_template";

type PlanDef = {
  id: PlanId;
  title: string;
  price: string;
  unit: string;
  points: string[];
  // false = अभी सिर्फ़ "जल्द" दिखेगा, चुना नहीं जा सकता
  selectable: boolean;
  // true = भुगतान वाला प्लान (Razorpay अभी नहीं जुड़ा)
  paid: boolean;
};

const PLANS: PlanDef[] = [
  {
    id: "free",
    title: "मुफ़्त",
    price: "₹0",
    unit: "/ महीना",
    points: ["5 पोस्टर हर महीने", "1 टेम्पलेट रील हर महीने", "वॉटरमार्क के साथ"],
    selectable: true,
    paid: false,
  },
  {
    id: "micro",
    title: "माइक्रो-पैक",
    price: "₹10",
    unit: "एक बार",
    points: ["5 अतिरिक्त क्रेडिट", "पोस्टर या टेम्पलेट रील, दोनों में चलेगा"],
    selectable: true,
    paid: true,
  },
  {
    id: "ai_reel",
    title: "AI वीडियो रील",
    price: "₹15",
    unit: "प्रति रील",
    points: ["AI से बनी वीडियो रील", "सिर्फ़ भुगतान पर उपलब्ध"],
    selectable: true,
    paid: true,
  },
  {
    id: "vip",
    title: "वीआईपी पास",
    price: "₹99",
    unit: "/ महीना",
    points: [
      "60 पोस्टर हर महीने",
      "10 टेम्पलेट रील हर महीने",
      "बिना वॉटरमार्क",
      "पोस्टर पर दुकान का नाम व लोगो",
      "WhatsApp broadcast (सिर्फ़ opt-in, Meta का शुल्क अलग)",
    ],
    selectable: true,
    paid: true,
  },
  {
    id: "premium_template",
    title: "प्रीमियम टेम्पलेट",
    price: "₹5",
    unit: "प्रति टेम्पलेट",
    points: ["मांग दिखने पर शुरू होगा"],
    selectable: false,
    paid: true,
  },
];

export default function PricingPage() {
  const [selected, setSelected] = useState<PlanId>("free");
  const [notice, setNotice] = useState<string | null>(null);

  // ब्राउज़र में पिछला चुनाव वापस लाएं (SSR के बाद, ताकि hydration न टूटे)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && PLANS.some((p) => p.id === saved && p.selectable)) {
        setSelected(saved as PlanId);
      }
    } catch {
      // storage बंद हो तो डिफ़ॉल्ट चुनाव ही रहेगा
    }
  }, []);

  function choose(id: PlanId) {
    setSelected(id);
    setNotice(null);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // सेव न हो पाए तो भी चुनाव स्क्रीन पर रहेगा
    }
  }

  const current = PLANS.find((p) => p.id === selected);
  if (!current) return null;

  function onContinue() {
    if (!current) return;
    setNotice(`${current.title} चुना गया। भुगतान जल्द शुरू होगा, तब तक मुफ़्त प्लान इस्तेमाल करें।`);
  }

  return (
    <main style={styles.main}>
      <p style={styles.brand}>Sthamly</p>
      <h1 style={styles.h1}>प्लान</h1>
      <p style={styles.sub}>पायलट के दौरान ये कीमतें बदल सकती हैं।</p>

      <div role="radiogroup" aria-label="प्लान चुनें" style={styles.list}>
        {PLANS.map((plan) => {
          const isSelected = plan.id === selected;
          const disabled = !plan.selectable;
          return (
            <button
              key={plan.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => choose(plan.id)}
              style={{
                ...styles.card,
                ...(isSelected ? styles.cardSelected : {}),
                ...(disabled ? styles.cardDisabled : {}),
              }}
            >
              <div style={styles.headRow}>
                <span style={styles.title}>{plan.title}</span>
                {isSelected && <span style={styles.badgeSelected}>चुना गया</span>}
                {disabled && <span style={styles.badgeSoon}>जल्द</span>}
              </div>
              <div style={styles.priceRow}>
                <span style={styles.price}>{plan.price}</span>
                <span style={styles.unit}>{plan.unit}</span>
              </div>
              <div style={styles.points}>
                {plan.points.map((pt) => (
                  <span key={pt} style={styles.point}>
                    • {pt}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <section style={styles.summary}>
        <div style={styles.summaryText}>
          <span style={styles.summaryLabel}>चुना हुआ प्लान</span>
          <strong style={styles.summaryValue}>
            {current.title} · {current.price} {current.unit}
          </strong>
        </div>
        {current.paid ? (
          <button type="button" onClick={onContinue} style={styles.primaryBtn}>
            आगे बढ़ें
          </button>
        ) : (
          <Link href="/onboarding" style={styles.primaryBtn}>
            मुफ़्त में शुरू करें
          </Link>
        )}
      </section>

      {notice && (
        <p role="status" style={styles.notice}>
          {notice}
        </p>
      )}

      <p style={styles.footnote}>भुगतान UPI (Razorpay) से होगा, जो जल्द जुड़ेगा।</p>
    </main>
  );
}

const ACCENT = "#e8581c";
const CARD_BG = "#1b1b1b";
const BORDER = "#2a2a2a";
const TEXT = "#f5f5f5";
const MUTED = "#a3a3a3";

const styles: Record<string, CSSProperties> = {
  main: {
    minHeight: "100dvh",
    padding: "24px 16px 32px",
    background: "#0f0f0f",
    color: TEXT,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxSizing: "border-box",
  },
  brand: { margin: 0, color: ACCENT, fontWeight: 700, fontSize: 18 },
  h1: { margin: "4px 0 0", fontSize: 32, fontWeight: 700 },
  sub: { margin: 0, color: MUTED, fontSize: 15 },
  list: { display: "flex", flexDirection: "column", gap: 12, marginTop: 8 },
  card: {
    width: "100%",
    textAlign: "left",
    background: CARD_BG,
    color: TEXT,
    border: `1.5px solid ${BORDER}`,
    borderRadius: 16,
    padding: 16,
    font: "inherit",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  cardSelected: { borderColor: ACCENT, background: "#241812" },
  cardDisabled: { opacity: 0.55, cursor: "not-allowed" },
  headRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { fontSize: 18, fontWeight: 700 },
  badgeSelected: {
    marginLeft: "auto",
    background: ACCENT,
    color: "#fff",
    borderRadius: 999,
    padding: "2px 10px",
    fontSize: 12,
    fontWeight: 600,
  },
  badgeSoon: {
    marginLeft: "auto",
    border: `1px solid ${BORDER}`,
    color: MUTED,
    borderRadius: 999,
    padding: "2px 10px",
    fontSize: 12,
  },
  priceRow: { display: "flex", alignItems: "baseline", gap: 6 },
  price: { fontSize: 28, fontWeight: 700 },
  unit: { color: MUTED, fontSize: 14 },
  points: { display: "flex", flexDirection: "column", gap: 4, marginTop: 4 },
  point: { color: MUTED, fontSize: 14, lineHeight: 1.5 },
  summary: {
    marginTop: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: CARD_BG,
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    padding: 16,
  },
  summaryText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
  summaryLabel: { color: MUTED, fontSize: 12 },
  summaryValue: { fontSize: 15 },
  primaryBtn: {
    background: ACCENT,
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "12px 16px",
    fontSize: 15,
    fontWeight: 600,
    textDecoration: "none",
    textAlign: "center",
    cursor: "pointer",
    whiteSpace: "nowrap",
    font: "inherit",
  },
  notice: {
    margin: 0,
    color: TEXT,
    background: "#241812",
    border: `1px solid ${ACCENT}`,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
  },
  footnote: { margin: "8px 0 0", color: MUTED, fontSize: 12, textAlign: "center" },
};