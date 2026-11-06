// Sthamly service worker: सिर्फ install योग्य बनाने के लिए।
// कोई cache नहीं: हर request नेटवर्क से ही जाएगी।
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // जानबूझकर खाली: browser सामान्य तरीके से नेटवर्क से लेगा
});