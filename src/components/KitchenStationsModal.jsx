import React, { useState } from 'react';
import ToggleSwitch from './ToggleSwitch';
import { newId } from '../utils/ids';
import { notify } from '../utils/notify';

// Oshxona sexlari (bar, issiq sex...): har sex bir nechta kategoriyani ko'rsatadi. Ro'yxat barcha
// qurilmalarda bir xil, "shu planshet qaysi sexni ko'rsatadi" - qurilmaning o'zida saqlanadi.
// Avtomatik oshxona cheki (KOT) ham shu qurilma uchun. Mantiq: src/utils/kitchenStations.ts

const ICONS = ['🔥', '🍹', '🥗', '🍰', '🍕', '🥘', '☕', '🍢'];

export default function KitchenStationsModal({
  stations = [],
  categories = [],
  selection = 'all',
  autoPrint = false,
  onChangeStations,
  onSelect,
  onToggleAutoPrint,
  onClose
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [picked, setPicked] = useState([]);

  const togglePicked = (cat) => setPicked(prev => (prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]));

  const handleAdd = (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || picked.length === 0) {
      notify('Sex nomini yozing va kamida bitta kategoriyani belgilang');
      return;
    }
    if (stations.some(s => s.name.toLowerCase() === clean.toLowerCase())) {
      notify(`"${clean}" nomli sex bor`);
      return;
    }
    onChangeStations([...stations, { id: newId('st_'), name: clean, icon, categories: picked }]);
    setName('');
    setPicked([]);
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-black text-lg text-gray-900 dark:text-white">👨‍🍳 Sexlar va oshxona cheki</h3>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-black" title="Yopish">✕</button>
        </div>

        <div className="p-5 space-y-6">
          <section className="space-y-2">
            <p className="text-xs font-black uppercase tracking-wider text-gray-400">Shu planshet ko'rsatadi</p>
            <div className="flex flex-wrap gap-2">
              {[{ id: 'all', label: 'Barcha sexlar' }, ...stations.map(s => ({ id: `st:${s.id}`, label: `${s.icon} ${s.name}` }))].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelect(opt.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black transition ${
                    selection === opt.id ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] font-bold text-gray-400">Tanlov shu qurilmada saqlanadi: sahifa qayta ochilsa ham o'zgarmaydi.</p>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-black uppercase tracking-wider text-gray-400">Sexlar ({stations.length})</p>
            {stations.length === 0 && (
              <p className="text-xs font-bold text-gray-400">Hali sex yo'q. Masalan: "🍹 Bar" - Ichimlik; "🔥 Issiq sex" - Asosiy.</p>
            )}
            <ul className="space-y-2">
              {stations.map(s => (
                <li key={s.id} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700">
                  <span className="text-xl">{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-gray-900 dark:text-white truncate">{s.name}</p>
                    <p className="text-[11px] font-bold text-gray-500 truncate">{s.categories.join(', ')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onChangeStations(stations.filter(x => x.id !== s.id))}
                    className="text-[11px] font-black text-red-500 hover:text-red-600 underline underline-offset-2"
                  >
                    O'chirish
                  </button>
                </li>
              ))}
            </ul>

            <form onSubmit={handleAdd} className="space-y-3 p-4 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600">
              <div className="flex gap-2">
                <select
                  value={icon}
                  onChange={e => setIcon(e.target.value)}
                  className="px-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-lg"
                  aria-label="Belgi"
                >
                  {ICONS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={24}
                  placeholder="Sex nomi: Bar, Issiq sex..."
                  className="flex-1 min-w-0 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-sm text-gray-900 dark:text-white outline-hidden focus:border-amber-500"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => togglePicked(cat)}
                    aria-pressed={picked.includes(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      picked.includes(cat) ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {picked.includes(cat) ? '✓ ' : ''}{cat}
                  </button>
                ))}
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-black transition active:scale-95">
                ➕ Sex qo'shish
              </button>
            </form>
          </section>

          <section className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700">
            <div className="flex-1">
              <p className="text-sm font-black text-gray-900 dark:text-white">🖨 Avtomatik oshxona cheki (KOT)</p>
              <p className="text-[11px] font-bold text-gray-500 mt-0.5 leading-snug">
                Yangi buyurtma yoki dozakaz kelsa, shu qurilma o'z sexi taomlarini chek printeriga chiqaradi.
                Brauzer chop etish oynasini so'raydi (so'ramasligi uchun Chrome "--kiosk-printing" bilan ochiladi).
              </p>
            </div>
            <ToggleSwitch checked={autoPrint} onChange={onToggleAutoPrint} label="Avtomatik oshxona cheki" />
          </section>
        </div>
      </div>
    </div>
  );
}
