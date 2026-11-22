// Sthamly AI: service worker. Ye sirf install ki shart poori karta hai.
// Jaan-boojhkar koi cache nahi: chat, login aur API hamesha taaza network se aate hain,
// taaki purana jawab ya purana session na dikhe.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});