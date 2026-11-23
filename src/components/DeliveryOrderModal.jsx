import React, { useState } from 'react';
import useSticky from '../hooks/useSticky';
import { notify } from '../utils/notify';
import { findLastDeliveryByPhone, phoneDigits } from '../utils/delivery';

const inputClass =
  'w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-sm text-gray-900 dark:text-white outline-hidden focus:border-orange-500 transition';
const labelClass = 'block text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1';

// Yangi yetkazish buyurtmasi: mijoz ma'lumotlari. Taomlar keyin oddiy menyudan tanlanadi.
export default function DeliveryOrderModal({ orders = [], onClose, onSubmit }) {
  // Standart yetkazish narxi barcha qurilmalarda bir xil (bulutda sinxronlanadi)
  const [defaultFee, setDefaultFee] = useSticky('pos_delivery_fee', 0);
  const [form, setForm] = useState(() => ({
    phone: '',
    customerName: '',
    address: '',
    landmark: '',
    note: '',
    fee: String(Number(defaultFee) || 0)
  }));
  const [prefilledFrom, setPrefilledFrom] = useState('');

  const setField = (name, value) => setForm(prev => ({ ...prev, [name]: value }));

  // Doimiy mijoz: telefon kiritilgach oldingi manzil avtomatik to'ldiriladi
  const handlePhoneBlur = () => {
    if (form.address.trim()) return;
    const last = findLastDeliveryByPhone(orders, form.phone);
    if (!last) return;
    setForm(prev => ({
      ...prev,
      customerName: prev.customerName || last.customerName || '',
      address: last.address || '',
      landmark: prev.landmark || last.landmark || ''
    }));
    setPrefilledFrom(last.address || '');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const phone = form.phone.trim();
    const address = form.address.trim();
    if (phoneDigits(phone).length < 9) {
      notify("⛔️ Mijozning to'liq telefon raqamini kiriting (kamida 9 ta raqam)");
      return;
    }
    if (!address) {
      notify('⛔️ Yetkazish manzilini kiriting');
      return;
    }
    const fee = Math.max(0, Math.round(Number(form.fee) || 0));
    if (fee !== (Number(defaultFee) || 0)) setDefaultFee(fee);

    onSubmit({
      phone,
      customerName: form.customerName.trim(),
      address,
      landmark: form.landmark.trim(),
      note: form.note.trim(),
      fee
    });
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[170] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl border border-orange-200 dark:border-orange-900/60 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center text-2xl shrink-0 shadow-md shadow-orange-500/30">
              🛵
            </div>
            <div>
              <h3 className="font-black text-lg text-gray-900 dark:text-white">Yangi yetkazish buyurtmasi</h3>
              <p className="text-xs font-bold text-gray-500">Mijoz ma'lumotlari, keyin taomlarni tanlaysiz</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-black flex items-center justify-center shrink-0"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Telefon *</label>
              <input
                type="tel"
                inputMode="tel"
                autoFocus
                value={form.phone}
                onChange={e => setField('phone', e.target.value)}
                onBlur={handlePhoneBlur}
                placeholder="90 123 45 67"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Mijoz ismi</label>
              <input
                type="text"
                value={form.customerName}
                onChange={e => setField('customerName', e.target.value)}
                placeholder="Masalan: Aziz aka"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Manzil *</label>
            <textarea
              rows={2}
              value={form.address}
              onChange={e => setField('address', e.target.value)}
              placeholder="Ko'cha, uy, xonadon"
              className={`${inputClass} resize-none`}
            />
            {prefilledFrom && form.address === prefilledFrom && (
              <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                ✓ Doimiy mijoz: oldingi manzil qo'yildi, kerak bo'lsa o'zgartiring
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Mo'ljal</label>
              <input
                type="text"
                value={form.landmark}
                onChange={e => setField('landmark', e.target.value)}
                placeholder="Masalan: maktab yonida"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Yetkazish narxi (so'm)</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.fee}
                onChange={e => setField('fee', e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Kuryer uchun izoh</label>
            <input
              type="text"
              value={form.note}
              onChange={e => setField('note', e.target.value)}
              placeholder="Masalan: 3-qavat, domofon 45, qaytim 100 000 dan"
              className={inputClass}
            />
          </div>

          <p className="text-[11px] font-bold text-gray-400">
            Yetkazish narxi chekka alohida qator bo'lib qo'shiladi, xizmat haqi (%) olinmaydi.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white font-black text-sm transition active:scale-95"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              className="flex-[2] py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm shadow-lg shadow-orange-500/30 transition active:scale-95"
            >
              Taomlarni tanlash ➜
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
