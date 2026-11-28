// Xodim rollari: rol - qaysi bo'limga kirish huquqi (kod uchun, localStorage'da saqlanadi).
// Lavozim nomi (user.title) - admin o'zi yozadigan matn (masalan "Bosh oshpaz", "Barmen"),
// faqat ko'rsatish uchun. Kirish huquqi har doim role bo'yicha aniqlanadi.

export const ROLE_OPTIONS = Object.freeze([
  { value: 'admin', label: 'Admin', icon: '👑', pinLength: 6, group: 'management', section: 'Barcha bo\'limlar' },
  { value: 'warehouse', label: 'Omborchi', icon: '📦', pinLength: 6, group: 'management', section: 'Ombor' },
  { value: 'cashier', label: 'Kassir', icon: '💳', pinLength: 6, group: 'staff', section: 'Kassa' },
  { value: 'waiter', label: 'Ofitsiant', icon: '📝', pinLength: 6, group: 'staff', section: 'Ofitsiant' },
  { value: 'kitchen', label: 'Oshpaz', icon: '👨‍🍳', pinLength: 6, group: 'staff', section: 'Oshxona' },
  { value: 'courier', label: 'Kuryer', icon: '🛵', pinLength: 6, group: 'staff', section: 'Yetkazib berish' }
]);

export const VALID_ROLES = Object.freeze(ROLE_OPTIONS.map(r => r.value));

export const getRoleMeta = (role) =>
  ROLE_OPTIONS.find(r => r.value === role) || {
    value: role,
    label: String(role || 'Xodim'),
    icon: '👤',
    pinLength: 6,
    group: 'staff',
    section: String(role || '')
  };

/**
 * Yangi PIN - hamma uchun 6 xonali (6-bosqich, 2-qadam: PIN serverda, 4 xonali PIN terib topishga oson).
 * Eski 4 xonali PIN'lar ishlashda davom etadi (kirish oynasida "✓ Kirish"), o'zgartirilganda - 6 xonali.
 */
export const getRequiredPinLength = () => 6;

/** Boshqaruv guruhi (kirish oynasining "Boshqaruv" tugmasi) */
export const isManagementRole = (role) => role === 'admin' || role === 'warehouse';

/** Eski PIN saqlanib qolishi mumkinmi: boshqaruvga - kamida 6 xonali, xodimlarga - kamida 4 xonali */
export const minKeptPinLength = (role) => (isManagementRole(role) ? 6 : 4);

/** Ekranda ko'rinadigan lavozim: admin yozgan nom, bo'lmasa rol nomi */
export const getUserTitle = (user) => String(user?.title || '').trim() || getRoleMeta(user?.role).label;

/** Lavozim nomi uchun tayyor takliflar (admin istalgan boshqa nomni yozishi mumkin) */
export const TITLE_SUGGESTIONS = Object.freeze([
  'Bosh oshpaz',
  'Oshpaz yordamchisi',
  'Barmen',
  'Katta ofitsiant',
  'Menejer',
  'Administrator',
  'Kuryer',
  'Haydovchi-kuryer'
]);
