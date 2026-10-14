import React, { useState } from 'react';

export default function AdminAuditLogsTab({ auditLogs = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  //jonkacham Loglarni qidirish (ism yoki harakat bo'yicha)
  const filteredLogs = auditLogs.filter(log => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (log.userName && log.userName.toLowerCase().includes(searchLower)) ||
      (log.action && log.action.toLowerCase().includes(searchLower)) ||
      (log.details && log.details.toLowerCase().includes(searchLower))
    );
  });

  return (
    <div className="bg-white dark:bg-gray-800 p-4 md:p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 animate-fade-in">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span>🕵️‍♂️</span> Xodimlar Harakati Tarixi (Audit Logs)
          </h2>
          <p className="text-sm font-bold text-gray-500 mt-1">
            Tizimdagi barcha kiritish, o'chirish va chegirmalarning qat'iy hisobi.
          </p>
        </div>
        
        <input 
          type="text" 
          placeholder="Xodim yoki harakatni qidiring..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-64 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-bold outline-none focus:border-indigo-500 text-gray-900 dark:text-white transition"
        />
      </div>

      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-10">
            <span className="text-4xl opacity-50 mb-3 block">📜</span>
            <p className="text-gray-500 font-bold">Hozircha tarix bo'sh yoki qidiruv bo'yicha hech narsa topilmadi.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="p-4 text-xs font-black text-gray-500 uppercase tracking-wider">Sana va Vaqt</th>
                  <th className="p-4 text-xs font-black text-gray-500 uppercase tracking-wider">Xodim</th>
                  <th className="p-4 text-xs font-black text-gray-500 uppercase tracking-wider">Harakat turi</th>
                  <th className="p-4 text-xs font-black text-gray-500 uppercase tracking-wider">Tafsilotlar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-white dark:hover:bg-gray-800 transition-colors">
                    <td className="p-4 whitespace-nowrap">
                      <span className="text-xs font-bold text-gray-500">{log.date}</span>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-black">
                          {log.userName.charAt(0)}
                        </span>
                        <span className="font-bold text-gray-900 dark:text-white text-sm">
                          {log.userName}
                        </span>
                        <span className="text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full uppercase">
                          {log.role}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`text-xs font-black px-2 py-1 rounded-lg ${
                        log.action.includes("Admin Ruxsat") ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        log.action.includes("O'chirish") || log.action.includes("Xato") ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {log.details}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}   