# Sthamly

छोटे शहर के दुकानदारों के लिए WhatsApp-first AI ad assistant।
दुकानदार दुकान की फोटो और ऑफर भेजता है, और उसे रील (9:16), पोस्टर (1:1 / A4) और हिंग्लिश कैप्शन मिलते हैं।

> **Status:** Scaffold। ढांचा और types तैयार हैं, ज़्यादातर functions अभी `not implemented` हैं। पूरा प्लान `docs/PLAN.md` में है।

## Stack

- **Next.js 15 (App Router) + TypeScript (strict)**, Vercel पर deploy
- **Supabase:** Postgres, Auth, Storage (RLS के साथ)
- **WhatsApp Cloud API** (Meta) for messaging
- **AI:** provider adapter (`lib/ai/`), शुरू में Fal.ai
- **Poster:** satori + resvg (हिंदी font से)
- **Validation:** zod
- **Billing (Phase 2):** Razorpay (UPI AutoPay)

## फोल्डर

| Path | क्या है |
|---|---|
| `app/` | Pages और API routes (`app/api/...`) |
| `components/` | React components (`ui/`, `onboarding/`, `dashboard/`, `pricing/`) |
| `lib/` | Server और shared logic: env, supabase, whatsapp, ai, render, quota, prompts |
| `types/` | Domain types, WhatsApp payload types, Supabase DB types |
| `supabase/migrations/` | Postgres schema और RLS |
| `public/` | Static files, fonts, templates |
| `scripts/` | Local test और seed scripts (TypeScript, `tsx` से चलते हैं) |
| `docs/` | प्लान, architecture, file tree, compliance, metrics, pilot log |

पूरी फाइल सूची और मेहनत का अनुमान: `docs/FILE_TREE.md`।

## शुरू कैसे करें

```bash
cp .env.example .env.local     # keys भरें
npm install
npm run typecheck              # TypeScript जांच
npm run dev                    # http://localhost:3000
```

Database के लिए (Supabase CLI):

```bash
npx supabase link --project-ref <ref>
npm run db:push
npm run db:types               # types/database.ts को असली schema से भरता है
```

## Rules

- `lib/supabase/admin.ts` और `SUPABASE_SERVICE_ROLE_KEY` सिर्फ server पर।
- Secret keys कभी `NEXT_PUBLIC_` से शुरू न हों।
- Prompts में हिंदी का spelling-sensitive टेक्स्ट AI से poster पर न लिखवाएं, वह `lib/render/poster.ts` से लिखा जाए।
- Launch से पहले `docs/COMPLIANCE.md` की checklist पूरी करें।

## अगला कदम

1. `docs/PLAN.md` पढ़ें, नाम और pricing फाइनल करें।
2. Phase 0: 20 दुकानों के साथ manual pilot (कोड से पहले)।
3. Phase 1: `docs/FILE_TREE.md` के MVP सेट के हिसाब से `not implemented` वाले functions भरें।
