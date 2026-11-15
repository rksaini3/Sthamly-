# ADR 0001: App shell (Android app का ढांचा)

- Status: स्वीकृत (proposed), pilot से पहले पक्का होगा
- तारीख़: Step 1
- जुड़े फ़ैसले: offline-first दुकान का core (Doc के अनुसार)

## संदर्भ (मापा हुआ)

मौजूदा Next.js app की जांच (repo में `grep`/`find` से):

- कुल pages: 20
- जिन pages में server-only API (cookies, headers, searchParams, redirect, server Supabase) है: 16 (लगभग 80%)
- API route handlers: 26
- Middleware: मौजूद (`middleware.ts`)
- Server actions: 0
- Server secrets छूने वाले lib modules: 27
- कोड का आकार: app 596K, components 368K, lib 260K

Doc की मांग: दुकान के काम बिना internet चलें (poster, हिसाब, voice, approval cards), और APK से दिया जाए।

## विकल्प

**A. Capacitor में वेबसाइट लोड करें (server URL mode)**
- फ़ायदा: सबसे तेज़, कोड बदलना लगभग नहीं।
- नुकसान: पहली बार खोलने पर internet चाहिए। Offline poster और हिसाब का Doc का मूल वादा टूटता है।
- फ़ैसला: नहीं।

**B. पूरी Next.js app को static export करें (`output: "export"`)**
- फ़ायदा: एक ही codebase।
- नुकसान: 16 में से 16 server-dependent pages का rewrite, middleware हटाना, auth client पर लाना, सारी API routes को Vercel में ही रखना। पूरे app को छूना पड़ेगा, और नए फ़ीचर धीमे होंगे।
- फ़ैसला: नहीं।

**C. अलग offline shell (चुना गया)**
- Capacitor + Vite + React + TypeScript की छोटी SPA, सिर्फ़ दुकान के core के लिए।
- Offline में चलता है: poster (Canvas), हिसाब-उधार (SQLite), approval cards, voice (built-in speech)।
- Online में बोलता है: मौजूदा Vercel API (login, wallet, AI, web search, live)।
- Next.js app Vercel पर वैसे ही रहती है (web, agent, live, billing)।
- फ़ायदा: offline वादा पूरा, मौजूदा server code बदलना नहीं पड़ता, दोनों अलग deploy हो सकते हैं।
- नुकसान: दो frontend (web और APK)। UI के हिस्से दोबारा लिखने पड़ सकते हैं। इसे संभालने के लिए साझा `packages/` बाद में।

## फ़ैसला

विकल्प C। Vite SPA को Capacitor में लपेटा जाएगा।

कारण: data (80% pages server-dependent) बताता है कि B बहुत महंगा है, और A offline वादे को तोड़ता है। C में दोनों सीमाएं नहीं हैं।

## Tool चुनाव (हर एक के लिए सिफ़ारिश)

| हिस्सा | चुनाव | कारण |
|---|---|---|
| Shell | Capacitor (current stable major, deploy से पहले verify करें) | React के साथ अच्छा, Android plugins आधिकारिक |
| Bundler | Vite | SPA के लिए तेज़, Capacitor docs में डिफ़ॉल्ट जैसा |
| Local DB | Capacitor SQLite, SQLCipher encryption के साथ | Data encrypted रहे |
| Auth | मौजूदा Supabase Auth, phone OTP provider के साथ | एक ही auth system, दो auth system नहीं |
| SMS | MSG91 (DLT registration ज़रूरी) | भारत में DLT के बिना SMS नहीं जाते |
| Voice | पहले Android built-in Hindi speech, बाद में Whisper (optional download) | APK का size न बढ़े |
| Poster | Canvas + bundled Noto Sans Devanagari (OFL) | Satori server पर है, phone पर Canvas ही चलेगा |
| Share | @capacitor/share (Android share sheet) | WhatsApp का direct API नहीं है |
| Backup | Google Drive appDataFolder, key device keystore में | Scope non-sensitive, verification आसान |
| Crash logs | Sentry (mobile SDK) | Pilot में crash दिखना ज़रूरी |

## परिणाम

- Step 2 से पहले तय होना चाहिए: auth का phone flow (Supabase phone auth + MSG91 SMS hook, या अलग)।
- Shell और web का साझा code तुरंत नहीं होगा। पहले दोनों अलग चलेंगे, फिर जहां ज़रूरत हो वहां `packages/` में निकाला जाएगा।
- Vercel API routes CORS के साथ APK की origin को allow करेंगी (Capacitor का origin `https://localhost` या `capacitor://localhost` होता है)।

## जोखिम

1. **DLT registration में हफ़्ते लग सकते हैं।** इसे अभी शुरू करें, Step 6 का इंतज़ार न करें।
2. **Play Billing:** अगर Play Store पर digital plan बेचना है, तो Razorpay की जगह Play Billing लगेगा। Policy अभी verify करें।
3. **Offline और auth:** पहली बार login internet से होगा, उसके बाद session local रहेगा। ये सामान्य है।
4. **Dual frontend का बोझ:** UI बदलने पर दोनों जगह असर पड़ेगा। Pilot के बाद इसे देखें।

## अगला कदम (Step 2 की तैयारी)

1. `shell/` नाम का नया folder: Vite + React + TypeScript + Capacitor।
2. Shell में एक खाली screen, जो flight mode में खुले और SQLite में एक row लिखे।
3. CORS जांच: Vercel पर API से APK का origin allow हो।
4. DLT registration शुरू करें और MSG91 खाता खोलें।