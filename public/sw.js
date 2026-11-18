// Sthamly service worker (v3)
// - ऐप की फ़ाइलें (JS, CSS, आइकन) एक बार आने पर फ़ोन में रहती हैं।
// - पन्ना खोलने पर नेटवर्क से ताज़ा आता है और उसकी कॉपी रखी जाती है।
//   नेटवर्क न हो या सर्वर बंद हो तो सेव की हुई कॉपी दिखती है।
// - लॉग-आउट पर runtime cache हटती है (lib/offline-cache.ts)।

const STATIC_CACHE = "sthamly-static-v3";
const RUNTIME_CACHE = "sthamly-runtime-v2";
const OFFLINE_URL = "/offline.html";
// offline में ये पन्ने पहले से सेव हों तो वही खुलते हैं
const FALLBACK_PAGES = ["/home", "/voice"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      // offline पन्ना न जुड़े तो भी service worker इंस्टॉल हो, वरना कुछ भी नहीं चलता
      .catch((error) => console.error("sw: offline page cache failed", error))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([STATIC_CACHE, RUNTIME_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // पन्ना खोलना: नेटवर्क पहले, न मिले या सर्वर बंद हो तो सेव की हुई कॉपी
  if (req.mode === "navigate") {
    event.respondWith(navigate(req));
    return;
  }

  // ऐप की फ़ाइलें: सेव हों तो वहीं से (नाम में hash है, इसलिए बदलें तो नई फ़ाइल)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // चैट की सूची: नेटवर्क पहले, न मिले तो आख़िरी सूची
  if (url.pathname === "/api/chats") {
    event.respondWith(networkFirst(req));
  }
});

async function navigate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(req);
    // 5xx (सर्वर बंद/गड़बड़) को भी "ऑफ़लाइन" मानें
    if (res.status < 500) {
      if (res.ok && !res.redirected) cache.put(req, res.clone());
      return res;
    }
    throw new Error(`server ${res.status}`);
  } catch {
    return offlineFallback(req, cache);
  }
}

async function offlineFallback(req, cache) {
  // 1) यही पन्ना पहले खुला था तो वही
  const same = await cache.match(req);
  if (same) return same;
  // 2) वरना होम या चैट का सेव पन्ना
  for (const path of FALLBACK_PAGES) {
    const hit = await cache.match(path);
    if (hit) return hit;
  }
  // 3) कुछ भी न हो तो "इंटरनेट नहीं है" पन्ना
  const page = await (await caches.open(STATIC_CACHE)).match(OFFLINE_URL);
  if (page) return page;
  return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    return new Response(JSON.stringify({ error: { code: "OFFLINE", message: "इंटरनेट नहीं है" } }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}