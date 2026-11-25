// Sinxronlashni ishga tushirish: transport tanlanadi.
//  - sahifa kafe mahalliy serveridan ochilgan bo'lsa (<meta name="cafe-hub">, server/hub.mjs qo'yadi)
//    yoki VITE_HUB_URL berilgan bo'lsa (dasturchi rejimi): mahalliy server (internetsiz ham ishlaydi)
//  - VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY bo'lsa: Supabase
//  - aks holda: sinxronlash o'chiq, dastur avvalgidek faqat shu qurilmada ishlaydi
import { configureSync, bootSync, markBooting } from './engine';

export async function setupSync() {
  const env = import.meta.env;
  const servedByHub = Boolean(document.querySelector('meta[name="cafe-hub"]'));
  const useHub = servedByHub || Boolean(env.VITE_HUB_URL);
  const useFake = !useHub && env.MODE === 'e2e' && env.VITE_FAKE_SYNC_URL;
  const useSupabase = !useHub && !useFake && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY;

  if (!useHub && !useFake && !useSupabase) {
    configureSync(null);
    return;
  }

  // Kutubxona yuklanguncha ilova emas, "yuklanmoqda" ekrani ko'rinsin
  markBooting();
  let transport;
  try {
    if (useHub) {
      const { createHubTransport } = await import('./hubTransport');
      transport = createHubTransport({ baseUrl: servedByHub ? '' : env.VITE_HUB_URL });
    } else if (useFake) {
      const { createFakeTransport } = await import('./fakeTransport');
      transport = createFakeTransport({ url: env.VITE_FAKE_SYNC_URL });
    } else {
      // Supabase kutubxonasi alohida faylda: sinxronlash o'chiq bo'lsa umuman yuklanmaydi
      const { createSupabaseTransport } = await import('./supabaseTransport');
      transport = createSupabaseTransport({ url: env.VITE_SUPABASE_URL, anonKey: env.VITE_SUPABASE_ANON_KEY });
    }
  } catch (e) {
    console.error("Sinxronlash kutubxonasini yuklab bo'lmadi:", e);
    configureSync(null);
    return;
  }

  configureSync(transport);
  bootSync();
}

export * from './engine';
