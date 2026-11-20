# Sthamly AI (Blueprint 0)

Hindi aur Hinglish mein chhote dukandaron ke liye AI sahayak. Ye repo Blueprint 3.0 ke hisaab se bana hai:
Cloudflare Worker gateway, React + Vite web app, aur baad mein Capacitor se Android.

## Product

- **Role-Based AI Action Agent:** यह यूजर के पेशे (Student, Shopkeeper, Lawyer, Creator) की जरूरत को समझकर बिना लंबे प्रॉम्प्ट के सीधे काम पूरा करता है।
- **Multi-Agent Orchestrator:** पर्दे के पीछे बैठा हमारा मुख्य इंजन जरूरत पड़ने पर किसी एक काम (जैसे सिर्फ इमेज एडिटिंग) को तुरंत निपटाता है, या फिर चारों विशेषज्ञ AI (इमेज, स्लाइड्स, वेबसाइट, दस्तावेज) को आपस में जोड़कर एक साथ पूरा प्रोजेक्ट डिलीवर करता है।

> **Status:** Phase 1 (Core AI) ka code taiyaar hai: streaming chat, history, login, model routing, usage aur budget cap.
> Live voice, connectors, memory, billing aur Android abhi baaki hain. Blueprint section 12 aur 13 dekhein.

## Folder structure

| Path | Kya hai |
|---|---|
| `worker/` | Cloudflare Worker: AI gateway, chat, history, user routes, budget |
| `web/` | React + Vite frontend: login, chat, usage, settings |
| `app/`, `components/`, `lib/` | Next.js root app: API routes (Vercel par), pages, server side logic |
| `shell/` | Vite based mobile/desktop shell app (Capacitor se Android ke liye) |
| `supabase/migrations/` | Database schema, RLS aur grants (schema `sthamly_v3`) |
| `tests/` | Root level tests (database aur RLS checks) |
| `.github/workflows/` | CI (secret scan, typecheck, tests, build) aur Worker deploy |
| `docs/` | Blueprint aur architecture notes (agar hon) |

## Stack

- **Gateway:** Cloudflare Workers (TypeScript, `wrangler`)
- **Frontend:** React 19, Vite, React Router, Vercel par host
- **Root app:** Next.js 16 (API routes aur server side), Vercel par host
- **Database, auth, storage:** Supabase (Postgres, RLS, Auth). Tables `sthamly_v3` schema mein hain.
- **AI:** Groq (chat, Whisper) aur Gemini (reasoning, vision, embeddings). Keys sirf server side (Worker ya API routes) mein.
- **Payments:** Razorpay (Stage 5 mein, abhi nahi)

## Zaroori tools

- **Node.js 22** (`.nvmrc` ke hisaab se). Node 20 ya usse neeche par build fail ho sakta hai.
- **npm**
- **Wrangler** alag se install karne ki zaroorat nahi, wo `worker/` ki devDependencies mein hai.

## Pehli baar setup (local)

### 1. Supabase project

1. Dev ke liye naya Supabase project banayein. Purane project mein mat chalayein.
2. SQL Editor mein migrations isi order mein chalayein:
   - `0001_core_v3.sql` aur `0002_*.sql`: **ye files repo mein abhi nahi hain.** Inhe repo mein add karna zaroori hai, warna fresh database mein core schema nahi banega.
   - `0003_processed_messages.sql`
   - `0004_credits.sql`
   - `0005_cost_events.sql`
   - `0006_storage.sql`
3. **Settings → API → Exposed schemas** mein `sthamly_v3` add karein.
4. **Authentication → URL Configuration → Redirect URLs** mein `http://localhost:5173/login` add karein.

### 2. Cloudflare KV

Worker ko ek KV namespace chahiye (binding ka naam `STATE`). Agar aapke account mein wo pehle se hai, to ye step skip karein.

1. Naya dev namespace banayein:
   ```bash
   cd worker
   npx wrangler kv namespace create STATE --env dev
   ```
2. Command ka output ek `id` dega. Use `worker/wrangler.toml` mein dono jagah daalein:
   - `[[kv_namespaces]]` block ki `id`
   - `[[env.dev.kv_namespaces]]` block ki `id`
3. **Production KV abhi placeholder hai** (`REPLACE-WITH-PROD-KV-ID`). Production deploy se pehle use bhi banayein aur bharein.

### 3. Worker secrets

Secrets `wrangler.toml` mein nahi, `wrangler secret put` se set hote hain. Dev ke liye:

```bash
cd worker
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env dev
npx wrangler secret put GROQ_API_KEY --env dev
npx wrangler secret put GEMINI_API_KEY --env dev
npx wrangler secret put TOKEN_ENCRYPTION_KEY --env dev
npx wrangler secret put CRON_SECRET --env dev
```

Har command value maangegi. Local development ke liye `worker/.dev.vars` file banayein, jiska example `.env.example` mein hai.

### 4. Dependencies install

Teeno folders mein alag-alag:

```bash
npm install              # root (Next.js app)
cd web && npm install    # web (React + Vite)
cd ../worker && npm install   # worker (Cloudflare)
```

Har folder ka `package-lock.json` commit karein.

### 5. Chalaayein

- **Worker:**
  ```bash
  cd worker && npm run dev
  ```
  Default address: `http://localhost:8787`
- **Web:** `web/` mein `.env.local` banayein, jisme `VITE_API_BASE=http://localhost:8787` aur Supabase ke `VITE_` variables hon (`.env.example` ka section 7 dekhein). Fir:
  ```bash
  cd web && npm run dev
  ```
  Default address: `http://localhost:5173` (ye `ALLOWED_ORIGINS` mein already hai).
- **Root (Next.js app):** `.env.example` ko `.env.local` mein copy karke values bharein. Fir:
  ```bash
  npm run dev
  ```

## Checks

Commit se pehle ye chalayein:

```bash
npm run typecheck        # root
npm run lint             # root
npm test                 # root
cd web && npm run build  # typecheck + vite build
cd ../worker && npm run typecheck && npm test
```

## Deploy

- Worker: `main` par push hone par dev mein apne-aap deploy hota hai. Production sirf manual trigger se hota hai, GitHub Environment `production` ki approval ke baad.
- Web: Vercel par.
- Secrets kabhi repo mein nahi jaate. `.env*` files `.gitignore` mein hain.