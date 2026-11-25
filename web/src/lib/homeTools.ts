// Sthamly AI web: home screen ki categories aur har category ke 4 tool cards.
// Ye sirf list hai. Credit ki ginti worker karta hai, yahan kuch nahi.

export type HomeCategoryId = "seller" | "general" | "shop" | "creator" | "study" | "legal";

export interface HomeCategory {
  id: HomeCategoryId;
  label: string;
}

export type HomeIconName = "chat" | "image" | "doc" | "chart";

export interface HomeTool {
  id: string;
  title: string;
  hint: string;
  // Card dabane par input mein ye shuruaati text aata hai.
  prompt: string;
  icon: HomeIconName;
}

export const HOME_CATEGORIES: HomeCategory[] = [
  { id: "seller", label: "Seller" },
  { id: "general", label: "सामान्य" },
  { id: "shop", label: "दुकान" },
  { id: "creator", label: "क्रिएटर" },
  { id: "study", label: "पढ़ाई" },
  { id: "legal", label: "कानूनी" },
];

export const HOME_TOOLS: Record<HomeCategoryId, HomeTool[]> = {
  seller: [
    { id: "seller_desc", title: "प्रोडक्ट विवरण", hint: "आइटम के लिए आकर्षक लिखावट", prompt: "मेरे प्रोडक्ट का विवरण लिखो: ", icon: "doc" },
    { id: "seller_offer", title: "ऑफ़र पोस्ट", hint: "सेल या डिस्काउंट का मैसेज", prompt: "मेरी सेल के लिए ऑफ़र पोस्ट बनाओ: ", icon: "chat" },
    { id: "seller_price", title: "प्राइस लिस्ट", hint: "सामान और दाम की सूची", prompt: "इन सामानों की प्राइस लिस्ट बनाओ: ", icon: "chart" },
    { id: "seller_photo", title: "फ़ोटो से विवरण", hint: "तस्वीर देखकर विवरण", prompt: "इस फ़ोटो से प्रोडक्ट का विवरण बनाओ। ", icon: "image" },
  ],
  general: [
    { id: "gen_chat", title: "कोई भी सवाल", hint: "हिंदी या हिंग्लिश में पूछें", prompt: "", icon: "chat" },
    { id: "gen_photo", title: "फ़ोटो से सवाल", hint: "तस्वीर भेजें और पूछें", prompt: "इस फ़ोटो के बारे में बताओ: ", icon: "image" },
    { id: "gen_translate", title: "अनुवाद", hint: "किसी भी भाषा में बदलें", prompt: "इसका अनुवाद करो: ", icon: "doc" },
    { id: "gen_message", title: "मैसेज लिखें", hint: "सही शब्दों में संदेश", prompt: "इस बात पर एक अच्छा मैसेज लिखो: ", icon: "chat" },
  ],
  shop: [
    { id: "shop_board", title: "दुकान का बोर्ड", hint: "बोर्ड या पोस्टर का टेक्स्ट", prompt: "मेरी दुकान के लिए बोर्ड का टेक्स्ट बनाओ: ", icon: "image" },
    { id: "shop_bill", title: "बिल का टेक्स्ट", hint: "ग्राहक के लिए बिल की लाइनें", prompt: "इन सामानों का बिल बनाओ: ", icon: "doc" },
    { id: "shop_reply", title: "ग्राहक को जवाब", hint: "शिकायत या पूछताछ का जवाब", prompt: "ग्राहक को यह जवाब लिखो: ", icon: "chat" },
    { id: "shop_ledger", title: "हिसाब का सार", hint: "आज की बिक्री का सारांश", prompt: "आज की बिक्री का हिसाब सार में बताओ: ", icon: "chart" },
  ],
  creator: [
    { id: "cre_reel", title: "रील स्क्रिप्ट", hint: "छोटी वीडियो का प्लान", prompt: "मेरी रील के लिए स्क्रिप्ट लिखो: ", icon: "doc" },
    { id: "cre_caption", title: "कैप्शन और हैशटैग", hint: "पोस्ट के लिए शब्द", prompt: "इस पोस्ट के लिए कैप्शन और हैशटैग दो: ", icon: "chat" },
    { id: "cre_thumb", title: "थंबनेल आइडिया", hint: "कवर के लिए विचार", prompt: "मेरे वीडियो के थंबनेल के लिए आइडिया दो: ", icon: "image" },
    { id: "cre_plan", title: "पोस्ट प्लान", hint: "हफ़्ते भर का कंटेंट", prompt: "अगले हफ़्ते के लिए पोस्ट का प्लान बनाओ: ", icon: "chart" },
  ],
  study: [
    { id: "stu_explain", title: "आसान समझाओ", hint: "कठिन टॉपिक सरल भाषा में", prompt: "यह टॉपिक आसान भाषा में समझाओ: ", icon: "chat" },
    { id: "stu_notes", title: "नोट्स बनाओ", hint: "पॉइंट्स में सार", prompt: "इस पाठ के नोट्स बनाओ: ", icon: "doc" },
    { id: "stu_quiz", title: "क्विज़ बनाओ", hint: "अभ्यास के सवाल", prompt: "इस टॉपिक पर 5 सवाल बनाओ: ", icon: "chart" },
    { id: "stu_photo", title: "सवाल की फ़ोटो", hint: "किताब का सवाल हल करें", prompt: "इस सवाल को हल करके समझाओ। ", icon: "image" },
  ],
  legal: [
    { id: "leg_notice", title: "नोटिस ड्राफ़्ट", hint: "नोटिस का शुरुआती मसौदा", prompt: "इस मामले के लिए नोटिस का ड्राफ़्ट बनाओ: ", icon: "doc" },
    { id: "leg_agreement", title: "समझौते का सार", hint: "कागज़ की मुख्य बातें", prompt: "इस समझौते की मुख्य बातें बताओ: ", icon: "doc" },
    { id: "leg_term", title: "कानूनी शब्द समझें", hint: "मुश्किल शब्दों का मतलब", prompt: "इस कानूनी शब्द का मतलब सरल भाषा में बताओ: ", icon: "chat" },
    { id: "leg_checklist", title: "दस्तावेज़ चेकलिस्ट", hint: "क्या-क्या चाहिए", prompt: "इस काम के लिए कौन-कौन से दस्तावेज़ चाहिए: ", icon: "chart" },
  ],
};