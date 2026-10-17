// Dunkin Inventory Service Worker v3 (Rock Solid & Safe)
const CACHE_NAME = "dunkin-inventory-v4";
const STATIC_ASSETS = [
  "/manifest.webmanifest",
  "/logo.png",
  "/icon-192.png",
  "/icon-512.png",
  "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap",
  "/uploaded-images/1788608968654-22.jpeg",
  "/uploaded-images/1789136851253-WhatsApp-Image-2026-03-29-at-7.47.41-PM.jpeg",
  "/uploaded-images/1789136898270-ahmedon123456.png",
  "/uploaded-images/1789709774763-1000813365.png",
  "/uploaded-images/1789709792556-1000813369.png",
  "/uploaded-images/1789709814452-1000813377.png",
  "/uploaded-images/1789709835553-1000813370.png",
  "/uploaded-images/1789709854104-1000813274.png",
  "/uploaded-images/1789709902432-1000813244.png",
  "/uploaded-images/1789709942694-1000813271.png",
  "/uploaded-images/1789710001037-1000813280.png",
  "/uploaded-images/1789710017744-1000813275.png",
  "/uploaded-images/1789710035818-1000813269.png",
  "/uploaded-images/1789710056342-1000813282.png",
  "/uploaded-images/1789710078001-1000813371.png",
  "/uploaded-images/1789710092201-1000813373.png",
  "/uploaded-images/1789710113803-1000813273.png",
  "/uploaded-images/1789710170636-1000813246.png",
  "/uploaded-images/1789710196591-1000813243.png",
  "/uploaded-images/1789710205331-1000813374.png",
  "/uploaded-images/1789710269835-1000813243.png",
  "/uploaded-images/1789710282144-1000813247.png",
  "/uploaded-images/1789710318558-1000813270.png",
  "/uploaded-images/1789710336988-1000813268.png",
  "/uploaded-images/1789710369166-1000813364.png",
  "/uploaded-images/1789710389580-1000813387.png",
  "/uploaded-images/1789710405708-1000813276.png",
  "/uploaded-images/1789710461400-1000813262.png",
  "/uploaded-images/1789710512811-1000813375.png",
  "/uploaded-images/1789710545692-1000813246.png",
  "/uploaded-images/1789710586967-1000813376.png",
  "/uploaded-images/1789710628216-1000813263.png",
  "/uploaded-images/1789710669082-1000813362.png",
  "/uploaded-images/1789710684141-1000813363.png",
  "/uploaded-images/1789710699831-1000813362.png",
  "/uploaded-images/1789711040611-1000813360.png"
];

// 1. Install: Precache shell assets and product images
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of STATIC_ASSETS) {
        try {
          await cache.add(url);
        } catch {
          // Ignore individual asset caching failures during install
        }
      }
    })
  );
  self.skipWaiting();
});

// 2. Activate: Clear ALL old caches and take immediate control
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch interceptor
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never intercept non-GET requests or WebSocket connections
  if (req.method !== "GET" || url.protocol.startsWith("ws")) {
    return;
  }

  // Never intercept Vite dev requests, source code, node_modules or API requests
  if (
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/src/") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // A. Product Images & Static Assets (Cache-First, update in background)
  if (
    url.pathname.startsWith("/uploaded-images/") ||
    url.hostname.includes("images.unsplash.com") ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".svg")
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          // Revalidate in background if online
          fetch(req)
            .then((fresh) => {
              if (fresh && fresh.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(req, fresh));
              }
            })
            .catch(() => {});
          return cached;
        }

        return fetch(req)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            }
            return response;
          })
          .catch(async () => {
            // Safe fallback: never return undefined
            const anyCached = await caches.match(req);
            if (anyCached) return anyCached;
            return new Response("", { status: 408, statusText: "Offline" });
          });
      })
    );
    return;
  }

  // B. Navigation requests (Opening the site or refreshing): Network-First with safe Cache fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const rootCached = await caches.match("/");
        if (rootCached) return rootCached;
        return new Response("<!doctype html><html><body>Offline</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" }
        });
      })
    );
    return;
  }

  // C. For all other requests (Vite dev assets, tRPC queries, etc.), let browser handle natively!
});
