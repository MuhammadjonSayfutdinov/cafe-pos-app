import React, { useState } from 'react';
import useSticky from '../hooks/useSticky';
import {
  DEFAULT_TELEGRAM_CONFIG,
  detectTelegramChatId,
  sendTelegramMessage
} from '../utils/telegramNotifier';

export default function AdminSettingsTab({ 
  cafeName = 'Premium Cafe', 
  setCafeName, 
  serviceFee = 10, 
  setServiceFee,
  tables = [],
  setTables,
  orders = [],
  setOrders,
  menuItems = [],
  setMenuItems,
  menuCategories = [],
  setMenuCategories,
  users = [],
  setUsers,
  inventory = [],
  setInventory,
  inventoryLogs = [],
  setInventoryLogs,
  auditLogs = [],
  setAuditLogs,
  currentUser,
  requireAdminOverride,
  addAuditLog 
}) {
  // ==========================================
  // 1. STATE'LAR
  // ==========================================
  const [tempCafeName, setTempCafeName] = useState(cafeName || '');
  const [tempServiceFee, setTempServiceFee] = useState(
    serviceFee !== undefined ? String(serviceFee) : '10'
  );
  const [newTableName, setNewTableName] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // TELEGRAM BOT SOZLAMALARI STATE'I
  const [telegramConfig, setTelegramConfig] = useSticky(
    'pos_telegram_config',
    DEFAULT_TELEGRAM_CONFIG
  );
  const [showBotToken, setShowBotToken] = useState(false);
  const [tgStatus, setTgStatus] = useState({ loading: false, message: '', isError: false });

  const safeTables = Array.isArray(tables) ? tables : [];
  const safeOrders = Array.isArray(orders) ? orders : [];

  const activeTableNames = safeOrders
    .filter(o => o && !["To'langan", 'Qarz', 'Arxiv'].includes(o.status))
    .map(o => o.table);

  // ==========================================
  // 2. ASOSIY SOZLAMALARNI SAQLASH
  // ==========================================
  const handleSaveSettings = (e) => {
    e.preventDefault();
    const cleanedName = tempCafeName.trim();
    const feeNumber = Number(tempServiceFee);

    if (!cleanedName) {
      alert("Iltimos, Kafe nomini kiriting!");
      return;
    }

    if (isNaN(feeNumber) || feeNumber < 0 || feeNumber > 100) {
      alert("Xizmat haqi 0% va 100% oralig'ida bo'lishi kerak!");
      return;
    }

    if (typeof setCafeName === 'function') setCafeName(cleanedName);
    if (typeof setServiceFee === 'function') setServiceFee(feeNumber);

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        "Sozlamalar yangilandi", 
        `Kafe nomi: "${cleanedName}", Xizmat haqi: ${feeNumber}%`
      );
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // ==========================================
  // 3. TELEGRAM BOT FUNKSIYALARI
  // ==========================================
  const updateTgField = (field, value) => {
    setTelegramConfig(prev => ({
      ...DEFAULT_TELEGRAM_CONFIG,
      ...(prev || {}),
      [field]: value
    }));
  };

  // Chat ID ni avtomatik topish (/getUpdates orqali)
  const handleAutoDetectChatId = async () => {
    setTgStatus({ loading: true, message: 'Telegram bot tekshirilmoqda...', isError: false });
    const res = await detectTelegramChatId(telegramConfig?.botToken);

    if (res.ok) {
      updateTgField('chatId', res.chatId);
      updateTgField('enabled', true);
      setTgStatus({
        loading: false,
        message: `✅ Topildi! "${res.chatName}" (ID: ${res.chatId}) avtomatik ulandi.`,
        isError: false
      });
      if (typeof addAuditLog === 'function') {
        addAuditLog('Telegram Bot ulandi', `Chat ID: ${res.chatId} (${res.chatName})`);
      }
    } else {
      setTgStatus({
        loading: false,
        message: `❌ ${res.error}`,
        isError: true
      });
    }
  };

  // Sinov xabarini yuborish
  const handleSendTestTelegram = async () => {
    setTgStatus({ loading: true, message: 'Sinov xabari yuborilmoqda...', isError: false });

    const testHtml = [
      `🚀 <b>TELEGRAM BOT MUVAFFAQIYATLI ULANDI!</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `🏪 <b>Kafe:</b> ${cafeName}`,
      `👤 <b>Tekshiruvchi:</b> ${currentUser?.name || 'Admin'}`,
      `🕒 <b>Vaqt:</b> ${new Date().toLocaleString()}`,
      `━━━━━━━━━━━━━━━━━━`,
      `✅ Endi smena hisobotlari (Z-Otchyot), qarzlar, chegirmalar va ombor ogohlantirishlari shu yerga jonli kelib tushadi!`
    ].join('\n');

    const res = await sendTelegramMessage(testHtml, 'test', {
      ...telegramConfig,
      enabled: true
    });

    if (res.ok) {
      setTgStatus({
        loading: false,
        message: '✅ Sinov xabari Telegramingizga muvaffaqiyatli yuborildi!',
        isError: false
      });
    } else {
      setTgStatus({
        loading: false,
        message: `❌ Xatolik: ${res.error}`,
        isError: true
      });
    }
  };

  // ==========================================
  // 4. ZAL STOLLARINI BOSHQARISH
  // ==========================================
  const handleAddTable = (e) => {
    e.preventDefault();
    const trimmed = newTableName.trim();
    if (!trimmed) return;

    if (safeTables.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      alert(`"${trimmed}" nomli stol allaqachon mavjud!`);
      return;
    }

    if (typeof setTables === 'function') {
      setTables(prev => [...(Array.isArray(prev) ? prev : []), trimmed]);
    }
    if (typeof addAuditLog === 'function') {
      addAuditLog("Yangi stol qo'shildi", `"${trimmed}" zalga qo'shildi`);
    }
    setNewTableName('');
  };

  const handleDeleteTable = (tableName) => {
    if (activeTableNames.includes(tableName)) {
      alert(`⛔️ "${tableName}" da hozir yopilmagan faol buyurtma bor! Avval stol hisobini yoping.`);
      return;
    }

    if (window.confirm(`Rostdan ham "${tableName}" ni zal ro'yxatidan o'chirmoqchimisiz?`)) {
      if (typeof setTables === 'function') {
        setTables(prev => (Array.isArray(prev) ? prev : []).filter(t => t !== tableName));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Stol o'chirildi", `"${tableName}" zal ro'yxatidan o'chirildi`);
      }
    }
  };

  // ==========================================
  // 5. ZAXIRA NUSXA (BACKUP & RESTORE) VA TOZALASH
  // ==========================================
  const handleExportBackup = () => {
    const backupPayload = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      cafeName,
      serviceFee,
      tables: safeTables,
      menuCategories,
      menuItems,
      users,
      inventory,
      inventoryLogs,
      orders: safeOrders,
      auditLogs,
      telegramConfig
    };

    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(cafeName || 'cafe').toLowerCase().replace(/\s+/g, '-')}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (typeof addAuditLog === 'function') {
      addAuditLog("Baza eksport qilindi", "To'liq zaxira nusxa (.json) yuklab olindi");
    }
  };

  const handleImportBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error("Noto'g'ri fayl formati");
        }

        if (!window.confirm("⚠️ Diqqat! Tanlangan zaxira faylidagi ma'lumotlar hozirgi baza ustiga yoziladi. Tasdiqlaysizmi?")) {
          return;
        }

        if (parsed.cafeName && typeof setCafeName === 'function') setCafeName(parsed.cafeName);
        if (parsed.serviceFee !== undefined && typeof setServiceFee === 'function') setServiceFee(Number(parsed.serviceFee));
        if (Array.isArray(parsed.tables) && typeof setTables === 'function') setTables(parsed.tables);
        if (Array.isArray(parsed.menuCategories) && typeof setMenuCategories === 'function') setMenuCategories(parsed.menuCategories);
        if (Array.isArray(parsed.menuItems) && typeof setMenuItems === 'function') setMenuItems(parsed.menuItems);
        if (Array.isArray(parsed.users) && typeof setUsers === 'function') setUsers(parsed.users);
        if (Array.isArray(parsed.inventory) && typeof setInventory === 'function') setInventory(parsed.inventory);
        if (Array.isArray(parsed.inventoryLogs) && typeof setInventoryLogs === 'function') setInventoryLogs(parsed.inventoryLogs);
        if (Array.isArray(parsed.orders) && typeof setOrders === 'function') setOrders(parsed.orders);
        if (parsed.telegramConfig) setTelegramConfig(parsed.telegramConfig);

        if (typeof addAuditLog === 'function') {
          addAuditLog("Baza tiklandi (Restore)", `Zaxira fayldan (${file.name}) ma'lumotlar tiklandi`);
        }

        alert("✅ Zaxira nusxa muvaffaqiyatli tiklandi!");
      } catch {
        alert("❌ Xatolik! Tanlangan fayl yaroqsiz yoki buzilgan.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearOrdersOnly = () => {
    const performClear = () => {
      if (window.confirm("⚠️ Barcha yopilgan va ochiq cheklar tarixi o'chiriladi (Menyu, Xodimlar va Ombor saqlanib qoladi). Tasdiqlaysizmi?")) {
        if (typeof setOrders === 'function') setOrders([]);
        if (typeof addAuditLog === 'function') {
          addAuditLog("Cheklar tozalandi", "Barcha buyurtmalar va cheklar tarixi o'chirildi");
        }
        alert("✅ Cheklar tarixi tozalandi!");
      }
    };

    if (typeof requireAdminOverride === 'function') {
      requireAdminOverride("Barcha cheklar tarixini o'chirish", performClear);
    } else {
      performClear();
    }
  };

  const handleFactoryReset = () => {
    const performReset = () => {
      if (window.confirm("🛑 OXIRGI OGOHLANTIRISH!\nBarcha ma'lumotlar o'chirilib, dastur zavod holatiga qaytadi. Davom etamizmi?")) {
        window.localStorage.clear();
        window.location.reload();
      }
    };

    if (typeof requireAdminOverride === 'function') {
      requireAdminOverride("Tizimni zavod holatiga qaytarish (Factory Reset)", performReset);
    } else {
      performReset();
    }
  };

  // ==========================================
  // 6. RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      
      {/* 1-BLOK: ASOSIY KAFE VA XIZMAT HAQI SOZLAMALARI */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-6">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">
              ⚙️ Umumiy Tizim Sozlamalari
            </h2>
            <p className="text-xs font-bold text-gray-500 mt-1">
              Chekda chiqadigan kafe nomi va xizmat ko'rsatish foizi
            </p>
          </div>
          {saveSuccess && (
            <span className="px-4 py-2 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-black text-xs animate-bounce">
              ✅ Sozlamalar saqlandi!
            </span>
          )}
        </div>
        
        <form onSubmit={handleSaveSettings} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Kafe / Restoran Nomi (Chek uchun) *
              </label>
              <input 
                type="text" 
                required
                value={tempCafeName}
                onChange={(e) => setTempCafeName(e.target.value)}
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition"
                placeholder="Masalan: Rayhon Milliy Taomlar"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Ofitsiant Xizmat Haqi Foizi (%) *
              </label>
              <div className="space-y-2">
                <input 
                  type="number" 
                  min="0" 
                  max="100"
                  step="any"
                  required
                  value={tempServiceFee}
                  onChange={(e) => setTempServiceFee(e.target.value)}
                  className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-gray-900 dark:text-white outline-none focus:border-indigo-500 transition text-lg"
                />
                <div className="flex gap-2">
                  {[0, 5, 10, 12, 15, 20].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setTempServiceFee(String(pct))}
                      className={`flex-1 py-1.5 rounded-lg font-black text-xs border transition ${
                        Number(tempServiceFee) === pct
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full sm:w-auto px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl shadow-lg shadow-indigo-600/30 transition active:scale-95 uppercase tracking-wider text-sm"
          >
            💾 O'zgarishlarni Saqlash
          </button>
        </form>
      </div>

      {/* =================================================================
          2-BLOK: ✈️ TELEGRAM BOT XABARNOMA MARKAZI (YANGI PRO MODUL)
          ================================================================= */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-sm border-2 border-sky-100 dark:border-sky-900/40 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 dark:border-gray-700 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-500 text-white flex items-center justify-center text-2xl shadow-md shadow-sky-500/30">
              ✈️
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 dark:text-white">
                Telegram Bot Xabarnoma Tizimi
              </h3>
              <p className="text-xs font-bold text-gray-500 mt-0.5">
                Z-Otchyot, nasiya qarzlar, chegirmalar va ombor qoldig'i haqida rahbar Telegramiga jonli hisobot
              </p>
            </div>
          </div>

          {/* Yoqish / O'chirish Switch */}
          <button
            type="button"
            onClick={() => updateTgField('enabled', !telegramConfig?.enabled)}
            className={`px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition active:scale-95 flex items-center gap-2 ${
              telegramConfig?.enabled
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >
            <span>{telegramConfig?.enabled ? '🟢 Yoqilgan (Faol)' : "⚪️ O'chirilgan"}</span>
          </button>
        </div>

        {/* Bot Token va Chat ID kiritish */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              1. Telegram Bot Token (@BotFather dan olinadi)
            </label>
            <div className="relative">
              <input
                type={showBotToken ? 'text' : 'password'}
                value={telegramConfig?.botToken || ''}
                onChange={e => updateTgField('botToken', e.target.value)}
                placeholder="Masalan: 7123456789:AAH..."
                className="w-full pl-4 pr-11 py-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-xs sm:text-sm text-gray-900 dark:text-white outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={() => setShowBotToken(prev => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-white text-sm"
                title="Tokenni ko'rsatish / yashirish"
              >
                {showBotToken ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              2. Rahbar Chat ID (Yoki Guruh ID)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={telegramConfig?.chatId || ''}
                onChange={e => updateTgField('chatId', e.target.value)}
                placeholder="Masalan: 123456789"
                className="flex-1 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-black text-xs sm:text-sm text-gray-900 dark:text-white outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={handleAutoDetectChatId}
                disabled={tgStatus.loading}
                className="px-4 py-3.5 rounded-xl bg-sky-100 dark:bg-sky-900/40 hover:bg-sky-200 text-sky-700 dark:text-sky-300 font-black text-xs whitespace-nowrap transition active:scale-95 disabled:opacity-50"
                title="Botingizga /start bosib, shu tugmani bosing — ID avtomatik topiladi"
              >
                🔍 ID ni topish
              </button>
            </div>
          </div>
        </div>

        {/* Qaysi xabarlar yuborilishini tanlash */}
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-3">
            Qaysi holatlarda Telegramga xabar yuborilsin?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: 'notifyOnZReport', icon: '📊', title: 'Z-Otchyot (Smena yopilganda)', desc: 'Kunlik tushum, tannarx va sof foyda' },
              { key: 'notifyOnDebt', icon: '📝', title: 'Nasiya (Qarz) cheklari', desc: 'Mijoz qarzga yozdirganda darhol xabar' },
              { key: 'notifyOnDiscount', icon: '🎁', title: 'Chegirma (Skidka) berilganda', desc: 'Kassir chegirma qilgan cheklar nazorati' },
              { key: 'notifyOnLowStock', icon: '⚠️', title: 'Ombor kam qolganda', desc: 'Masalliq qizil chegaradan tushganda' },
              { key: 'notifyOnEverySale', icon: '🧾', title: 'Har bir yopilgan chekda', desc: 'Barcha sotuvlarni bittalab jonli kuzatish' },
              { key: 'notifyOnSecurity', icon: '🛡️', title: 'Xavfsizlik amallarida', desc: 'Muhim o\'chirish va Admin tasdiqlari' }
            ].map(opt => {
              const isChecked = Boolean(telegramConfig?.[opt.key]);
              return (
                <label
                  key={opt.key}
                  onClick={() => updateTgField(opt.key, !isChecked)}
                  className={`p-3.5 rounded-2xl border-2 cursor-pointer transition flex items-start gap-3 select-none ${
                    isChecked
                      ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-900/20'
                      : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 opacity-75'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    className="mt-1 w-4 h-4 accent-sky-600"
                  />
                  <div>
                    <p className="font-black text-xs text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span>{opt.icon}</span> {opt.title}
                    </p>
                    <p className="text-[11px] font-bold text-gray-400 mt-0.5">
                      {opt.desc}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Status xabari va Test tugmasi */}
        {tgStatus.message && (
          <div className={`p-3.5 rounded-2xl text-xs font-black ${
            tgStatus.isError
              ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
          }`}>
            {tgStatus.message}
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
          <div className="text-[11px] font-bold text-gray-400 leading-relaxed">
            💡 <b>Qanday ulanadi?</b> 1) Telegramda <b>@BotFather</b> ga kirib <code>/newbot</code> orqali bot oching va Tokenni nusxalang. 2) Yangi botingizga kirib <b>Start</b> bosing. 3) Shu yerda <b>"🔍 ID ni topish"</b> tugmasini bosing.
          </div>

          <button
            type="button"
            onClick={handleSendTestTelegram}
            disabled={tgStatus.loading}
            className="px-6 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-sky-500/30 transition active:scale-95 whitespace-nowrap disabled:opacity-50"
          >
            🚀 Sinov Xabarini Yuborish
          </button>
        </div>
      </div>

      {/* 3-BLOK: ZAL STOLLARINI BOSHQARISH */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
        <div>
          <h3 className="text-lg font-black text-gray-900 dark:text-white">
            🪑 Zal Stollari va Kabinalar Boshqaruvi ({safeTables.length} ta)
          </h3>
          <p className="text-xs font-bold text-gray-500 mt-1">
            Ofitsiant va QR-Menyuda ko'rinadigan stollar yoki VIP-xonalar ro'yxati
          </p>
        </div>

        <form onSubmit={handleAddTable} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newTableName}
            onChange={e => setNewTableName(e.target.value)}
            placeholder="Yangi stol yoki xona nomi (Masalan: 16-Stol yoki VIP-1)"
            className="flex-1 p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-sm text-gray-900 dark:text-white outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            className="px-6 py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-sm shadow-md transition active:scale-95 whitespace-nowrap"
          >
            + Stol Qo'shish
          </button>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          {safeTables.map(tName => {
            const isBusy = activeTableNames.includes(tName);
            return (
              <div
                key={tName}
                className={`p-3 rounded-xl border flex justify-between items-center gap-2 ${
                  isBusy
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'
                    : 'bg-gray-50 dark:bg-gray-900/60 border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="truncate">
                  <span className="font-black text-xs sm:text-sm text-gray-800 dark:text-gray-200 block truncate">
                    {tName}
                  </span>
                  <span className="text-[10px] font-bold text-gray-400">
                    {isBusy ? '🔴 Band' : '🟢 Bo\'sh'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteTable(tName)}
                  className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-500 font-black text-xs flex items-center justify-center shrink-0 transition"
                  title="Stolni o'chirish"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4-BLOK: MA'LUMOTLAR BAZASI ZAXIRASI (BACKUP & RESTORE) */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 dark:border-gray-700 space-y-5">
        <div>
          <h3 className="text-lg font-black text-gray-900 dark:text-white">
            💾 Ma'lumotlar Bazasini Zaxiralash (Backup & Restore)
          </h3>
          <p className="text-xs font-bold text-gray-500 mt-1">
            Barcha menyu, ombor, xodimlar va cheklarni kompyuterga fayl qilib saqlab qo'ying yoki boshqa qurilmaga ko'chiring
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={handleExportBackup}
            className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 border-2 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-black text-sm flex items-center justify-center gap-3 transition active:scale-95"
          >
            <span className="text-2xl">📥</span>
            <div className="text-left">
              <span className="block">Zaxira Nusxa Yuklab Olish (.json)</span>
              <span className="text-[11px] font-bold opacity-75">Kompyuterga saqlash</span>
            </div>
          </button>

          <label className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 border-2 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-black text-sm flex items-center justify-center gap-3 cursor-pointer transition active:scale-95">
            <span className="text-2xl">📤</span>
            <div className="text-left">
              <span className="block">Zaxiradan Tiklash (Restore)</span>
              <span className="text-[11px] font-bold opacity-75">.json faylni tanlang</span>
            </div>
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* 5-BLOK: XAVFLI HUDUD (DANGER ZONE) */}
      <div className="bg-red-50/60 dark:bg-red-900/10 rounded-3xl p-6 md:p-8 border-2 border-red-200 dark:border-red-900/40 space-y-4">
        <div>
          <h3 className="text-lg font-black text-red-700 dark:text-red-400">
            ⚠️ Xavfli Hudud (Tizimni Tozalash)
          </h3>
          <p className="text-xs font-bold text-red-600/80 dark:text-red-300/80 mt-1">
            Ushbu amallar faqat Rahbar PIN-kodi bilan bajariladi. Ehtiyotkorlik bilan foydalaning!
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleClearOrdersOnly}
            className="flex-1 py-3.5 px-5 rounded-xl bg-white dark:bg-gray-800 hover:bg-red-100 text-red-600 border border-red-300 dark:border-red-800 font-black text-xs uppercase tracking-wider transition active:scale-95"
          >
            🧹 Faqat Cheklar Tarixini Tozalash
          </button>

          <button
            type="button"
            onClick={handleFactoryReset}
            className="flex-1 py-3.5 px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-red-600/20 transition active:scale-95"
          >
            🧨 Tizimni Zavod Holatiga Qaytarish
          </button>
        </div>
      </div>

    </div>
  );
}