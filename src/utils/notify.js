// Bildirishnomalar va tasdiqlash oynasi (alert/confirm o'rniga, B13).
// Istalgan joydan chaqiriladi; ko'rsatish NotificationHost komponentida.
//
//   notify("✅ Saqlandi!")                  -> yashil toast (turi emojidan aniqlanadi)
//   notify("Matn", 'error')                  -> turi aniq berilgan
//   if (!(await confirmAsync("O'chirasizmi?"))) return;

const listeners = new Set();
let state = { toasts: [], confirms: [] };
let nextId = 1;

const emit = () => {
  listeners.forEach(fn => fn(state));
};

export function subscribeNotifications(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

const inferType = (message) => {
  const text = String(message || '').trim();
  if (/^(❌|⛔|🛑|🚫|🚨)/u.test(text)) return 'error';
  if (/^(✅|🎉|💰)/u.test(text)) return 'success';
  if (/^(⚠️|⚠)/u.test(text)) return 'warning';
  return 'info';
};

export function dismissToast(id) {
  state = { ...state, toasts: state.toasts.filter(t => t.id !== id) };
  emit();
}

/**
 * Toast ko'rsatadi.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} [type] berilmasa matndagi emojidan aniqlanadi
 */
export function notify(message, type) {
  const id = nextId++;
  const resolvedType = type || inferType(message);
  const toast = { id, message: String(message ?? ''), type: resolvedType };
  // Bir vaqtda ko'pi bilan 4 ta toast
  state = { ...state, toasts: [...state.toasts, toast].slice(-4) };
  emit();

  const ttl = resolvedType === 'error' || resolvedType === 'warning' ? 7000 : 4000;
  setTimeout(() => dismissToast(id), ttl);
  return id;
}

/**
 * Tasdiqlash oynasi. Promise<boolean> qaytaradi.
 * @param {string} message
 * @param {{ confirmText?: string, cancelText?: string, danger?: boolean }} [options]
 */
export function confirmAsync(message, options = {}) {
  return new Promise(resolve => {
    const id = nextId++;
    const text = String(message ?? '');
    const item = {
      id,
      message: text,
      confirmText: options.confirmText || 'Tasdiqlash',
      cancelText: options.cancelText || 'Bekor qilish',
      danger: options.danger ?? /^(⚠️|⚠|🛑|🚨|❌)/u.test(text.trim()),
      resolve
    };
    state = { ...state, confirms: [...state.confirms, item] };
    emit();
  });
}

export function resolveConfirm(id, value) {
  const item = state.confirms.find(c => c.id === id);
  state = { ...state, confirms: state.confirms.filter(c => c.id !== id) };
  emit();
  if (item) item.resolve(Boolean(value));
}
