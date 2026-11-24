// Telegram jonli jurnali: shu qurilmada bajarilgan har bir amal (audit jurnali yozuvi)
// rahbarning Telegramiga boradi. Sozlash: Boshqaruv -> Tizim Sozlamalari -> Telegram.
//
// - Faqat amal bajarilgan qurilma yuboradi. Boshqa qurilmadan bulut orqali kelgan yozuv
//   useSticky dan o'tmaydi (src/sync/engine.js -> writeLocalFromRemote), shuning uchun
//   bitta amal Telegramga ikki marta bormaydi.
// - Bir necha soniya ichidagi amallar bitta xabarga yig'iladi: Telegram guruhga daqiqasiga
//   20 tagacha xabar qabul qiladi.
// - Internet yo'q bo'lsa, navbat shu qurilmada saqlanadi va internet qaytganda yuboriladi.
import { getTelegramConfig, sendTelegramMessage, escapeHtml } from './telegramNotifier';

const AUDIT_KEY = 'pos_audit_logs';
const OUTBOX_KEY = 'pos_tg_feed_outbox'; // faqat shu qurilmada (src/sync/config.ts da yo'q)
const LOCK_KEY = 'pos_tg_feed_lock';     // bir qurilmada ikki oyna ochiq bo'lsa, bittasi yuboradi

const DEBOUNCE_MS = 2500;      // shu vaqt ichidagi amallar bitta xabarga yig'iladi
const MAX_WAIT_MS = 10000;     // uzluksiz amallar bo'lsa ham xabar shundan kechikmaydi
const MIN_GAP_MS = 3100;       // xabarlar orasidagi eng kam vaqt (guruh cheklovi)
const RETRY_MIN_MS = 5000;
const RETRY_MAX_MS = 300000;
const LOCK_TTL_MS = 30000;
const MAX_TEXT = 3500;         // Telegram cheklovi 4096 belgi
const MAX_DETAILS = 600;
const MAX_PENDING = 300;       // navbat cheklovi (uzoq oflayn bo'lsa xotira to'lmasin)
// Bitta yozishda bundan ko'p yangi yozuv paydo bo'lsa, bu amal emas (masalan, zaxiradan tiklash)
const BULK_LIMIT = 5;

const ROLE_LABEL = {
  admin: 'Admin',
  cashier: 'Kassir',
  waiter: 'Ofitsiant',
  kitchen: 'Oshpaz',
  warehouse: 'Omborchi',
  courier: 'Kuryer',
  guest: 'Mijoz'
};

// Tartib muhim: birinchi mos kelgan belgi olinadi
const ICONS = [
  [/kirish/, '🔑'],
  [/chiqish/, '🚪'],
  [/(^|\s)o'chiril|bekor|tozala|kamaytiril|rad etil/, '🗑'],
  [/kuryer|yetkazish/, '🛵'],
  [/oshxona|stop-list/, '👨‍🍳'],
  [/yetkazil/, '🍽'],
  [/pre-chek/, '🧾'],
  [/to'landi|qarz/, '💰'],
  [/buyurtma|chek bo'lindi/, '📝'],
  [/smena|z-hisobot/, '📊'],
  [/ombor|tayyorlov/, '📦'],
  [/xodim|ofitsiant|maosh/, '👥'],
  [/taom|toifa/, '🍔'],
  [/stol|bron|vip/, '🪑'],
  [/ruxsat/, '🛡'],
  [/qr/, '📱'],
  [/zaxira|sozlama/, '⚙️'],
  [/kassa|crm/, '💵']
];

// Bu amallar uchun alohida batafsil xabar bor (telegramNotifier / CashierMode / ShiftPanel):
// jurnalda takrorlanmasin
const COVERED_ACTIONS = {
  'Kassa: Kunlik Xarajat': () => true,
  'Kassa: Inkassatsiya': () => true,
  'Z-hisobot (smena yopildi)': cfg => Boolean(cfg.notifyOnZReport)
};

const TAB_ID = Math.random().toString(36).slice(2);
let timer = null;
let timerAt = 0;
let firstQueuedAt = 0;
let flushing = false;
const lastSentByChat = new Map(); // Telegram cheklovi har bir chat uchun alohida
let retryDelay = RETRY_MIN_MS;

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const readJson = (key, fallback) => {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const readOutbox = () => {
  const box = readJson(OUTBOX_KEY, null);
  return {
    entries: Array.isArray(box?.entries) ? box.entries : [],
    jobs: Array.isArray(box?.jobs) ? box.jobs : [],
    dropped: Number(box?.dropped) || 0
  };
};

const writeOutbox = (box) => {
  try {
    if (!box.entries.length && !box.jobs.length) storage()?.removeItem(OUTBOX_KEY);
    else storage()?.setItem(OUTBOX_KEY, JSON.stringify(box));
  } catch (e) {
    console.warn("Telegram jurnal navbatini saqlab bo'lmadi:", e);
  }
};

const parseChats = (raw) => String(raw || '').split(',').map(s => s.trim()).filter(Boolean);

export const isTelegramFeedActive = (cfg = getTelegramConfig()) =>
  Boolean(cfg?.enabled && cfg.notifyOnActivity !== false &&
    String(cfg.botToken || '').trim() && parseChats(cfg.chatId).length);

const pad2 = (n) => String(n).padStart(2, '0');
const clock = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** Audit yozuvidan Telegram (HTML) matni */
export function formatAuditEntry(entry) {
  const action = String(entry?.action || 'Amal');
  const lower = action.toLowerCase();
  const icon = (ICONS.find(([re]) => re.test(lower)) || [null, '📋'])[1];
  let details = String(entry?.details ?? '').trim();
  if (details.length > MAX_DETAILS) details = `${details.slice(0, MAX_DETAILS)}…`;
  const role = ROLE_LABEL[String(entry?.role || '').toLowerCase()] || entry?.role || '';
  const who = [entry?.userName || entry?.user, role].filter(Boolean).map(escapeHtml).join(' · ');
  return [
    `🕒 ${clock()} · ${icon} <b>${escapeHtml(action)}</b>`,
    details ? escapeHtml(details) : null,
    who ? `👤 ${who}` : null
  ].filter(Boolean).join('\n');
}

function schedule(delay) {
  const at = Date.now() + Math.max(0, delay);
  if (timer && timerAt <= at) return; // ertaroq rejalashtirilgan bo'lsa, o'shani qoldiramiz
  if (timer) clearTimeout(timer);
  timerAt = at;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, Math.max(0, delay));
}

function queueEntries(texts) {
  if (!texts.length) return;
  const box = readOutbox();
  box.entries.push(...texts);
  const overflow = box.entries.length + box.jobs.length - MAX_PENDING;
  if (overflow > 0) {
    box.entries.splice(0, Math.min(overflow, box.entries.length));
    box.dropped += overflow;
  }
  writeOutbox(box);

  const now = Date.now();
  if (!firstQueuedAt) firstQueuedAt = now;
  const delay = Math.min(DEBOUNCE_MS, Math.max(0, firstQueuedAt + MAX_WAIT_MS - now));
  // Debounce: yangi amal kelsa, kutish qaytadan boshlanadi (lekin MAX_WAIT_MS dan oshmaydi)
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  schedule(delay);
}

/** useSticky har bir MAHALLIY yozuvdan keyin chaqiradi (bulutdan kelgani bu yerga kelmaydi). */
export function reportLocalWrite(key, prevValue, nextValue) {
  if (key !== AUDIT_KEY) return;
  try {
    const cfg = getTelegramConfig();
    if (!isTelegramFeedActive(cfg)) return;
    const prevIds = new Set((Array.isArray(prevValue) ? prevValue : []).map(e => (e ? String(e.id) : '')));
    const fresh = (Array.isArray(nextValue) ? nextValue : []).filter(
      e => e && e.id !== undefined && e.id !== null && !prevIds.has(String(e.id))
    );
    if (!fresh.length || fresh.length > BULK_LIMIT) return;
    const texts = fresh
      .filter(e => !(COVERED_ACTIONS[e.action] && COVERED_ACTIONS[e.action](cfg)))
      .reverse() // ro'yxat yangisi boshida: Telegramda vaqt tartibida chiqsin
      .map(formatAuditEntry);
    queueEntries(texts);
  } catch (e) {
    console.warn('Telegram jurnal xatosi:', e);
  }
}

function acquireLock() {
  try {
    const cur = readJson(LOCK_KEY, null);
    if (cur && cur.tab !== TAB_ID && Date.now() - Number(cur.t || 0) < LOCK_TTL_MS) return false;
    storage()?.setItem(LOCK_KEY, JSON.stringify({ tab: TAB_ID, t: Date.now() }));
    return true;
  } catch {
    return true;
  }
}

function releaseLock() {
  try {
    if (readJson(LOCK_KEY, null)?.tab === TAB_ID) storage()?.removeItem(LOCK_KEY);
  } catch {
    // e'tiborsiz
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Navbatdagi yozuvlarni 3500 belgigacha bo'lgan xabarlarga bo'lish
function buildTexts(entries, dropped) {
  const cafeName = readJson('pos_cafe_name', '') || 'Kafe';
  const header = `📡 <b>${escapeHtml(cafeName)}</b> · jonli jurnal\n━━━━━━━━━━━━━━━━━━`;
  const parts = dropped > 0 ? [`⚠️ Navbat to'lgani uchun ${dropped} ta eski yozuv yuborilmadi`, ...entries] : [...entries];
  const texts = [];
  let current = [];
  let length = header.length;
  parts.forEach(part => {
    const piece = part.length > MAX_TEXT ? `${part.slice(0, MAX_TEXT)}…` : part;
    if (current.length && length + piece.length + 2 > MAX_TEXT) {
      texts.push(`${header}\n${current.join('\n\n')}`);
      current = [];
      length = header.length;
    }
    current.push(piece);
    length += piece.length + 2;
  });
  if (current.length) texts.push(`${header}\n${current.join('\n\n')}`);
  return texts;
}

async function flush() {
  if (flushing) return;
  firstQueuedAt = 0;
  const cfg = getTelegramConfig();
  if (!isTelegramFeedActive(cfg)) {
    // Jurnal o'chirilgan: eski navbat keyin yoqilganda to'satdan yuborilib ketmasin
    writeOutbox({ entries: [], jobs: [], dropped: 0 });
    return;
  }
  if (!acquireLock()) {
    schedule(LOCK_TTL_MS / 2);
    return;
  }
  flushing = true;
  try {
    let box = readOutbox();
    if (box.entries.length) {
      const chats = parseChats(cfg.chatId);
      box.jobs.push(...buildTexts(box.entries, box.dropped).map(text => ({ text, chats })));
      box.entries = [];
      box.dropped = 0;
      writeOutbox(box);
    }

    for (;;) {
      box = readOutbox();
      const job = box.jobs[0];
      if (!job) break;
      const chat = Array.isArray(job.chats) ? job.chats[0] : null;
      if (!chat || !job.text) {
        box.jobs.shift();
        writeOutbox(box);
        continue;
      }

      const wait = (lastSentByChat.get(chat) || 0) + MIN_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      acquireLock(); // qulf muddatini yangilash

      const res = await sendTelegramMessage(job.text, 'activity', { ...cfg, chatId: chat });
      lastSentByChat.set(chat, Date.now());

      if (!res.ok && res.retryable) {
        const delay = res.retryAfter ? res.retryAfter * 1000 + 500 : retryDelay;
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
        schedule(delay);
        break;
      }
      if (!res.ok) {
        // Noto'g'ri token yoki Chat ID: qayta urinish foyda bermaydi
        console.warn(`Telegram jurnal xabari yuborilmadi (${chat}):`, res.error);
      }
      retryDelay = RETRY_MIN_MS;

      box = readOutbox();
      const head = box.jobs[0];
      if (head && head.text === job.text) {
        head.chats = (Array.isArray(head.chats) ? head.chats : []).filter(c => c !== chat);
        if (!head.chats.length) box.jobs.shift();
        writeOutbox(box);
      }
    }
  } catch (e) {
    console.warn('Telegram jurnal yuborishda xato:', e);
    schedule(retryDelay);
  } finally {
    flushing = false;
    releaseLock();
  }

  // Yuborish paytida yangi yozuvlar qo'shilgan bo'lsa
  if (!timer && readOutbox().entries.length) schedule(DEBOUNCE_MS);
}

// Ilova ochilganda oldingi (oflayn qolgan) navbatni yuborish
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => schedule(1000));
  const box = readOutbox();
  if (box.entries.length || box.jobs.length) schedule(5000);
}
