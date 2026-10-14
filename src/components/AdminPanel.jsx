import React, { useState, useMemo } from 'react';
import AdminMenuTab from './AdminMenuTab';
import AdminCategoriesTab from './AdminCategoriesTab';
import AdminUsersTab from './AdminUsersTab';
import AdminAuditLogsTab from './AdminAuditLogsTab';
import AdminSettingsTab from './AdminSettingsTab';

export default function AdminPanel({ 
  menuItems = [], 
  setMenuItems, 
  menuCategories = [], 
  setMenuCategories, 
  users = [], 
  setUsers,
  orders = [],
  setOrders,
  tables = [],
  setTables,
  inventory = [],
  setInventory,
  inventoryLogs = [],
  setInventoryLogs,
  auditLogs = [],
  setAuditLogs,
  isOverrideEnabled = true,
  setIsOverrideEnabled,
  serviceFee = 10,
  currentUser,
  addAuditLog
}) {
  // Boshlang'ich oyna sifatida 'Taomlar' bo'limi ochiladi
  const [activeTab, setActiveTab] = useState('menu');

  // Xavfsiz massivlar (Oq oynaning oldini olish uchun)
  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];
  const safeCategories = Array.isArray(menuCategories) ? menuCategories : [];
  const safeUsers = Array.isArray(users) ? users : [];
  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const safeAuditLogs = Array.isArray(auditLogs) ? auditLogs : [];
  const safeOrders = Array.isArray(orders) ? orders : [];

  // Stop-listdagi taomlar soni
  const stopListCount = useMemo(() => {
    return safeMenuItems.filter(item => item?.is_available === false).length;
  }, [safeMenuItems]);

  // Admin Panel bo'limlari (Tablar va jonli ko'rsatkichlar)
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
      badge: isOverrideEnabled ? '🔒' : '🔓'
    }
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 min-h-[calc(100vh-140px)] flex flex-col md:flex-row overflow-hidden animate-fade-in">
      
      {/* ========================================== */}
      {/* CHAP TOMON: ADMIN MENYU TABLARI            */}
      {/* ========================================== */}
      <div className="w-full md:w-76 bg-gray-50 dark:bg-gray-900 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 p-4 shrink-0 overflow-x-auto md:overflow-y-auto hide-scrollbar flex flex-col justify-between">
        
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
          
          <div className="flex md:flex-col gap-2 md:gap-3 pr-4 md:pr-0">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-between gap-3 px-4 py-3 md:py-4 rounded-xl font-bold transition-all whitespace-nowrap active:scale-95 ${
                    isActive 
                      ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30 scale-[1.02]' 
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{tab.icon}</span>
                    <span className="text-sm md:text-base font-black">{tab.label}</span>
                  </div>

                  <div className="flex items-center gap-1">
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

        {/* Pastki qism: Tizim va Xavfsizlik holati (Faqat kompyuter/planshetda ko'rinadi) */}
        <div className="hidden md:block mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
          <div className={`p-3.5 rounded-2xl border ${
            isOverrideEnabled 
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50' 
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50'
          }`}>
            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Admin PIN-Ruxsat Tizimi
            </p>
            <p className={`text-xs font-black mt-1 ${
              isOverrideEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {isOverrideEnabled ? '🔒 Yoqilgan (Xavfsiz rejim)' : "🔓 O'chirilgan (Erkin rejim)"}
            </p>
          </div>
        </div>

      </div>

      {/* ========================================== */}
      {/* O'NG TOMON: ASOSIY KONTENT (TANLANGAN TAB) */}
      {/* ========================================== */}
      <div className="flex-1 p-2 md:p-6 bg-white dark:bg-gray-800 overflow-y-auto">
        
        {/* 1. TAOMLAR (MENU) BO'LIMI */}
        {activeTab === 'menu' && (
          <AdminMenuTab 
            menuItems={safeMenuItems} 
            setMenuItems={setMenuItems} 
            menuCategories={safeCategories}
            inventory={safeInventory}
            addAuditLog={addAuditLog}
          />
        )}
        
        {/* 2. KATEGORIYALAR BO'LIMI */}
        {activeTab === 'categories' && (
          <AdminCategoriesTab 
            menuCategories={safeCategories}
            setMenuCategories={setMenuCategories}
            menuItems={safeMenuItems}
            setMenuItems={setMenuItems}
            addAuditLog={addAuditLog}
          />
        )}
        
        {/* 3. XODIMLAR BO'LIMI */}
        {activeTab === 'users' && (
          <AdminUsersTab 
            users={safeUsers} 
            setUsers={setUsers}
            currentUser={currentUser}
            addAuditLog={addAuditLog}
          />
        )}

        {/* 4. TARIX (AUDIT LOGS) BO'LIMI */}
        {activeTab === 'logs' && (
          <AdminAuditLogsTab 
            auditLogs={safeAuditLogs}
            setAuditLogs={setAuditLogs}
          />
        )}

        {/* 5. SOZLAMALAR BO'LIMI */}
        {activeTab === 'settings' && (
          <AdminSettingsTab 
            isOverrideEnabled={isOverrideEnabled} 
            setIsOverrideEnabled={setIsOverrideEnabled}
            tables={tables}
            setTables={setTables}
            orders={safeOrders}
            setOrders={setOrders}
            inventoryLogs={inventoryLogs}
            setInventoryLogs={setInventoryLogs}
            auditLogs={safeAuditLogs}
            setAuditLogs={setAuditLogs}
            serviceFee={serviceFee}
            addAuditLog={addAuditLog}
          />
        )}
        
      </div>
      
    </div>
  );
}