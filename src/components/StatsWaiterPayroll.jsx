import React, { useState, useMemo, useEffect } from 'react';

// =========================================================
// BUYURTMA VA XARAJAT SANASINI UNIVERSAL O'QISH YORDAMCHISI
// =========================================================
const parseRecordTimeMs = (record) => {
  if (!record) return Date.now();

  if (record.closedAtMs && !isNaN(Number(record.closedAtMs))) return Number(record.closedAtMs);
  if (record.createdAt && !isNaN(Number(record.createdAt))) return Number(record.createdAt);

  const rawDateStr = String(record.closeTime || record.archiveDate || record.date || '').trim();
  if (rawDateStr) {
    const dmyMatch = rawDateStr.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (dmyMatch) {
      const day = Number(dmyMatch[1]);
      const month = Number(dmyMatch[2]) - 1;
      const year = Number(dmyMatch[3]);
      const timeMatch = rawDateStr.match(/(\d{1,2}):(\d{2})/);
      const hh = timeMatch ? Number(timeMatch[1]) : 12;
      const mm = timeMatch ? Number(timeMatch[2]) : 0;
      const constructed = new Date(year, month, day, hh, mm).getTime();
      if (!isNaN(constructed)) return constructed;
    }

    const parsed = Date.parse(rawDateStr);
    if (!isNaN(parsed)) return parsed;
  }

  const idMatch = String(record.id || '').match(/\d{13}/);
  if (idMatch) {
    const idMs = Number(idMatch[0]);
    if (idMs > 1600000000000 && idMs <= Date.now() + 86400000) return idMs;
  }

  return Date.now();
};

const toDateInputStr = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Standart maosh stavkasi (Agar xodim uchun alohida kiritilmagan bo'lsa)
const DEFAULT_WAITER_RULE = {
  serviceSharePercent: 100, // Yig'ilgan xizmat haqining necha % ofitsiantga tegishli (Masalan: 100% yoki 70%)
  salesBonusPercent: 0,     // Sof taom savdosidan qo'shimcha % bonus
  dailyShiftRate: 0,        // 1 ta chiqqan ish kuni (smena) uchun fiks stavka (so'm)
  fixedMonthlySalary: 0,    // Oylik fiks oklad (so'm)
  manualBonus: 0,           // Rahbar tomonidan qo'shimcha mukofot (+)
  manualDeduction: 0,       // Qo'shimcha ushlanma / avans / jarima (-)
  note: ''
};

const readLocalJSON = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export default function StatsWaiterPayroll({
  scopedOrders = [],
  allOrders = [],
  scopedExpenses = [],
  allExpenses = [],
  users = [],
  serviceFee = 10,
  activePeriodLabel = 'Joriy davr',
  addAuditLog
}) {
  // =========================================================
  // 1. XODIMLAR MAOSH QOIDALARI XOTIRASI (LOCALSTORAGE BILAN)
  // =========================================================
  const [payrollRules, setPayrollRules] = useState(() =>
    readLocalJSON('pos_waiter_payroll_rules', {})
  );
  const [localUsers] = useState(() => readLocalJSON('pos_users', []));

  useEffect(() => {
    try {
      window.localStorage.setItem('pos_waiter_payroll_rules', JSON.stringify(payrollRules));
    } catch {
      // ignore storage errors
    }
  }, [payrollRules]);

  // =========================================================
  // 2. SANA ORALIG'I VA QIDIRUV STATE'LARI
  // =========================================================
  // 'sync' (StatsMode filtri bilan bir xil) | 'today' | 'week' | 'month' | 'last_month' | 'custom'
  const [dateMode, setDateMode] = useState('sync');
  const [isDateBarOpen, setIsDateBarOpen] = useState(false);

  const todayStr = useMemo(() => toDateInputStr(new Date()), []);
  const firstOfMonthStr = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    return toDateInputStr(d);
  }, []);

  const [customStart, setCustomStart] = useState(firstOfMonthStr);
  const [customEnd, setCustomEnd] = useState(todayStr);
  const [searchQuery, setSearchQuery] = useState('');

  // Tahrirlash va Cheklarni ko'rish modallari
  const [editingWaiter, setEditingWaiter] = useState(null);
  const [ruleForm, setRuleForm] = useState(DEFAULT_WAITER_RULE);
  const [inspectingWaiter, setInspectingWaiter] = useState(null);

  const safeUsers = useMemo(() => {
    if (Array.isArray(users) && users.length > 0) return users;
    return Array.isArray(localUsers) ? localUsers : [];
  }, [users, localUsers]);

  // =========================================================
  // 3. TANLANGAN DAVR BO'YICHA CHEKLAR VA AVANSLARNI AJRATISH
  // =========================================================
  const { filteredOrders, filteredExpenses, currentPeriodText } = useMemo(() => {
    if (dateMode === 'sync') {
      return {
        filteredOrders: Array.isArray(scopedOrders) ? scopedOrders : [],
        filteredExpenses: Array.isArray(scopedExpenses) ? scopedExpenses : [],
        currentPeriodText: activePeriodLabel
      };
    }

    const now = new Date();
    let startMs = 0;
    let endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    let label = 'Tanlangan davr';

    if (dateMode === 'today') {
      startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
      label = `Bugun (${now.toLocaleDateString()})`;
    } else if (dateMode === 'week') {
      const w = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      startMs = w.getTime();
      label = 'Oxirgi 7 kun';
    } else if (dateMode === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      startMs = m.getTime();
      label = 'Shu oy';
    } else if (dateMode === 'last_month') {
      const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      startMs = lmStart.getTime();
      endMs = lmEnd.getTime();
      label = "O'tgan oy";
    } else if (dateMode === 'custom') {
      if (customStart) {
        const [sy, sm, sd] = customStart.split('-').map(Number);
        startMs = new Date(sy, sm - 1, sd, 0, 0, 0, 0).getTime();
      }
      if (customEnd) {
        const [ey, em, ed] = customEnd.split('-').map(Number);
        endMs = new Date(ey, em - 1, ed, 23, 59, 59, 999).getTime();
      }
      label = `${customStart} dan ${customEnd} gacha`;
    }

    const sourceOrders = Array.isArray(allOrders) && allOrders.length > 0 ? allOrders : scopedOrders;
    const sourceExpenses = Array.isArray(allExpenses) && allExpenses.length > 0 ? allExpenses : scopedExpenses;

    const matchingOrders = (Array.isArray(sourceOrders) ? sourceOrders : []).filter(o => {
      if (!o || !["To'langan", 'Arxiv'].includes(o.status)) return false;
      const t = parseRecordTimeMs(o);
      return t >= startMs && t <= endMs;
    });

    const matchingExpenses = (Array.isArray(sourceExpenses) ? sourceExpenses : []).filter(e => {
      if (!e) return false;
      const t = parseRecordTimeMs(e);
      return t >= startMs && t <= endMs;
    });

    return {
      filteredOrders: matchingOrders,
      filteredExpenses: matchingExpenses,
      currentPeriodText: label
    };
  }, [
    dateMode,
    scopedOrders,
    allOrders,
    scopedExpenses,
    allExpenses,
    activePeriodLabel,
    customStart,
    customEnd
  ]);

  // =========================================================
  // 4. HAR BIR OFITSIANT UCHUN ULUSH VA MAOSH HISOB-KITOBI
  // =========================================================
  const waiterPayrollRows = useMemo(() => {
    const map = {};

    // 1. Ro'yxatdan o'tgan barcha ofitsiantlarni bazaga kiritib olamiz
    safeUsers.forEach(u => {
      if (!u || !u.name) return;
      const roleLower = String(u.role || '').toLowerCase();
      if (roleLower === 'waiter' || roleLower === 'ofitsiant') {
        const key = String(u.name).trim();
        map[key] = {
          waiterName: key,
          role: 'Ofitsiant',
          ordersCount: 0,
          portionsCount: 0,
          workedDaysSet: new Set(),
          subTotalSales: 0,
          totalRevenue: 0,
          totalServiceFeeGenerated: 0,
          ordersList: []
        };
      }
    });

    // 2. Yopilgan cheklarni ofitsiantlar bo'yicha taqsimlaymiz
    filteredOrders.forEach(order => {
      if (!order) return;
      const rawWaiter = String(order.waiterName || order.waiter || 'Ofitsiant').trim();

      if (!map[rawWaiter]) {
        map[rawWaiter] = {
          waiterName: rawWaiter,
          role: 'Ofitsiant',
          ordersCount: 0,
          portionsCount: 0,
          workedDaysSet: new Set(),
          subTotalSales: 0,
          totalRevenue: 0,
          totalServiceFeeGenerated: 0,
          ordersList: []
        };
      }

      const items = Array.isArray(order.items) ? order.items : [];
      const calcSub = items.reduce((s, it) => {
        const p = Number(it?.price ?? it?.variants?.[0]?.price ?? 0) || 0;
        const q = Number(it?.quantity ?? it?.qty ?? 1) || 0;
        return s + p * q;
      }, 0);

      const sub = Number(order.subTotal ?? order.subtotal ?? calcSub) || 0;
      const isTakeaway = order.table === 'Olib ketish';
      const pct = isTakeaway ? 0 : Number(order.serviceFeePercent ?? order.serviceFee ?? serviceFee) || 0;
      const feeAmt = Number(order.serviceFeeAmount ?? Math.round((sub * pct) / 100)) || 0;
      const finalAmt = Number(order.finalTotal ?? order.total ?? (sub + feeAmt)) || 0;
      const portions = items.reduce((s, it) => s + (Number(it?.quantity ?? it?.qty ?? 1) || 0), 0);

      const dayKey = toDateInputStr(new Date(parseRecordTimeMs(order)));

      map[rawWaiter].ordersCount += 1;
      map[rawWaiter].portionsCount += portions;
      map[rawWaiter].workedDaysSet.add(dayKey);
      map[rawWaiter].subTotalSales += sub;
      map[rawWaiter].totalRevenue += finalAmt;
      map[rawWaiter].totalServiceFeeGenerated += feeAmt;
      map[rawWaiter].ordersList.push({
        ...order,
        computedSub: sub,
        computedFee: feeAmt,
        computedFinal: finalAmt,
        computedPortions: portions
      });
    });

    // 3. Har bir ofitsiant uchun Maosh Qoidalari va Kassadan olingan Avanslarni hisoblaymiz
    const rows = Object.values(map).map(w => {
      const rule = {
        ...DEFAULT_WAITER_RULE,
        ...(payrollRules[w.waiterName] || {})
      };

      const workedDaysCount = w.workedDaysSet.size;

      // a) Xizmat haqidan ulushi (Masalan: yig'ilgan 10% xizmat haqining 100% yoki 70% qismi)
      const serviceShareEarned = Math.round(
        (w.totalServiceFeeGenerated * (Number(rule.serviceSharePercent) || 0)) / 100
      );

      // b) Taomlar savdosidan qo'shimcha bonus %
      const salesBonusEarned = Math.round(
        (w.subTotalSales * (Number(rule.salesBonusPercent) || 0)) / 100
      );

      // c) Ishlagan smenalari (kunlari) uchun kunlik stavka + Oylik oklad
      const shiftSalaryEarned = workedDaysCount * (Number(rule.dailyShiftRate) || 0);
      const fixedSalary = Number(rule.fixedMonthlySalary) || 0;

      // d) Kassadan "Avans" sifatida shu xodim nomiga yozilgan chiqimlarni avtomatik topish
      const nameLower = w.waiterName.toLowerCase();
      const cashierAdvances = filteredExpenses
        .filter(exp => {
          if (!exp || exp.category !== 'Avans') return false;
          const rec = String(exp.recipient || '').toLowerCase();
          const note = String(exp.note || '').toLowerCase();
          return rec.includes(nameLower) || note.includes(nameLower);
        })
        .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

      const manualBonus = Number(rule.manualBonus) || 0;
      const manualDeduction = Number(rule.manualDeduction) || 0;
      const totalDeductions = cashierAdvances + manualDeduction;

      // Jami hisoblangan maosh (Qo'lga tegadigan sof summa)
      const grossEarned =
        serviceShareEarned +
        salesBonusEarned +
        shiftSalaryEarned +
        fixedSalary +
        manualBonus;

      const netPayableSalary = grossEarned - totalDeductions;

      return {
        ...w,
        workedDaysCount,
        rule,
        serviceShareEarned,
        salesBonusEarned,
        shiftSalaryEarned,
        fixedSalary,
        cashierAdvances,
        manualBonus,
        manualDeduction,
        totalDeductions,
        grossEarned,
        netPayableSalary
      };
    });

    // Qidiruv va Saralash (Eng ko'p maosh/savdo qilganlar tepada)
    return rows
      .filter(r => {
        if (!searchQuery.trim()) return true;
        return r.waiterName.toLowerCase().includes(searchQuery.trim().toLowerCase());
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue || b.netPayableSalary - a.netPayableSalary);
  }, [safeUsers, filteredOrders, filteredExpenses, payrollRules, serviceFee, searchQuery]);

  // Umumiy Jami Ko'rsatkichlar (Footer va Tepasi uchun)
  const totalsSummary = useMemo(() => {
    return waiterPayrollRows.reduce(
      (acc, r) => {
        acc.totalOrders += r.ordersCount;
        acc.totalSales += r.totalRevenue;
        acc.totalServiceCollected += r.totalServiceFeeGenerated;
        acc.totalWaiterServiceShare += r.serviceShareEarned;
        acc.totalAdvances += r.totalDeductions;
        acc.totalNetPayable += r.netPayableSalary;
        return acc;
      },
      {
        totalOrders: 0,
        totalSales: 0,
        totalServiceCollected: 0,
        totalWaiterServiceShare: 0,
        totalAdvances: 0,
        totalNetPayable: 0
      }
    );
  }, [waiterPayrollRows]);

  // =========================================================
  // 5. MODAL HANDLERLARI VA EKSPORT
  // =========================================================
  const handleOpenEditRule = (waiterRow) => {
    setEditingWaiter(waiterRow.waiterName);
    setRuleForm({
      ...DEFAULT_WAITER_RULE,
      ...(payrollRules[waiterRow.waiterName] || {})
    });
  };

  const handleSaveRule = (e) => {
    e.preventDefault();
    if (!editingWaiter) return;

    const cleaned = {
      serviceSharePercent: Math.min(100, Math.max(0, Number(ruleForm.serviceSharePercent) || 0)),
      salesBonusPercent: Math.min(100, Math.max(0, Number(ruleForm.salesBonusPercent) || 0)),
      dailyShiftRate: Math.max(0, Number(ruleForm.dailyShiftRate) || 0),
      fixedMonthlySalary: Math.max(0, Number(ruleForm.fixedMonthlySalary) || 0),
      manualBonus: Math.max(0, Number(ruleForm.manualBonus) || 0),
      manualDeduction: Math.max(0, Number(ruleForm.manualDeduction) || 0),
      note: String(ruleForm.note || '').trim()
    };

    setPayrollRules(prev => ({
      ...(prev || {}),
      [editingWaiter]: cleaned
    }));

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        'Ofitsiant maosh stavkasi yangilandi',
        `${editingWaiter}: Xizmat ulushi ${cleaned.serviceSharePercent}%, Kunlik: ${cleaned.dailyShiftRate.toLocaleString()} s, Oklad: ${cleaned.fixedMonthlySalary.toLocaleString()} s`
      );
    }

    setEditingWaiter(null);
  };

  const handleExportPayrollTxt = () => {
    const lines = [
      `========================================================`,
      `👨‍🍳 OFITSIANTLAR ULUSHI VA OYLIK MAOSH VEDOMOSTI`,
      `Davr: ${currentPeriodText}`,
      `Sana: ${new Date().toLocaleString()}`,
      `========================================================\n`,
      ...waiterPayrollRows.map(
        (r, i) =>
          `${i + 1}. ${r.waiterName} (${r.workedDaysCount} smena | ${r.ordersCount} ta chek | ${r.portionsCount} pors)\n` +
          `   • Jami savdosi: ${r.totalRevenue.toLocaleString()} so'm\n` +
          `   • Yig'ilgan xizmat haqi: ${r.totalServiceFeeGenerated.toLocaleString()} so'm\n` +
          `   • Xizmatdan ulushi (${r.rule.serviceSharePercent}%): +${r.serviceShareEarned.toLocaleString()} so'm\n` +
          (r.salesBonusEarned > 0 ? `   • Savdodan bonus (${r.rule.salesBonusPercent}%): +${r.salesBonusEarned.toLocaleString()} so'm\n` : '') +
          (r.shiftSalaryEarned + r.fixedSalary > 0 ? `   • Oklad / Smena puli: +${(r.shiftSalaryEarned + r.fixedSalary).toLocaleString()} so'm\n` : '') +
          (r.manualBonus > 0 ? `   • Qo'shimcha mukofot: +${r.manualBonus.toLocaleString()} so'm\n` : '') +
          (r.totalDeductions > 0 ? `   • Olingan Avans / Jarima: -${r.totalDeductions.toLocaleString()} so'm\n` : '') +
          `   💰 QO'LGA TEGADIGAN SOF MAOSH: ${r.netPayableSalary.toLocaleString()} so'm\n`
      ),
      `--------------------------------------------------------`,
      `JAMI TO'LANADIGAN MAOSH FONDI: ${totalsSummary.totalNetPayable.toLocaleString()} so'm`
    ].join('\n');

    const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ofitsiantlar-maoshi-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // =========================================================
  // 6. RENDER (UI JADVAL VA MODALLAR)
  // =========================================================
  return (
    <div className="bg-white dark:bg-gray-800 p-5 md:p-6 rounded-3xl shadow-sm border-2 border-amber-100 dark:border-amber-900/40 space-y-5">
      
      {/* 1. TEPA SARLAVHA VA BOSHQARUV TUGMALARI */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-2xl shadow-md shadow-amber-500/25 shrink-0">
            👨‍🍳
          </div>
          <div>
            <h3 className="text-lg md:text-xl font-black text-gray-900 dark:text-white leading-tight">
              Ofitsiantlar Ulushi va Oylik Maosh Hisoblagichi (HR Payroll)
            </h3>
            <p className="text-xs font-bold text-gray-500 mt-0.5">
              Faol davr: <strong className="text-indigo-600 dark:text-indigo-400">{currentPeriodText}</strong> • Har bir xodimning xizmat haqi ulushi, okladi va avanslari
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto justify-between xl:justify-end">
          {/* Qidiruv */}
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 Ofitsiant ismi..."
            className="px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-amber-500 w-full sm:w-44"
          />

          {/* Sana oralig'i tugmasi */}
          <button
            type="button"
            onClick={() => setIsDateBarOpen(prev => !prev)}
            className={`px-3.5 py-2 rounded-xl font-black text-xs transition flex items-center gap-1.5 ${
              dateMode !== 'sync' || isDateBarOpen
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
            }`}
          >
            <span>📅</span>
            <span>{dateMode === 'sync' ? 'Maosh davri' : currentPeriodText}</span>
            <span className="text-[10px]">{isDateBarOpen ? '▲' : '▼'}</span>
          </button>

          {/* Vedomost yuklab olish */}
          <button
            type="button"
            onClick={handleExportPayrollTxt}
            className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-black text-xs border border-emerald-200 dark:border-emerald-800/50 transition active:scale-95 whitespace-nowrap"
          >
            📥 Vedomost (.txt)
          </button>
        </div>
      </div>

      {/* 2. OCHILUVCHI SANA ORALIG'I PANELI */}
      {isDateBarOpen && (
        <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-gray-900/80 border border-amber-200 dark:border-gray-700 space-y-3 animate-fade-in">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <span className="text-xs font-black uppercase text-amber-800 dark:text-amber-400">
              📅 Maosh va ulushlarni qaysi davr uchun hisoblaymiz?
            </span>
            {dateMode !== 'sync' && (
              <button
                type="button"
                onClick={() => setDateMode('sync')}
                className="text-[11px] font-black text-red-500 hover:underline"
              >
                ✕ Yuqoridagi asosiy filtr bilan birxillashtirish
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'sync', label: '🔄 Umumiy filtr bilan birga' },
              { id: 'today', label: '☀️ Bugun (Kunlik ulush)' },
              { id: 'week', label: '📆 Oxirgi 7 kun (Haftalik)' },
              { id: 'month', label: '🗓 Shu oy (Oylik maosh)' },
              { id: 'last_month', label: "⏪ O'tgan oy" },
              { id: 'custom', label: "🎯 Sanadan — Sanagacha" }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDateMode(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                  dateMode === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {dateMode === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">
                  Boshlanish sanasi (... dan)
                </label>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-amber-300 dark:border-gray-700 text-xs font-black text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-gray-500 mb-1">
                  Tugash sanasi (... gacha)
                </label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-amber-300 dark:border-gray-700 text-xs font-black text-gray-900 dark:text-white"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. QISQACHA FONDLAR XULOSASI (4 TA MINI-KARTA) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700">
          <span className="text-[10px] font-black uppercase text-gray-400 block">
            🛎 Jami Yig'ilgan Xizmat Haqi
          </span>
          <span className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400">
            {totalsSummary.totalServiceCollected.toLocaleString()} s
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700">
          <span className="text-[10px] font-black uppercase text-gray-400 block">
            👨‍🍳 Ofitsiantlar Xizmat Ulushi
          </span>
          <span className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400">
            +{totalsSummary.totalWaiterServiceShare.toLocaleString()} s
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700">
          <span className="text-[10px] font-black uppercase text-gray-400 block">
            💸 Olingan Avans va Ushlanmalar
          </span>
          <span className="text-base sm:text-lg font-black text-red-500">
            {totalsSummary.totalAdvances > 0 ? `-${totalsSummary.totalAdvances.toLocaleString()}` : '0'} s
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50">
          <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 block">
            💰 Jami Qo'lga Tegadigan Maosh
          </span>
          <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400">
            {totalsSummary.totalNetPayable.toLocaleString()} s
          </span>
        </div>
      </div>

      {/* 4. ASOSIY OFITSIANTLAR MAOSH VA ULUSH JADVALI */}
      {waiterPayrollRows.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 dark:bg-gray-900/40 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-gray-400 font-bold text-sm">
          Tanlangan davrda ofitsiantlar sotuvi yoki xodimlar topilmadi.
        </div>
      ) : (
        <div className="overflow-x-auto bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700 text-[11px] font-black text-gray-500 uppercase tracking-wider">
                <th className="p-4">Ofitsiant</th>
                <th className="p-4 text-center">Smena / Cheklar</th>
                <th className="p-4">Jami Savdosi</th>
                <th className="p-4">Yig'ilgan Xizmat (10%)</th>
                <th className="p-4">Xizmatdan Ulushi</th>
                <th className="p-4">Oklad / Bonus</th>
                <th className="p-4">Avans / Jarima</th>
                <th className="p-4 text-right">Qo'lga Tegadigan Maosh</th>
                <th className="p-4 text-center">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/70 dark:divide-gray-700 text-xs sm:text-sm font-bold">
              {waiterPayrollRows.map((row, index) => {
                const extraFixedAndBonus =
                  row.salesBonusEarned + row.shiftSalaryEarned + row.fixedSalary + row.manualBonus;

                return (
                  <tr
                    key={row.waiterName}
                    onClick={() => setInspectingWaiter(row)}
                    className="hover:bg-white dark:hover:bg-gray-800 transition cursor-pointer group"
                    title="Bosib shu ofitsiant yopgan barcha cheklarni ko'ring"
                  >
                    {/* 1. Ofitsiant ismi */}
                    <td className="p-4">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-black text-xs flex items-center justify-center shrink-0">
                          #{index + 1}
                        </span>
                        <div>
                          <p className="font-black text-gray-900 dark:text-white text-sm sm:text-base group-hover:text-indigo-600 transition">
                            {row.waiterName}
                          </p>
                          <span className="text-[10px] font-bold text-gray-400">
                            Ulush stavkasi: {row.rule.serviceSharePercent}% xizmatdan
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 2. Smena va Cheklar soni */}
                    <td className="p-4 text-center">
                      <span className="font-black text-gray-900 dark:text-white block">
                        {row.ordersCount} ta chek
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {row.workedDaysCount} kun • {row.portionsCount} pors
                      </span>
                    </td>

                    {/* 3. Jami Savdosi */}
                    <td className="p-4">
                      <span className="font-black text-gray-900 dark:text-white block">
                        {row.totalRevenue.toLocaleString()} s
                      </span>
                      <span className="text-[10px] text-gray-400">
                        Taomlar: {row.subTotalSales.toLocaleString()} s
                      </span>
                    </td>

                    {/* 4. Yig'ilgan Xizmat Haqi */}
                    <td className="p-4">
                      <span className="font-black text-amber-600 dark:text-amber-400">
                        {row.totalServiceFeeGenerated.toLocaleString()} s
                      </span>
                    </td>

                    {/* 5. Ofitsiantning Xizmat Haqidan Sof Ulushi */}
                    <td className="p-4">
                      <span className="font-black text-indigo-600 dark:text-indigo-400 block">
                        +{row.serviceShareEarned.toLocaleString()} s
                      </span>
                      <span className="text-[10px] text-gray-400">
                        ({row.rule.serviceSharePercent}% ulush)
                      </span>
                    </td>

                    {/* 6. Oklad, Kunlik Smena va Savdo Bonusi */}
                    <td className="p-4">
                      {extraFixedAndBonus > 0 ? (
                        <div>
                          <span className="font-black text-emerald-600 dark:text-emerald-400 block">
                            +{extraFixedAndBonus.toLocaleString()} s
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {row.rule.salesBonusPercent > 0 ? `Savdodan ${row.rule.salesBonusPercent}% ` : ''}
                            {row.fixedSalary > 0 ? '• Oklad ' : ''}
                            {row.manualBonus > 0 ? '• Mukofot' : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">0 s</span>
                      )}
                    </td>

                    {/* 7. Avans va Jarimalar */}
                    <td className="p-4">
                      {row.totalDeductions > 0 ? (
                        <div>
                          <span className="font-black text-red-500 block">
                            -{row.totalDeductions.toLocaleString()} s
                          </span>
                          {row.cashierAdvances > 0 && (
                            <span className="text-[10px] text-gray-400">
                              Kassa avansi: -{row.cashierAdvances.toLocaleString()} s
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">0 s</span>
                      )}
                    </td>

                    {/* 8. Qo'lga Tegadigan Yakuniy Maosh */}
                    <td className="p-4 text-right">
                      <span className={`text-base sm:text-lg font-black px-3 py-1.5 rounded-xl inline-block ${
                        row.netPayableSalary >= 0
                          ? 'bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                          : 'bg-red-100 text-red-600'
                      }`}>
                        {row.netPayableSalary.toLocaleString()} s
                      </span>
                    </td>

                    {/* 9. Sozlash va Cheklar tugmasi */}
                    <td className="p-4 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditRule(row)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 font-black text-xs transition"
                          title="Foiz ulushi, oklad va avansni sozlash"
                        >
                          ⚙️ Stavka
                        </button>
                        <button
                          type="button"
                          onClick={() => setInspectingWaiter(row)}
                          className="px-2.5 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-amber-100 text-gray-700 dark:text-gray-200 font-black text-xs transition"
                          title="Ofitsiant cheklarini ko'rish"
                        >
                          👁
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* =========================================================
          MODAL 1: ⚙️ OFITSIANT STAVKASI, OKLAD VA AVANSNI SOZLASH
          ========================================================= */}
      {editingWaiter && (
        <div
          onClick={() => setEditingWaiter(null)}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[160] flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 border border-gray-100 dark:border-gray-700 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white">
                  ⚙️ {editingWaiter} — Maosh va Ulush Stavkasi
                </h3>
                <p className="text-xs font-bold text-gray-400">
                  Xodimning xizmat haqidan oladigan foizi, okladi va avans/mukofotlari
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingWaiter(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 font-black"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRule} className="space-y-4">
              {/* 1. Xizmat haqidan ulushi (%) */}
              <div className="bg-amber-50/70 dark:bg-gray-900/60 p-4 rounded-2xl border border-amber-200 dark:border-gray-700 space-y-2">
                <label className="block text-xs font-black text-amber-900 dark:text-amber-400 uppercase">
                  1. Yig'ilgan Xizmat Haqidan Ofitsiant Ulushi (%)
                </label>
                <p className="text-[11px] font-bold text-gray-500">
                  Masalan: 100% bo'lsa chekdagi barcha xizmat haqi ofitsiantga yoziladi; 70% bo'lsa 70% ofitsiantga, 30% kafega qoladi.
                </p>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={ruleForm.serviceSharePercent}
                    onChange={e => setRuleForm(prev => ({ ...prev, serviceSharePercent: e.target.value }))}
                    className="w-28 p-3 rounded-xl bg-white dark:bg-gray-800 border border-amber-300 font-black text-base text-center text-gray-900 dark:text-white"
                  />
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {[100, 80, 70, 50, 0].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setRuleForm(prev => ({ ...prev, serviceSharePercent: pct }))}
                        className={`px-3 py-2 rounded-xl font-black text-xs border transition ${
                          Number(ruleForm.serviceSharePercent) === pct
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 2. Savdodan qo'shimcha % va Kunlik smena stavkasi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">
                    Taom savdosidan bonus (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={ruleForm.salesBonusPercent}
                    onChange={e => setRuleForm(prev => ({ ...prev, salesBonusPercent: e.target.value }))}
                    placeholder="Masalan: 0 yoki 2"
                    className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">
                    1 Kunlik (Smena) Chiqish Puli (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={ruleForm.dailyShiftRate}
                    onChange={e => setRuleForm(prev => ({ ...prev, dailyShiftRate: e.target.value }))}
                    placeholder="Masalan: 50000"
                    className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* 3. Oylik Oklad, Mukofot (+) va Ushlanma/Jarima (-) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">
                    Oylik Fiks Oklad (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={ruleForm.fixedMonthlySalary}
                    onChange={e => setRuleForm(prev => ({ ...prev, fixedMonthlySalary: e.target.value }))}
                    placeholder="0"
                    className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-emerald-600 uppercase mb-1">
                    + Qo'shimcha Bonus (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={ruleForm.manualBonus}
                    onChange={e => setRuleForm(prev => ({ ...prev, manualBonus: e.target.value }))}
                    placeholder="0"
                    className="w-full p-3 rounded-xl bg-emerald-50/60 dark:bg-gray-900 border border-emerald-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-red-600 uppercase mb-1">
                    - Avans / Jarima (s)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={ruleForm.manualDeduction}
                    onChange={e => setRuleForm(prev => ({ ...prev, manualDeduction: e.target.value }))}
                    placeholder="0"
                    className="w-full p-3 rounded-xl bg-red-50/60 dark:bg-gray-900 border border-red-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-500 uppercase mb-1">
                  Izoh (Ixtiyoriy)
                </label>
                <input
                  type="text"
                  value={ruleForm.note}
                  onChange={e => setRuleForm(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="Masalan: Katta ofitsiant, banket bonusi qo'shildi"
                  className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingWaiter(null)}
                  className="flex-1 py-3.5 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-bold text-xs"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-lg shadow-indigo-600/30 transition active:scale-95"
                >
                  💾 Stavkani Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL 2: 👁 OFITSIANT YOPGAN BARCHA CHEKLAR RO'YXATI
          ========================================================= */}
      {inspectingWaiter && (
        <div
          onClick={() => setInspectingWaiter(null)}
          className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[160] flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-800 w-full max-w-3xl rounded-3xl p-6 shadow-2xl space-y-4 max-h-[88vh] flex flex-col border border-gray-100 dark:border-gray-700"
          >
            <div className="flex justify-between items-start border-b pb-3 dark:border-gray-700">
              <div>
                <h3 className="font-black text-xl text-gray-900 dark:text-white">
                  👨‍🍳 {inspectingWaiter.waiterName} — Yopilgan Cheklar Tarixi ({inspectingWaiter.ordersCount} ta)
                </h3>
                <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                  Davr: {currentPeriodText} • Jami savdo: {inspectingWaiter.totalRevenue.toLocaleString()} s • Sof maosh: {inspectingWaiter.netPayableSalary.toLocaleString()} s
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingWaiter(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 font-black"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {inspectingWaiter.ordersList.length === 0 ? (
                <div className="text-center py-12 text-gray-400 font-bold">
                  Ushbu davrda yopilgan cheklar yo'q.
                </div>
              ) : (
                inspectingWaiter.ordersList.map(ord => (
                  <div
                    key={ord.id}
                    className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-gray-900 dark:text-white">
                          🪑 {ord.table}
                        </span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          #{String(ord.id).slice(-4)}
                        </span>
                        <span className="text-xs font-bold text-gray-400">
                          🕒 {ord.closeTime || `${ord.date || ''} ${ord.time || ''}`}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-gray-500">
                        🍽 {(ord.items || []).map(i => `${i.name} (x${i.quantity ?? i.qty ?? 1})`).join(', ')}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-black text-sm text-gray-900 dark:text-white block">
                        Chek: {ord.computedFinal.toLocaleString()} s
                      </span>
                      <span className="text-xs font-black text-amber-600 dark:text-amber-400">
                        Xizmat haqi: +{ord.computedFee.toLocaleString()} s
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}