import React, { useState } from 'react';
import useSticky from '../hooks/useSticky';
import {
  DEFAULT_GEOFENCE,
  QR_GEOFENCE_KEY,
  QR_SECRET_KEY,
  generateQrSecret,
  normalizeGeofence,
  parseLatLng
} from '../qr/tableKey';
import { notify, confirmAsync } from '../utils/notify';

// Admin -> Tizim Sozlamalari: mijoz telefonidan uzoqdan "o'yin qilib" buyurtma berilmasin.
//  1) Stol kaliti (QR stikerda): band stolga faqat stoldagi QR ni skaner qilgan mijoz buyurtma beradi.
//  2) "Faqat kafe ichidan": telefon joylashuvi kafe radiusida bo'lsagina buyurtma va chaqiruv o'tadi.
// Tekshiruv serverda: supabase/qr.sql -> qr_access. Sozlama bulut orqali (pos_qr_geofence) boradi.

const RADIUS_OPTIONS = [100, 200, 300, 500];

const formatPoint = (g) => (g.lat !== null && g.lng !== null ? `${g.lat}, ${g.lng}` : '');

export default function QrSecuritySection({ addAuditLog }) {
  const [savedGeo, setSavedGeo] = useSticky(QR_GEOFENCE_KEY, DEFAULT_GEOFENCE);
  const [, setSecret] = useSticky(QR_SECRET_KEY, '');
  const current = normalizeGeofence(savedGeo);

  const [enabled, setEnabled] = useState(current.enabled);
  const [pointText, setPointText] = useState(formatPoint(current));
  const [radius, setRadius] = useState(current.radius);
  const [locating, setLocating] = useState(false);
  const [lastAccuracy, setLastAccuracy] = useState(null);

  const point = parseLatLng(pointText);

  const handleLocate = () => {
    if (!navigator.geolocation) {
      notify("Bu qurilma joylashuvni aniqlay olmaydi. Koordinatani Google Maps'dan nusxalab yozing.", 'error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setPointText(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`);
        setLastAccuracy(Math.round(p.coords.accuracy || 0));
      },
      (err) => {
        setLocating(false);
        notify(err?.code === 1
          ? "Joylashuvga ruxsat berilmadi. Brauzer sozlamasida ruxsat bering yoki koordinatani qo'lda yozing."
          : "Joylashuvni aniqlab bo'lmadi. Koordinatani Google Maps'dan nusxalab yozing.", 'error');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const handleSave = () => {
    if (enabled && !point) {
      notify("Kafe joylashuvini kiriting (masalan: 41.311081, 69.240562)", 'error');
      return;
    }
    const next = normalizeGeofence({
      enabled,
      lat: point ? point.lat : null,
      lng: point ? point.lng : null,
      radius
    });
    setSavedGeo(next);
    if (typeof addAuditLog === 'function') {
      addAuditLog(
        'QR himoyasi sozlandi',
        next.enabled ? `Faqat kafe ichidan: yoqildi (${next.radius} m)` : "Faqat kafe ichidan: o'chirildi"
      );
    }
    notify(next.enabled ? `✅ Saqlandi: buyurtma faqat kafedan ${next.radius} m ichida` : "✅ Saqlandi: joylashuv tekshiruvi o'chiq", 'success');
  };

  const handleRotateKeys = async () => {
    const ok = await confirmAsync(
      "⚠️ Barcha stollarning QR kaliti yangilanadi. Eski stikerlar bilan band stolga buyurtma berib bo'lmay qoladi: yangi stikerlarni chop etib almashtirish kerak. Davom etilsinmi?",
      { confirmText: 'Ha, yangilash' }
    );
    if (!ok) return;
    setSecret(generateQrSecret());
    if (typeof addAuditLog === 'function') addAuditLog('QR kalitlari yangilandi', 'Eski QR stikerlar band stolga ishlamaydi');
    notify("🔄 QR kalitlari yangilandi. \"🖨️ QR stikerlar\" orqali yangi stikerlarni chop eting.", 'success');
  };

  const dirty = enabled !== current.enabled || radius !== current.radius ||
    (point ? `${point.lat},${point.lng}` : '') !== (current.lat !== null ? `${current.lat},${current.lng}` : '');

  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-xs border border-gray-100 dark:border-gray-700 space-y-5">
      <div>
        <h3 className="text-lg font-black text-gray-900 dark:text-white">
          🛡️ QR-buyurtma himoyasi (uzoqdan buyurtma berilmasin)
        </h3>
        <ul className="mt-2 space-y-1 text-xs font-bold text-gray-500 dark:text-gray-400">
          <li>🔐 Band stolga faqat o'sha stoldagi QR kodni skaner qilgan mijoz buyurtma beradi (stikerda stolning maxfiy kaliti bor).
            Havolani qo'lda yozgan odam faqat bo'sh stolga so'rov yubora oladi.</li>
          <li>✅ Har bir QR-buyurtmani ofitsiant tasdiqlaydi. Bitta stoldan daqiqasiga 3 ta, tasdiqlanmagan so'rov ko'pi bilan 3 ta.</li>
          <li>📍 Quyidagini yoqsangiz, buyurtma va ofitsiant chaqiruvi faqat kafe ichidan (telefon joylashuvi bo'yicha) qabul qilinadi.</li>
        </ul>
      </div>

      {/* Faqat kafe ichidan */}
      <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 space-y-4">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span>
            <span className="block font-black text-sm text-gray-900 dark:text-white">📍 Faqat kafe ichidan buyurtma</span>
            <span className="block text-[11px] font-bold text-gray-500 dark:text-gray-400">
              Mijoz telefoni joylashuvga ruxsat so'raydi. Ruxsat bermasa yoki uzoqda bo'lsa, buyurtma o'tmaydi.
            </span>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="w-6 h-6 accent-emerald-600 shrink-0"
          />
        </label>

        <div className="space-y-2">
          <span className="block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">Kafe joylashuvi</span>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={pointText}
              onChange={e => setPointText(e.target.value)}
              placeholder="41.311081, 69.240562"
              className="flex-1 p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-mono font-bold text-sm text-gray-900 dark:text-white outline-hidden focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={handleLocate}
              disabled={locating}
              className="px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-black text-xs sm:text-sm whitespace-nowrap transition active:scale-95"
            >
              {locating ? '⏳ Aniqlanmoqda...' : '📍 Shu qurilma turgan joy'}
            </button>
          </div>
          {pointText && !point && (
            <p className="text-xs font-bold text-red-600 dark:text-red-400">Format: kenglik, uzunlik (masalan: 41.311081, 69.240562)</p>
          )}
          {lastAccuracy !== null && (
            <p className={`text-xs font-bold ${lastAccuracy > 100 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
              Aniqlik: ±{lastAccuracy} m.{lastAccuracy > 100 ? " Aniq emas: kafe ichida telefondan qayta bosing yoki Google Maps'dan nusxalang." : ''}
            </p>
          )}
          <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
            Kompyuterda joylashuv noaniq bo'lishi mumkin. Eng yaxshisi: Google Maps'da kafeni bosib turing va chiqqan raqamlarni shu yerga yozing.
          </p>
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">Ruxsat etilgan masofa</span>
          <div className="grid grid-cols-4 gap-2">
            {RADIUS_OPTIONS.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRadius(r)}
                className={`py-2.5 rounded-xl border-2 text-xs sm:text-sm font-black transition ${
                  radius === r
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-gray-900 dark:text-white'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-300'
                }`}
              >
                {r} m
              </button>
            ))}
          </div>
          <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
            Bino ichida GPS 30–100 m adashadi: 200 m tavsiya etiladi.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span className={`text-xs font-black ${current.enabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
            Hozir: {current.enabled ? `yoqilgan (${current.radius} m)` : "o'chiq"}
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty}
            className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm shadow-md transition active:scale-95"
          >
            💾 Saqlash
          </button>
        </div>
      </div>

      {/* Kalitni yangilash */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-red-50/60 dark:bg-red-900/10 border border-red-200 dark:border-red-900/40">
        <p className="text-xs font-bold text-red-700 dark:text-red-300">
          Stiker surati yoki havolasi begona odamga tarqalib ketsa, kalitlarni yangilang va stikerlarni qayta chop eting.
        </p>
        <button
          type="button"
          onClick={handleRotateKeys}
          className="px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-300 font-black text-xs sm:text-sm whitespace-nowrap transition active:scale-95"
        >
          🔄 QR kalitlarini yangilash
        </button>
      </div>
    </div>
  );
}
