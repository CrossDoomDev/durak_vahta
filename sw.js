/* Network first for navigation and assets. A failed connection falls back to this exact release. */
const BUILD = {"version":"1.8.0","id":"fca7a3f2470fd5c2","html":"index-fca7a3f2470fd5c2.html","js":"public/build/app-fca7a3f2470fd5c2.js","css":"public/build/app-fca7a3f2470fd5c2.css"},
  FILES = ["index.html","index-fca7a3f2470fd5c2.html","public/build/app-fca7a3f2470fd5c2.js","public/build/app-fca7a3f2470fd5c2.css","public/assets/audio/button.wav?v=fca7a3f2470fd5c2","public/assets/audio/card.wav?v=fca7a3f2470fd5c2","public/assets/audio/cover.wav?v=fca7a3f2470fd5c2","public/assets/audio/deal.wav?v=fca7a3f2470fd5c2","public/assets/audio/event.wav?v=fca7a3f2470fd5c2","public/assets/audio/kettle.wav?v=fca7a3f2470fd5c2","public/assets/audio/music.wav?v=fca7a3f2470fd5c2","public/assets/audio/take.wav?v=fca7a3f2470fd5c2","public/assets/audio/win.wav?v=fca7a3f2470fd5c2","public/assets/audio/wind.wav?v=fca7a3f2470fd5c2","public/assets/cards.webp?v=fca7a3f2470fd5c2","public/assets/decor.webp?v=fca7a3f2470fd5c2","public/assets/events.webp?v=fca7a3f2470fd5c2","public/assets/fonts/LICENSE.txt?v=fca7a3f2470fd5c2","public/assets/fonts/body.ttf?v=fca7a3f2470fd5c2","public/assets/fonts/heading.ttf?v=fca7a3f2470fd5c2","public/assets/npc-extra.webp?v=fca7a3f2470fd5c2","public/assets/npc.webp?v=fca7a3f2470fd5c2","public/assets/room.webp?v=fca7a3f2470fd5c2"];
const SCOPE = new URL(self.registration.scope).pathname;
const PREFIX = "durak-vahta-" + SCOPE.replace(/[^a-z0-9]/gi, "_") + "-";
const CACHE = PREFIX + BUILD.id;
const canonical = new URL("index.html", self.registration.scope).href;
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        FILES.map(async (file) => {
          const url = new URL(file, self.registration.scope).href;
          const source =
            file === "index.html"
              ? new URL(BUILD.html, self.registration.scope).href
              : url;
          const response = await fetch(source, { cache: "no-store" });
          if (!response.ok) throw Error("Cannot cache " + file);
          await cache.put(url, response);
        }),
      );
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key === CACHE) continue;
        if (key.startsWith(PREFIX)) {
          await caches.delete(key);
          continue;
        }
        if (/^durak-vahta-[a-f0-9]+$/.test(key)) {
          const legacy = await caches.open(key);
          if (await legacy.match(canonical)) await caches.delete(key);
        }
      }
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(SCOPE)
  )
    return;
  if (
    url.pathname === new URL("version.json", self.registration.scope).pathname
  ) {
    event.respondWith(
      fetch(req, { cache: "no-store" }).catch(
        () => new Response("", { status: 503 }),
      ),
    );
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE),
        navigation = req.mode === "navigate";
      try {
        const response = await fetch(req, { cache: "no-store" });
        if (response.ok) {
          if (
            !navigation ||
            (await response.clone().text()).includes(
              `name="vahta-build" content="${BUILD.id}"`,
            )
          )
            await cache.put(navigation ? canonical : req, response.clone());
          return response;
        }
        const saved = await cache.match(navigation ? canonical : req);
        return saved || response;
      } catch {
        const saved = await cache.match(navigation ? canonical : req);
        return (
          saved || new Response("Offline resource unavailable", { status: 503 })
        );
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "VAHTA_VERSION") event.ports[0]?.postMessage(BUILD);
});
