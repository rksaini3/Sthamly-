// Sthamly service worker
// - ऐप की फ़ाइलें (JS, CSS, आइकन) एक बार आने पर फ़ोन में रहती हैं, ताकि ऑफ़लाइन में पन्ना खुले।
// - पन्ना खोलने पर नेटवर्क से ताज़ा आता है और उसकी कॉपी रखी जाती है।
//   नेटवर्क न हो तो वही पुरानी कॉपी दिखती है, जिसमें पहले की बातचीत भी होती है।
// - चैट की सूची (/api/chats) भी यही तरीका अपनाती है।
// - लॉग-आउट पर runtime cache हटती है (components/account/AccountActions.tsx में)।

const STATIC_CACHE = "sthamly-static-v2";
const RUNTIME_CACHE = "sthamly-runtime-v2";
const OFFLINE_URL = "/offline.html";
const SHELL_URL = "/voice";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
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

  // पन्ना खोलना: नेटवर्क पहले, न मिले तो सेव की हुई कॉपी
  if (req.mode === "navigate") {
    event.respondWith(navigate(req));
    return;
  }

  // ऐप की फ़ाइलें: सेव हों तो वहीं से (ये हर संस्करण पर बदलती हैं, इसलिए नाम में hash है)
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
    if (res.ok && !res.redirected) {
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    // 1) यही पन्ना (जैसे /voice?chat=...) पहले खुला था तो वही
    // 2) वरना ऐप का मुख्य पन्ना, जो चैट की सेव की हुई जानकारी से खुलता है
    // 3) कुछ भी न हो तो "इंटरनेट नहीं है" पन्ना
    const hit =
      (await cache.match(req)) ||
      (await cache.match(SHELL_URL)) ||
      (await (await caches.open(STATIC_CACHE)).match(OFFLINE_URL));
    if (hit) return hit;
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
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