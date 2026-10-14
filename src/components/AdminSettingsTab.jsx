import React from 'react';

export default function AdminSettingsTab({ 
  isOverrideEnabled, 
  setIsOverrideEnabled 
}) {
  return (
    <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 animate-fade-in">
      
      <div className="mb-8">
        <h2 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
          <span>⚙️</span> Tizim Sozlamalari
        </h2>
        <p className="text-sm font-bold text-gray-500 mt-1">
          Bosh direktor va ma'muriyat uchun xavfsizlik va ruxsatlarni boshqarish markazi.
        </p>
      </div>

      <div className="space-y-6">
        {/* RAHBAR RUXSATI (OVERRIDE) SOZLAMASI */}
        <div className="max-w-3xl bg-gray-50 dark:bg-gray-900/50 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm hover:shadow-md transition-shadow">
          
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">🛡️</span>
              <h3 className="font-black text-gray-900 dark:text-white text-lg">
                Qat'iy Rahbar Ruxsati (Manager Override)
              </h3>
            </div>
            <p className="text-sm font-bold text-gray-500 leading-relaxed max-w-xl">
              Yoqilgan holatda ofitsiant va kassirlar chekdan taom o'chirish yoki chegirma qilish uchun 
              majburiy ravishda <span className="text-red-500 font-black">Admin parolini (6 xonali)</span> kiritishlari talab etiladi. Bu o'g'rilik va suiiste'molchilikning oldini oladi.
            </p>
          </div>

          {/* iOS uslubidagi chiroyli Toggle Switch */}
          <button 
            onClick={() => setIsOverrideEnabled(!isOverrideEnabled)}
            className={`relative w-16 h-8 rounded-full flex-shrink-0 transition-colors duration-300 focus:outline-none shadow-inner ${
              isOverrideEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-300 flex items-center justify-center ${
              isOverrideEnabled ? 'translate-x-9' : 'translate-x-1'
            }`}>
              {isOverrideEnabled && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
            </div>
          </button>

        </div>

        {/* Avtomatik qulflash haqida ma'lumot qutisi (faqat ko'rsatish uchun) */}
        <div className="max-w-3xl bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 flex items-start gap-4">
          <span className="text-3xl">⏱️</span>
          <div>
            <h3 className="font-black text-indigo-900 dark:text-indigo-400 text-lg mb-1">
              Avtomatik Qulflash (Auto-Lock) Faol
            </h3>
            <p className="text-sm font-bold text-indigo-700 dark:text-indigo-300/70">
              Tizim xavfsizligini ta'minlash maqsadida, agar istalgan xodim 2 daqiqa davomida ekranga tegmasa, dastur avtomatik ravishda qulflanadi va LockScreen oynasiga qaytadi. Ushbu funksiya tizim kodida qat'iy o'rnatilgan.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}