import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import QrCodeSvg from '../qr/QrCodeSvg';
import { formatSecret, totpUri, verifyTotp, TOTP_DIGITS } from '../utils/totp';
import { createTwoFactorSecret, formatBackupCode, generateBackupCodes } from '../utils/twoFactor';
import { notify } from '../utils/notify';

// Ikki bosqichli kirishni yoqish (admin o'z hisobiga):
//   1) telefondagi Authenticator ilovasi QR kodni skaner qiladi (yoki sirni qo'lda yozadi);
//   2) ilova bergan kodni terib, to'g'ri ulanganini tasdiqlaydi;
//   3) 10 ta zaxira kodni saqlab oladi (telefon yo'qolsa kirish uchun).
// Hech narsa saqlanmaydi, toki oxirgi "Yoqish" bosilmaguncha: onEnable(secret, backupCodes).

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http (192.168.x.x) da clipboard yo'q: eski usul
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
};

export default function TwoFactorSetupModal({ user, cafeName = 'Kafe POS', onEnable, onCancel }) {
  const [secret] = useState(createTwoFactorSecret);
  const [backupCodes] = useState(() => generateBackupCodes());
  const [step, setStep] = useState(1); // 1 - skaner va tasdiq, 2 - zaxira kodlar
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [savedCodes, setSavedCodes] = useState(false);

  const userName = String(user?.name || 'Admin');
  const uri = totpUri(secret, userName, cafeName);

  const codesText = [
    `${cafeName} — ${userName}: zaxira kodlar (ikki bosqichli kirish)`,
    `Yaratilgan: ${new Date().toLocaleString()}`,
    "Har bir kod faqat bir marta ishlaydi. Telefon yo'q bo'lsa: PIN, keyin \"zaxira kod bilan\".",
    '',
    ...backupCodes.map((c, i) => `${String(i + 1).padStart(2, ' ')}. ${formatBackupCode(c)}`)
  ].join('\n');

  const handleVerify = (e) => {
    e.preventDefault();
    const clean = code.replace(/\D/g, '');
    if (clean.length !== TOTP_DIGITS) {
      setError(`Ilovadagi ${TOTP_DIGITS} xonali kodni tering.`);
      return;
    }
    if (verifyTotp(secret, clean) === null) {
      setError("❌ Kod mos kelmadi. QR kodni qayta skaner qiling va qurilma hamda telefon soati to'g'riligini tekshiring.");
      return;
    }
    setError('');
    setStep(2);
  };

  const handleCopyCodes = async () => {
    notify(await copyText(codesText) ? '✅ Zaxira kodlar nusxalandi' : "⚠️ Nusxalab bo'lmadi: kodlarni qog'ozga yozib oling");
  };

  const handleDownloadCodes = () => {
    const blob = new Blob([codesText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zaxira-kodlar-${userName.toLowerCase().replace(/\s+/g, '-')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleEnable = () => {
    if (!savedCodes) return;
    if (typeof onEnable === 'function') onEnable(secret, backupCodes);
  };

  // Portal ichidagi bosish React daraxti bo'ylab ota oynaga yetmasin (u bosishda yopiladi)
  return createPortal(
    <div
      onClick={e => e.stopPropagation()}
      className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md overflow-y-auto overscroll-contain animate-fade-in">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-gray-900 text-white rounded-[32px] p-6 sm:p-7 shadow-2xl shadow-black/60 border border-gray-700/70">

          <div className="flex justify-between items-start gap-3 mb-4">
            <div>
              <h3 className="text-lg font-bold tracking-tight">🔐 Ikki bosqichli kirish</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {userName} · {step === 1 ? '1/2: telefonni ulash' : '2/2: zaxira kodlar'}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="w-9 h-9 shrink-0 rounded-full bg-gray-800 border border-gray-700 text-gray-400 hover:text-red-400 font-bold flex items-center justify-center transition"
              title="Yopish"
            >
              ✕
            </button>
          </div>

          {step === 1 ? (
            <form onSubmit={handleVerify} className="space-y-4">
              <ol className="text-xs text-gray-300 space-y-1.5 list-decimal list-inside">
                <li>
                  Telefoningizga <strong>Google Authenticator</strong> yoki <strong>Microsoft Authenticator</strong> ilovasini
                  o'rnating (Play Market / App Store, bepul).
                </li>
                <li>Ilovada "+" → "QR kodni skanerlash" ni bosib, pastdagi kodni skaner qiling.</li>
                <li>Ilovada chiqqan {TOTP_DIGITS} xonali kodni pastga yozing.</li>
              </ol>

              <div className="flex justify-center">
                <QrCodeSvg value={uri} ecc="M" className="w-52 h-52 rounded-2xl" title="Authenticator uchun QR kod" />
              </div>

              <div className="text-center">
                {showSecret ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-gray-400">Ilovada "Kalitni kiritish" → hisob nomi: {userName}, kalit:</p>
                    <p className="font-mono text-sm font-bold tracking-wider text-brand-300 break-all select-all">{formatSecret(secret)}</p>
                    <button
                      type="button"
                      onClick={async () => notify(await copyText(secret) ? '✅ Kalit nusxalandi' : "⚠️ Nusxalab bo'lmadi")}
                      className="text-xs font-semibold text-brand-400 underline underline-offset-4"
                    >
                      📋 Kalitni nusxalash
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSecret(true)}
                    className="text-xs font-semibold text-brand-400 underline underline-offset-4"
                  >
                    Skaner qilib bo'lmayaptimi? Kalitni qo'lda kiritish
                  </button>
                )}
              </div>

              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={e => {
                    setError('');
                    setCode(e.target.value.replace(/\D/g, '').slice(0, TOTP_DIGITS));
                  }}
                  placeholder="Ilovadagi kod: 123456"
                  className="w-full py-3 px-4 rounded-2xl bg-gray-800 border border-gray-700 focus:border-brand-500 text-center text-2xl font-bold tracking-[0.4em] placeholder:text-sm placeholder:tracking-normal outline-hidden"
                />
                {error && <p className="text-xs font-bold text-red-400 mt-2 text-center">{error}</p>}
              </div>

              <button
                type="submit"
                disabled={code.length !== TOTP_DIGITS}
                className="w-full py-3.5 rounded-full bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm transition active:scale-95 disabled:opacity-40"
              >
                Tasdiqlash →
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-3 py-2">
                ✅ Telefon ulandi. Endi zaxira kodlarni saqlab oling: telefon yo'qolsa yoki buzilsa, shular bilan kirasiz.
              </p>

              <div className="grid grid-cols-2 gap-2 bg-gray-800 border border-gray-700 rounded-2xl p-4 font-mono text-sm font-bold text-center select-all">
                {backupCodes.map((c, i) => (
                  <span key={c} className="py-1">
                    <span className="text-gray-500 text-xs mr-1">{i + 1}.</span>{formatBackupCode(c)}
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyCodes}
                  className="flex-1 py-2.5 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-semibold transition active:scale-95"
                >
                  📋 Nusxalash
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCodes}
                  className="flex-1 py-2.5 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-semibold transition active:scale-95"
                >
                  ⬇️ Faylga saqlash
                </button>
              </div>

              <p className="text-[11px] text-gray-400">
                Har bir kod bir marta ishlaydi. Kodlarni qog'ozga yozib, xavfsiz joyda saqlang (kassa yonida emas).
                Telefon ham, kodlar ham yo'qolsa, hisobga faqat boshqa admin kirishni tiklay oladi.
              </p>

              <label className="flex items-center gap-2 text-xs font-semibold text-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={savedCodes}
                  onChange={e => setSavedCodes(e.target.checked)}
                  className="w-4 h-4 accent-brand-500"
                />
                Zaxira kodlarni saqlab oldim
              </label>

              <button
                type="button"
                onClick={handleEnable}
                disabled={!savedCodes}
                className="w-full py-3.5 rounded-full bg-brand-600 hover:bg-brand-500 text-white font-semibold text-sm transition active:scale-95 disabled:opacity-40"
              >
                🔐 Ikki bosqichli kirishni yoqish
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
