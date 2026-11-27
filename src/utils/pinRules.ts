// Admin PIN himoyasi (rahbar tasdig'i) - har bir amal uchun alohida (Telegram guruhidagi ruxsatlar
// ro'yxati kabi). Oldin bitta umumiy tugma edi (pos_override_enabled): yoqilsa hamma joyda PIN
// so'ralardi, o'chirilsa hech qayerda.
//
// Saqlash: pos_pin_rules = { waiterCancelOrder: true, cashierDebt: false, ... } (KV, bulut orqali).
// Yozilmagan amal: avval himoyalangan bo'lsa (legacy) - eski umumiy tugma qiymati, yangi amal - o'chiq.
// O'zgartirish: Ega yoki "PIN himoyasini boshqarish" huquqi bor admin (src/utils/adminRights.ts).
// Eski versiyadagi qurilmalar uchun pos_override_enabled = "kamida bitta amal himoyalangan".

export const PIN_RULES_KEY = 'pos_pin_rules';
export const LEGACY_OVERRIDE_KEY = 'pos_override_enabled';

export type PinRuleKey =
  | 'waiterReduceItem'
  | 'waiterCancelOrder'
  | 'cashierDiscount'
  | 'cashierDebt'
  | 'cashierCancelOrder'
  | 'cashierDeleteExpense'
  | 'cashierRefund'
  | 'kitchenReject'
  | 'warehouseWriteOff'
  | 'warehouseDeleteItem'
  | 'warehouseClearHistory'
  | 'adminClearOrders';

export interface PinRuleMeta {
  key: PinRuleKey;
  label: string;
  hint: string;
  /** Oldin umumiy tugma bilan himoyalangan edi (yozilmagan bo'lsa eski tugma qiymatini oladi) */
  legacy: boolean;
  /** Yangi amal, lekin standart holatda yoqiq (pul chiqimi): umumiy himoya o'chiq bo'lsa - o'chiq */
  defaultOn?: boolean;
}

export interface PinRuleGroup {
  id: string;
  icon: string;
  label: string;
  rules: readonly PinRuleMeta[];
}

export const PIN_RULE_GROUPS: readonly PinRuleGroup[] = Object.freeze([
  {
    id: 'waiter',
    icon: '📝',
    label: 'Ofitsiant',
    rules: [
      { key: 'waiterReduceItem', label: "Oshxonaga ketgan taomni kamaytirish yoki o'chirish", hint: 'Pre-chek chiqarilgan chekdagi taom ham', legacy: true },
      { key: 'waiterCancelOrder', label: "Chekni to'liq bekor qilish", hint: "Stol bo'shaydi, oshxonaga xabar boradi", legacy: true }
    ]
  },
  {
    id: 'cashier',
    icon: '💰',
    label: 'Kassa',
    rules: [
      { key: 'cashierDiscount', label: 'Katta chegirma', hint: "20% va undan ko'p yoki pre-chek chiqqandan keyin", legacy: true },
      { key: 'cashierDebt', label: 'Chekni qarzga yozish', hint: 'Mijoz keyin to\'laydi', legacy: false },
      { key: 'cashierCancelOrder', label: 'Chekni bekor qilish (kassada)', hint: '', legacy: true },
      { key: 'cashierDeleteExpense', label: "Kassa xarajatini o'chirish", hint: '', legacy: true },
      { key: 'cashierRefund', label: 'Mijozga pul qaytarish', hint: "To'langan chekdan oshxona rad etgan taom puli", legacy: false, defaultOn: true }
    ]
  },
  {
    id: 'kitchen',
    icon: '👨‍🍳',
    label: 'Oshxona',
    rules: [
      { key: 'kitchenReject', label: 'Taomni rad etish', hint: "O'chiq bo'lsa oshpaz o'zi rad etadi (tezroq)", legacy: false }
    ]
  },
  {
    id: 'warehouse',
    icon: '📦',
    label: 'Ombor',
    rules: [
      { key: 'warehouseWriteOff', label: 'Chiqim (spisanie) va qoldiqni kamaytirish', hint: 'Reviziyada qoldiq kamaysa ham', legacy: false },
      { key: 'warehouseDeleteItem', label: "Mahsulotni ombordan o'chirish", hint: '', legacy: false },
      { key: 'warehouseClearHistory', label: 'Ombor tarixini tozalash', hint: '', legacy: true }
    ]
  },
  {
    id: 'admin',
    icon: '⚙️',
    label: 'Boshqaruv',
    rules: [
      { key: 'adminClearOrders', label: 'Cheklar tarixini tozalash', hint: "To'langan va bekor qilingan cheklar", legacy: true }
    ]
  }
]);

export const PIN_RULES: readonly PinRuleMeta[] = Object.freeze(PIN_RULE_GROUPS.flatMap(g => g.rules));
export const PIN_RULE_KEYS: readonly PinRuleKey[] = Object.freeze(PIN_RULES.map(r => r.key));

/** Faqat Ega bajaradigan amallar (Ega PIN'i bilan): ro'yxatda ma'lumot uchun ko'rsatiladi */
export const OWNER_ONLY_ACTIONS: readonly string[] = Object.freeze([
  'Egalikni boshqa adminga topshirish',
  'Zaxira nusxadan bazani tiklash',
  'Tizimni zavod holatiga qaytarish',
  'Audit jurnalini (tarixni) tozalash',
  "Telegram xabarnomasini o'zgartirish (bot, chat ID)"
]);

export type PinRules = Record<PinRuleKey, boolean>;

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);

export const isPinRuleKey = (key: unknown): key is PinRuleKey =>
  typeof key === 'string' && (PIN_RULE_KEYS as readonly string[]).includes(key);

/** Amaldagi qoidalar: yozilgani, yozilmagani - eski umumiy tugmadan (yangi amal - o'chiq) */
export function resolvePinRules(stored: unknown, legacyEnabled: unknown): PinRules {
  const legacyOn = legacyEnabled !== false;
  const obj = isObject(stored) ? stored : {};
  const out = {} as PinRules;
  PIN_RULES.forEach(rule => {
    out[rule.key] = typeof obj[rule.key] === 'boolean'
      ? (obj[rule.key] as boolean)
      : (rule.legacy || Boolean(rule.defaultOn)) && legacyOn;
  });
  return out;
}

/** Shu amalda PIN so'raladimi. Kalit noma'lum bo'lsa - kamida bitta qoida yoqilgan bo'lsa (ehtiyot) */
export function isPinRuleOn(rules: PinRules, key: unknown): boolean {
  if (isPinRuleKey(key)) return rules[key] === true;
  return PIN_RULE_KEYS.some(k => rules[k]);
}

export const countPinRules = (rules: PinRules, keys: readonly PinRuleKey[] = PIN_RULE_KEYS): { on: number; total: number } => ({
  on: keys.filter(k => rules[k]).length,
  total: keys.length
});

/** Bitta (yoki bir guruh) qoidani o'zgartirish: butun obyekt yoziladi (eski tugmaga bog'liq qolmaydi) */
export function withPinRules(rules: PinRules, changes: Partial<Record<PinRuleKey, boolean>>): PinRules {
  const next = { ...rules };
  (Object.keys(changes) as PinRuleKey[]).forEach(k => {
    if (isPinRuleKey(k)) next[k] = Boolean(changes[k]);
  });
  return next;
}

export const pinRuleLabel = (key: PinRuleKey): string => PIN_RULES.find(r => r.key === key)?.label || key;
