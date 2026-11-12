// Service worker: la app abre al instante (y sin conexión muestra la última versión guardada).
// Las listas se leen siempre de la nube; esto solo guarda los archivos de la app.
const CACHE = 'listas-v13';
const FILES = ['./', './index.html', './app.js', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './medios-sol.png', './medios-aguila.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
// Al actualizar la app se borra la copia vieja de sus archivos, pero NUNCA los charts guardados
// en el teléfono («listas-archivos»): esos siguen sirviendo.
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'listas-archivos').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Primero la red (para tener siempre la versión nueva); sin red, lo guardado.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Firebase (archivos con su versión en la dirección: nunca cambian): de la copia guardada,
  // así la app abre rápido sin volver a bajarlos cada vez.
  // Firebase y el lector de PDF (pdf.js): versiones fijas en la dirección, se guardan una vez.
  const pinned = (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
    || (url.origin === 'https://cdnjs.cloudflare.com' && url.pathname.startsWith('/ajax/libs/pdf.js/'));
  if (e.request.method === 'GET' && pinned) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }))));
    return;
  }
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
