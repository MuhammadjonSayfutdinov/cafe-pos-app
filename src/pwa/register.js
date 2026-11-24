// Service worker'ni ro'yxatdan o'tkazish (faqat production build'da).
//
// Service worker faqat oflayn kesh uchun: internet uzilsa ham dastur ochiladi.
// Sahifaning o'zini yangilash (qachon qayta yuklash) - src/pwa/update.js ning ishi. Shuning uchun
// yangi service worker kutib turmaydi va foydalanuvchidan so'ramaydi: darhol keshni yangilaydi.
import { setServiceWorkerRegistration } from './update';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const activate = (worker) => {
    if (worker) worker.postMessage('SKIP_WAITING');
  };

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      setServiceWorkerRegistration(reg);
      if (reg.waiting && navigator.serviceWorker.controller) activate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) activate(worker);
        });
      });
    } catch (e) {
      console.warn("Service worker ro'yxatdan o'tmadi:", e);
    }
  });
}
