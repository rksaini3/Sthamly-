// Sthamly AI: service worker.
// Kaam: app ka shell (HTML, JS, CSS, icon) cache karna, taaki internet na ho tab bhi app khule.
// Jaan-boojhkar cache NAHI hota: /api/, Worker, aur Supabase ki requests. Chat ka jawab
// aur login hamesha taaza network se aate hain, taaki purana jawab ya purana session na dikhe.

const CACHE = "sthamly-shell-v1";
const SHELL = [
  "/chat",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {
        // Shell cache na ho to bhi install chalega. Bas offline nahi khulega.
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

function isNetworkOnly(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.hostname.endsWith("workers.dev") ||
    url.hostname.endsWith("supabase.co")
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = (await cache.match(request)) || (await cache.match("/chat"));
    if (cached) return cached;
    return new Response("offline", { status: 503, statusText: "Offline" });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isNetworkOnly(url)) return;

  // Hashed JS/CSS (/assets/) ek baar badalti nahi, isliye pehle cache se.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Page aur baaki files: pehle network, nahi mile to cache (offline).
  event.respondWith(networkFirst(request));
});