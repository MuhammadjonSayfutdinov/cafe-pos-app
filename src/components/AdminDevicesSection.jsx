import React, { useCallback, useEffect, useState } from 'react';
import { discardHeldChanges, getHeldChanges, retryHeld } from '../sync/engine';
import { listDevices, updateDevice } from '../sync/staffAuth';
import { confirmAsync, notify } from '../utils/notify';

// Admin -> Tizim Sozlamalari -> "📱 Qurilmalar" (supabase/security.sql o'rnatilgan bo'lsa).
// Kafe hisobiga ulangan har bir qurilma: tasdiqlash, bloklash, nom berish. Ro'yxatni server faqat
// Ega yoki "Tizim sozlamalari" huquqli adminga beradi (shu qurilmada internet bilan kirgan bo'lsa).
// Pastda: server ruxsat bermagan (kutayotgan) o'zgarishlar.

const STATUS_VIEW = {
  pending: { text: '🟡 Tasdiqlanmagan', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  trusted: { text: '🟢 Ishonchli', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  revoked: { text: '⛔️ Bloklangan', cls: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' }
};

const REASON_TEXT = {
  staff_login: "PIN bilan (internet bor paytda) kirgan xodim kerak",
  admin_only: 'faqat admin',
  self_fields: "o'z rolini yoki huquqini o'zgartirib bo'lmaydi",
  self_delete: "o'zini o'chirib bo'lmaydi",
  owner_locked: "Egani o'zgartirib bo'lmaydi",
  owner_role: "Ega o'z rolini o'zgartira olmaydi",
  add_admins: '"Yangi admin tayinlash" huquqi kerak',
  not_appointer: 'bu adminni boshqa admin tayinlagan',
  appointed_by: "tayinlagan admin noto'g'ri",
  grant_right: "o'zida yo'q huquqni berib bo'lmaydi",
  staff_right: '"Xodimlar" huquqi kerak',
  menu_right: '"Taomlar" huquqi kerak',
  audit_append_only: "jurnalni faqat Ega tozalaydi",
  orders_delete: '"Tizim sozlamalari" huquqi kerak',
  owner_only: 'faqat Ega',
  pin_rules_right: '"PIN himoyasini boshqarish" huquqi kerak',
  categories_right: '"Kategoriyalar" huquqi kerak',
  stats_right: '"Statistika" huquqi kerak',
  settings_right: '"Tizim sozlamalari" huquqi kerak',
  bad_row: "noto'g'ri yozuv"
};

const COLLECTION_TEXT = {
  pos_users: 'Xodim',
  pos_menu: 'Taom',
  pos_orders: 'Chek',
  pos_audit_logs: 'Jurnal yozuvi',
  pos_inventory: 'Ombor',
  pos_customers: 'Mijoz',
  pos_expenses: 'Xarajat'
};

/** Brauzer va qurilma turi (foydalanuvchi uchun qisqa) */
export function describeAgent(ua) {
  const s = String(ua || '');
  if (!s) return '';
  const os = /iPad/.test(s) ? 'iPad' : /iPhone/.test(s) ? 'iPhone' : /Android/.test(s) ? 'Android'
    : /Windows/.test(s) ? 'Windows' : /Mac OS X|Macintosh/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : '';
  const browser = /Edg\//.test(s) ? 'Edge' : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox'
    : /Safari\//.test(s) ? 'Safari' : '';
  return [os, browser].filter(Boolean).join(' · ');
}

const formatTime = (iso) => {
  const d = new Date(iso);
  return iso && !Number.isNaN(d.getTime()) ? d.toLocaleString() : '—';
};

export default function AdminDevicesSection({ status }) {
  const [devices, setDevices] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // { session, label }
  const heldList = status.held > 0 ? getHeldChanges() : [];
  const staffName = status.security?.staff?.name || '';

  const load = useCallback(async () => {
    setBusy(true);
    const res = await listDevices();
    setBusy(false);
    if (res.ok) {
      setDevices(res.devices);
      setError('');
    } else {
      setDevices(null);
      setError(res.reason === 'offline'
        ? "📴 Server bilan aloqa yo'q: ro'yxatni ko'rish uchun internet kerak."
        : "🔒 Ro'yxatni faqat Ega yoki \"Tizim sozlamalari\" huquqli admin ko'radi. Shu qurilmada internet bor paytda PIN bilan qayta kiring.");
    }
  }, []);

  // Xodim almashsa (serverda kirgan) ro'yxat qayta so'raladi
  useEffect(() => {
    load();
  }, [load, staffName]);

  const act = async (device, action, label) => {
    if (action === 'revoke') {
      const ok = await confirmAsync(
        `⛔️ "${device.label || 'Nomsiz qurilma'}" bloklansinmi?\n\nU kafe ma'lumotini ko'ra olmaydi va yoza olmaydi, qurilmadagi maxfiy ma'lumot o'chiriladi. Keyin qayta tasdiqlash mumkin.`,
        { confirmText: 'Bloklash', danger: true }
      );
      if (!ok) return;
    }
    setBusy(true);
    const res = await updateDevice(device.session, action, label);
    setBusy(false);
    if (!res.ok) {
      notify(res.reason === 'self' ? "⛔️ O'zingiz ishlayotgan qurilmani bloklab bo'lmaydi." : "❌ Bajarib bo'lmadi", 'error');
      return;
    }
    notify(action === 'approve' ? '✅ Qurilma tasdiqlandi' : action === 'revoke' ? '⛔️ Qurilma bloklandi'
      : action === 'forget' ? "🗑 Ro'yxatdan olib tashlandi" : '✅ Nomi saqlandi');
    setEditing(null);
    load();
  };

  const handleDiscardHeld = async () => {
    const ok = await confirmAsync(
      `${heldList.length} ta o'zgarish serverga qabul qilinmagan (ruxsat yo'q). Ulardan voz kechilsinmi? Qurilmada serverdagi holat tiklanadi.`,
      { confirmText: "Voz kechish", danger: true }
    );
    if (!ok) return;
    try {
      await discardHeldChanges();
      notify('✅ Serverdagi holat tiklandi');
    } catch {
      notify("❌ Server bilan aloqa yo'q: keyinroq urinib ko'ring", 'error');
    }
  };

  return (
    <div className="space-y-4 border-t border-gray-100 dark:border-gray-700 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-base font-black text-gray-900 dark:text-white">📱 Qurilmalar</h4>
          <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
            Kafe hisobiga ulangan har bir brauzer. Yangi qurilma tasdiqlanmaguncha hech narsa ko'rmaydi.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="shrink-0 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-xs font-black text-gray-700 dark:text-gray-200 disabled:opacity-60"
        >
          {busy ? '...' : '🔄'}
        </button>
      </div>

      <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
        Bu qurilma: {status.security?.label || 'nomsiz'} ·{' '}
        {staffName ? `serverda kirgan: ${staffName}` : "serverda hech kim kirmagan (umumiy ruxsat)"}
      </p>

      {error && <p className="text-xs font-bold text-amber-700 dark:text-amber-300">{error}</p>}

      {Array.isArray(devices) && (
        <div className="space-y-2">
          {devices.length === 0 && <p className="text-xs font-bold text-gray-400">Qurilma yo'q</p>}
          {devices.map(d => {
            const view = STATUS_VIEW[d.status] || STATUS_VIEW.pending;
            const isEditing = editing?.session === d.session;
            return (
              <div
                key={d.session}
                className={`p-3 rounded-2xl border ${d.status === 'pending' ? 'border-amber-300 dark:border-amber-700' : 'border-gray-100 dark:border-gray-700'} bg-gray-50 dark:bg-gray-900/60 space-y-2`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-sm text-gray-900 dark:text-white">{d.label || 'Nomsiz qurilma'}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${view.cls}`}>{view.text}</span>
                  {d.current && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">Bu qurilma</span>}
                  {d.locked && <span className="text-[10px] font-black text-red-600">🔒 PIN xatolari: vaqtincha blok</span>}
                </div>
                <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                  {describeAgent(d.user_agent) || 'Brauzer noma\'lum'} · oxirgi faollik: {formatTime(d.last_seen_at)}
                  {d.staff ? ` · hozir: ${d.staff}` : ''}
                  {d.approved_by ? ` · tasdiqlagan: ${d.approved_by}` : ''}
                </p>
                {isEditing ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editing.label}
                      maxLength={60}
                      autoFocus
                      onChange={e => setEditing({ session: d.session, label: e.target.value })}
                      className="flex-1 min-w-0 p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-900 dark:text-white"
                    />
                    <button type="button" onClick={() => act(d, 'rename', editing.label.trim())} className="px-3 rounded-xl bg-brand-600 text-white text-xs font-black">Saqlash</button>
                    <button type="button" onClick={() => setEditing(null)} className="px-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-xs font-black">✕</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {d.status !== 'trusted' && (
                      <button type="button" disabled={busy} onClick={() => act(d, 'approve')} className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black disabled:opacity-60">
                        ✅ {d.status === 'revoked' ? 'Qayta tasdiqlash' : 'Tasdiqlash'}
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => setEditing({ session: d.session, label: d.label || '' })} className="px-3 py-1.5 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 text-xs font-black disabled:opacity-60">
                      ✏️ Nomi
                    </button>
                    {d.status !== 'revoked' && !d.current && (
                      <button type="button" disabled={busy} onClick={() => act(d, 'revoke')} className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-xs font-black disabled:opacity-60">
                        ⛔️ Bloklash
                      </button>
                    )}
                    {d.status !== 'trusted' && (
                      <button type="button" disabled={busy} onClick={() => act(d, 'forget')} className="px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 text-xs font-black disabled:opacity-60">
                        🗑 Ro'yxatdan olib tashlash
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {heldList.length > 0 && (
        <div className="p-3 rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 space-y-2">
          <p className="text-xs font-black text-amber-800 dark:text-amber-200">
            ⏸ {heldList.length} ta o'zgarish serverga qabul qilinmadi (ruxsat yo'q). Huquqi bor xodim shu qurilmada
            internet bilan kirsa, o'zi qayta yuboriladi.
          </p>
          <ul className="text-[11px] font-bold text-amber-800 dark:text-amber-200 space-y-0.5 max-h-40 overflow-y-auto">
            {heldList.slice(0, 20).map(h => (
              <li key={`${h.kind}:${h.collection || h.key}:${h.id || ''}`}>
                • {h.kind === 'kv' ? `Sozlama (${h.key})` : `${COLLECTION_TEXT[h.collection] || h.collection} ${h.id}`}: {REASON_TEXT[h.reason] || h.reason}
              </li>
            ))}
          </ul>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={retryHeld} className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black">
              🔄 Qayta yuborish
            </button>
            <button type="button" onClick={handleDiscardHeld} className="flex-1 py-2 rounded-xl bg-white dark:bg-gray-800 text-red-600 text-xs font-black">
              Voz kechish (serverdagini tiklash)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
