import React from 'react';

export default function WarehouseHistoryTab({ inventoryLogs = [] }) {
  const safeLogs = Array.isArray(inventoryLogs) ? inventoryLogs : [];

  if (safeLogs.length === 0) {
    return (
      <div className="animate-fade-in text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl">
        <p className="font-bold text-gray-400">Hali hech qanday harakat bajarilmagan.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      
      {/* MOBILE UCHUN KARTOCHKALAR (History) */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {safeLogs.map(log => (
          <div 
            key={log.id} 
            className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden"
          >
            <div className={`absolute top-0 left-0 w-1.5 h-full ${
              log.type === 'Kirim' ? 'bg-emerald-500' : 
              log.type === 'Zagatovka' ? 'bg-amber-500' : 'bg-orange-500'
            }`}></div>
            
            <div className="flex justify-between items-start mb-2 pl-2">
              <span className="text-xs font-bold text-gray-400">{log.date}</span>
              <span className={`px-2 py-1 rounded-md text-[10px] uppercase font-black tracking-wider ${
                  log.type === 'Kirim' ? 'bg-emerald-100 text-emerald-700' :
                  log.type === 'Zagatovka' ? 'bg-amber-100 text-amber-700' :
                  'bg-orange-100 text-orange-700'
                }`}>
                {log.type}
              </span>
            </div>

            <div className="flex justify-between items-center pl-2">
              <span className="font-bold text-gray-900 dark:text-white text-lg">{log.itemName}</span>
              <span className={`font-black text-lg ${log.diffAmount.startsWith('+') ? 'text-emerald-500' : 'text-orange-500'}`}>
                {log.diffAmount} <span className="text-xs">{log.unit}</span>
              </span>
            </div>
            
            <div className="mt-2 pt-2 border-t dark:border-gray-700 pl-2">
              <p className="text-xs font-bold text-gray-500 line-clamp-2">{log.note}</p>
              <p className="text-xs font-black text-indigo-500 mt-1">👤 {log.user}</p>
            </div>
          </div>
        ))}
      </div>

      {/* PLANSHET VA KOMPYUTER UCHUN JADVAL (History) */}
      <div className="hidden md:block overflow-x-auto bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b dark:border-gray-700">
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Sana / Vaqt</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Harakat Turi</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Mahsulot / Miqdor</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Izoh / Tarkib</th>
              <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Foydalanuvchi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {safeLogs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                <td className="p-4 text-xs font-bold text-gray-500">{log.date}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-md text-[10px] uppercase font-black tracking-wider ${
                    log.type === 'Kirim' ? 'bg-emerald-100 text-emerald-700' :
                    log.type === 'Zagatovka' ? 'bg-amber-100 text-amber-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    {log.type}
                  </span>
                </td>
                <td className="p-4">
                  <p className="font-bold text-gray-900 dark:text-gray-100">{log.itemName}</p>
                  <p className={`font-black text-sm ${log.diffAmount.startsWith('+') ? 'text-emerald-500' : 'text-orange-500'}`}>
                    {log.diffAmount} {log.unit}
                  </p>
                </td>
                <td className="p-4 text-xs text-gray-600 dark:text-gray-400 font-bold max-w-xs truncate">
                  {log.note}
                </td>
                <td className="p-4 text-xs font-bold text-indigo-500 text-right">
                  👤 {log.user}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
    </div>
  );
}