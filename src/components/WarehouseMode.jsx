import React, { useState, useMemo } from 'react';
import WarehouseStockTab from './WarehouseStockTab';
import WarehousePrepTab from './WarehousePrepTab';
import WarehouseHistoryTab from './WarehouseHistoryTab';

// ==========================================
// GLOBAL O'LCHOV BIRLIKLARI VA KONVERTATSIYA MOTORI
// ==========================================
export const MEASUREMENT_UNITS = [
  // Og'irlik birliklari (O'zaro gr <-> kg <-> tonna konvertatsiya bo'ladi)
  { value: 'gr', label: 'Gramm (gr)', short: 'gr', family: 'weight', factorToGrams: 1 },
  { value: 'kg', label: 'Kilogramm (kg)', short: 'kg', family: 'weight', factorToGrams: 1000 },
  { value: 'tonna', label: 'Tonna (t)', short: 't', family: 'weight', factorToGrams: 1000000 },

  // Hajm birliklari (O'zaro ml <-> litr konvertatsiya bo'ladi)
  { value: 'ml', label: 'Millilitr (ml)', short: 'ml', family: 'volume', factorToMl: 1 },
  { value: 'litr', label: 'Litr (l)', short: 'l', family: 'volume', factorToMl: 1000 },

  // Dona va qadoq birliklari (Oshxona va Ombor uchun yangi birliklar)
  { value: 'dona', label: 'Dona (dona)', short: 'dona', family: 'count' },
  { value: 'porsiya', label: 'Porsiya (pors)', short: 'pors', family: 'count' },
  { value: 'boglam', label: "Bog'lam (ko'kat/non)", short: "bog'lam", family: 'count' },
  { value: 'qadoq', label: 'Qadoq / Pachka', short: 'qadoq', family: 'count' },
  { value: 'qop', label: 'Qop', short: 'qop', family: 'count' },
  { value: 'karobka', label: 'Karobka / Blok', short: 'blok', family: 'count' }
];

// Birlik nomini standart shaklga keltirish
export const normalizeUnit = (unitStr) => {
  const u = String(unitStr || 'kg').trim().toLowerCase();
  if (['g', 'gr', 'gram', 'gramm'].includes(u)) return 'gr';
  if (['kg', 'kilogram', 'kilogramm', 'kilo'].includes(u)) return 'kg';
  if (['t', 'ton', 'tonna', 'tn'].includes(u)) return 'tonna';
  if (['ml', 'millilitr'].includes(u)) return 'ml';
  if (['l', 'lt', 'litr', 'liter'].includes(u)) return 'litr';
  if (['pors', 'porsiya'].includes(u)) return 'porsiya';
  if (["bog'lam", 'boglam', 'bog'].includes(u)) return 'boglam';
  if (['pachka', 'qadoq'].includes(u)) return 'qadoq';
  if (['blok', 'karobka', 'yashik'].includes(u)) return 'karobka';
  if (['dona', 'ta', 'sht'].includes(u)) return 'dona';
  return u;
};

// Birlik oilasini aniqlash ('weight' | 'volume' | 'count')
export const getUnitFamily = (unitStr) => {
  const norm = normalizeUnit(unitStr);
  const found = MEASUREMENT_UNITS.find(u => u.value === norm);
  return found ? found.family : 'count';
};

// Qiymatni bir o'lchov birligidan ikkinchisiga aniq o'tkazish (Masalan: 500 gr -> 0.5 kg yoki 1.5 tonna -> 1500 kg)
export const convertMeasurement = (amount, fromUnit, toUnit) => {
  const numAmount = Number(amount) || 0;
  const fromNorm = normalizeUnit(fromUnit);
  const toNorm = normalizeUnit(toUnit);

  if (fromNorm === toNorm) return numAmount;

  const fromMeta = MEASUREMENT_UNITS.find(u => u.value === fromNorm);
  const toMeta = MEASUREMENT_UNITS.find(u => u.value === toNorm);

  // Og'irlik konvertatsiyasi: gr <-> kg <-> tonna
  if (fromMeta?.family === 'weight' && toMeta?.family === 'weight') {
    const inGrams = numAmount * fromMeta.factorToGrams;
    return Number((inGrams / toMeta.factorToGrams).toFixed(6));
  }

  // Hajm konvertatsiyasi: ml <-> litr
  if (fromMeta?.family === 'volume' && toMeta?.family === 'volume') {
    const inMl = numAmount * fromMeta.factorToMl;
    return Number((inMl / toMeta.factorToMl).toFixed(6));
  }

  // Agar har xil oila bo'lsa (masalan dona), o'zini qaytaradi
  return numAmount;
};

// Bitta mahsulotni ham Gramm, ham Kilogramm, ham Tonnada formatlab ko'rsatish
export const formatMultiUnitWeight = (amount, baseUnit, displayMode = 'auto') => {
  const num = Number(amount) || 0;
  const normUnit = normalizeUnit(baseUnit);
  const family = getUnitFamily(normUnit);

  if (family === 'weight') {
    const inGrams = convertMeasurement(num, normUnit, 'gr');
    const inKg = convertMeasurement(num, normUnit, 'kg');
    const inTons = convertMeasurement(num, normUnit, 'tonna');

    if (displayMode === 'gr') {
      return `${inGrams.toLocaleString()} gr`;
    }
    if (displayMode === 'kg') {
      return `${inKg.toLocaleString()} kg`;
    }
    if (displayMode === 'tonna') {
      return `${inTons.toLocaleString()} t`;
    }
    if (displayMode === 'all') {
      return `${inTons} t  |  ${inKg.toLocaleString()} kg  |  ${inGrams.toLocaleString()} gr`;
    }

    // 'auto' rejimda asosiy qiymat va qavs ichida qolgan birliklar
    if (normUnit === 'tonna') {
      return `${inTons.toLocaleString()} t (${inKg.toLocaleString()} kg / ${inGrams.toLocaleString()} gr)`;
    }
    if (normUnit === 'kg') {
      return `${inKg.toLocaleString()} kg (${inGrams.toLocaleString()} gr / ${inTons} t)`;
    }
    return `${inGrams.toLocaleString()} gr (${inKg} kg)`;
  }

  if (family === 'volume') {
    const inMl = convertMeasurement(num, normUnit, 'ml');
    const inLitr = convertMeasurement(num, normUnit, 'litr');
    if (displayMode === 'all') {
      return `${inLitr.toLocaleString()} litr  |  ${inMl.toLocaleString()} ml`;
    }
    return normUnit === 'litr'
      ? `${inLitr.toLocaleString()} litr (${inMl.toLocaleString()} ml)`
      : `${inMl.toLocaleString()} ml (${inLitr} litr)`;
  }

  return `${num.toLocaleString()} ${baseUnit || 'dona'}`;
};

export default function WarehouseMode({ 
  inventory = [], 
  setInventory, 
  inventoryLogs = [], 
  setInventoryLogs,
  menuItems = [],
  setMenuItems,
  currentUser,
  requireAdminOverride,
  addAuditLog 
}) {
  // ==========================================
  // 1. STATE'LAR
  // ==========================================
  // Tablarni boshqarish: 'stock' (Qoldiqlar), 'prep' (Tayyorlov), 'history' (Tarix)
  const [activeTab, setActiveTab] = useState('stock');
  
  // Og'irlikni ko'rsatish rejimi: 'auto' | 'all' | 'gr' | 'kg' | 'tonna'
  const [displayUnitMode, setDisplayUnitMode] = useState('all');

  // Tezkor birlik konvertori modali
  const [isConverterOpen, setIsConverterOpen] = useState(false);
  const [convValue, setConvValue] = useState('1');
  const [convFromUnit, setConvFromUnit] = useState('kg');

  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const safeLogs = Array.isArray(inventoryLogs) ? inventoryLogs : [];
  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];

  // ==========================================
  // 2. OMBOR STATISTIKASI (GRAMM, KG, TONNA YIG'INDISI BILAN)
  // ==========================================
  const warehouseStats = useMemo(() => {
    let totalWeightGrams = 0;
    let totalVolumeMl = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    safeInventory.forEach(item => {
      if (!item) return;
      const qty = Number(item.quantity ?? item.qty ?? 0) || 0;
      const minLim = Number(item.minLimit ?? item.min_quantity ?? 5) || 0;
      const unit = normalizeUnit(item.unit);
      const family = getUnitFamily(unit);

      if (qty <= 0) {
        outOfStockCount += 1;
      } else if (qty <= minLim) {
        lowStockCount += 1;
      }

      if (family === 'weight') {
        totalWeightGrams += convertMeasurement(qty, unit, 'gr');
      } else if (family === 'volume') {
        totalVolumeMl += convertMeasurement(qty, unit, 'ml');
      }
    });

    return {
      totalItems: safeInventory.length,
      lowStockCount,
      outOfStockCount,
      totalGrams: Math.round(totalWeightGrams),
      totalKg: Number((totalWeightGrams / 1000).toFixed(3)),
      totalTons: Number((totalWeightGrams / 1000000).toFixed(4)),
      totalLiters: Number((totalVolumeMl / 1000).toFixed(2))
    };
  }, [safeInventory]);

  // ==========================================
  // 3. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 min-h-[calc(100vh-140px)] flex flex-col overflow-hidden animate-fade-in">
      
      {/* ========================================== */}
      {/* TEPADAGI TABLAR VA O'LCHOV BIRLIGI PANELI  */}
      {/* ========================================== */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4 md:p-6 bg-gray-50 dark:bg-gray-900/50 space-y-4">
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          {/* Asosiy 3 ta Tab */}
          <div className="flex gap-2 w-full lg:w-auto overflow-x-auto hide-scrollbar">
            <button 
              type="button"
              onClick={() => setActiveTab('stock')}
              className={`px-5 py-3 rounded-xl font-black text-xs sm:text-sm transition-all whitespace-nowrap active:scale-95 flex items-center gap-2 ${
                activeTab === 'stock' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' 
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span>📦</span>
              <span>Ombor Qoldig'i ({warehouseStats.totalItems})</span>
              {(warehouseStats.lowStockCount + warehouseStats.outOfStockCount) > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                  {warehouseStats.lowStockCount + warehouseStats.outOfStockCount}
                </span>
              )}
            </button>
            
            <button 
              type="button"
              onClick={() => setActiveTab('prep')}
              className={`px-5 py-3 rounded-xl font-black text-xs sm:text-sm transition-all whitespace-nowrap active:scale-95 flex items-center gap-2 ${
                activeTab === 'prep' 
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30' 
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span>🔪</span>
              <span>Tayyorlov (Kalkulyatsiya)</span>
            </button>

            <button 
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-5 py-3 rounded-xl font-black text-xs sm:text-sm transition-all whitespace-nowrap active:scale-95 flex items-center gap-2 ${
                activeTab === 'history' 
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30' 
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span>📜</span>
              <span>Harakatlar Tarixi ({safeLogs.length})</span>
            </button>
          </div>

          {/* O'LCHOV BIRLIGI KO'RINISHI SWITCHERI (Gramm / Kg / Tonna) */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
            <div className="flex items-center bg-white dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto hide-scrollbar">
              <span className="text-[10px] font-black uppercase text-gray-400 px-2.5 whitespace-nowrap">
                ⚖️ O'lchov:
              </span>
              {[
                { id: 'all', label: 't / kg / gr' },
                { id: 'tonna', label: 'Tonna (t)' },
                { id: 'kg', label: 'Kg' },
                { id: 'gr', label: 'Gramm (gr)' },
                { id: 'auto', label: 'Asl birlik' }
              ].map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setDisplayUnitMode(mode.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black whitespace-nowrap transition ${
                    displayUnitMode === mode.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsConverterOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-black text-xs whitespace-nowrap hover:bg-amber-200 transition active:scale-95"
              title="Gramm, Kilogramm va Tonna kalkulyatori"
            >
              🧮 Kalkulyator
            </button>
          </div>
        </div>

        {/* JONLI OMBOR ZAXIRASI XULOSASI (TONNA / KG / GRAMMDA) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <div className="bg-white dark:bg-gray-800 p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700">
            <span className="text-[10px] font-black uppercase text-gray-400 block">
              ⚖️ Jami og'irlik zaxirasi
            </span>
            <p className="text-sm sm:text-base font-black text-indigo-600 dark:text-indigo-400 mt-1">
              {warehouseStats.totalTons} t • {warehouseStats.totalKg.toLocaleString()} kg
            </p>
            <p className="text-[11px] font-bold text-gray-400">
              ({warehouseStats.totalGrams.toLocaleString()} gramm)
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700">
            <span className="text-[10px] font-black uppercase text-gray-400 block">
              🧪 Suyuqlik va Hajm zaxirasi
            </span>
            <p className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {warehouseStats.totalLiters.toLocaleString()} litr
            </p>
            <p className="text-[11px] font-bold text-gray-400">
              ({(warehouseStats.totalLiters * 1000).toLocaleString()} ml)
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700">
            <span className="text-[10px] font-black uppercase text-amber-500 block">
              ⚠️ Kam qolgan mahsulotlar
            </span>
            <p className="text-sm sm:text-base font-black text-amber-600 dark:text-amber-400 mt-1">
              {warehouseStats.lowStockCount} xil mahsulot
            </p>
            <p className="text-[11px] font-bold text-gray-400">
              Minimal limitdan past
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700">
            <span className="text-[10px] font-black uppercase text-red-500 block">
              🛑 Tugagan mahsulotlar
            </span>
            <p className="text-sm sm:text-base font-black text-red-600 dark:text-red-400 mt-1">
              {warehouseStats.outOfStockCount} xil mahsulot
            </p>
            <p className="text-[11px] font-bold text-gray-400">
              Zudlik bilan kirim kerak
            </p>
          </div>
        </div>

      </div>

      {/* ========================================== */}
      {/* ASOSIY EKRAN (Tanlangan Tabga qarab)       */}
      {/* ========================================== */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800 p-4 md:p-6">
        
        {activeTab === 'stock' && (
          <WarehouseStockTab 
            inventory={safeInventory}
            setInventory={setInventory}
            inventoryLogs={safeLogs}
            setInventoryLogs={setInventoryLogs}
            menuItems={safeMenuItems}
            currentUser={currentUser}
            requireAdminOverride={requireAdminOverride}
            addAuditLog={addAuditLog}
            displayUnitMode={displayUnitMode}
            measurementUnits={MEASUREMENT_UNITS}
            convertMeasurement={convertMeasurement}
            formatMultiUnitWeight={formatMultiUnitWeight}
          />
        )}

        {activeTab === 'prep' && (
          <WarehousePrepTab 
            inventory={safeInventory}
            setInventory={setInventory}
            inventoryLogs={safeLogs}
            setInventoryLogs={setInventoryLogs}
            menuItems={safeMenuItems}
            setMenuItems={setMenuItems}
            currentUser={currentUser}
            requireAdminOverride={requireAdminOverride}
            addAuditLog={addAuditLog}
            displayUnitMode={displayUnitMode}
            measurementUnits={MEASUREMENT_UNITS}
            convertMeasurement={convertMeasurement}
            formatMultiUnitWeight={formatMultiUnitWeight}
          />
        )}

        {activeTab === 'history' && (
          <WarehouseHistoryTab 
            inventoryLogs={safeLogs}
            setInventoryLogs={setInventoryLogs}
            currentUser={currentUser}
            requireAdminOverride={requireAdminOverride}
            addAuditLog={addAuditLog}
          />
        )}

      </div>

      {/* =======================================================
          MODAL: TEZKOR BIRLIK KONVERTORI (GR <-> KG <-> TONNA)
          ======================================================= */}
      {isConverterOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
              <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <span>🧮</span> Birliklar Konvertori (gr / kg / tonna)
              </h3>
              <button
                type="button"
                onClick={() => setIsConverterOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-black flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                  Miqdorni kiriting
                </label>
                <input
                  type="number"
                  step="any"
                  value={convValue}
                  onChange={e => setConvValue(e.target.value)}
                  className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 font-black text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                  Tanlangan birlik
                </label>
                <select
                  value={convFromUnit}
                  onChange={e => setConvFromUnit(e.target.value)}
                  className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 font-bold text-gray-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="gr">Gramm (gr)</option>
                  <option value="kg">Kilogramm (kg)</option>
                  <option value="tonna">Tonna (t)</option>
                  <option value="ml">Millilitr (ml)</option>
                  <option value="litr">Litr (l)</option>
                </select>
              </div>
            </div>

            {/* Konvertatsiya natijalari */}
            <div className="bg-gray-50 dark:bg-gray-900/60 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-2.5">
              {getUnitFamily(convFromUnit) === 'weight' ? (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-gray-500">🥄 Grammda:</span>
                    <span className="font-black text-indigo-600 dark:text-indigo-400">
                      {convertMeasurement(convValue, convFromUnit, 'gr').toLocaleString()} gr
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-gray-500">🏋️ Kilogrammda:</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400">
                      {convertMeasurement(convValue, convFromUnit, 'kg').toLocaleString()} kg
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-gray-500">📦 Tonnada:</span>
                    <span className="font-black text-amber-600 dark:text-amber-400">
                      {convertMeasurement(convValue, convFromUnit, 'tonna').toLocaleString()} tonna
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-gray-500">💧 Millilitrda:</span>
                    <span className="font-black text-indigo-600 dark:text-indigo-400">
                      {convertMeasurement(convValue, convFromUnit, 'ml').toLocaleString()} ml
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-gray-500">🧪 Litrda:</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400">
                      {convertMeasurement(convValue, convFromUnit, 'litr').toLocaleString()} litr
                    </span>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsConverterOpen(false)}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-black text-sm"
            >
              Yopish
            </button>
          </div>
        </div>
      )}

    </div>
  );
}