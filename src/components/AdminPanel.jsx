import React, { useState, useMemo } from 'react';
import useSticky from '../hooks/useSticky';
import AdminMenuTab from './AdminMenuTab';
import AdminCategoriesTab from './AdminCategoriesTab';
import AdminUsersTab from './AdminUsersTab';
import AdminAuditLogsTab from './AdminAuditLogsTab';
import AdminSettingsTab from './AdminSettingsTab';

export default function AdminPanel({ 
  menuItems, 
  setMenuItems, 
  menuCategories, 
  setMenuCategories, 
  users, 
  setUsers,
  orders,
  setOrders,
  tables,
  setTables,
  inventory,
  setInventory,
  inventoryLogs,
  setInventoryLogs,
  auditLogs,
  setAuditLogs,
  isOverrideEnabled,
  setIsOverrideEnabled,
  cafeName,
  setCafeName,
  serviceFee,
  setServiceFee,
  currentUser,
  requireAdminOverride,
  addAuditLog
}) {
  // Boshlang'ich oyna sifatida 'Taomlar' bo'limi ochiladi
  const [activeTab, setActiveTab] = useState('menu');

  // ==========================================
  // 1. ZAXIRA XOTIRA (AGAR APP.JSX DAN PROP UZILGAN BO'LSA)
  // ==========================================
  const [stickyMenu, setStickyMenu] = useSticky('pos_menu', []);
  const [stickyCategories, setStickyCategories] = useSticky('pos_categories', ['Asosiy', 'Ichimlik', 'Shirinlik']);
  const [stickyUsers, setStickyUsers] = useSticky('pos_users', []);
  const [stickyOrders, setStickyOrders] = useSticky('pos_orders', []);
  const [stickyTables, setStickyTables] = useSticky('pos_tables', []);
  const [stickyInventory, setStickyInventory] = useSticky('pos_inventory', []);
  const [stickyInventoryLogs, setStickyInventoryLogs] = useSticky('pos_inventory_logs', []);
  const [stickyAuditLogs, setStickyAuditLogs] = useSticky('pos_audit_logs', []);
  const [stickyCafeName, setStickyCafeName] = useSticky('pos_cafe_name', 'Premium Cafe');
  const [stickyServiceFee, setStickyServiceFee] = useSticky('pos_service_fee', 10);
  const [stickyOverride, setStickyOverride] = useSticky('pos_override_enabled', true);

  // Xavfsiz massivlar va funksiyalar
  const safeMenuItems = Array.isArray(menuItems) ? menuItems : (Array.isArray(stickyMenu) ? stickyMenu : []);
  const safeCategories = Array.isArray(menuCategories) && menuCategories.length > 0 
    ? menuCategories 
    : (Array.isArray(stickyCategories) && stickyCategories.length > 0 ? stickyCategories : ['Asosiy']);
  const safeUsers = Array.isArray(users) ? users : (Array.isArray(stickyUsers) ? stickyUsers : []);
  const safeOrders = Array.isArray(orders) ? orders : (Array.isArray(stickyOrders) ? stickyOrders : []);
  const safeTables = Array.isArray(tables) ? tables : (Array.isArray(stickyTables) ? stickyTables : []);
  const safeInventory = Array.isArray(inventory) ? inventory : (Array.isArray(stickyInventory) ? stickyInventory : []);
  const safeInventoryLogs = Array.isArray(inventoryLogs) ? inventoryLogs : (Array.isArray(stickyInventoryLogs) ? stickyInventoryLogs : []);
  const safeAuditLogs = Array.isArray(auditLogs) ? auditLogs : (Array.isArray(stickyAuditLogs) ? stickyAuditLogs : []);

  const resolvedCafeName = cafeName !== undefined ? cafeName : stickyCafeName;
  const resolvedServiceFee = serviceFee !== undefined ? serviceFee : stickyServiceFee;
  const resolvedOverride = isOverrideEnabled !== undefined ? isOverrideEnabled : stickyOverride;

  const updateMenuItems = typeof setMenuItems === 'function' ? setMenuItems : setStickyMenu;
  const updateCategories = typeof setMenuCategories === 'function' ? setMenuCategories : setStickyCategories;
  const updateUsers = typeof setUsers === 'function' ? setUsers : setStickyUsers;
  const updateOrders = typeof setOrders === 'function' ? setOrders : setStickyOrders;
  const updateTables = typeof setTables === 'function' ? setTables : setStickyTables;
  const updateInventory = typeof setInventory === 'function' ? setInventory : setStickyInventory;
  const updateInventoryLogs = typeof setInventoryLogs === 'function' ? setInventoryLogs : setStickyInventoryLogs;
  const updateAuditLogs = typeof setAuditLogs === 'function' ? setAuditLogs : setStickyAuditLogs;
  const updateCafeName = typeof setCafeName === 'function' ? setCafeName : setStickyCafeName;
  const updateServiceFee = typeof setServiceFee === 'function' ? setServiceFee : setStickyServiceFee;
  const updateOverride = typeof setIsOverrideEnabled === 'function' ? setIsOverrideEnabled : setStickyOverride;

  const handleAddAuditLog = (action, details) => {
    if (typeof addAuditLog === 'function') {
      addAuditLog(action, details);
    } else {
      updateAuditLogs(prev => [
        {
          id: `${Date.now()}_${Math.random()}`,
          date: new Date().toLocaleString(),
          action,
          details,
          userName: currentUser?.name || 'Admin',
          role: currentUser?.role || 'admin'
        },
        ...(Array.isArray(prev) ? prev : [])
      ]);
    }
  };

  // Stop-listdagi taomlar soni
  const stopListCount = useMemo(() => {
    return safeMenuItems.filter(item => item?.is_available === false).length;
  }, [safeMenuItems]);

  // Admin Panel bo'limlari
  const tabs = [
    { 
      id: 'menu', 
      label: 'Taomlar (Menyu)', 
      icon: '🍽️',
      badge: safeMenuItems.length,
      subBadge: stopListCount > 0 ? `${stopListCount} stop` : null
    },
    { 
      id: 'categories', 
      label: 'Kategoriyalar', 
      icon: '📁',
      badge: safeCategories.length
    },
    { 
      id: 'users', 
      label: 'Xodimlar va Parollar', 
      icon: '👥',
      badge: safeUsers.length
    },
    { 
      id: 'logs', 
      label: 'Tarix (Audit Logs)', 
      icon: '🕵️‍♂️',
      badge: safeAuditLogs.length
    },
    { 
      id: 'settings', 
      label: 'Tizim Sozlamalari', 
      icon: '⚙️',
      badge: resolvedOverride ? '🔒' : '🔓'
    }
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 min-h-[calc(100vh-140px)] flex flex-col md:flex-row overflow-hidden animate-fade-in">
      
      {/* ========================================== */}
      {/* CHAP TOMON: ADMIN MENYU TABLARI            */}
      {/* TUZATILDI: md:w-76 o'rniga md:w-72 lg:w-80 */}
      {/* ========================================== */}
      <div className="w-full md:w-72 lg:w-80 bg-gray-50 dark:bg-gray-900 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 p-4 shrink-0 overflow-x-auto md:overflow-y-auto hide-scrollbar flex flex-col justify-between">
        
        <div>
          <div className="mb-6 hidden md:block pl-2">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center text-lg shadow-sm">
                👑
              </span>
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white leading-tight">
                  Admin Panel
                </h2>
                <p className="text-xs font-bold text-gray-500">
                  Boshqaruv markazi
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex md:flex-col gap-2 md:gap-2.5 pr-2 md:pr-0">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-between gap-3 px-4 py-3 md:py-3.5 rounded-xl font-bold transition-all whitespace-nowrap active:scale-95 ${
                    isActive 
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30' 
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">{tab.icon}</span>
                    <span className="text-sm font-black truncate">{tab.label}</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {tab.subBadge && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                        isActive 
                          ? 'bg-red-600 text-white' 
                          : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                      }`}>
                        {tab.subBadge}
                      </span>
                    )}
                    {tab.badge !== undefined && tab.badge !== null && (
                      <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${
                        isActive 
                          ? 'bg-white/25 text-white' 
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        {tab.badge}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Pastki qism: Tizim va Xavfsizlik holati */}
        <div className="hidden md:block mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
          <div 
            onClick={() => updateOverride(!resolvedOverride)}
            className={`p-3.5 rounded-2xl border cursor-pointer transition active:scale-95 ${
              resolvedOverride 
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50' 
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50'
            }`}
            title="Bosib yoqish / o'chirish mumkin"
          >
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Admin PIN-Ruxsat Tizimi
            </p>
            <p className={`text-xs font-black mt-1 ${
              resolvedOverride ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {resolvedOverride ? '🔒 Yoqilgan (Xavfsiz rejim)' : "🔓 O'chirilgan (Erkin rejim)"}
            </p>
          </div>
        </div>

      </div>

      {/* ========================================== */}
      {/* O'NG TOMON: ASOSIY KONTENT (TANLANGAN TAB) */}
      {/* TUZATILDI: min-w-0 qo'shildi               */}
      {/* ========================================== */}
      <div className="flex-1 min-w-0 p-3 md:p-6 bg-white dark:bg-gray-800 overflow-y-auto">
        
        {/* 1. TAOMLAR (MENU) BO'LIMI */}
        {activeTab === 'menu' && (
          <AdminMenuTab 
            menuItems={safeMenuItems} 
            setMenuItems={updateMenuItems} 
            menuCategories={safeCategories}
            inventory={safeInventory}
            addAuditLog={handleAddAuditLog}
          />
        )}
        
        {/* 2. KATEGORIYALAR BO'LIMI */}
        {activeTab === 'categories' && (
          <AdminCategoriesTab 
            menuCategories={safeCategories}
            setMenuCategories={updateCategories}
            menuItems={safeMenuItems}
            setMenuItems={updateMenuItems}
            addAuditLog={handleAddAuditLog}
          />
        )}
        
        {/* 3. XODIMLAR BO'LIMI */}
        {activeTab === 'users' && (
          <AdminUsersTab 
            users={safeUsers} 
            setUsers={updateUsers}
            orders={safeOrders}
            currentUser={currentUser}
            addAuditLog={handleAddAuditLog}
          />
        )}

        {/* 4. TARIX (AUDIT LOGS) BO'LIMI */}
        {activeTab === 'logs' && (
          <AdminAuditLogsTab 
            auditLogs={safeAuditLogs}
            setAuditLogs={updateAuditLogs}
            currentUser={currentUser}
            requireAdminOverride={requireAdminOverride}
            addAuditLog={handleAddAuditLog}
          />
        )}

        {/* 5. SOZLAMALAR BO'LIMI */}
        {activeTab === 'settings' && (
          <AdminSettingsTab 
            cafeName={resolvedCafeName}
            setCafeName={updateCafeName}
            serviceFee={resolvedServiceFee}
            setServiceFee={updateServiceFee}
            isOverrideEnabled={resolvedOverride} 
            setIsOverrideEnabled={updateOverride}
            tables={safeTables}
            setTables={updateTables}
            orders={safeOrders}
            setOrders={updateOrders}
            menuItems={safeMenuItems}
            setMenuItems={updateMenuItems}
            menuCategories={safeCategories}
            setMenuCategories={updateCategories}
            users={safeUsers}
            setUsers={updateUsers}
            inventory={safeInventory}
            setInventory={updateInventory}
            inventoryLogs={safeInventoryLogs}
            setInventoryLogs={updateInventoryLogs}
            auditLogs={safeAuditLogs}
            setAuditLogs={updateAuditLogs}
            currentUser={currentUser}
            requireAdminOverride={requireAdminOverride}
            addAuditLog={handleAddAuditLog}
          />
        )}
        
      </div>
      
    </div>
  );
}