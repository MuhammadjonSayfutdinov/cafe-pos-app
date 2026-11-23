// Service worker shabloni. vite.config.js build paytida versiya va fayllar ro'yxatini to'ldirib,
// dist/sw.js sifatida chiqaradi. Bu fayl ilova bundle'iga kirmaydi.
//
// - Ilova fayllari oldindan keshlanadi: internet uzilsa ham sahifa ochiladi.
// - Sahifaning o'zi (navigatsiya): avval internetdan, bo'lmasa keshdan.
// - Boshqa saytlarga so'rovlar (Supabase, Telegram) keshlanmaydi.
const VERSION = '__VERSION__';
const CACHE = `cafe-pos-${VERSION}`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

// Yangi versiya darhol emas, foydalanuvchi "Yangilash" ni bosganda ishga tushadi
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('cafe-pos-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.open(CACHE).then((cache) =>
          cache.match('/index.html').then((hit) => hit || cache.match('/'))
        )
      )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && url.pathname.startsWith('/assets/')) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
