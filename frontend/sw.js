// ===== Nexus AI — Service Worker (Web Push) =====
// Sert uniquement à recevoir et afficher les notifications push.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Réception d'une notification push envoyée par le serveur (VAPID).
self.addEventListener('push', (event) => {
  let data = { title: 'Nexus AI', body: 'Nouvelle notification' };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag || 'nexus',
      data: { url: data.url || '/' },
      badge: undefined,
    })
  );
});

// Clic sur la notification : focus l'onglet existant ou en ouvre un.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
