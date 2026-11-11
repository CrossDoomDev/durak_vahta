/* Network first for navigation and assets. A failed connection falls back to this exact release. */
const BUILD = {"version":"1.10.0","id":"52d3135d3b1bf05d","html":"index-52d3135d3b1bf05d.html","js":"public/build/app-52d3135d3b1bf05d.js","css":"public/build/app-52d3135d3b1bf05d.css"},
  FILES = ["index.html","index-52d3135d3b1bf05d.html","public/build/app-52d3135d3b1bf05d.js","public/build/app-52d3135d3b1bf05d.css","public/assets/audio/button.wav?v=52d3135d3b1bf05d","public/assets/audio/card.wav?v=52d3135d3b1bf05d","public/assets/audio/cover.wav?v=52d3135d3b1bf05d","public/assets/audio/deal.wav?v=52d3135d3b1bf05d","public/assets/audio/event.wav?v=52d3135d3b1bf05d","public/assets/audio/kettle.wav?v=52d3135d3b1bf05d","public/assets/audio/music.wav?v=52d3135d3b1bf05d","public/assets/audio/take.wav?v=52d3135d3b1bf05d","public/assets/audio/win.wav?v=52d3135d3b1bf05d","public/assets/audio/wind.wav?v=52d3135d3b1bf05d","public/assets/cards.webp?v=52d3135d3b1bf05d","public/assets/decor.webp?v=52d3135d3b1bf05d","public/assets/events.webp?v=52d3135d3b1bf05d","public/assets/fonts/LICENSE.txt?v=52d3135d3b1bf05d","public/assets/fonts/body.ttf?v=52d3135d3b1bf05d","public/assets/fonts/heading.ttf?v=52d3135d3b1bf05d","public/assets/loss-crew.webp?v=52d3135d3b1bf05d","public/assets/npc-extra.webp?v=52d3135d3b1bf05d","public/assets/npc.webp?v=52d3135d3b1bf05d","public/assets/room.webp?v=52d3135d3b1bf05d"];
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
