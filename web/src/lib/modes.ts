// Sthamly AI web: role mode (सामान्य, दुकान, पढ़ाई, कानूनी, क्रिएटर).
// Abhi ye sirf UI hai: mode chip badalta hai aur suggestion cards dikhte hain.
// Server ko mode ka alag field bhejna Phase 1 ke agle kadam mein hoga (worker/src/routes/chat.ts).

export type ModeKey = "general" | "shop" | "study" | "legal" | "creator";

export interface ModeDef {
  key: ModeKey;
  label: string;
  // Kuch modes mein upar ek chhota disclaimer dikhta hai.
  note: string | null;
  suggestions: readonly string[];
}

export const MODES: readonly ModeDef[] = [
  {
    key: "general",
    label: "सामान्य",
    note: null,
    suggestions: [
      "किसी विषय को आसान भाषा में समझाओ",
      "मेरे लिए एक ईमेल का ड्राफ़्ट बनाओ",
      "मुझे एक छोटी प्रेरक कहानी सुनाओ",
      "रोज़ की दिनचर्या का सरल सुझाव दो",
    ],
  },
  {
    key: "shop",
    label: "दुकान",
    note: null,
    suggestions: [
      "आज के ऑफ़र का WhatsApp मैसेज लिखो",
      "एक सरल बिल का ढाँचा बनाओ",
      "उधार वाले ग्राहकों को याद दिलाने का मैसेज लिखो",
      "दुकान के लिए पोस्टर का विचार दो",
    ],
  },
  {
    key: "study",
    label: "पढ़ाई",
    note: null,
    suggestions: [
      "न्यूटन का पहला नियम आसान भाषा में समझाओ",
      "मेरे विषय पर 5 MCQ बनाओ, जवाब के साथ",
      "इस अध्याय के नोट्स का सारांश दो",
      "परीक्षा के लिए पढ़ाई का टाइम-टेबल बनाओ",
    ],
  },
  {
    key: "legal",
    label: "कानूनी",
    note: "यह कानूनी सलाह नहीं है। अंतिम फ़ैसले से पहले वकील से सलाह लें।",
    suggestions: [
      "किराएदार को नोटिस का ड्राफ़्ट बनाओ",
      "शिकायत पत्र का सरल ढाँचा बनाओ",
      "कानूनी शब्दों का आसान मतलब बताओ",
      "एक आवेदन पत्र का प्रारूप दो",
    ],
  },
  {
    key: "creator",
    label: "क्रिएटर",
    note: null,
    suggestions: [
      "Reel के लिए 3 hook लाइन लिखो",
      "इस विषय पर Hinglish caption बनाओ",
      "YouTube thumbnail का टेक्स्ट सुझाओ",
      "एक 30 सेकंड की स्क्रिप्ट लिखो",
    ],
  },
];

export function findMode(key: ModeKey): ModeDef {
  // MODES हमेशा भरा रहता है, इसलिए पहला मोड fallback है।
  return MODES.find((m) => m.key === key) ?? MODES[0]!;
}