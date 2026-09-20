/* eslint-disable no-undef */
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

precacheAndRoute(self.__WB_MANIFEST);

// Offline app shell: serve the precached index.html for SPA navigations. The
// API and server-rendered share pages (/s/:id) must still hit the network.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/s\//],
  })
);

// Public, non-personalised map reads only (matched by path so it also works
// when the API lives on another origin). Network first so data stays fresh;
// the cached copy is used when offline or the network is slow. Detail,
// notifications, watches and other identity-scoped endpoints are deliberately
// NOT cached.
registerRoute(
  ({ request, url }) =>
    request.method === "GET" &&
    (url.pathname === "/api/sightings" || url.pathname === "/api/sightings/clusters"),
  new NetworkFirst({
    cacheName: "api-map",
    networkTimeoutSeconds: 4,
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 3 }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
);

registerRoute(
  ({ request, url }) =>
    request.method === "GET" && /^\/api\/sightings\/[^/]+\/thumbnail$/.test(url.pathname),
  new CacheFirst({
    cacheName: "cat-thumbnails",
    plugins: [
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

registerRoute(
  /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
  new CacheFirst({
    cacheName: "osm-tiles",
    plugins: [
      new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 14 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

self.addEventListener("push", (event) => {
  let data = { title: "CatMap", body: "You have a new notification.", url: "/" };
  try {
    if (event.data) data = { ...data, ...JSON.parse(event.data.text()) };
  } catch {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url || "/" },
      icon: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
