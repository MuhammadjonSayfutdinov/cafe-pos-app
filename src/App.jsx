import React, { useState, useEffect, useCallback } from 'react';

// MAXSUS HOOK
import useSticky from './hooks/useSticky';

// KOMPONENTLAR
import LockScreen from './components/LockScreen';
import WaiterMode from './components/WaiterMode';
import CashierMode from './components/CashierMode';
import CustomerQRView from './components/CustomerQRView';
import KitchenMode from './components/KitchenMode';
import AdminPanel from './components/AdminPanel';
import WarehouseMode from './components/WarehouseMode';
import ManagerOverrideModal from './components/ManagerOverrideModal';
import StatsMode from './components/StatsMode';
import PrintReceiptModal from './components/PrintReceiptModal';
import CustomerMode from './components/CustomerMode';
import AutoLockControl from './components/AutoLockControl';

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

const initialUsers = [
  { id: 1, name: 'Admin', role: 'admin', pin: '777777' },
  { id: 2, name: 'Sardor', role: 'cashier', pin: '1111' },
  { id: 3, name: 'Ali', role: 'waiter', pin: '2222', canSeeSales: true },
  { id: 4, name: 'Oshpaz', role: 'kitchen', pin: '3333' },
  { id: 5, name: 'Omborchi', role: 'warehouse', pin: '444444' }
];

export default function App() {
  // ==========================================
  // 1. ASOSIY STATE'LAR (Baza - LocalStorage Sync)
  // ==========================================
  const [cafeName, setCafeName] = useSticky('pos_cafe_name', 'Premium Cafe');
  const [serviceFee, setServiceFee] = useSticky('pos_service_fee', 10);
  const [isDarkMode, setIsDarkMode] = useSticky('pos_theme', false);
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
  
  // Xavfsizlik va Nazorat Statelari
  const [auditLogs, setAuditLogs] = useSticky('pos_audit_logs', []);
  const [isOverrideEnabled, setIsOverrideEnabled] = useSticky('pos_override_enabled', true);

  // Routing va Sessiya Statelari
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState('login'); // 'login' | 'app' | 'guest_qr'
  const [guestTable, setGuestTable] = useState('1-Stol'); 
  const [adminActiveView, setAdminActiveView] = useState('admin'); // 'admin' | 'stats' | 'warehouse' | 'waiter' | 'cashier' | 'kitchen'
  
  const [overrideRequest, setOverrideRequest] = useState(null); 
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
        safeUsers[adminIndex] = { ...safeUsers[adminIndex], pin: '777777' };
        isUpdated = true;
      }

      // 2. Agar xotirada Omborchi yo'qolib qolgan bo'lsa, uni qayta qo'shamiz
      const hasWarehouse = safeUsers.some(u => u.role === 'warehouse');
      if (!hasWarehouse) {
        const warehouseUser = initialUsers.find(u => u.role === 'warehouse');
        if (warehouseUser) {
          safeUsers.push(warehouseUser);
          isUpdated = true;
        }
      }

      return isUpdated ? safeUsers : prevUsers;
    });
  }, [setUsers]);

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

  // LockScreen dagi "Bo'sh stollar ro'yxati" modalidan tanlangan stolni ochish
  const handleGuestLogin = (selectedTableName) => {
    const targetTable = typeof selectedTableName === 'string' && selectedTableName.trim() !== ''
      ? selectedTableName
      : '1-Stol';
    setGuestTable(targetTable);
    setView('guest_qr');
  };

  // Ofitsiant ekranidan QR kod tugmasi bosilganda
  const handleShowQrTable = (tableName) => {
    setGuestTable(tableName || '1-Stol');
    setView('guest_qr');
  };

  // ==========================================
  // 5. BUYURTMALAR VA OMBOR MANTIG'I
  // ==========================================
  const deductInventoryForItems = (cartItems, tableLabel) => {
    if (!Array.isArray(inventory) || inventory.length === 0) return;

    let invUpdated = false;
    const newInventory = [...inventory];
    const newLogs = [];

    cartItems.forEach(orderItem => {
      const menuObj = menuItems.find(m => m.id === orderItem.id || m.name === orderItem.baseName || m.name === orderItem.name);
      const recipe = menuObj?.recipe || menuObj?.ingredients;

      if (Array.isArray(recipe) && recipe.length > 0) {
        const itemQty = Number(orderItem.quantity || orderItem.qty || 1);
        recipe.forEach(ing => {
          const invIdx = newInventory.findIndex(
            i => String(i.id) === String(ing.inventoryId ?? ing.productId ?? ing.id) || i.name === ing.name
          );
          if (invIdx !== -1) {
            const deductAmount = Number(ing.qty ?? ing.amount ?? ing.quantity ?? 0) * itemQty;
            newInventory[invIdx] = {
              ...newInventory[invIdx],
              quantity: Math.max(0, Number(newInventory[invIdx].quantity || 0) - deductAmount)
            };
            invUpdated = true;
            newLogs.push({
              id: `${Date.now()}_${Math.random()}`,
              date: new Date().toLocaleString(),
              itemName: newInventory[invIdx].name,
              productName: newInventory[invIdx].name,
              type: 'chiqim_avto',
              diffAmount: `-${deductAmount}`,
              amount: deductAmount,
              unit: newInventory[invIdx].unit || 'dona',
              note: `Sotuv (${tableLabel}: ${orderItem.name} x${itemQty})`,
              reason: `Sotuv (${tableLabel}: ${orderItem.name} x${itemQty})`,
              user: currentUser?.name || 'QR-Mijoz'
            });
          }
        });
      }
    });

    if (invUpdated) {
      setInventory(newInventory);
      if (newLogs.length > 0) {
        setInventoryLogs(prev => [...newLogs, ...(Array.isArray(prev) ? prev : [])]);
      }
    }
  };

  // Universal Buyurtma Qabul Qilish (Ham WaiterMode, ham CustomerQRView uchun)
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

    if (incomingItems.length === 0) return;

    const normalizedItems = incomingItems.map(item => {
      const q = Number(item.quantity ?? item.qty ?? 1) || 1;
      return {
        ...item,
        cartItemId: item.cartItemId || `${Date.now()}_${Math.random()}`,
        price: Number(item.price ?? item.variants?.[0]?.price ?? 0),
        quantity: q,
        qty: q,
        sentQty: q
      };
    });

    deductInventoryForItems(normalizedItems, targetTable);

    setOrders(prevOrders => {
      const safeOrders = Array.isArray(prevOrders) ? prevOrders : [];
      
      const existingOrderIndex = safeOrders.findIndex(
        o => o && o.table === targetTable && !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)
      );

      if (existingOrderIndex !== -1 && targetTable !== 'Olib ketish') {
        const updatedOrders = [...safeOrders];
        const existingOrder = updatedOrders[existingOrderIndex];
        const combinedItems = [...(existingOrder.items || []), ...normalizedItems];

        const newSubtotal = combinedItems.reduce(
          (sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || it.qty || 1)),
          0
        );
        const newServiceFeeAmount = Math.round((newSubtotal * serviceFee) / 100);
        const newTotal = newSubtotal + newServiceFeeAmount;

        updatedOrders[existingOrderIndex] = {
          ...existingOrder,
          items: combinedItems,
          subTotal: newSubtotal,
          subtotal: newSubtotal,
          serviceFeeAmount: newServiceFeeAmount,
          total: newTotal,
          finalTotal: newTotal,
          status: 'Yangi',
          updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        return updatedOrders;
      }

      const subtotal = normalizedItems.reduce(
        (sum, it) => sum + (Number(it.price || 0) * Number(it.quantity || it.qty || 1)),
        0
      );
      const isTakeaway = targetTable === 'Olib ketish';
      const serviceFeeAmount = isTakeaway ? 0 : Math.round((subtotal * serviceFee) / 100);
      const total = subtotal + serviceFeeAmount;

      const newOrder = {
        id: Date.now().toString(),
        createdAt: Date.now(),
        table: targetTable,
        waiter: currentUser?.name || 'QR-Menyu (Mijoz)',
        waiterName: currentUser?.name || 'QR-Menyu (Mijoz)',
        items: normalizedItems,
        subTotal: subtotal,
        subtotal,
        serviceFee: isTakeaway ? 0 : serviceFee,
        serviceFeePercent: isTakeaway ? 0 : serviceFee,
        serviceFeeAmount,
        total,
        finalTotal: total,
        status: 'Yangi',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString()
      };

      return [newOrder, ...safeOrders];
    });

    addAuditLog("Buyurtma yaratildi", `${targetTable} uchun ${normalizedItems.length} xil taom qo'shildi`);
  };

  // Buyurtma statusini yangilash
  const handleUpdateStatus = (orderId, newStatus, extraData = {}) => {
    setOrders(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      return safePrev.map(o => {
        if (String(o.id) === String(orderId)) {
          return {
            ...o,
            ...extraData,
            status: newStatus,
            updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
        }
        return o;
      });
    });
    addAuditLog("Status o'zgardi", `Buyurtma #${String(orderId).slice(-4)} -> ${newStatus}`);
  };

  // ==========================================
  // 6. STOLNI KO'CHIRISH VA CHEKNI BO'LISH
  // ==========================================
  const handleTransferTable = (fromTable, toTable) => {
    if (!fromTable || !toTable || fromTable === toTable) return;

    setOrders(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      return safePrev.map(o => {
        if (o.table === fromTable && !["To'langan", 'Qarz', 'Arxiv'].includes(o.status)) {
          return { ...o, table: toTable };
        }
        return o;
      });
    });

    addAuditLog("Stol ko'chirildi", `${fromTable} -> ${toTable}`);
  };

  const handleSplitOrder = (orderId, itemsToMove, targetTable) => {
    if (!orderId || !Array.isArray(itemsToMove) || itemsToMove.length === 0 || !targetTable) return;

    setOrders(prev => {
      const safePrev = Array.isArray(prev) ? [...prev] : [];
      const sourceIndex = safePrev.findIndex(o => String(o.id) === String(orderId));
      if (sourceIndex === -1) return safePrev;

      const sourceOrder = safePrev[sourceIndex];
      const movedIds = new Set(itemsToMove.map(i => i.cartItemId || i.id));
      const remainingItems = (sourceOrder.items || []).filter(
        i => !movedIds.has(i.cartItemId || i.id)
      );

      const remSubtotal = remainingItems.reduce(
        (s, it) => s + (Number(it.price || 0) * Number(it.quantity || it.qty || 1)),
        0
      );
      const remService = Math.round((remSubtotal * serviceFee) / 100);

      safePrev[sourceIndex] = {
        ...sourceOrder,
        items: remainingItems,
        subTotal: remSubtotal,
        subtotal: remSubtotal,
        serviceFeeAmount: remService,
        total: remSubtotal + remService,
        finalTotal: remSubtotal + remService
      };

      const moveSubtotal = itemsToMove.reduce(
        (s, it) => s + (Number(it.price || 0) * Number(it.quantity || it.qty || 1)),
        0
      );
      const moveService = Math.round((moveSubtotal * serviceFee) / 100);

      const newSplitOrder = {
        id: Date.now().toString(),
        createdAt: Date.now(),
        table: targetTable,
        waiter: sourceOrder.waiter,
        waiterName: sourceOrder.waiterName || sourceOrder.waiter,
        items: itemsToMove,
        subTotal: moveSubtotal,
        subtotal: moveSubtotal,
        serviceFee,
        serviceFeePercent: serviceFee,
        serviceFeeAmount: moveService,
        total: moveSubtotal + moveService,
        finalTotal: moveSubtotal + moveService,
        status: sourceOrder.status,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString()
      };

      return [newSplitOrder, ...safePrev];
    });

    addAuditLog("Chek bo'lindi", `Buyurtma #${String(orderId).slice(-4)} dan ${targetTable} ga bo'lindi`);
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
          id: Date.now(),
          table: targetTable,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ];
    });
  };

  const handleClearCall = (callIdOrTable) => {
    setWaiterCalls(prev => {
      const safePrev = Array.isArray(prev) ? prev : [];
      return safePrev.filter(
        c => c?.id !== callIdOrTable && c?.table !== callIdOrTable && c !== callIdOrTable
      );
    });
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
        onSubmitOrder={(cartItems, tbl) => handleOrderSubmit(tbl || guestTable, cartItems)}
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
        onGuestLogin={handleGuestLogin}
        onOpenQrMenu={handleGuestLogin}
      />
    );
  }

  // C) ASOSIY ISHCHI DASTUR REJIMI
  const currentActiveView = currentUser.role === 'admin' ? adminActiveView : currentUser.role;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      isDarkMode ? 'dark bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'
    }`}>
      
      {/* --- GLOBAL TOP NAVBAR --- */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-3 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-xl font-black shadow-md shadow-indigo-600/30">
            🍽️
          </div>
          <div>
            <h1 className="font-black text-lg text-gray-900 dark:text-white leading-tight">
              {cafeName}
            </h1>
            <p className="text-xs font-bold text-gray-400">
              {currentUser.name} • <span className="uppercase text-indigo-500">{currentUser.role}</span>
            </p>
          </div>
        </div>

        {/* Admin uchun barcha ekranlarni ko'rish va boshqarish tablari */}
        {currentUser.role === 'admin' && (
          <nav className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-900/60 p-1.5 rounded-2xl overflow-x-auto hide-scrollbar">
            {[
              { id: 'admin', label: '⚙️ Boshqaruv' },
              { id: 'stats', label: '📊 Statistika' },
              { id: 'warehouse', label: '📦 Ombor' },
              { id: 'waiter', label: `📝 Ofitsiant ${waiterCalls.length > 0 ? `(${waiterCalls.length})` : ''}` },
              { id: 'cashier', label: '💰 Kassa' },
              { id: 'kitchen', label: '👨‍🍳 Oshxona' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setAdminActiveView(tab.id)}
                className={`px-3.5 py-2 rounded-xl font-black text-xs whitespace-nowrap transition active:scale-95 ${
                  adminActiveView === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        {/* O'ng taraf: Avto-Qulf sozlamasi (Telefon/Kompyuter uslubida), Tungi rejim va Chiqish */}
        <div className="flex items-center gap-2">
          <AutoLockControl
            currentUser={currentUser}
            users={users}
            cafeName={cafeName}
            onSwitchUser={handleLogin}
            onLogout={handleLogout}
          />

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-lg transition active:scale-90"
            title="Tungi / Kunduzgi rejim"
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>

          <button
            onClick={handleLogout}
            className="bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-600 dark:text-red-400 font-black px-4 py-2 rounded-xl text-xs sm:text-sm transition active:scale-95"
          >
            Chiqish 🔒
          </button>
        </div>
      </header>

      {/* --- ASOSIY ISHCHI MODULLAR --- */}
      <main className="p-3 md:p-5 max-w-[1600px] mx-auto">
        
        {/* 1. OFITSIANT TERMINALI */}
        {currentActiveView === 'waiter' && (
          <WaiterMode
            menuItems={menuItems}
            menuCategories={menuCategories}
            tables={tables}
            orders={orders}
            setOrders={setOrders}
            cafeName={cafeName}
            onOrderSubmit={handleOrderSubmit}
            onUpdateStatus={handleUpdateStatus}
            onTransferTable={handleTransferTable}
            onSplitOrder={handleSplitOrder}
            onShowQrTable={handleShowQrTable}
            onPrintReceipt={(orderObj) => setReceiptToPrint(orderObj)}
            waiterCalls={waiterCalls}
            onClearCall={handleClearCall}
            currentUser={currentUser}
            waiterCanSeeSales={currentUser.role === 'admin' || currentUser.canSeeSales}
            serviceFee={serviceFee}
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
            onUpdateStatus={handleUpdateStatus}
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
            onUpdateStatus={handleUpdateStatus}
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