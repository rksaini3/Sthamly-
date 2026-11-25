// Sthamly AI web: home screen ki categories aur har category ke 4 tool cards.
// Har shabd teeno bhashaon mein: hi (Hindi), hinglish (Roman Hindi), en (English).
// Ye sirf list hai. Credit ki ginti worker karta hai, yahan kuch nahi.

import type { SupportedLanguage } from "./languages";

type Localized = Record<SupportedLanguage, string>;

export type HomeCategoryId = "seller" | "general" | "shop" | "creator" | "study" | "legal";

export interface HomeCategory {
  id: HomeCategoryId;
  label: Localized;
}

export type HomeIconName = "chat" | "image" | "doc" | "chart";

export interface HomeTool {
  id: string;
  title: Localized;
  hint: Localized;
  // Card dabane par input mein ye shuruaati text aata hai (bhasha ke hisaab se). Khaali ho to sirf focus.
  prompt: Localized;
  icon: HomeIconName;
}

export const HOME_CATEGORIES: HomeCategory[] = [
  { id: "seller", label: { hi: "Seller", hinglish: "Seller", en: "Seller" } },
  { id: "general", label: { hi: "सामान्य", hinglish: "Samanya", en: "General" } },
  { id: "shop", label: { hi: "दुकान", hinglish: "Dukaan", en: "Shop" } },
  { id: "creator", label: { hi: "क्रिएटर", hinglish: "Creator", en: "Creator" } },
  { id: "study", label: { hi: "पढ़ाई", hinglish: "Padhai", en: "Study" } },
  { id: "legal", label: { hi: "कानूनी", hinglish: "Kaanooni", en: "Legal" } },
];

export const HOME_TOOLS: Record<HomeCategoryId, HomeTool[]> = {
  seller: [
    {
      id: "seller_desc",
      title: { hi: "प्रोडक्ट विवरण", hinglish: "Product vivran", en: "Product description" },
      hint: { hi: "आइटम के लिए आकर्षक लिखावट", hinglish: "Item ke liye aakarshak likhawat", en: "Attractive text for your item" },
      prompt: { hi: "मेरे प्रोडक्ट का विवरण लिखो: ", hinglish: "Mere product ka vivran likho: ", en: "Write a description for my product: " },
      icon: "doc",
    },
    {
      id: "seller_offer",
      title: { hi: "ऑफ़र पोस्ट", hinglish: "Offer post", en: "Offer post" },
      hint: { hi: "सेल या डिस्काउंट का मैसेज", hinglish: "Sale ya discount ka message", en: "Message for a sale or discount" },
      prompt: { hi: "मेरी सेल के लिए ऑफ़र पोस्ट बनाओ: ", hinglish: "Meri sale ke liye offer post banao: ", en: "Create an offer post for my sale: " },
      icon: "chat",
    },
    {
      id: "seller_price",
      title: { hi: "प्राइस लिस्ट", hinglish: "Price list", en: "Price list" },
      hint: { hi: "सामान और दाम की सूची", hinglish: "Saman aur daam ki suchi", en: "List of items and prices" },
      prompt: { hi: "इन सामानों की प्राइस लिस्ट बनाओ: ", hinglish: "In samaan ki price list banao: ", en: "Make a price list for these items: " },
      icon: "chart",
    },
    {
      id: "seller_photo",
      title: { hi: "फ़ोटो से विवरण", hinglish: "Photo se vivran", en: "Description from photo" },
      hint: { hi: "तस्वीर देखकर विवरण", hinglish: "Tasveer dekh kar vivran", en: "Describe from a picture" },
      prompt: { hi: "इस फ़ोटो से प्रोडक्ट का विवरण बनाओ। ", hinglish: "Is photo se product ka vivran banao. ", en: "Write a product description from this photo. " },
      icon: "image",
    },
  ],
  general: [
    {
      id: "gen_chat",
      title: { hi: "कोई भी सवाल", hinglish: "Koi bhi sawal", en: "Ask anything" },
      hint: { hi: "हिंदी या हिंग्लिश में पूछें", hinglish: "Hindi ya Hinglish mein poochhein", en: "Ask in Hindi, Hinglish or English" },
      prompt: { hi: "", hinglish: "", en: "" },
      icon: "chat",
    },
    {
      id: "gen_photo",
      title: { hi: "फ़ोटो से सवाल", hinglish: "Photo se sawal", en: "Ask about a photo" },
      hint: { hi: "तस्वीर भेजें और पूछें", hinglish: "Tasveer bhejein aur poochhein", en: "Send a picture and ask" },
      prompt: { hi: "इस फ़ोटो के बारे में बताओ: ", hinglish: "Is photo ke baare mein batao: ", en: "Tell me about this photo: " },
      icon: "image",
    },
    {
      id: "gen_translate",
      title: { hi: "अनुवाद", hinglish: "Anuvaad", en: "Translate" },
      hint: { hi: "किसी भी भाषा में बदलें", hinglish: "Kisi bhi bhasha mein badlein", en: "Convert to any language" },
      prompt: { hi: "इसका अनुवाद करो: ", hinglish: "Iska anuvaad karo: ", en: "Translate this: " },
      icon: "doc",
    },
    {
      id: "gen_message",
      title: { hi: "मैसेज लिखें", hinglish: "Message likhein", en: "Write a message" },
      hint: { hi: "सही शब्दों में संदेश", hinglish: "Sahi shabdon mein sandesh", en: "A message with the right words" },
      prompt: { hi: "इस बात पर एक अच्छा मैसेज लिखो: ", hinglish: "Is baat par ek achha message likho: ", en: "Write a good message about this: " },
      icon: "chat",
    },
  ],
  shop: [
    {
      id: "shop_board",
      title: { hi: "दुकान का बोर्ड", hinglish: "Dukaan ka board", en: "Shop board" },
      hint: { hi: "बोर्ड या पोस्टर का टेक्स्ट", hinglish: "Board ya poster ka text", en: "Text for a board or poster" },
      prompt: { hi: "मेरी दुकान के लिए बोर्ड का टेक्स्ट बनाओ: ", hinglish: "Meri dukaan ke liye board ka text banao: ", en: "Write board text for my shop: " },
      icon: "image",
    },
    {
      id: "shop_bill",
      title: { hi: "बिल का टेक्स्ट", hinglish: "Bill ka text", en: "Bill text" },
      hint: { hi: "ग्राहक के लिए बिल की लाइनें", hinglish: "Customer ke liye bill ki lines", en: "Bill lines for a customer" },
      prompt: { hi: "इन सामानों का बिल बनाओ: ", hinglish: "In samaan ka bill banao: ", en: "Make a bill for these items: " },
      icon: "doc",
    },
    {
      id: "shop_reply",
      title: { hi: "ग्राहक को जवाब", hinglish: "Customer ko jawab", en: "Reply to customer" },
      hint: { hi: "शिकायत या पूछताछ का जवाब", hinglish: "Shikayat ya poochhtaach ka jawab", en: "Answer a complaint or question" },
      prompt: { hi: "ग्राहक को यह जवाब लिखो: ", hinglish: "Customer ko ye jawab likho: ", en: "Write this reply to the customer: " },
      icon: "chat",
    },
    {
      id: "shop_ledger",
      title: { hi: "हिसाब का सार", hinglish: "Hisaab ka saar", en: "Ledger summary" },
      hint: { hi: "आज की बिक्री का सारांश", hinglish: "Aaj ki bikri ka saraansh", en: "Summary of today's sales" },
      prompt: { hi: "आज की बिक्री का हिसाब सार में बताओ: ", hinglish: "Aaj ki bikri ka hisaab saar mein batao: ", en: "Summarise today's sales: " },
      icon: "chart",
    },
  ],
  creator: [
    {
      id: "cre_reel",
      title: { hi: "रील स्क्रिप्ट", hinglish: "Reel script", en: "Reel script" },
      hint: { hi: "छोटी वीडियो का प्लान", hinglish: "Chhoti video ka plan", en: "Plan for a short video" },
      prompt: { hi: "मेरी रील के लिए स्क्रिप्ट लिखो: ", hinglish: "Meri reel ke liye script likho: ", en: "Write a script for my reel: " },
      icon: "doc",
    },
    {
      id: "cre_caption",
      title: { hi: "कैप्शन और हैशटैग", hinglish: "Caption aur hashtag", en: "Caption and hashtags" },
      hint: { hi: "पोस्ट के लिए शब्द", hinglish: "Post ke liye shabd", en: "Words for your post" },
      prompt: { hi: "इस पोस्ट के लिए कैप्शन और हैशटैग दो: ", hinglish: "Is post ke liye caption aur hashtag do: ", en: "Give a caption and hashtags for this post: " },
      icon: "chat",
    },
    {
      id: "cre_thumb",
      title: { hi: "थंबनेल आइडिया", hinglish: "Thumbnail idea", en: "Thumbnail idea" },
      hint: { hi: "कवर के लिए विचार", hinglish: "Cover ke liye vichar", en: "Ideas for a cover" },
      prompt: { hi: "मेरे वीडियो के थंबनेल के लिए आइडिया दो: ", hinglish: "Mere video ke thumbnail ke liye idea do: ", en: "Give thumbnail ideas for my video: " },
      icon: "image",
    },
    {
      id: "cre_plan",
      title: { hi: "पोस्ट प्लान", hinglish: "Post plan", en: "Post plan" },
      hint: { hi: "हफ़्ते भर का कंटेंट", hinglish: "Hafte bhar ka content", en: "A week of content" },
      prompt: { hi: "अगले हफ़्ते के लिए पोस्ट का प्लान बनाओ: ", hinglish: "Agle hafte ke liye post ka plan banao: ", en: "Make a post plan for next week: " },
      icon: "chart",
    },
  ],
  study: [
    {
      id: "stu_explain",
      title: { hi: "आसान समझाओ", hinglish: "Aasan samjhao", en: "Explain simply" },
      hint: { hi: "कठिन टॉपिक सरल भाषा में", hinglish: "Kathin topic saral bhasha mein", en: "A hard topic in simple words" },
      prompt: { hi: "यह टॉपिक आसान भाषा में समझाओ: ", hinglish: "Ye topic aasan bhasha mein samjhao: ", en: "Explain this topic in simple words: " },
      icon: "chat",
    },
    {
      id: "stu_notes",
      title: { hi: "नोट्स बनाओ", hinglish: "Notes banao", en: "Make notes" },
      hint: { hi: "पॉइंट्स में सार", hinglish: "Points mein saar", en: "Summary in points" },
      prompt: { hi: "इस पाठ के नोट्स बनाओ: ", hinglish: "Is paath ke notes banao: ", en: "Make notes for this lesson: " },
      icon: "doc",
    },
    {
      id: "stu_quiz",
      title: { hi: "क्विज़ बनाओ", hinglish: "Quiz banao", en: "Make a quiz" },
      hint: { hi: "अभ्यास के सवाल", hinglish: "Abhyaas ke sawal", en: "Practice questions" },
      prompt: { hi: "इस टॉपिक पर 5 सवाल बनाओ: ", hinglish: "Is topic par 5 sawal banao: ", en: "Make 5 questions on this topic: " },
      icon: "chart",
    },
    {
      id: "stu_photo",
      title: { hi: "सवाल की फ़ोटो", hinglish: "Sawal ki photo", en: "Question from photo" },
      hint: { hi: "किताब का सवाल हल करें", hinglish: "Kitaab ka sawal hal karein", en: "Solve a question from a book" },
      prompt: { hi: "इस सवाल को हल करके समझाओ। ", hinglish: "Is sawal ko hal karke samjhao. ", en: "Solve this question and explain. " },
      icon: "image",
    },
  ],
  legal: [
    {
      id: "leg_notice",
      title: { hi: "नोटिस ड्राफ़्ट", hinglish: "Notice draft", en: "Notice draft" },
      hint: { hi: "नोटिस का शुरुआती मसौदा", hinglish: "Notice ka shuruaati masauda", en: "A first draft of a notice" },
      prompt: { hi: "इस मामले के लिए नोटिस का ड्राफ़्ट बनाओ: ", hinglish: "Is mamle ke liye notice ka draft banao: ", en: "Draft a notice for this matter: " },
      icon: "doc",
    },
    {
      id: "leg_agreement",
      title: { hi: "समझौते का सार", hinglish: "Samjhauta ka saar", en: "Agreement summary" },
      hint: { hi: "कागज़ की मुख्य बातें", hinglish: "Kaagaz ki mukhya baatein", en: "Key points of the document" },
      prompt: { hi: "इस समझौते की मुख्य बातें बताओ: ", hinglish: "Is samjhaute ki mukhya baatein batao: ", en: "Tell me the key points of this agreement: " },
      icon: "doc",
    },
    {
      id: "leg_term",
      title: { hi: "कानूनी शब्द समझें", hinglish: "Kaanooni shabd samjhein", en: "Understand a legal term" },
      hint: { hi: "मुश्किल शब्दों का मतलब", hinglish: "Mushkil shabdon ka matlab", en: "Meaning of hard words" },
      prompt: { hi: "इस कानूनी शब्द का मतलब सरल भाषा में बताओ: ", hinglish: "Is kaanooni shabd ka matlab saral bhasha mein batao: ", en: "Explain this legal term in simple words: " },
      icon: "chat",
    },
    {
      id: "leg_checklist",
      title: { hi: "दस्तावेज़ चेकलिस्ट", hinglish: "Dastavez checklist", en: "Document checklist" },
      hint: { hi: "क्या-क्या चाहिए", hinglish: "Kya-kya chahiye", en: "What you need" },
      prompt: { hi: "इस काम के लिए कौन-कौन से दस्तावेज़ चाहिए: ", hinglish: "Is kaam ke liye kaun-kaun se dastavez chahiye: ", en: "Which documents are needed for this task: " },
      icon: "chart",
    },
  ],
};
