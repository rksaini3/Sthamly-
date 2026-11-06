# Sthamly

छोटे शहर के दुकानदारों के लिए WhatsApp-first AI ad assistant।
दुकानदार दुकान की फोटो और ऑफर भेजता है, और उसे पोस्टर (1:1), हिंग्लिश कैप्शन मिलते हैं। रील (9:16) अगले चरण में जुड़ेगी।

> **Status:** Pilot की तैयारी। Login, WhatsApp flow, credit, poster render, dashboard, PWA और डेटा हटाने का रास्ता लिखा जा चुका है। अभी बाकी: AI caption provider, पहली बार typecheck और build, और end-to-end टेस्ट। पूरा प्लान `docs/MVP_BRIEF.md` में है।

## Stack

- **Next.js 15 (App Router) + TypeScript (strict)**, Vercel पर deploy
- **Supabase:** Postgres, Auth (ईमेल magic link), Storage (RLS के साथ)
- **WhatsApp Cloud API** (Meta) for messaging
- **AI:** provider adapter (`lib/ai/`). Caption के लिए provider अभी तय होना है।
- **Poster:** satori + resvg (हिंदी font से)
- **Validation:** zod
- **PWA:** manifest और service worker, Home screen पर install हो सकता है
- **Billing (Phase 2):** Razorpay (UPI AutoPay)

## फोल्डर

| Path | क्या है |
|---|---|
| `app/` | Pages और API routes (`app/api/...`) |
| `components/` | React components (`ui/`, `nav/`, `onboarding/`, `dashboard/`, `pricing/`, `legal/`, `pwa/`) |
| `lib/` | Server और shared logic: env, supabase, whatsapp, ai, render, quota, prompts, jobs, account |
| `types/` | Domain types, WhatsApp payload types, Supabase DB types |
| `supabase/migrations/` | Postgres schema, RLS और storage |
| `public/` | Static files, icons, manifest, service worker |
| `scripts/` | Local test और seed scripts (TypeScript, `tsx` से चलते हैं) |
| `docs/` | प्लान, architecture, file tree, compliance, metrics, pilot log |

पूरी फाइल सूची: `docs/FILE_TREE.md`।

## शुरू कैसे करें

```bash
cp .env.example .env.local     # keys भरें
npm install
npm run typecheck              # TypeScript जांच
npm run dev                    # http://localhost:3000