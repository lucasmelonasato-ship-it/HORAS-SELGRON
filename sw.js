// Rede primeiro: sempre pega a versão mais nova do app; o cache só é usado sem internet.
const CACHE = 'horas-selgron-v3';
const ASSETS = ['./', 'index.html', 'styles.css', 'app.js', 'ficha-pdf.js',
  'vendor/pdf-lib.min.js', 'vendor/supabase.js', 'assets/modelo-ficha.js', 'assets/selgron-logo.png',
  'assets/icon-192.png', 'assets/icon-512.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // Supabase etc. sempre pela rede
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request))
  );
});
