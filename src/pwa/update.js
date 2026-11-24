// Dastur yangilanishi: serverga yangi versiya chiqsa, telefon, planshet va kompyuter o'zi yangilanadi.
//
// Qanday ishlaydi:
//  - Har bir build'ning versiyasi bor (__APP_BUILD__, vite.config.js). Server oxirgisini /version.json da beradi.
//  - Qurilma uni tekshiradi: ochilganda, har 5 daqiqada, ilova fondan qaytganda (telefon), internet qaytganda.
//  - Yangi versiya bo'lsa, ish buzilmaydigan paytda sahifa o'zi qayta yuklanadi:
//      * PIN oynasida (hech kim kirmagan) - 20 soniya hech narsa bosilmasa yoki ilova fonda bo'lsa;
//      * xodim ishlayotgan bo'lsa - 3 daqiqa hech narsa bosilmaganda. Xodim o'sha ekranga PIN'siz qaytadi
//        (faqat shu oynada, 1 daqiqa ichida, bir marta; avto-qulf yopiq bo'lsa - PIN so'raladi);
//      * ofitsiant savatchasida yuborilmagan taom yoki ochiq yetkazish formasi bo'lsa - kutadi.
//    Ekranning pastida "Yangilash" tugmasi ham chiqadi (UpdateBanner): bosilsa darhol yangilanadi.
//  - Mijozning QR sahifasi faqat telefon fonga o'tganda yangilanadi (savatcha qurilmada saqlanadi).
import { confirmAsync } from '../utils/notify';

/* global __APP_BUILD__, __APP_BUILD_TIME__ */
export const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev';
export const APP_BUILD_TIME = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';

const CHECK_EVERY_MS = 5 * 60 * 1000;
const MIN_CHECK_GAP_MS = 30 * 1000;
const POLICY_TICK_MS = 10 * 1000;
const IDLE_LOGIN_SCREEN_MS = 20 * 1000;
const IDLE_WORKING_MS = 3 * 60 * 1000;

const RESUME_KEY = 'pos_update_resume'; // sessionStorage: yangilangach qaysi xodim qaytadi
const RESUME_MAX_AGE_MS = 60 * 1000;
const RELOAD_GUARD_KEY = 'pos_update_reloaded'; // bir versiya uchun cheksiz qayta yuklanmaslik
const RELOAD_GUARD_MS = 10 * 60 * 1000;

let mode = 'staff';
let started = false;
let applying = false;
let lastCheckAt = 0;
let lastActivityAt = Date.now();
let swRegistration = null;
let session = null; // { userId, role, adminView } | null (App.jsx)
let screenLocked = false; // AutoLockControl qulf ekrani
const unsavedWork = new Set();

let state = { ready: false, latestBuild: null, latestBuiltAt: null, unsaved: false };
const listeners = new Set();

const emit = () => listeners.forEach(fn => fn(state));
const setState = (patch) => {
  state = { ...state, ...patch };
  emit();
};

// Sahifa ochilganda bir marta o'qiladi va o'chiriladi (StrictMode'da ikki marta chaqirilsa ham xavfsiz)
const bootResume = (() => {
  try {
    const raw = window.sessionStorage.getItem(RESUME_KEY);
    window.sessionStorage.removeItem(RESUME_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const age = Date.now() - Number(saved?.at);
    if (!(age >= 0 && age <= RESUME_MAX_AGE_MS)) return null;
    const nav = window.performance?.getEntriesByType?.('navigation')?.[0];
    if (nav && nav.type !== 'reload') return null;
    return saved;
  } catch {
    return null;
  }
})();

// Yangilanishdan oldin ishlagan xodim (ro'yxatda hali bor va roli o'zgarmagan bo'lsa)
export function getUpdateResume(users) {
  if (!bootResume) return null;
  const user = (Array.isArray(users) ? users : []).find(
    u => u && String(u.id) === String(bootResume.userId) && u.role === bootResume.role
  );
  if (!user) return null;
  return { user, adminView: typeof bootResume.adminView === 'string' ? bootResume.adminView : null };
}

export function subscribeUpdate(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export const getUpdateState = () => state;

export function setUpdateSession(next) {
  session = next && next.userId !== undefined && next.userId !== null ? next : null;
  trySafeApply();
}

export function setUpdateScreenLocked(locked) {
  screenLocked = Boolean(locked);
  trySafeApply();
}

// Yo'qolishi mumkin bo'lgan ish (masalan, savatcha): bor ekan, avtomatik yangilanmaydi
export function markUnsavedWork(key, hasUnsaved) {
  if (hasUnsaved) unsavedWork.add(key);
  else unsavedWork.delete(key);
  const unsaved = unsavedWork.size > 0;
  if (unsaved !== state.unsaved) setState({ unsaved });
  trySafeApply();
}

export function setServiceWorkerRegistration(reg) {
  swRegistration = reg || null;
}

export async function checkForUpdate({ force = false } = {}) {
  if (typeof window === 'undefined' || navigator.onLine === false) return;
  const now = Date.now();
  if (!force && now - lastCheckAt < MIN_CHECK_GAP_MS) return;
  lastCheckAt = now;

  // Oflayn kesh (service worker) ham yangilansin
  if (swRegistration) swRegistration.update().catch(() => {});

  try {
    const res = await fetch(`/version.json?t=${now}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const build = typeof data?.build === 'string' ? data.build : '';
    if (!build || build === APP_BUILD) return;
    if (!state.ready || state.latestBuild !== build) {
      setState({ ready: true, latestBuild: build, latestBuiltAt: data.builtAt || null });
    }
    trySafeApply();
  } catch {
    // internet yo'q yoki server javob bermadi: keyingi tekshiruvda
  }
}

const idleMs = () => Date.now() - lastActivityAt;
const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

// Shu versiya uchun yaqinda qayta yuklangan bo'lsa (masalan, server eski sahifani berdi), qaytarmaymiz
const recentlyReloadedFor = (build) => {
  try {
    const t = JSON.parse(window.sessionStorage.getItem(RELOAD_GUARD_KEY) || 'null');
    return Boolean(t && t.build === build && Date.now() - Number(t.at) < RELOAD_GUARD_MS);
  } catch {
    return false;
  }
};

export function trySafeApply() {
  if (!state.ready || applying || unsavedWork.size > 0) return;
  if (recentlyReloadedFor(state.latestBuild)) return;

  if (mode === 'customer') {
    if (isHidden()) applyUpdate();
    return;
  }
  if (!session) {
    if (isHidden() || idleMs() >= IDLE_LOGIN_SCREEN_MS) applyUpdate();
    return;
  }
  if (!isHidden() && idleMs() >= IDLE_WORKING_MS) applyUpdate();
}

export function applyUpdate() {
  if (applying) return;
  applying = true;
  try {
    window.sessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify({ build: state.latestBuild, at: Date.now() }));
    if (session && !screenLocked) {
      window.sessionStorage.setItem(RESUME_KEY, JSON.stringify({ ...session, at: Date.now() }));
    } else {
      window.sessionStorage.removeItem(RESUME_KEY);
    }
  } catch {
    // sessionStorage yo'q: xodim PIN bilan qayta kiradi
  }
  window.location.reload();
}

// "Yangilash" tugmasi
export async function applyUpdateFromUser() {
  if (unsavedWork.size > 0) {
    const ok = await confirmAsync(
      "⚠️ Yuborilmagan buyurtma bor (savatcha yoki yetkazish formasi). Yangilansa u o'chadi. Baribir yangilansinmi?",
      { confirmText: 'Yangilash', cancelText: 'Bekor qilish' }
    );
    if (!ok) return;
  }
  applyUpdate();
}

export function startUpdateChecks(options = {}) {
  if (started || typeof window === 'undefined') return;
  started = true;
  mode = options.mode === 'customer' ? 'customer' : 'staff';

  const onActivity = () => {
    lastActivityAt = Date.now();
  };
  ['pointerdown', 'keydown', 'touchstart', 'wheel', 'mousemove'].forEach(ev =>
    window.addEventListener(ev, onActivity, { passive: true })
  );

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Ilova qayta ochildi: PIN oynasida darhol yangilash mumkin, ishlayotgan xodim uchun esa
      // "hozirgina harakat bo'ldi" deb hisoblaymiz (avto-qulf o'z vaqtida ishlashi uchun)
      lastActivityAt = Date.now() - IDLE_LOGIN_SCREEN_MS;
      checkForUpdate({ force: true });
    } else {
      trySafeApply();
    }
  });
  window.addEventListener('online', () => checkForUpdate({ force: true }));
  window.addEventListener('focus', () => checkForUpdate());
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) checkForUpdate({ force: true });
  });

  setInterval(() => checkForUpdate(), CHECK_EVERY_MS);
  setInterval(trySafeApply, POLICY_TICK_MS);
  setTimeout(() => checkForUpdate({ force: true }), 3000);
}
