// Ega (kafe egasi) va adminlar huquqlari: Telegram guruhidagi "Ega" va "Admin huquqlari" kabi.
//
// - Ega: barcha huquqlar. Uni hech kim tahrirlay, o'chira yoki huquqini kamaytira olmaydi
//   (faqat o'zi o'z ismi, PIN'i va ikki bosqichli kirishini o'zgartiradi).
// - Kim Ega: pos_owner (KV, bulut orqali barcha qurilmalarda) dagi admin. Yozilmagan bo'lsa yoki u
//   admin bo'lmay qolgan bo'lsa (masalan eski versiyadagi qurilmada o'chirilgan) - eng birinchi
//   qo'shilgan admin. Hisob id dan (qo'shilgan vaqt), ro'yxat tartibidan emas: barcha qurilmada bir xil.
// - Boshqa admin: Ega (yoki "Yangi admin tayinlash" huquqi bor admin) ochib bergan bo'limlar.
//   user.adminRights = { stats: true, cashier: false, ... }, user.appointedBy = tayinlagan admin id si.
//   Huquqi yozilmagan eski admin: avvalgidek barcha bo'limlar, maxsus huquqlardan faqat tasdiqlash.
// - Admin faqat o'zi tayinlagan adminni o'zgartiradi va faqat o'zida bor huquqni bera oladi.
//
// Eslatma: tekshiruv qurilmada (oflayn ishlash uchun). Bazaga to'g'ridan-to'g'ri yozila oladigandan
// himoya - serverda (6-bosqich, 2-qadam: PIN serverda, RLS).

export const OWNER_KEY = 'pos_owner';

export type AdminRightKey =
  | 'stats'
  | 'warehouse'
  | 'waiter'
  | 'cashier'
  | 'kitchen'
  | 'courier'
  | 'menu'
  | 'categories'
  | 'staff'
  | 'logs'
  | 'settings'
  | 'approve'
  | 'pinRules'
  | 'addAdmins';

export type AdminRightGroup = 'screens' | 'panel' | 'special';

export interface AdminRightMeta {
  key: AdminRightKey;
  icon: string;
  label: string;
  hint: string;
  group: AdminRightGroup;
  /** Yangi tayinlangan admin uchun standart (Telegram kabi: ko'pi ochiq, admin tayinlash yopiq) */
  defaultOn: boolean;
}

export type AdminRights = Record<AdminRightKey, boolean>;

export const ADMIN_RIGHT_GROUPS: readonly { id: AdminRightGroup; label: string }[] = Object.freeze([
  { id: 'screens', label: "Ekranlar (bo'limlar)" },
  { id: 'panel', label: "Boshqaruv bo'limlari" },
  { id: 'special', label: 'Maxsus huquqlar' }
]);

export const ADMIN_RIGHTS: readonly AdminRightMeta[] = Object.freeze([
  { key: 'stats', icon: '📊', label: 'Statistika va hisobotlar', hint: "Savdo, foyda, ish haqi", group: 'screens', defaultOn: true },
  { key: 'warehouse', icon: '📦', label: 'Ombor', hint: 'Qoldiq, kirim-chiqim, tayyorlov', group: 'screens', defaultOn: true },
  { key: 'waiter', icon: '📝', label: 'Ofitsiant ekrani', hint: "Stollar, buyurtma, QR-so'rovlar", group: 'screens', defaultOn: true },
  { key: 'cashier', icon: '💰', label: 'Kassa', hint: "To'lov, smena, xarajat", group: 'screens', defaultOn: true },
  { key: 'kitchen', icon: '👨‍🍳', label: 'Oshxona', hint: 'Oshxona ekrani, stop-list', group: 'screens', defaultOn: true },
  { key: 'courier', icon: '🛵', label: 'Kuryer (yetkazish)', hint: 'Yetkazish buyurtmalari', group: 'screens', defaultOn: true },
  { key: 'menu', icon: '🍽️', label: 'Taomlar (menyu)', hint: "Taom qo'shish, narx, rasm", group: 'panel', defaultOn: true },
  { key: 'categories', icon: '📁', label: 'Kategoriyalar', hint: '', group: 'panel', defaultOn: true },
  { key: 'staff', icon: '👥', label: 'Xodimlar va PIN kodlar', hint: "Ofitsiant, kassir, oshpaz... qo'shish, PIN berish, o'chirish", group: 'panel', defaultOn: true },
  { key: 'logs', icon: '🕵️', label: 'Tarix (audit jurnali)', hint: "Kim nima qilgani", group: 'panel', defaultOn: true },
  { key: 'settings', icon: '⚙️', label: 'Tizim sozlamalari', hint: 'Kafe nomi, stollar, QR, Telegram, bulut', group: 'panel', defaultOn: true },
  { key: 'approve', icon: '✅', label: 'Xavfli amalni PIN bilan tasdiqlash', hint: "Rahbar tasdig'i: chekni bekor qilish, chegirma...", group: 'special', defaultOn: true },
  { key: 'pinRules', icon: '🔐', label: 'PIN himoyasini boshqarish', hint: "Qaysi amalda PIN so'ralishini yoqish va o'chirish", group: 'special', defaultOn: false },
  { key: 'addAdmins', icon: '👑', label: 'Yangi admin tayinlash', hint: "O'zida bor huquqlarnigina bera oladi", group: 'special', defaultOn: false }
]);

export const ADMIN_RIGHT_KEYS: readonly AdminRightKey[] = Object.freeze(ADMIN_RIGHTS.map(r => r.key));

/** Admin ekranlari (yuqoridagi menyu): Boshqaruv ('admin') har doim ochiq - u yerda o'z profili bor */
export const ADMIN_SCREEN_KEYS: readonly AdminRightKey[] = Object.freeze(['stats', 'warehouse', 'waiter', 'cashier', 'kitchen', 'courier']);

const fill = (fn: (meta: AdminRightMeta) => boolean): AdminRights => {
  const out = {} as AdminRights;
  ADMIN_RIGHTS.forEach(meta => {
    out[meta.key] = fn(meta);
  });
  return out;
};

export const ALL_RIGHTS: Readonly<AdminRights> = Object.freeze(fill(() => true));
export const NO_RIGHTS: Readonly<AdminRights> = Object.freeze(fill(() => false));

/** Yangi tayinlanayotgan admin uchun boshlang'ich huquqlar */
export const defaultAdminRights = (): AdminRights => fill(meta => meta.defaultOn);

/** Huquqlari yozilmagan (shu yangilanishdan oldingi) admin: avvalgidek barcha bo'limlar ochiq */
export const legacyAdminRights = (): AdminRights => fill(meta => meta.group !== 'special' || meta.key === 'approve');

// ---------- xodim yozuvi ----------
export interface UserLike {
  id?: unknown;
  role?: unknown;
  name?: unknown;
  adminRights?: unknown;
  appointedBy?: unknown;
}

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

export const userIdOf = (u: UserLike | null | undefined): string =>
  u && u.id !== undefined && u.id !== null && u.id !== '' ? String(u.id) : '';

export const isAdminUser = (u: UserLike | null | undefined): boolean =>
  Boolean(u) && String(u?.role ?? '').toLowerCase() === 'admin';

/**
 * Xodim qachon qo'shilgani (id dan): 1, 2 ... - dastlabki namuna xodimlar (eng eskilar),
 * eski id = Date.now(), yangi id = "user_<vaqt>_...". Topilmasa - eng oxirida.
 */
export function createdOrderOf(u: UserLike | null | undefined): number {
  const raw = u?.id;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw ?? '');
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/(\d{10,})/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

// ---------- Ega ----------
export interface OwnerRecord {
  id: string;
  /** Egalik berilgan vaqt (ms) */
  at: number;
  /** Kim topshirdi (ism) */
  by: string;
}

export function readOwnerRecord(value: unknown): OwnerRecord | null {
  if (!isObject(value)) return null;
  const id = value.id;
  if (id === undefined || id === null || id === '') return null;
  return { id: String(id), at: Number(value.at) || 0, by: String(value.by ?? '') };
}

export const makeOwnerRecord = (userId: unknown, byName: unknown, now: number = Date.now()): OwnerRecord => ({
  id: String(userId),
  at: now,
  by: String(byName ?? '')
});

/** Ega id si: pos_owner dagi admin, bo'lmasa eng birinchi qo'shilgan admin. Admin yo'q - null */
export function resolveOwnerId(users: unknown, ownerValue: unknown): string | null {
  const admins = (Array.isArray(users) ? users : []).filter(
    (u): u is UserLike => isObject(u) && isAdminUser(u as UserLike) && userIdOf(u as UserLike) !== ''
  );
  if (admins.length === 0) return null;
  const rec = readOwnerRecord(ownerValue);
  if (rec && admins.some(a => userIdOf(a) === rec.id)) return rec.id;
  const oldest = [...admins].sort(
    (a, b) => createdOrderOf(a) - createdOrderOf(b) || userIdOf(a).localeCompare(userIdOf(b))
  )[0];
  return userIdOf(oldest) || null;
}

export const isOwnerUser = (u: UserLike | null | undefined, ownerId: string | null | undefined): boolean =>
  Boolean(ownerId) && isAdminUser(u) && userIdOf(u) === ownerId;

// ---------- huquqlar ----------
/** Yozilgan huquqlar (Egasiz hisob): yozilmagan bo'lsa - eski admin (avvalgidek) */
export function readAdminRights(u: UserLike | null | undefined): AdminRights {
  const stored = u?.adminRights;
  if (!isObject(stored)) return legacyAdminRights();
  return fill(meta => (typeof stored[meta.key] === 'boolean' ? (stored[meta.key] as boolean) : meta.defaultOn));
}

/** Xodimning amaldagi huquqlari: Ega - hammasi, admin - yozilgani, boshqa rol - hech biri */
export function getUserRights(u: UserLike | null | undefined, ownerId: string | null | undefined): AdminRights {
  if (!isAdminUser(u)) return { ...NO_RIGHTS };
  if (isOwnerUser(u, ownerId)) return { ...ALL_RIGHTS };
  return readAdminRights(u);
}

export const hasRight = (u: UserLike | null | undefined, ownerId: string | null | undefined, key: AdminRightKey): boolean =>
  getUserRights(u, ownerId)[key] === true;

/** Xavfli amalni PIN bilan tasdiqlay oladi (rahbar tasdig'i) */
export const canApproveOverride = (u: UserLike | null | undefined, ownerId: string | null | undefined): boolean =>
  hasRight(u, ownerId, 'approve');

/** Admin yuqoridagi menyudagi ekranni ocha oladimi ('admin' = Boshqaruv, doim ochiq) */
export function canOpenAdminView(u: UserLike | null | undefined, ownerId: string | null | undefined, view: string): boolean {
  if (!isAdminUser(u)) return false;
  if (view === 'admin') return true;
  return (ADMIN_SCREEN_KEYS as readonly string[]).includes(view) && hasRight(u, ownerId, view as AdminRightKey);
}

/** Admin bera oladigan huquqlar: Ega - hammasi, "Yangi admin tayinlash" bor admin - o'zida borlari */
export function grantableRights(actor: UserLike | null | undefined, ownerId: string | null | undefined): AdminRights {
  if (isOwnerUser(actor, ownerId)) return { ...ALL_RIGHTS };
  if (!hasRight(actor, ownerId, 'addAdmins')) return { ...NO_RIGHTS };
  return getUserRights(actor, ownerId);
}

export const canAddAdmins = (actor: UserLike | null | undefined, ownerId: string | null | undefined): boolean =>
  hasRight(actor, ownerId, 'addAdmins');

/**
 * actor boshqa xodimni (o'zini emas) tahrirlay, o'chira, huquqini o'zgartira oladimi:
 * Egani - hech kim; adminni - Ega yoki uni o'zi tayinlagan ("Yangi admin tayinlash" huquqi bilan);
 * oddiy xodimni - Ega yoki "Xodimlar" huquqi bor admin.
 */
export function canManageUser(
  actor: UserLike | null | undefined,
  target: UserLike | null | undefined,
  ownerId: string | null | undefined
): boolean {
  if (!actor || !target || !isAdminUser(actor)) return false;
  if (userIdOf(actor) === userIdOf(target)) return false;
  if (isOwnerUser(target, ownerId)) return false;
  if (isOwnerUser(actor, ownerId)) return true;
  if (isAdminUser(target)) {
    return canAddAdmins(actor, ownerId) && String(target.appointedBy ?? '') === userIdOf(actor);
  }
  return hasRight(actor, ownerId, 'staff');
}

/**
 * Saqlashdan oldin: actor bera olmaydigan huquq o'zgarmaydi (oldingi qiymati qoladi,
 * yangi adminda - yopiq). Telegram kabi: admin o'zida yo'q huquqni bera olmaydi.
 */
export function clampRights(
  next: Partial<Record<AdminRightKey, unknown>> | null | undefined,
  actor: UserLike | null | undefined,
  ownerId: string | null | undefined,
  previous?: AdminRights | null
): AdminRights {
  const grant = grantableRights(actor, ownerId);
  return fill(meta =>
    grant[meta.key] ? Boolean(next?.[meta.key]) : Boolean(previous ? previous[meta.key] : false)
  );
}

/** Nechta huquq ochiq (guruh bo'yicha ham) */
export function countRights(rights: AdminRights, group?: AdminRightGroup): { on: number; total: number } {
  const list = ADMIN_RIGHTS.filter(meta => !group || meta.group === group);
  return { on: list.filter(meta => rights[meta.key]).length, total: list.length };
}

/** Audit uchun: qaysi huquqlar ochildi / yopildi */
export function describeRightsChange(before: AdminRights, after: AdminRights): string {
  const opened = ADMIN_RIGHTS.filter(m => !before[m.key] && after[m.key]).map(m => m.label);
  const closed = ADMIN_RIGHTS.filter(m => before[m.key] && !after[m.key]).map(m => m.label);
  const parts: string[] = [];
  if (opened.length) parts.push(`ochildi: ${opened.join(', ')}`);
  if (closed.length) parts.push(`yopildi: ${closed.join(', ')}`);
  return parts.join(' • ') || "o'zgarish yo'q";
}
