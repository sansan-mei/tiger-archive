/* Online game PWA: never mix cached game rules with a newer server. */
const CACHE_NAME = "tiger-field-online-v2";
const OFFLINE = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE])));
  // Wait for existing pages to close. Never force-refresh an active battle.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter((name) => name.startsWith("tiger-field-") && name !== CACHE_NAME)
      .map((name) => caches.delete(name)),
  )));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(OFFLINE) || new Response("离线，请联网后重试。", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }));
});
