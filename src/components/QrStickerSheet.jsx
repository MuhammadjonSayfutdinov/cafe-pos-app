import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import useSticky from '../hooks/useSticky';
import QrCodeSvg from '../qr/QrCodeSvg';
import { isQrBackendConfigured } from '../qr/qrApi';
import { useQrTableKey } from '../qr/useQrTableKey';
import {
  QR_BASE_URL_KEY,
  buildTableQrUrl,
  currentAppUrl,
  displayHost,
  isLocalOnlyUrl,
  normalizeQrBaseUrl
} from '../qr/tableQrUrl';
import { notify } from '../utils/notify';

// Admin -> Tizim Sozlamalari -> Stollar: barcha stollar uchun QR stikerlar (A4 varaq).
// Chop etish: varaq document.body ga alohida chiziladi, @media print da faqat u ko'rinadi.
// O'lchamlar mm da: A4 (210x297) - 8 mm hoshiya = 194x281 mm.

const TAKEAWAY = 'Olib ketish';

const SIZES = {
  large: { label: 'Katta', cols: 2, rows: 2, w: 92, h: 134, qr: 72, pad: 5, gap: 2.5, cafe: 13, name: 26, text: 9.5 },
  medium: { label: "O'rta", cols: 3, rows: 3, w: 61, h: 88, qr: 44, pad: 4, gap: 1.8, cafe: 9.5, name: 18, text: 7 },
  small: { label: 'Kichik', cols: 4, rows: 4, w: 45, h: 66, qr: 32, pad: 3, gap: 1.2, cafe: 7.5, name: 13, text: 5.5 }
};
const GAP_MM = 4;

const PRINT_CSS = `
  #qr-sticker-print { display: none; }
  @media print {
    @page { size: A4 portrait; margin: 8mm; }
    html, body { background: #ffffff !important; }
    body > *:not(#qr-sticker-print) { display: none !important; }
    #qr-sticker-print { display: block !important; }
    .qr-sticker-page { break-after: page; page-break-after: always; }
    .qr-sticker-page:last-child { break-after: auto; page-break-after: auto; }
  }
`;

function Sticker({ table, cafeName, url, host, size }) {
  return (
    <div
      style={{
        width: `${size.w}mm`,
        height: `${size.h}mm`,
        boxSizing: 'border-box',
        padding: `${size.pad}mm`,
        border: '0.3mm dashed #9ca3af',
        borderRadius: '3mm',
        background: '#ffffff',
        color: '#111827',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: `${size.gap}mm`,
        textAlign: 'center',
        overflow: 'hidden',
        breakInside: 'avoid',
        pageBreakInside: 'avoid'
      }}
    >
      <div
        style={{
          fontSize: `${size.cafe}pt`,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          lineHeight: 1.1,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {cafeName}
      </div>
      <QrCodeSvg
        value={url}
        ecc="Q"
        title={`${table} QR kodi`}
        style={{ width: `${size.qr}mm`, height: `${size.qr}mm`, display: 'block', flexShrink: 0 }}
      />
      <div style={{ fontSize: `${size.name}pt`, fontWeight: 900, lineHeight: 1.05, maxWidth: '100%', overflowWrap: 'anywhere' }}>
        {table}
      </div>
      <div style={{ fontSize: `${size.text}pt`, fontWeight: 700, lineHeight: 1.3, color: '#374151' }}>
        📱 Kamerani QR kodga qarating
        <br />
        Menyu · Buyurtma · Ofitsiantni chaqirish
      </div>
      {host && (
        <div style={{ fontSize: `${size.text * 0.8}pt`, color: '#6b7280', maxWidth: '100%', overflowWrap: 'anywhere' }}>
          {host}
        </div>
      )}
    </div>
  );
}

export default function QrStickerSheet({ tables = [], cafeName = '', onClose, addAuditLog }) {
  const safeTables = useMemo(
    () => (Array.isArray(tables) ? tables : []).map(t => (t && typeof t === 'object' ? t.name : t)).filter(Boolean).map(String),
    [tables]
  );

  const [savedBase, setSavedBase] = useSticky(QR_BASE_URL_KEY, '');
  // Stol kaliti: band stolga faqat shu stikerni skaner qilgan mijoz buyurtma beradi
  const getTableKey = useQrTableKey();
  const [draftBase, setDraftBase] = useState(() => normalizeQrBaseUrl(savedBase) || currentAppUrl());
  const [selected, setSelected] = useState(() => new Set(safeTables.filter(t => t !== TAKEAWAY)));
  const [sizeKey, setSizeKey] = useState('medium');
  const [copies, setCopies] = useState(1);

  const size = SIZES[sizeKey];
  const base = normalizeQrBaseUrl(draftBase);
  const host = base ? displayHost(base) : '';
  const backendReady = isQrBackendConfigured();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && typeof onClose === 'function') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stickers = useMemo(() => {
    if (!base) return [];
    const list = [];
    safeTables.forEach(table => {
      if (!selected.has(table)) return;
      const url = buildTableQrUrl(base, table, getTableKey(table));
      for (let c = 0; c < copies; c++) list.push({ key: `${table}__${c}`, table, url });
    });
    return list;
  }, [safeTables, selected, copies, base, getTableKey]);

  const perPage = size.cols * size.rows;
  const pages = useMemo(() => {
    const out = [];
    for (let i = 0; i < stickers.length; i += perPage) out.push(stickers.slice(i, i + perPage));
    return out;
  }, [stickers, perPage]);

  const toggleTable = (table) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(table)) next.delete(table);
      else next.add(table);
      return next;
    });
  };

  const handlePrint = () => {
    if (!base) {
      notify("Sayt manzili noto'g'ri. Masalan: https://kafe.vercel.app", 'error');
      return;
    }
    if (stickers.length === 0) {
      notify('Kamida bitta stolni tanlang', 'error');
      return;
    }
    // Manzil boshqa qurilmalardagi (ofitsiant) QR oynasi uchun ham saqlanadi
    if (base !== normalizeQrBaseUrl(savedBase)) {
      setSavedBase(base);
      if (typeof addAuditLog === 'function') {
        addAuditLog("QR-menyu manzili o'zgartirildi", `${displayHost(savedBase)} → ${host}`);
      }
    }
    window.print();
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${size.cols}, ${size.w}mm)`,
    gridAutoRows: `${size.h}mm`,
    gap: `${GAP_MM}mm`,
    justifyContent: 'center'
  };

  return (
    <div
      onClick={() => typeof onClose === 'function' && onClose()}
      className="fixed inset-0 bg-black/70 backdrop-blur-xs z-[120] overflow-y-auto p-3 sm:p-6"
    >
      <style>{PRINT_CSS}</style>

      <div
        onClick={e => e.stopPropagation()}
        className="relative mx-auto max-w-5xl bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 p-4 sm:p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white">🖨️ Stollar uchun QR stikerlar</h2>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-1">
              Mijoz stikerni skaner qilib, o'z telefonidan menyuni ko'radi va buyurtma beradi (ofitsiant tasdiqlaydi).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-red-100 hover:text-red-500 font-black flex items-center justify-center transition"
            title="Yopish (Esc)"
          >
            ✕
          </button>
        </div>

        {!backendReady && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs font-bold text-red-700 dark:text-red-300">
            ⛔️ Bulut (Supabase) ulanmagan: mijoz QR kodni skaner qilsa "QR-menyu hozircha ishlamaydi" chiqadi.
            Avval SUPABASE.md bo'yicha ulang va <code>supabase/qr.sql</code> ni ishga tushiring.
          </div>
        )}

        {/* 1. Sayt manzili */}
        <div className="space-y-2">
          <label className="block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
            QR kod ochadigan sayt manzili
          </label>
          <input
            type="url"
            inputMode="url"
            value={draftBase}
            onChange={e => setDraftBase(e.target.value)}
            placeholder="https://kafe.vercel.app"
            className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-sm text-gray-900 dark:text-white outline-hidden focus:border-amber-500"
          />
          {!base ? (
            <p className="text-xs font-bold text-red-600 dark:text-red-400">Manzil noto'g'ri. Masalan: https://kafe.vercel.app</p>
          ) : isLocalOnlyUrl(base) ? (
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
              ⚠️ Bu manzil faqat shu kompyuter yoki shu Wi-Fi ichida ochiladi. Mijoz telefoni (mobil internet) uni ocha olmaydi.
              Internetdagi manzilni yozing (masalan, Vercel'dagi sayt).
            </p>
          ) : (
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
              Misol: <span className="font-mono break-all">{buildTableQrUrl(base, safeTables[0] || '1-Stol', getTableKey(safeTables[0] || '1-Stol'))}</span>
            </p>
          )}
        </div>

        {/* 2. O'lcham va nusxa */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-2">
            <span className="block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">Stiker o'lchami</span>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(SIZES).map(([key, s]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSizeKey(key)}
                  className={`p-2.5 rounded-xl border-2 text-left transition ${
                    sizeKey === key
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-amber-300'
                  }`}
                >
                  <span className="block text-sm font-black text-gray-900 dark:text-white">{s.label}</span>
                  <span className="block text-[11px] font-bold text-gray-500 dark:text-gray-400">
                    {s.w}×{s.h} mm · varaqda {s.cols * s.rows} ta
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="sm:w-44 space-y-2">
            <span className="block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">Har stolga</span>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCopies(n)}
                  className={`py-3 rounded-xl border-2 text-sm font-black transition ${
                    copies === n
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-gray-900 dark:text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-amber-300'
                  }`}
                >
                  {n} ta
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Stollar */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Stollar ({selected.size} / {safeTables.length})
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set(safeTables))}
                className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs font-black text-gray-700 dark:text-gray-200 hover:bg-gray-200"
              >
                Hammasi
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs font-black text-gray-700 dark:text-gray-200 hover:bg-gray-200"
              >
                Hech biri
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {safeTables.map(table => {
              const on = selected.has(table);
              return (
                <button
                  key={table}
                  type="button"
                  onClick={() => toggleTable(table)}
                  aria-pressed={on}
                  className={`px-3 py-2 rounded-xl border-2 text-xs sm:text-sm font-black transition ${
                    on
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-amber-300'
                  }`}
                >
                  {on ? '✓ ' : ''}{table === TAKEAWAY ? '🛍️ ' : ''}{table}
                </button>
              );
            })}
          </div>
          {selected.has(TAKEAWAY) && (
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
              🛍️ "Olib ketish" stikeri kassa yoniga: mijoz o'zi buyurtma beradi, xizmat haqi qo'shilmaydi.
            </p>
          )}
        </div>

        {/* 4. Chop etish */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700">
          <div className="flex-1 text-xs font-bold text-gray-600 dark:text-gray-300 space-y-1">
            <p className="text-sm font-black text-gray-900 dark:text-white">
              {stickers.length} ta stiker · {pages.length} ta A4 varaq
            </p>
            <p>Chop etish oynasida masshtab 100% ("Fit to page" emas). PDF sifatida saqlab, bosmaxonaga yuborish ham mumkin.</p>
            <p>Yopishtirgach telefon bilan bittasini skaner qilib, menyu ochilishini tekshiring.</p>
            <p>🔐 Har bir stikerda stolning maxfiy kaliti bor: band stolga faqat shu stikerni skaner qilgan mijoz buyurtma beradi. Eski (kalitsiz) stikerlarni almashtiring.</p>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!base || stickers.length === 0}
            className="px-6 py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-sm shadow-lg shadow-amber-600/30 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            🖨️ Chop etish
          </button>
        </div>

        {/* 5. Ko'rinishi (ekranda) */}
        {stickers.length > 0 && (
          <div className="space-y-2">
            <span className="block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">Ko'rinishi</span>
            <div className="rounded-2xl bg-gray-200 dark:bg-gray-900 p-3 overflow-x-auto">
              <div className="flex flex-wrap justify-center gap-3">
                {stickers.map(s => (
                  <Sticker key={s.key} table={s.table} cafeName={cafeName} url={s.url} host={host} size={size} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chop etiladigan varaqlar (ekranda yashirin) */}
      {typeof document !== 'undefined' && createPortal(
        <div id="qr-sticker-print">
          {pages.map((page, i) => (
            <div key={i} className="qr-sticker-page" style={gridStyle}>
              {page.map(s => (
                <Sticker key={s.key} table={s.table} cafeName={cafeName} url={s.url} host={host} size={size} />
              ))}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
