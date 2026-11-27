// Oshxona sexlari, har taom taymeri va oshxona cheki - KOT (7-bosqich, 3-qism, 4-qadam).
//
// Sex: bir nechta kategoriyani birlashtiradi ("🍹 Bar" = Ichimlik + Shirinlik). Ro'yxat barcha qurilmalarda
// bir xil (pos_kds_stations, bulut orqali), qaysi sexni ko'rsatishi - har qurilmaning o'zida
// (pos_kds_station): bar plansheti qayta ochilganda ham faqat bar taomlarini ko'rsatadi.
// Tanlov qiymati: 'all' | 'st:<sex id>' | 'cat:<kategoriya>' (eski: kategoriya nomining o'zi).

export const STATIONS_KEY = 'pos_kds_stations';
export const DEVICE_STATION_KEY = 'pos_kds_station';
export const AUTO_PRINT_KEY = 'pos_kds_autoprint';
export const PRINTED_KEY = 'pos_kds_printed';

type Dict = Record<string, unknown>;

export interface KitchenStation {
  id: string;
  name: string;
  icon: string;
  categories: string[];
}

const isObj = (x: unknown): x is Dict => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown): string => (x === undefined || x === null ? '' : String(x));
const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

export function normalizeStations(value: unknown): KitchenStation[] {
  return (Array.isArray(value) ? value : [])
    .filter(isObj)
    .map(s => ({
      id: str(s.id),
      name: str(s.name).trim(),
      icon: str(s.icon).trim() || '👨‍🍳',
      categories: (Array.isArray(s.categories) ? s.categories : []).map(str).filter(Boolean)
    }))
    .filter(s => s.id && s.name);
}

/** Taomning kategoriyasi: qatorning o'zida yoki menyudan (id, asosiy nomi yoki nomi bo'yicha) */
export function lineCategory(item: unknown, menu: unknown): string {
  if (!isObj(item)) return '';
  if (str(item.category)) return str(item.category);
  const found = (Array.isArray(menu) ? menu : []).filter(isObj).find(
    m => str(m.id) === str(item.id) || (str(item.baseName) && m.name === item.baseName) || m.name === item.name
  );
  return found ? str(found.category) : '';
}

/** Tanlangan sex (yoki kategoriya) qaysi kategoriyalarni ko'rsatadi. null - hammasi */
export function selectionCategories(selection: unknown, stations: readonly KitchenStation[]): Set<string> | null {
  const sel = str(selection);
  if (!sel || sel === 'all' || sel === 'Barchasi') return null;
  if (sel.startsWith('st:')) {
    const st = stations.find(s => s.id === sel.slice(3));
    return st ? new Set(st.categories) : null;
  }
  return new Set([sel.startsWith('cat:') ? sel.slice(4) : sel]);
}

export function selectionLabel(selection: unknown, stations: readonly KitchenStation[]): string {
  const sel = str(selection);
  if (!sel || sel === 'all' || sel === 'Barchasi') return 'Barcha sexlar';
  if (sel.startsWith('st:')) {
    const st = stations.find(s => s.id === sel.slice(3));
    return st ? `${st.icon} ${st.name}` : 'Barcha sexlar';
  }
  return sel.startsWith('cat:') ? sel.slice(4) : sel;
}

// ---------- taymer ----------
/** Taom oshxonaga tushgan vaqt (dozakaz - o'z vaqti). Yo'q bo'lsa - chek oshxonaga tushgan vaqt */
export const lineSentMs = (item: unknown, fallbackMs: number): number => {
  const t = isObj(item) ? num(item.kitchenSentAt) : 0;
  return t > 0 ? t : fallbackMs;
};

export const formatTimer = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export type SlaLevel = 'normal' | 'warning' | 'critical';
export const slaLevelOf = (seconds: number, warnSec: number, critSec: number): SlaLevel =>
  seconds >= critSec ? 'critical' : seconds >= warnSec ? 'warning' : 'normal';

// ---------- oshxona cheki (KOT) ----------
export interface KotLine {
  lineId: string;
  name: string;
  /** chekda chiqadigan porsiya (oshxonada turgani) */
  qty: number;
  /** qatordagi jami porsiya (avtomatik chop etishda nechtasi yangi ekanini bilish uchun) */
  total?: number;
  note?: string;
  isAddition?: boolean;
}

export interface KotInput {
  cafeName: string;
  table: string;
  waiter: string;
  orderId: string;
  station: string;
  lines: readonly KotLine[];
  printedAt: number;
  /** avtomatik chop etilgan yangi porsiyalar (dozakaz) */
  isUpdate?: boolean;
}

const esc = (s: unknown): string =>
  str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function kotTicket(k: KotInput): string {
  const time = new Date(k.printedAt).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const rows = k.lines
    .map(l => `<tr><td class="q">${Math.max(0, Math.round(num(l.qty)))}×</td><td><b>${esc(l.name)}</b>${
      l.isAddition ? ' <span class="tag">QO\'SHIMCHA</span>' : ''}${
      l.note ? `<div class="note">! ${esc(l.note)}</div>` : ''}</td></tr>`)
    .join('');
  const total = k.lines.reduce((s, l) => s + Math.max(0, num(l.qty)), 0);
  return `<section class="kot"><h1>OSHXONA CHEKI</h1>${k.isUpdate ? '<p><b>*** QO\'SHIMCHA (DOZAKAZ) ***</b></p>' : ''}
<div class="big">${esc(k.table)}</div><p>${esc(k.station)}</p>
<p>Ofitsiant: ${esc(k.waiter || '—')} • #${esc(str(k.orderId).slice(-4))}</p><p>${esc(time)}</p>
<table>${rows}</table><div class="foot">Jami: ${total} porsiya • ${esc(k.cafeName)}</div></section>`;
}

/** 58/80 mm chek printeriga mos HTML. Bir nechta chek - har biri alohida qog'ozda */
export function kotDocument(tickets: readonly KotInput[]): string {
  return `<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>Oshxona cheki</title>
<style>@page{margin:2mm}body{font-family:monospace;font-size:13px;width:72mm;margin:0 auto;padding:0;color:#000}
.kot{padding:2mm;page-break-after:always;break-after:page}.kot:last-child{page-break-after:auto;break-after:auto}
h1{font-size:18px;text-align:center;margin:0}p{margin:1mm 0;text-align:center}
.big{font-size:22px;font-weight:bold;text-align:center;margin:2mm 0}
table{width:100%;border-collapse:collapse;margin-top:2mm}td{padding:1.5mm 0;vertical-align:top;border-top:1px dashed #000;font-size:15px}
td.q{width:12mm;font-size:18px;font-weight:bold}.note{font-size:13px;font-weight:bold;margin-top:1mm}
.tag{font-size:11px;border:1px solid #000;padding:0 1mm}.foot{border-top:1px dashed #000;margin-top:2mm;padding-top:1mm;text-align:center}</style>
</head><body>${tickets.map(kotTicket).join('')}</body></html>`;
}

export const kotHtml = (k: KotInput): string => kotDocument([k]);

/**
 * Avtomatik chop etish: shu qurilmada hali chop etilmagan porsiyalar.
 * printed - { [lineId]: chop etilganda qatordagi jami porsiya }. Yozuv yo'q bo'lsa, tayyor bo'lgan porsiyalar
 * chop etilgan deb olinadi (qayta chiqmaydi). Rad etilgan/bekor qilingan porsiya hisobni kamaytiradi.
 */
export function unprintedLines(
  lines: readonly KotLine[],
  printed: Record<string, number>
): { lines: KotLine[]; next: Record<string, number> } {
  const next = { ...printed };
  const out: KotLine[] = [];
  lines.forEach(l => {
    const pending = Math.max(0, num(l.qty));
    const total = Math.max(pending, num(l.total ?? l.qty));
    const prev = printed[l.lineId] !== undefined ? num(printed[l.lineId]) : total - pending;
    const fresh = Math.min(pending, Math.max(0, total - prev));
    if (fresh > 0) out.push({ ...l, qty: fresh, isAddition: Boolean(l.isAddition) || prev > 0 });
    next[l.lineId] = total;
  });
  return { lines: out, next };
}

/** Eski yozuvlarni tozalash (1 kun): xarita cheksiz o'smasin */
export function prunePrinted(printed: Record<string, number>, keepIds: ReadonlySet<string>): Record<string, number> {
  const out: Record<string, number> = {};
  Object.keys(printed || {}).forEach(id => {
    if (keepIds.has(id)) out[id] = printed[id];
  });
  return out;
}

/** Yashirin iframe orqali chop etish (qalqib chiquvchi oyna kerak emas: avtomatik chop etishda ham ishlaydi) */
export function printHtml(html: string): boolean {
  if (typeof document === 'undefined') return false;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    return false;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } finally {
      setTimeout(() => frame.remove(), 1500);
    }
  }, 250);
  return true;
}
