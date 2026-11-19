# Sthamly AI (Blueprint 3.0)

Hindi aur Hinglish mein chhote dukandaron ke liye AI sahayak. Ye repo Blueprint 3.0 ke hisaab se bana hai:
Cloudflare Worker gateway, React + Vite web app, aur baad mein Capacitor se Android.

> **Status:** Phase 1 (Core AI) ka code taiyaar hai: streaming chat, history, login, model routing, usage aur budget cap.
> Live voice, connectors, memory, billing aur Android abhi baaki hain. Blueprint section 12 aur 13 dekhein.

## Folder structure

| Path | Kya hai |
|---|---|
| `worker/` | Cloudflare Worker: AI gateway, chat, history, user routes, budget |
| `web/` | React + Vite frontend: login, chat, usage, settings |
| `supabase/migrations/` | Database schema, RLS aur grants (schema `sthamly_v3`) |
| `.github/workflows/` | CI (tests, typecheck, secret scan) aur Worker deploy |
| `docs/` | Blueprint aur architecture notes (agar hon) |

## Stack

- **Gateway:** Cloudflare Workers (TypeScript, `wrangler`)
- **Frontend:** React 19, Vite, React Router, Vercel par host
- **Database, auth, storage:** Supabase (Postgres, RLS, Auth). Tables `sthamly_v3` schema mein hain.
- **AI:** Groq (chat, Whisper) aur Gemini (reasoning, vision, embeddings). Keys sirf Worker mein.
- **Payments:** Razorpay (Stage 5 mein, abhi nahi)

## Pehli baar setup (local)

### 1. Supabase project
1. Dev ke liye naya Supabase project banayein. Purane project mein mat chalayein.
2. SQL Editor mein `supabase/migrations/0001_core_v3.sql` chalayein.
3. **Settings → API → Exposed schemas** mein `sthamly_v3` add karein.
4. **Authentication → URL Configuration → Redirect URLs** mein `http://localhost:5173/login` add karein.

### 2. Cloudflare KV