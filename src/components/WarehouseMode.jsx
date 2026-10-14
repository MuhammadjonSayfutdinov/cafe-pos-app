import React, { useState } from 'react';
import WarehouseStockTab from './WarehouseStockTab';
import WarehousePrepTab from './WarehousePrepTab';
import WarehouseHistoryTab from './WarehouseHistoryTab';

export default function WarehouseMode({ 
  inventory = [], 
  setInventory, 
  inventoryLogs = [], 
  setInventoryLogs,
  currentUser,
  addAuditLog 
}) {
  // Tablarni boshqarish: 'stock' (Qoldiqlar), 'prep' (Tayyorlov), 'history' (Tarix)
  const [activeTab, setActiveTab] = useState('stock');

  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 min-h-[calc(100vh-140px)] flex flex-col overflow-hidden animate-fade-in">
      
      {/* ========================================== */}
      {/* TEPADAGI TABLAR (NAVIGATSIYA)              */}
      {/* ========================================== */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4 md:p-6 bg-gray-50 dark:bg-gray-900/50">
        <div className="flex gap-2 w-full overflow-x-auto hide-scrollbar">
          
          <button 
            onClick={() => setActiveTab('stock')}
            className={`px-6 py-3 rounded-xl font-black text-sm transition-all whitespace-nowrap active:scale-95 flex items-center gap-2 ${
              activeTab === 'stock' 
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' 
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <span>📦</span> Ombor Qoldig'i
          </button>
          
          <button 
            onClick={() => setActiveTab('prep')}
            className={`px-6 py-3 rounded-xl font-black text-sm transition-all whitespace-nowrap active:scale-95 flex items-center gap-2 ${
              activeTab === 'prep' 
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30' 
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <span>🔪</span> Tayyorlov (Kalkulyatsiya)
          </button>

          <button 
            onClick={() => setActiveTab('history')}
            className={`px-6 py-3 rounded-xl font-black text-sm transition-all whitespace-nowrap active:scale-95 flex items-center gap-2 ${
              activeTab === 'history' 
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30' 
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <span>📜</span> Harakatlar Tarixi
          </button>

        </div>
      </div>

      {/* ========================================== */}
      {/* ASOSIY EKRAN (Tanlangan Tabga qarab)       */}
      {/* ========================================== */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800 p-4 md:p-6">
        
        {activeTab === 'stock' && (
          <WarehouseStockTab 
            inventory={inventory}
            setInventory={setInventory}
            inventoryLogs={inventoryLogs}
            setInventoryLogs={setInventoryLogs}
            currentUser={currentUser}
            addAuditLog={addAuditLog}
          />
        )}

        {activeTab === 'prep' && (
          <WarehousePrepTab 
            inventory={inventory}
            setInventory={setInventory}
            setInventoryLogs={setInventoryLogs}
            currentUser={currentUser}
            addAuditLog={addAuditLog}
          />
        )}

        {activeTab === 'history' && (
          <WarehouseHistoryTab 
            inventoryLogs={inventoryLogs}
          />
        )}

      </div>
    </div>
  );
}