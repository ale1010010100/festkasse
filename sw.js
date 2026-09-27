// FestKasse – Service Worker: App startet auch bei schlechtem Netz.
// Strategie: App-Dateien «zuerst Netz, sonst Cache»; Bilder «zuerst Cache».
// Datenbank- und Zahlungsaufrufe werden nie zwischengespeichert.
const CACHE = 'festkasse-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'api.js', 'api-demo.js', 'qr.js', 'library.js', 'config.js',
  'manifest.webmanifest', 'assets/icons/icon-192.png', 'danke.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('payrexx.com')) return;
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(url.pathname);
  const isLib = url.hostname === 'cdn.jsdelivr.net';
  if (isImage || isLib) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
