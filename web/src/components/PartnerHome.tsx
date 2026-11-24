// Sthamly AI web: partner (CSC / vakeel) ka home. Chaar bade cards, har ek ek kaam.
// Kaam wahi chat mein chalta hai: card dabane par sawal composer mein bhar jaata hai.
// Lead aur rating ka data backend se aayega, tab tak saaf "jaldi aayega" likha hai.

import { useState } from "react";

export type PartnerAction = "customer_check" | "whatsapp_draft" | "today_leads" | "my_rating";

interface PartnerHomeProps {
  onAction: (action: PartnerAction, prefill: string) => void;
  onExit: () => void;
}

const PARTNER_CARDS: { action: PartnerAction; title: string; hint: string; prefill: string; soon?: boolean }[] = [
  {
    action: "customer_check",
    title: "कस्टमर का गज़ जाँचो",
    hint: "ज़मीन के माप को गज़ और वर्ग फ़ुट में बदलें",
    prefill: "कस्टमर की ज़मीन का माप गज़ में जाँचने में मदद करो: ",
  },
  {
    action: "whatsapp_draft",
    title: "WhatsApp ड्राफ़्ट",
    hint: "ग्राहक को भेजने के लिए छोटा, विनम्र संदेश",
    prefill: "ग्राहक को WhatsApp पर भेजने के लिए एक छोटा, विनम्र संदेश लिखो: ",
  },
  {
    action: "today_leads",
    title: "आज की लीड",
    hint: "आज के नए ग्राहक",
    prefill: "",
    soon: true,
  },
  {
    action: "my_rating",
    title: "मेरी रेटिंग",
    hint: "ग्राहकों की राय",
    prefill: "",
    soon: true,
  },
];

export function PartnerHome({ onAction, onExit }: PartnerHomeProps) {
  const [notice, setNotice] = useState<string | null>(null);

  function handle(card: (typeof PARTNER_CARDS)[number]) {
    if (card.soon) {
      setNotice(`"${card.title}" की जानकारी जल्द आएगी।`);
      return;
    }
    setNotice(null);
    onAction(card.action, card.prefill);
  }

  return (
    <section className="partner-home" aria-labelledby="partner-home-title">
      <div className="partner-band" role="note">
        <strong>पार्टनर मोड</strong>
        <span className="small"> · CSC / वकील के लिए</span>
      </div>
      <h2 id="partner-home-title" className="partner-title">
        नमस्ते, पार्टनर
      </h2>

      <div className="partner-grid">
        {PARTNER_CARDS.map((card) => (
          <button
            key={card.action}
            type="button"
            className="partner-card"
            onClick={() => handle(card)}
          >
            <span className="partner-card-title">{card.title}</span>
            <span className="partner-card-hint small">{card.hint}</span>
            {card.soon && <span className="partner-soon small">जल्द आएगा</span>}
          </button>
        ))}
      </div>

      {notice !== null && (
        <p className="partner-notice" role="status">
          {notice}
        </p>
      )}

      <button type="button" className="btn-ghost partner-exit" onClick={onExit}>
        उपभोक्ता मोड पर जाएँ
      </button>
    </section>
  );
}