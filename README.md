# Sthamly

दुकानदारों के लिए WhatsApp-first AI सेवा। दुकान की फोटो और ऑफर भेजें, पोस्टर और हिंग्लिश कैप्शन पाएं।

## स्टैक

- Next.js 15 (App Router), TypeScript, PWA
- Supabase: Postgres, Auth, Storage (RLS के साथ)
- WhatsApp Cloud API (Meta)
- Gemini (caption), satori और resvg (पोस्टर)
- Vercel (hosting और cron)

## शुरू करें

```bash
nvm use            # .nvmrc के हिसाब से Node
npm install
cp .env.example .env.local   # फिर उसमें अपनी keys भरें
npm run dev
```

## Database

Supabase SQL Editor में `supabase/migrations/` की फाइलें क्रम से चलाएं (0001 से 0009 तक)।
Schema बदलने के बाद:

```bash
npm run db:types   # types/database.ts बनाता है
```

## स्क्रिप्ट

| कमांड | काम |
|---|---|
| `npm run dev` | लोकल सर्वर |
| `npm run build` | production build |
| `npm run typecheck` | TypeScript जांच |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run test:webhook` | WhatsApp webhook का लोकल टेस्ट |

## Deploy (Vercel)

1. GitHub पर repo बनाएं, फिर Vercel में Import करें।
2. `.env.example` की सारी keys Vercel के Environment Variables में डालें।
3. `NEXT_PUBLIC_APP_URL` को production domain पर रखें।
4. Supabase में Site URL और Redirect URLs में production `/auth/callback` जोड़ें।
5. WhatsApp webhook का URL production domain पर बदलें।

## सुरक्षा

- `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_ACCESS_TOKEN`, `CRON_SECRET`, `GEMINI_API_KEY` सिर्फ server पर रहते हैं।
- `NEXT_PUBLIC_` वाले variables में कोई secret न रखें।
- Privacy और Terms के पन्ने draft हैं, launch से पहले वकील की समीक्षा ज़रूरी है।

## स्थिति

- Phase 1 (pilot): पोस्टर, कैप्शन, login, credit, WhatsApp flow, डेटा हटाना।
- अभी बाकी: Gemini और WhatsApp का असली टेस्ट, Razorpay (Phase 2), रील।