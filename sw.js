const CACHE = 'horas-selgron-v1';
const ASSETS = ['./','index.html','styles.css','app.js','ficha-pdf.js',
  'vendor/pdf-lib.min.js','vendor/supabase.js','assets/modelo-ficha.js',
  'assets/icon-192.png','assets/icon-512.png','manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;            // Supabase etc. sempre pela rede
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
