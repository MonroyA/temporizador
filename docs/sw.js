// Service worker: la app abre al instante (y sin conexión muestra la última versión guardada).
// Las listas se leen siempre de la nube; esto solo guarda los archivos de la app.
const CACHE = 'listas-v4';
const FILES = ['./', './index.html', './app.js', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Primero la red (para tener siempre la versión nueva); sin red, lo guardado.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  );
});
// Al tocar un aviso: abre la app (o la trae al frente) en la pantalla del aviso.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || '#/avisos';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const w = wins[0];
    if (w) { w.navigate(new URL('./' + link, self.registration.scope).href).catch(() => {}); return w.focus(); }
    return self.clients.openWindow('./' + link);
  }));
});
