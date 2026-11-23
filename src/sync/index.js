// Sinxronlashni ishga tushirish: .env.local dagi sozlamaga qarab transport tanlanadi.
//  - VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY bo'lsa: Supabase
//  - aks holda: sinxronlash o'chiq, dastur avvalgidek faqat shu qurilmada ishlaydi
import { configureSync, bootSync, markBooting } from './engine';

export async function setupSync() {
  const env = import.meta.env;
  const useFake = env.MODE === 'e2e' && env.VITE_FAKE_SYNC_URL;
  const useSupabase = !useFake && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY;

  if (!useFake && !useSupabase) {
    configureSync(null);
    return;
  }

  // Kutubxona yuklanguncha ilova emas, "yuklanmoqda" ekrani ko'rinsin
  markBooting();
  let transport;
  try {
    if (useFake) {
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
