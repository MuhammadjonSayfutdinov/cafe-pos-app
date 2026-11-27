// Service worker shabloni. vite.config.js build paytida versiya va fayllar ro'yxatini to'ldirib,
// dist/sw.js sifatida chiqaradi. Bu fayl ilova bundle'iga kirmaydi.
//
// - Ilova fayllari oldindan keshlanadi: internet uzilsa ham sahifa ochiladi.
// - Sahifaning o'zi (navigatsiya): avval internetdan, bo'lmasa keshdan. Internet sekin bo'lsa
//   (NAV_TIMEOUT_MS ichida javob yo'q) - keshdan darhol: dastur sekin internetda ham tez ochiladi.
//   Yangi versiya baribir keladi: src/pwa/update.js /version.json ni alohida tekshiradi.
// - Boshqa saytlarga so'rovlar (Supabase, Telegram) keshlanmaydi. Istisno: taom rasmlari
//   (Supabase Storage, supabase/storage.sql) - bir marta ochilgan rasm internetsiz ham ko'rinadi.
// - /version.json har doim internetdan (yangi versiyani bilish uchun: src/pwa/update.js).
const VERSION = '__VERSION__';
const CACHE = `cafe-pos-${VERSION}`;
const PRECACHE = __PRECACHE__;
const NAV_TIMEOUT_MS = 3500;
// Taom rasmlari keshi: nomi 'cafe-pos-' bilan boshlanmaydi, yangi versiyada o'chmaydi
const IMAGE_CACHE = 'menu-images-v1';
const IMAGE_CACHE_LIMIT = 400;

const isMenuImage = (url) =>
  url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/menu-images/');

function trimImageCache(cache) {
  return cache.keys().then((keys) => {
    const extra = keys.length - IMAGE_CACHE_LIMIT;
    if (extra > 0) return Promise.all(keys.slice(0, extra).map((k) => cache.delete(k)));
    return undefined;
  });
}

// Har bir rasm yo'li noyob va o'zgarmaydi (src/utils/menuImages.ts): avval keshdan
function cacheFirstImage(req) {
  return caches.open(IMAGE_CACHE).then((cache) =>
    cache.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Faqat CORS javob (DishImage crossOrigin bilan so'raydi). Opaque javob kesh kvotasini behuda yeydi
        if (res.ok && res.type === 'cors') {
          cache.put(req, res.clone()).then(() => trimImageCache(cache)).catch(() => {});
        }
        return res;
      });
    })
  );
}

const cachedPage = () =>
  caches.open(CACHE).then((cache) => cache.match('/index.html').then((hit) => hit || cache.match('/')));

// Internetdan, lekin NAV_TIMEOUT_MS dan oshsa yoki xato bo'lsa - keshdan
function networkFirstWithTimeout(req) {
  return new Promise((resolve) => {
    let done = false;
    const fallback = () =>
      cachedPage().then((hit) => {
        if (done) return;
        if (hit) {
          done = true;
          resolve(hit);
        }
      });
    const timer = setTimeout(fallback, NAV_TIMEOUT_MS);
    fetch(req)
      .then((res) => {
        clearTimeout(timer);
        if (!done) {
          done = true;
          resolve(res);
        }
      })
      .catch(() => {
        clearTimeout(timer);
        cachedPage().then((hit) => {
          if (done) return;
          done = true;
          resolve(hit || Response.error());
        });
      });
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

// Yangi versiya sahifa buyrug'i bilan ishga tushadi (src/pwa/register.js)
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
  if (isMenuImage(url)) {
    event.respondWith(cacheFirstImage(req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/version.json') return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstWithTimeout(req));
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
