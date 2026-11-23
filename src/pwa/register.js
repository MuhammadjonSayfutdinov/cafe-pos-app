// Service worker'ni ro'yxatdan o'tkazish (faqat production build'da).
import { confirmAsync } from '../utils/notify';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Birinchi o'rnatishda sahifa qayta yuklanmasin: faqat avval SW bo'lgan bo'lsa
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  const promptUpdate = async (worker) => {
    const ok = await confirmAsync(
      "🔄 Dasturning yangi versiyasi tayyor. Hozir yangilansinmi?\nOchiq to'lov yoki buyurtma kiritayotgan bo'lsangiz, avval tugating.",
      { confirmText: 'Yangilash', cancelText: 'Keyinroq', danger: false }
    );
    if (ok) worker.postMessage('SKIP_WAITING');
  };

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(worker);
        });
      });
      // Planshet kun bo'yi ochiq turadi: har 30 daqiqada yangi versiyani tekshiramiz
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    } catch (e) {
      console.warn("Service worker ro'yxatdan o'tmadi:", e);
    }
  });
}
