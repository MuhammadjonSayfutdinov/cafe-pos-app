import React, { useState, useMemo } from 'react';

export default function AdminAuditLogsTab({ 
  auditLogs = [],
  setAuditLogs
}) {
  // ==========================================
  // 1. STATE'LAR VA XAVFSIZ RO'YXAT
  // ==========================================
  const safeLogs = Array.isArray(auditLogs) ? auditLogs : [];

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'danger' | 'override' | 'auth' | 'routine'
  const [filterRole, setFilterRole] = useState('all');

  // ==========================================
  // 2. YORDAMCHI FUNKSIYALAR (RANG VA TOIFA ANIQLASH)
  // ==========================================
  const getLogCategory = (log) => {
    const actionLower = String(log?.action || '').toLowerCase();
    const detailsLower = String(log?.details || '').toLowerCase();

    // 1. O'chirish, bekor qilish, stop-list yoki xatolar (Qizil)
    if (
      actionLower.includes("o'chir") ||
      actionLower.includes("ochir") ||
      actionLower.includes("bekor") ||
      actionLower.includes("stop-list") ||
      actionLower.includes("taqiq") ||
      actionLower.includes("xato") ||
      detailsLower.includes("o'chirildi")
    ) {
      return 'danger';
    }

    // 2. Admin ruxsatlari, parol va tahrirlashlar (Sariq / Amber)
    if (
      actionLower.includes("ruxsat") ||
      actionLower.includes("override") ||
      actionLower.includes("tahrir") ||
      actionLower.includes("ko'chir") ||
      actionLower.includes("bo'lin") ||
      actionLower.includes("avtomatik qulflash")
    ) {
      return 'override';
    }

    // 3. Tizimga kirish va chiqish (Ko'k / Indigo)
    if (
      actionLower.includes("kirish") ||
      actionLower.includes("chiqish") ||
      actionLower.includes("login")
    ) {
      return 'auth';
    }

    // 4. Oddiy kundalik amallar: qo'shish, sotuv, status (Yashil)
    return 'routine';
  };

  const getRoleLabel = (role) => {
    const r = String(role || 'guest').toLowerCase();
    if (r === 'admin') return { label: '👑 Admin', style: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
    if (r === 'warehouse') return { label: '📦 Omborchi', style: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
    if (r === 'cashier') return { label: '💳 Kassir', style: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
    if (r === 'waiter') return { label: '📝 Ofitsiant', style: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' };
    if (r === 'kitchen') return { label: '👨‍🍳 Oshpaz', style: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' };
    return { label: '📱 Mijoz / Tizim', style: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' };
  };

  // ==========================================
  // 3. STATISTIKA VA FILTRLASH MANTIG'I
  // ==========================================
  const stats = useMemo(() => {
    let dangerCount = 0;
    let overrideCount = 0;
    let authCount = 0;

    safeLogs.forEach(log => {
      const cat = getLogCategory(log);
      if (cat === 'danger') dangerCount += 1;
      else if (cat === 'override') overrideCount += 1;
      else if (cat === 'auth') authCount += 1;
    });

    return {
      total: safeLogs.length,
      dangerCount,
      overrideCount,
      authCount
    };
  }, [safeLogs]);

  const filteredLogs = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();

    return safeLogs.filter(log => {
      if (!log) return false;

      // 1. Toifa bo'yicha filtr
      if (filterType !== 'all' && getLogCategory(log) !== filterType) {
        return false;
      }

      // 2. Rol bo'yicha filtr
      if (filterRole !== 'all' && String(log.role || '').toLowerCase() !== filterRole) {
        return false;
      }

      // 3. Matn bo'yicha qidiruv
      if (!searchLower) return true;

      const userNameMatch = String(log.userName || '').toLowerCase().includes(searchLower);
      const actionMatch = String(log.action || '').toLowerCase().includes(searchLower);
      const detailsMatch = String(log.details || '').toLowerCase().includes(searchLower);
      const dateMatch = String(log.date || '').toLowerCase().includes(searchLower);

      return userNameMatch || actionMatch || detailsMatch || dateMatch;
    });
  }, [safeLogs, searchTerm, filterType, filterRole]);

  // ==========================================
  // 4. EKSPORT VA TOZALASH FUNKSIYALARI
  // ==========================================
  const handleExportLogs = () => {
    if (filteredLogs.length === 0) {
      alert("Yuklab olish uchun yozuvlar yo'q!");
      return;
    }

    const lines = filteredLogs.map(
      (l, idx) => `${idx + 1}. [${l.date || '-'}] (${l.userName || "Noma'lum"} - ${l.role || 'guest'}) | ${l.action || '-'}: ${l.details || '-'}`
    );
    const content = `CAFE POS APP — XAVFSIZLIK VA HARAKATLAR JURNALI\nSana: ${new Date().toLocaleString()}\n==========================================================\n\n` + lines.join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClearLogs = () => {
    if (typeof setAuditLogs !== 'function' || safeLogs.length === 0) return;

    if (window.confirm("DIQQAT! Barcha harakatlar tarixini (Audit Logs) o'chirib tozalamoqchimisiz?")) {
      setAuditLogs([
        {
          id: `${Date.now()}`,
          date: new Date().toLocaleString(),
          action: "Tarix tozalandi",
          details: "Admin tomonidan eski audit yozuvlari tozalandi",
          userName: "Admin",
          role: "admin"
        }
      ]);
    }
  };

  // ==========================================
  // 5. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 animate-fade-in space-y-6">
      
      {/* 5.1. SARLAVHA VA AMALLAR TUGMALARI */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span>🕵️‍♂️</span> Xodimlar Harakati Tarixi (Audit Logs)
          </h2>
          <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1">
            Tizimdagi barcha kirish-chiqishlar, o'chirishlar va Admin ruxsatlarining qat'iy nazorati.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={handleExportLogs}
            disabled={filteredLogs.length === 0}
            className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 font-black text-xs transition active:scale-95 disabled:opacity-40"
          >
            📥 Yuklab olish (.txt)
          </button>

          {typeof setAuditLogs === 'function' && safeLogs.length > 0 && (
            <button
              type="button"
              onClick={handleClearLogs}
              className="px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-600 dark:text-red-400 font-black text-xs transition active:scale-95"
            >
              🗑 Tarixni tozalash
            </button>
          )}
        </div>
      </div>

      {/* 5.2. TEZKOR STATISTIKA KARTALARI (BOSILGANDA FILTRLAYDI) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setFilterType('all')}
          className={`p-4 rounded-2xl border-2 text-left transition ${
            filterType === 'all'
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
              : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40'
          }`}
        >
          <p className="text-[11px] font-black uppercase text-gray-400">Jami harakatlar</p>
          <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{stats.total} ta</p>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('danger')}
          className={`p-4 rounded-2xl border-2 text-left transition ${
            filterType === 'danger'
              ? 'border-red-500 bg-red-50/60 dark:bg-red-900/20'
              : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40'
          }`}
        >
          <p className="text-[11px] font-black uppercase text-red-500">🚨 O'chirish / Stop-List</p>
          <p className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">{stats.dangerCount} ta</p>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('override')}
          className={`p-4 rounded-2xl border-2 text-left transition ${
            filterType === 'override'
              ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-900/20'
              : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40'
          }`}
        >
          <p className="text-[11px] font-black uppercase text-amber-600">🔑 Ruxsat va Tahrirlar</p>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{stats.overrideCount} ta</p>
        </button>

        <button
          type="button"
          onClick={() => setFilterType('auth')}
          className={`p-4 rounded-2xl border-2 text-left transition ${
            filterType === 'auth'
              ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/20'
              : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40'
          }`}
        >
          <p className="text-[11px] font-black uppercase text-emerald-600">🚪 Kirish va Chiqish</p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.authCount} ta</p>
        </button>
      </div>

      {/* 5.3. QIDIRUV VA ROL FILTRI */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-gray-50 dark:bg-gray-900/50 p-3 rounded-2xl border border-gray-100 dark:border-gray-700">
        <div className="relative flex-1">
          <input 
            type="text" 
            placeholder="🔍 Xodim, sana, harakat yoki tafsilotni qidiring..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-bold outline-none focus:border-indigo-500 text-gray-900 dark:text-white transition"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 font-black"
            >
              ✕
            </button>
          )}
        </div>

        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="px-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-black text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
        >
          <option value="all">👥 Barcha rollar</option>
          <option value="admin">👑 Admin</option>
          <option value="warehouse">📦 Omborchi</option>
          <option value="cashier">💳 Kassir</option>
          <option value="waiter">📝 Ofitsiant</option>
          <option value="kitchen">👨‍🍳 Oshpaz</option>
          <option value="guest">📱 Mijoz / Tizim</option>
        </select>
      </div>

      {/* 5.4. AUDIT LOGS JADVALI */}
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-5xl opacity-50 mb-3 block">📜</span>
            <p className="text-gray-500 font-bold text-sm">
              Hozircha tarix bo'sh yoki tanlangan filtr bo'yicha yozuv topilmadi.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="p-4 text-xs font-black text-gray-500 uppercase tracking-wider">Sana va Vaqt</th>
                  <th className="p-4 text-xs font-black text-gray-500 uppercase tracking-wider">Xodim</th>
                  <th className="p-4 text-xs font-black text-gray-500 uppercase tracking-wider">Harakat turi</th>
                  <th className="p-4 text-xs font-black text-gray-500 uppercase tracking-wider">Tafsilotlar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredLogs.map((log, index) => {
                  const safeUserName = String(log?.userName || "Noma'lum");
                  const firstChar = safeUserName.trim() ? safeUserName.trim().charAt(0).toUpperCase() : '?';
                  const safeAction = String(log?.action || 'Harakat');
                  const safeDetails = String(log?.details || '-');
                  const category = getLogCategory(log);
                  const roleBadge = getRoleLabel(log?.role);

                  return (
                    <tr 
                      key={log?.id || index} 
                      className="hover:bg-white dark:hover:bg-gray-800 transition-colors"
                    >
                      {/* 1. Sana va Vaqt */}
                      <td className="p-4 whitespace-nowrap">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                          {log?.date || '-'}
                        </span>
                      </td>

                      {/* 2. Xodim va Roli */}
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <span className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-black shrink-0">
                            {firstChar}
                          </span>
                          <span className="font-black text-gray-900 dark:text-white text-sm">
                            {safeUserName}
                          </span>
                          <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${roleBadge.style}`}>
                            {roleBadge.label}
                          </span>
                        </div>
                      </td>

                      {/* 3. Harakat turi */}
                      <td className="p-4 whitespace-nowrap">
                        <span className={`text-xs font-black px-2.5 py-1 rounded-lg inline-block ${
                          category === 'danger' 
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' 
                            : category === 'override'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : category === 'auth'
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        }`}>
                          {safeAction}
                        </span>
                      </td>

                      {/* 4. Tafsilotlar */}
                      <td className="p-4">
                        <span className="text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300">
                          {safeDetails}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}