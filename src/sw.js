/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

registerRoute(
  ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 5,
  }),
);

const offlineNavigationHandler = createHandlerBoundToURL('/index.html');
const navigationHandler = async ({ event }) => {
  try {
    const freshRequest = new Request(event.request, { cache: 'no-store' });
    const response = await fetch(freshRequest);
    if (response && response.ok) return response;
  } catch {
    // Fall back to the cached app shell when offline.
  }
  return offlineNavigationHandler({ event });
};
registerRoute(new NavigationRoute(navigationHandler, {
  denylist: [/^\/api\//],
}));

self.addEventListener('push', (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  const title = payload.title || 'Tamga';
  const options = {
    body: payload.body || 'Новое уведомление',
    icon: '/icons/icon-512.png',
    badge: '/icons/clock.png',
    vibrate: [200, 100, 200],
    tag: payload.tag || 'tamga-notification',
    data: {
      url: payload.url || '/#/dashboard',
      kind: payload.kind || 'generic',
    },
    requireInteraction: !!payload.requireInteraction,
    renotify: true,
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/#/dashboard', self.location.origin).href;

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(targetUrl);
        return;
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
