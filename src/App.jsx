import React, { useState, useEffect, useCallback } from 'react';

// MAXSUS HOOK
import useSticky from './hooks/useSticky';
import { orderTotalsFields, getItemQty } from './utils/orderTotals';
import { ackNotices, appendKitchenItems, newKitchenLine, serveReadyLines } from './utils/kitchenFlow';

// KOMPONENTLAR
import LockScreen from './components/LockScreen';
import WaiterMode from './components/WaiterMode';
import CashierMode from './components/CashierMode';
import CustomerQRView from './components/CustomerQRView';
import KitchenMode from './components/KitchenMode';
import CourierMode from './components/CourierMode';
import AdminPanel from './components/AdminPanel';
import WarehouseMode from './components/WarehouseMode';
import ManagerOverrideModal from './components/ManagerOverrideModal';
import StatsMode from './components/StatsMode';
import PrintReceiptModal from './components/PrintReceiptModal';
import CustomerMode from './components/CustomerMode';
import AutoLockControl from './components/AutoLockControl';
import SyncStatusBadge from './components/SyncStatusBadge';
import QrRequestsPanel from './components/QrRequestsPanel';
import WaiterCallsPanel from './components/WaiterCallsPanel';
import KitchenNoticesPanel from './components/KitchenNoticesPanel';
import { callRpc } from './sync/engine';
import { notify } from './utils/notify';
import { CLOSED_ORDER_STATUSES, DELIVERY_STATUS, ORDER_STATUS, TAKEAWAY_TABLE, isDeliveryOrder } from './constants/orderStatus';
import { getRoleMeta, getUserTitle } from './constants/roles';
import { newId } from './utils/ids';
import { getUpdateResume, setUpdateSession } from './pwa/update';
import { checkPin, migrateUserPins, pinLengthOf } from './utils/pinHash';
import { isNetworkError } from './sync/timeouts';

const initialMenuItems = [
  { 
    id: 1, 
    name: "Osh (To'y oshi)", 
    category: 'Asosiy', 
    is_available: true, 
    variants: [
      { id: 'v1', name: '1 pors', price: 35000 },
      { id: 'v2', name: '0.7 pors', price: 28000 }
    ] 
  },
  { 
    id: 2, 
    name: 'Choy', 
    category: 'Ichimlik', 
    is_available: true, 
    variants: [
      { id: 'v3', name: 'Qora choy', price: 5000 },
      { id: 'v4', name: "Ko'k choy", price: 5000 },
      { id: 'v5', name: 'Limon choy', price: 12000 }
    ] 
  }
];

const initialCategories = ['Asosiy', 'Ichimlik', 'Shirinlik', 'Boshqalar'];
const initialTables = ['1-Stol', '2-Stol', '3-Stol', '4-Stol', '5-Stol', 'VIP-1', 'VIP-2', 'Olib ketish'];

// Birinchi ishga tushirish uchun. Admin kirgach almashtirishi kerak (ogohlantirish chiqadi).
const DEFAULT_ADMIN_PIN = '777777';

const initialUsers = [
  { id: 1, name: 'Admin', role: 'admin', pin: DEFAULT_ADMIN_PIN },
  { id: 2, name: 'Sardor', role: 'cashier', pin: '1111' },
  { id: 3, name: 'Ali', role: 'waiter', pin: '2222', canSeeSales: true },
  { id: 4, name: 'Oshpaz', role: 'kitchen', pin: '3333' },
  { id: 5, name: 'Omborchi', role: 'warehouse', pin: '444444' }
];

// Namuna PIN kodlar README'da ochiq yozilgan: ular bilan qolgan xodim haqida admin ogohlantiriladi.
// initialUsers dagi ochiq PIN'lar faqat birinchi ishga tushirish uchun: App ochilganda xeshga o'tadi.
const SAMPLE_PINS = [...new Set(initialUsers.map(u => u.pin))];

/** Namuna PIN bilan qolgan xodimlar (PIN xeshlangan: har bir xodim faqat o'z uzunligidagi namunalar bilan tekshiriladi) */
const findStaffWithSamplePin = (users) =>
  (Array.isArray(users) ? users : []).filter(u => {
    if (!u) return false;
    const len = pinLengthOf(u, 0);
    return SAMPLE_PINS.some(p => (!len || p.length === len) && checkPin(u, p));
  });

export default function App() {
  // ==========================================
  // 1. ASOSIY STATE'LAR (Baza - LocalStorage Sync)
  // ==========================================
  const [cafeName, setCafeName] = useSticky('pos_cafe_name', 'Premium Cafe');
  const [serviceFee, setServiceFee] = useSticky('pos_service_fee', 10);
  const [isDarkMode, setIsDarkMode] = useSticky('pos_theme', true); // yangi qurilmada to'q (restoran uslubi)
  const [tables, setTables] = useSticky('pos_tables', initialTables);
  const [orders, setOrders] = useSticky('pos_orders', []);
  const [waiterCalls, setWaiterCalls] = useSticky('pos_calls', []);
  const [menuItems, setMenuItems] = useSticky('pos_menu', initialMenuItems);
  const [menuCategories, setMenuCategories] = useSticky('pos_categories', initialCategories);
  const [users, setUsers] = useSticky('pos_users', initialUsers);
  const [inventory, setInventory] = useSticky('pos_inventory', []);
  const [inventoryLogs, setInventoryLogs] = useSticky('pos_inv_logs', []);
  const [expenses, setExpenses] = useSticky('pos_expenses', []);
  const [customers, setCustomers] = useSticky('pos_customers', []);
  const [qrRequests, setQrRequests] = useSticky('pos_qr_requests', []);
  
  // Xavfsizlik va Nazorat Statelari
  const [auditLogs, setAuditLogs] = useSticky('pos_audit_logs', []);
  const [isOverrideEnabled, setIsOverrideEnabled] = useSticky('pos_override_enabled', true);

  // Routing va Sessiya Statelari
  // Dastur yangilangach (sahifa o'zi qayta yuklanganda) xodim o'sha ekranga PIN'siz qaytadi: src/pwa/update.js
  const [updateResume] = useState(() => getUpdateResume(users));
  const [currentUser, setCurrentUser] = useState(updateResume ? updateResume.user : null);
  const [view, setView] = useState(updateResume ? 'app' : 'login'); // 'login' | 'app' | 'guest_qr'
  const [guestTable, setGuestTable] = useState('1-Stol'); 
  // Mijoz ekrani qachon ochildi: shundan oldin ochilgan chek - boshqa mijozniki (band stol)
  const [guestStartedAt, setGuestStartedAt] = useState(0);
  const [adminActiveView, setAdminActiveView] = useState(updateResume?.adminView || 'admin'); // 'admin' | 'stats' | 'warehouse' | 'waiter' | 'cashier' | 'kitchen' | 'courier'
  
  const [overrideRequest, setOverrideRequest] = useState(null); 
  // Namuna PIN tekshiruvi xeshlash bilan sekinroq: faqat admin uchun va ekranni to'xtatmasdan
  const [samplePinStaff, setSamplePinStaff] = useState([]);
  const isAdminSession = currentUser?.role === 'admin' && view === 'app';
  useEffect(() => {
    if (!isAdminSession) return undefined;
    const t = setTimeout(() => setSamplePinStaff(findStaffWithSamplePin(users)), 50);
    return () => clearTimeout(t);
  }, [isAdminSession, users]);
  const [receiptToPrint, setReceiptToPrint] = useState(null);

  // ==========================================
  // 2. AVTOMATIK XOTIRANI TUZATISH (SELF-HEALING)
  // ==========================================
  useEffect(() => {
    setUsers(prevUsers => {
      const safeUsers = Array.isArray(prevUsers) ? [...prevUsers] : [...initialUsers];
      let isUpdated = false;

      // 1. Agar xotirada Admin paroli 4 xonali (7777) bo'lib qolgan bo'lsa, 6 xonaliga (777777) o'zgartiramiz
      const adminIndex = safeUsers.findIndex(u => u.role === 'admin');
      if (adminIndex !== -1 && safeUsers[adminIndex].pin === '7777') {
        safeUsers[adminIndex] = { ...safeUsers[adminIndex], pin: DEFAULT_ADMIN_PIN };
        isUpdated = true;
      }

      // Omborchi o'chirilsa qayta qo'shilmaydi: avval u standart 444444 PIN bilan qaytib,
      // bulut orqali barcha qurilmalarga tarqalardi. Omborni admin ham ocha oladi.

      return isUpdated ? safeUsers : prevUsers;
    });
  }, [setUsers]);

  // PIN ochiq matnda saqlanmasin: eski ma'lumot (yoki eski versiyadagi qurilmadan kelgan xodim)
  // darhol xeshga o'tkaziladi va bulut orqali boshqa qurilmalarga ham tarqaladi (src/utils/pinHash.ts)
  useEffect(() => {
    const hasPlainPin = Array.isArray(users) &&
      users.some(u => u && (u.pin !== undefined || u.password !== undefined));
    if (hasPlainPin) setUsers(prev => migrateUserPins(Array.isArray(prev) ? prev : []));
  }, [users, setUsers]);

  // Yangi versiya chiqsa, kim ishlayotganini bilish uchun (yangilangach shu xodim o'z ekraniga qaytadi)
  useEffect(() => {
    setUpdateSession(currentUser && view === 'app'
      ? { userId: currentUser.id, role: currentUser.role, adminView: adminActiveView }
      : null);
  }, [currentUser, view, adminActiveView]);

  // Tungi rejim (Dark Mode) klassini HTML body'ga ulash
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // ==========================================
  // 3. GLOBAL XAVFSIZLIK VA AUDIT FUNKSIYALARI
  // ==========================================
  const addAuditLog = useCallback((action, details, specificUser = null) => {
    setAuditLogs(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const userToLog = specificUser || currentUser;
      return [
        {
          id: `${Date.now()}_${Math.random()}`,
          date: new Date().toLocaleString(),
          action,
          details,
          userName: userToLog?.name || "Noma'lum",
          role: userToLog?.role || 'guest'
        },
        ...safePrev
      ];
    });
  }, [currentUser, setAuditLogs]);

  const requireAdminOverride = (actionName, onSuccessCallback) => {
    const normalizedAction = typeof actionName === 'function' ? 'Tasdiqlangan amal' : actionName;
    const normalizedCallback = typeof actionName === 'function' ? actionName : onSuccessCallback;

    if (!isOverrideEnabled || currentUser?.role === 'admin') {
      if (!isOverrideEnabled) {
        addAuditLog("Avtomat Ruxsat (Himoya O'chiq)", normalizedAction);
      } else {
        addAuditLog("Admin Ruxsati Avtomat", normalizedAction);
      }
      if (typeof normalizedCallback === 'function') {
        normalizedCallback();
      }
    } else {
      setOverrideRequest({
        actionName: normalizedAction,
        onSuccess: (adminUser) => {
          addAuditLog(
            "Admin Ruxsat Berdi", 
            `${normalizedAction} (Ruxsat beruvchi: ${adminUser?.name || 'Admin'})`, 
            adminUser
          );
          setOverrideRequest(null);
          if (typeof normalizedCallback === 'function') {
            normalizedCallback();
          }
        }
      });
    }
  };

  // ==========================================
  // 4. KIRISH VA CHIQISH (AUTH & QR MENU)
  // ==========================================
  const handleLogin = (user) => {
    setCurrentUser(user);
    if (user.role === 'admin') {
      setAdminActiveView('admin');
    }
    setView('app');
    addAuditLog("Tizimga kirish", `${user.name} (${user.role}) tizimga kirdi`, user);
  };

  const handleLogout = () => {
    if (currentUser) {
      addAuditLog("Tizimdan chiqish", `${currentUser.name} tizimdan chiqdi`);
    }
    setCurrentUser(null);
    setView('login');
  };

  // Stolda to'lanmagan chek bormi (stol band). "Olib ketish" band bo'lmaydi: har buyurtma alohida chek
  const findOpenTableOrder = (tableName) =>
    tableName === TAKEAWAY_TABLE
      ? null
      : (Array.isArray(orders) ? orders : []).find(
        o => o && o.table === tableName && !CLOSED_ORDER_STATUSES.includes(o.status)
      ) || null;

  // LockScreen dagi "Bo'sh stollar ro'yxati" modalidan tanlangan stolni ochish.
  // Mijoz ekranida faqat BO'SH stol ochiladi: band stolga (boshqa mijozning chekiga) faqat
  // o'sha stoldagi QR kodni telefon bilan skaner qilib buyurtma beriladi.
  const handleGuestLogin = (selectedTableName) => {
    const targetTable = typeof selectedTableName === 'string' && selectedTableName.trim() !== ''
      ? selectedTableName
      : '1-Stol';
    if (findOpenTableOrder(targetTable)) {
      notify(`🔒 ${targetTable} band. Shu stolda o'tirgan bo'lsangiz, stoldagi QR kodni telefoningiz bilan skaner qiling.`, 'error');
      return;
    }
    setGuestTable(targetTable);
    setGuestStartedAt(Date.now());
    setView('guest_qr');
  };

  // Ofitsiant ekranidan QR kod tugmasi bosilganda
  const handleShowQrTable = (tableName) => {
    setGuestTable(tableName || '1-Stol');
    setGuestStartedAt(Date.now());
    setView('guest_qr');
  };

  // Mijoz ekranidan buyurtma: stol shu ekran ochilgandan keyin boshqa mijozga band bo'lib qolgan
  // bo'lsa, buyurtma o'tmaydi (o'zi ochgan chekka qo'shimcha buyurtma bera oladi)
  const handleGuestOrderSubmit = (cartItems, tbl) => {
    const targetTable = tbl || guestTable;
    const openOrder = findOpenTableOrder(targetTable);
    if (openOrder && Number(openOrder.createdAt || 0) < guestStartedAt) {
      return {
        ok: false,
        error: `${targetTable} band. Shu stolda o'tirgan bo'lsangiz, stoldagi QR kodni telefoningiz bilan skaner qiling yoki ofitsiantni chaqiring.`
      };
    }
    handleOrderSubmit(targetTable, cartItems);
    return { ok: true };
  };

  // ==========================================
  // 5. BUYURTMALAR (QR-menyu uchun)
  // ==========================================
  // Ombor bu yerda AYIRILMAYDI: yagona joy - kassada to'lov (CashierMode). (B1)
  // Ofitsiant buyurtmalari WaiterMode.handleSubmitOrder orqali yoziladi.
  // Qaytaradi: taom qo'shilgan chekning id si (yangi yoki dozakaz), bo'sh savatda null
  const handleOrderSubmit = (arg1, arg2) => {
    let targetTable = guestTable || '1-Stol';
    let incomingItems = [];

    if (Array.isArray(arg1)) {
      incomingItems = arg1;
      if (typeof arg2 === 'string' && arg2.trim() !== '') {
        targetTable = arg2;
      }
    } else if (typeof arg1 === 'string') {
      targetTable = arg1;
      incomingItems = Array.isArray(arg2) ? arg2 : [];
    } else if (arg1 && typeof arg1 === 'object' && Array.isArray(arg1.items)) {
      targetTable = arg1.table || targetTable;
      incomingItems = arg1.items;
    }

    const nowMs = Date.now();
    // Oshxonaga ketadigan qatorlar (taom darajasidagi holat bilan: src/utils/kitchenFlow.ts)
    const normalizedItems = incomingItems
      .filter(item => item && typeof item === 'object')
      .map(item => newKitchenLine(item, getItemQty(item) || 1, nowMs));
    if (normalizedItems.length === 0) return null;

    const nowTime = new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let targetOrderId = null; // useSticky yangilanishni darhol (sinxron) bajaradi

    setOrders(prevOrders => {
      const safeOrders = Array.isArray(prevOrders) ? prevOrders : [];

      const existingOrderIndex = safeOrders.findIndex(
        o => o && o.table === targetTable && !CLOSED_ORDER_STATUSES.includes(o.status)
      );

      if (existingOrderIndex !== -1 && targetTable !== 'Olib ketish') {
        const updatedOrders = [...safeOrders];
        const existingOrder = updatedOrders[existingOrderIndex];
        targetOrderId = existingOrder.id;
        // Dozakaz (B3): eski taomlar qayta pishirilmaydi, oshxona faqat yangi porsiyalarni ko'radi;
        // tayyor/berilgan belgilar saqlanadi, chek oshxonadan o'tgan bo'lsa yana 'Yangi' bo'ladi
        updatedOrders[existingOrderIndex] = {
          ...appendKitchenItems(
            { ...existingOrder, serviceFee: existingOrder.serviceFee ?? serviceFee },
            normalizedItems,
            nowMs
          ),
          updatedAt: nowTime
        };

        return updatedOrders;
      }

      const newOrder = {
        id: newId(),
        createdAt: nowMs,
        table: targetTable,
        waiter: currentUser?.name || 'QR-Menyu (Mijoz)',
        items: normalizedItems,
        status: ORDER_STATUS.NEW,
        time: nowTime,
        date: new Date(nowMs).toLocaleDateString()
      };
      targetOrderId = newOrder.id;

      return [{ ...newOrder, ...orderTotalsFields(newOrder, normalizedItems, serviceFee) }, ...safeOrders];
    });

    addAuditLog(
      "Buyurtma yaratildi",
      `${targetTable}: ${normalizedItems.map(it => `${it.quantity}× ${it.name || 'Taom'}`).join(', ')}`
    );
    return targetOrderId;
  };

  // ==========================================
  // 6. MIJOZ TELEFONIDAN QR-BUYURTMA SO'ROVLARI (supabase/qr.sql)
  // ==========================================
  // So'rov serverda atomik tarzda "olinadi": ikki xodim bir vaqtda bossa, buyurtma ikki marta tushmaydi
  const handleQrRequest = async (req, status) => {
    if (!req || req.status !== 'pending') return;
    let res;
    try {
      res = await callRpc('qr_claim_request', { p_id: req.id, p_status: status, p_by: currentUser?.name || '' });
    } catch (e) {
      notify(isNetworkError(e)
        ? "📴 Internet yo'q yoki juda sekin: QR-buyurtmani qabul qilish uchun internet kerak. Birozdan keyin qayta bosing."
        : `❌ So'rovni qayta ishlab bo'lmadi: ${e.message}`);
      return;
    }
    if (!res?.ok) {
      notify("⚠️ Bu so'rovni boshqa xodim allaqachon ko'rib chiqqan");
      return;
    }
    const handledAt = Date.now();
    // Qabul qilinsa, so'rovga chek id si yoziladi: mijoz telefoni chek holatini (tayyor, to'landi)
    // shu bo'yicha ko'radi (supabase/qr.sql -> qr_request_status). Chek to'langach telefondagi
    // "Buyurtmalarim" dan o'chadi.
    const orderId = status === 'accepted'
      ? handleOrderSubmit(req.table, Array.isArray(req.items) ? req.items : [])
      : null;

    // Bajarilgan eski so'rovlarni ro'yxatdan tozalaymiz (1 kundan eski)
    setQrRequests(prev => (Array.isArray(prev) ? prev : [])
      .map(r => (r && r.id === req.id
        ? { ...r, status, handledBy: currentUser?.name || '', handledAt, ...(orderId ? { orderId: String(orderId) } : {}) }
        : r))
      .filter(r => r && (r.status === 'pending' || handledAt - Number(r.createdAt || handledAt) < 86400000)));

    if (status === 'accepted') {
      notify(`✅ ${req.table}: QR-buyurtma oshxonaga yuborildi`);
    } else {
      addAuditLog("QR-buyurtma rad etildi", `${req.table}: ${(req.items || []).length} xil taom`);
    }
  };

  // ==========================================
  // 7. OFITSIANT CHAQIRUVI (BELL / QO'NG'IROQCHA)
  // ==========================================
  const handleCallWaiter = (tableNameFromChild) => {
    const targetTable = typeof tableNameFromChild === 'string' && tableNameFromChild.trim() !== ''
      ? tableNameFromChild
      : (guestTable || '1-Stol');

    setWaiterCalls(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const alreadyExists = safePrev.some(
        c => (typeof c === 'object' ? c.table === targetTable : c === targetTable)
      );
      if (alreadyExists) return safePrev;

      return [
        ...safePrev,
        {
          id: newId('call_'),
          table: targetTable,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          createdAt: Date.now()
        }
      ];
    });
  };

  // Chaqiruvga javob berildi: shu stolning barcha chaqiruvlari (telefondan va eski usuldagi
  // buyurtma belgisi hasCall) o'chadi, bulut orqali boshqa xodimlar ekranidan ham
  const handleClearCall = (callIdOrTable) => {
    const safeCalls = Array.isArray(waiterCalls) ? waiterCalls : [];
    const matched = safeCalls.find(c => c?.id === callIdOrTable);
    const tableName = matched ? matched.table : callIdOrTable;

    setWaiterCalls(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      const next = safePrev.filter(
        c => c?.id !== callIdOrTable && c?.table !== tableName && c !== tableName
      );
      return next.length === safePrev.length ? safePrev : next;
    });

    if ((Array.isArray(orders) ? orders : []).some(o => o && o.table === tableName && o.hasCall)) {
      setOrders(prev => (Array.isArray(prev) ? prev : []).map(o =>
        o && o.table === tableName && o.hasCall ? { ...o, hasCall: false } : o
      ));
    }
  };

  // Oshxona xabari (rad etilgan taom yoki to'langan chek tayyor) ko'rildi: barcha qurilmalarda yopiladi
  const handleAckKitchenNotice = (notice) => {
    if (!notice?.orderId) return;
    const by = currentUser?.name || '';
    const now = Date.now();
    setOrders(prev => (Array.isArray(prev) ? prev : []).map(o => {
      if (!o || String(o.id) !== String(notice.orderId)) return o;
      if (notice.kind === 'ready') return ackNotices(serveReadyLines(o, now).order, 'ready', by, now);
      return ackNotices(o, 'rejections', by, now);
    }));
  };

  // ==========================================
  // 8. EKRANLARNI YO'NALTIRISH (ROUTING)
  // ==========================================

  // A) MIJOZ QR-MENYU REJIMI
  if (view === 'guest_qr') {
    return (
      <CustomerQRView
        cafeName={cafeName}
        table={guestTable}
        menuItems={menuItems}
        menuCategories={menuCategories}
        orders={orders}
        serviceFee={serviceFee}
        isDarkMode={isDarkMode}
        onSubmitOrder={handleGuestOrderSubmit}
        onCallWaiter={(tbl) => handleCallWaiter(tbl || guestTable)}
        onExitGuest={() => setView('login')}
      />
    );
  }

  // B) QULF EKRANI (LOGIN REJIMI)
  if (view === 'login' || !currentUser) {
    return (
      <LockScreen
        cafeName={cafeName}
        users={users}
        tables={tables}
        orders={orders}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        onLogin={handleLogin}
        onAudit={addAuditLog}
        onGuestLogin={handleGuestLogin}
        onOpenQrMenu={handleGuestLogin}
      />
    );
  }

  // C) ASOSIY ISHCHI DASTUR REJIMI
  const currentActiveView = currentUser.role === 'admin' ? adminActiveView : currentUser.role;
  const staffWithSamplePin = currentUser.role === 'admin' ? samplePinStaff : [];
  // Kuryer biriktirilmagan yetkazish buyurtmalari (admin menyusidagi belgi)
  const unassignedDeliveries = (Array.isArray(orders) ? orders : []).filter(
    o => o && isDeliveryOrder(o) && !CLOSED_ORDER_STATUSES.includes(o.status) &&
      !o.delivery?.courier && (o.delivery?.status || DELIVERY_STATUS.WAITING) === DELIVERY_STATUS.WAITING
  ).length;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDarkMode ? 'dark bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'
    }`}>
      
      {/* --- GLOBAL TOP NAVBAR --- */}
      <header className="bg-white/85 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700/70 px-4 md:px-6 py-3 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center text-xl font-black shadow-lg shadow-brand-900/40">
            🍽️
          </div>
          <div>
            <h1 className="font-bold tracking-tight text-lg sm:text-xl text-gray-900 dark:text-white leading-tight">
              {cafeName}
            </h1>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {currentUser.name} • <span className="uppercase font-bold tracking-wide text-brand-600 dark:text-brand-500">{getRoleMeta(currentUser.role).icon} {getUserTitle(currentUser)}</span>
            </p>
          </div>
        </div>

        {/* Admin uchun barcha ekranlarni ko'rish va boshqarish tablari */}
        {currentUser.role === 'admin' && (
          <nav className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700/70 p-1 rounded-full overflow-x-auto hide-scrollbar">
            {[
              { id: 'admin', label: '⚙️ Boshqaruv' },
              { id: 'stats', label: '📊 Statistika' },
              { id: 'warehouse', label: '📦 Ombor' },
              { id: 'waiter', label: `📝 Ofitsiant ${waiterCalls.length > 0 ? `(${waiterCalls.length})` : ''}` },
              { id: 'cashier', label: '💰 Kassa' },
              { id: 'kitchen', label: '👨‍🍳 Oshxona' },
              { id: 'courier', label: `🛵 Kuryer ${unassignedDeliveries > 0 ? `(${unassignedDeliveries})` : ''}` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setAdminActiveView(tab.id)}
                className={`px-4 py-2 rounded-full font-semibold text-xs whitespace-nowrap transition-all duration-300 active:scale-95 ${
                  adminActiveView === tab.id
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/40'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white dark:hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        {/* O'ng taraf: Avto-Qulf sozlamasi (Telefon/Kompyuter uslubida), Tungi rejim va Chiqish */}
        <div className="flex items-center gap-2">
          <SyncStatusBadge />

          <AutoLockControl
            currentUser={currentUser}
            users={users}
            cafeName={cafeName}
            onSwitchUser={handleLogin}
            onLogout={handleLogout}
            onAudit={addAuditLog}
          />

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-brand-500 flex items-center justify-center text-lg transition active:scale-90"
            title="Tungi / Kunduzgi rejim"
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>

          <button
            onClick={handleLogout}
            className="bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 font-semibold px-4 py-2 rounded-full text-xs sm:text-sm transition active:scale-95"
          >
            Chiqish 🔒
          </button>
        </div>
      </header>

      {/* --- ASOSIY ISHCHI MODULLAR --- */}
      <main className="p-3 md:p-5 max-w-[1600px] mx-auto">

        {/* Mijoz chaqiruvlari va telefondan kelgan QR-buyurtmalar (ofitsiant, kassir, admin) */}
        {['admin', 'waiter', 'cashier'].includes(currentUser.role) && (
          <>
            <WaiterCallsPanel
              waiterCalls={waiterCalls}
              orders={orders}
              onClear={handleClearCall}
            />
            <KitchenNoticesPanel
              orders={orders}
              onAck={handleAckKitchenNotice}
            />
            <QrRequestsPanel
              requests={qrRequests}
              orders={orders}
              onAccept={(req) => handleQrRequest(req, 'accepted')}
              onReject={(req) => handleQrRequest(req, 'rejected')}
            />
          </>
        )}

        {/* Namuna PIN (777777, 1111, ...) hali almashtirilmagan bo'lsa ogohlantirish (B6) */}
        {staffWithSamplePin.length > 0 && (
          <div className="mb-4 px-4 py-3 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 text-xs sm:text-sm font-semibold break-words">
            ⚠️ Namuna PIN kod bilan qolgan xodimlar: {staffWithSamplePin.map(u => String(u.name || '—')).join(', ')}.
            {' '}Boshqaruv → "Xodimlar va Parollar" bo'limida PIN kodlarni almashtiring yoki keraksiz xodimni o'chiring.
          </div>
        )}
        
        {/* 1. OFITSIANT TERMINALI */}
        {currentActiveView === 'waiter' && (
          <WaiterMode
            menuItems={menuItems}
            menuCategories={menuCategories}
            tables={tables}
            orders={orders}
            setOrders={setOrders}
            cafeName={cafeName}
            onShowQrTable={handleShowQrTable}
            onPrintReceipt={(orderObj) => setReceiptToPrint(orderObj)}
            waiterCalls={waiterCalls}
            onClearCall={handleClearCall}
            currentUser={currentUser}
            waiterCanSeeSales={currentUser.role === 'admin' || currentUser.canSeeSales}
            serviceFee={serviceFee}
            inventory={inventory}
            requireAdminOverride={requireAdminOverride}
            addAuditLog={addAuditLog}
          />
        )}

        {/* 2. KASSA TERMINALI */}
        {currentActiveView === 'cashier' && (
          <CashierMode
            orders={orders}
            setOrders={setOrders}
            tables={tables}
            menuItems={menuItems}
            inventory={inventory}
            setInventory={setInventory}
            inventoryLogs={inventoryLogs}
            setInventoryLogs={setInventoryLogs}
            expenses={expenses}
            setExpenses={setExpenses}
            customers={customers}
            setCustomers={setCustomers}
            cafeName={cafeName}
            serviceFee={serviceFee}
            currentUser={currentUser}
            onPrintReceipt={(orderObj) => setReceiptToPrint(orderObj)}
            setReceiptToPrint={setReceiptToPrint}
            requireAdminOverride={requireAdminOverride}
            addAuditLog={addAuditLog}
          />
        )}

        {/* 3. OSHXONA EKRANI (KDS) */}
        {currentActiveView === 'kitchen' && (
          <KitchenMode
            orders={orders}
            setOrders={setOrders}
            menuItems={menuItems}
            setMenuItems={setMenuItems}
            menuCategories={menuCategories}
            currentUser={currentUser}
            addAuditLog={addAuditLog}
          />
        )}

        {/* 3.1 YETKAZIB BERISH (KURYER) */}
        {currentActiveView === 'courier' && (
          <CourierMode
            orders={orders}
            setOrders={setOrders}
            users={users}
            currentUser={currentUser}
            addAuditLog={addAuditLog}
          />
        )}

        {/* 4. OMBORXONA BO'LIMI */}
        {currentActiveView === 'warehouse' && (
          <WarehouseMode
            inventory={inventory}
            setInventory={setInventory}
            inventoryLogs={inventoryLogs}
            setInventoryLogs={setInventoryLogs}
            menuItems={menuItems}
            setMenuItems={setMenuItems}
            currentUser={currentUser}
            requireAdminOverride={requireAdminOverride}
            addAuditLog={addAuditLog}
          />
        )}

        {/* 5. STATISTIKA VA ANALITIKA */}
        {currentActiveView === 'stats' && (
          <StatsMode
            orders={orders}
            setOrders={setOrders}
            menuItems={menuItems}
            users={users}
            inventory={inventory}
            inventoryLogs={inventoryLogs}
            expenses={expenses}
            setExpenses={setExpenses}
            serviceFee={serviceFee}
            currentUser={currentUser}
            auditLogs={auditLogs}
            setAuditLogs={setAuditLogs}
            addAuditLog={addAuditLog}
          />
        )}

        {/* 6. ADMIN BOSHQARUV PANELI */}
        {currentActiveView === 'admin' && (
          <AdminPanel
            cafeName={cafeName}
            setCafeName={setCafeName}
            serviceFee={serviceFee}
            setServiceFee={setServiceFee}
            menuItems={menuItems}
            setMenuItems={setMenuItems}
            menuCategories={menuCategories}
            setMenuCategories={setMenuCategories}
            users={users}
            setUsers={setUsers}
            orders={orders}
            setOrders={setOrders}
            tables={tables}
            setTables={setTables}
            inventory={inventory}
            setInventory={setInventory}
            inventoryLogs={inventoryLogs}
            setInventoryLogs={setInventoryLogs}
            auditLogs={auditLogs}
            setAuditLogs={setAuditLogs}
            isOverrideEnabled={isOverrideEnabled}
            setIsOverrideEnabled={setIsOverrideEnabled}
            currentUser={currentUser}
            requireAdminOverride={requireAdminOverride}
            addAuditLog={addAuditLog}
          />
        )}

        {/* Zaxira: CustomerMode */}
        {currentActiveView === 'customer' && (
          <CustomerMode
            cafeName={cafeName}
            table={guestTable}
            tableNumber={guestTable}
            menuItems={menuItems}
            menuCategories={menuCategories}
            orders={orders}
            serviceFee={serviceFee}
            isDarkMode={isDarkMode}
            onSubmitOrder={(cartItems, tbl) => handleOrderSubmit(tbl || guestTable, cartItems)}
            onCallWaiter={(tbl) => handleCallWaiter(tbl || guestTable)}
            onExitGuest={() => setView('login')}
          />
        )}

      </main>

      {/* --- GLOBAL MODALLAR --- */}
      {overrideRequest && (
        <ManagerOverrideModal
          request={overrideRequest}
          actionName={overrideRequest.actionName}
          users={users}
          onSuccess={overrideRequest.onSuccess}
          onCancel={() => setOverrideRequest(null)}
          onClose={() => setOverrideRequest(null)}
          onAudit={addAuditLog}
        />
      )}

      {receiptToPrint && (
        <PrintReceiptModal
          order={receiptToPrint}
          receipt={receiptToPrint}
          receiptData={receiptToPrint}
          cafeName={cafeName}
          serviceFee={serviceFee}
          onClose={() => setReceiptToPrint(null)}
        />
      )}

    </div>
  );
}