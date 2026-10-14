import React, { useState } from 'react';

export default function ManagerOverrideModal({ 
  actionName, 
  users = [], 
  onSuccess, 
  onCancel 
}) {
  const [adminPin, setAdminPin] = useState('');
  const [error, setError] = useState(false);

  const handleVerify = (e) => {
    e.preventDefault();
    
    const admins = users.filter(u => u.role === 'admin');
    const validAdmin = admins.find(a => a.pin === adminPin);

    if (validAdmin) {
      onSuccess(validAdmin);
    } else {
      setError(true);
      setAdminPin('');
      setTimeout(() => {
        setError(false);
      }, 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-3xl p-6 md:p-8 shadow-2xl border border-red-100 dark:border-red-900/30 text-center">
        
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4">
          🛡️
        </div>
        
        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-2">
          Rahbar Tasdig'i Talab Qilinadi
        </h2>
        
        <p className="text-sm font-bold text-gray-500 mb-6 bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
          Ushbu harakat uchun Admin paroli kerak: <br/>
          <span className="text-red-500 font-black">"{actionName}"</span>
        </p>

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <input 
              type="password" 
              autoFocus
              maxLength={6}
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              placeholder="Admin PIN-kodi"
              className={`w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border-2 outline-none font-black text-center tracking-[0.5em] text-xl transition ${
                error 
                  ? 'border-red-500 text-red-500 animate-shake' 
                  : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:border-indigo-500'
              }`}
            />
            {error && (
              <p className="text-xs font-bold text-red-500 mt-2">
                Xato PIN-kod! Tasdiqlanmadi.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              type="button" 
              onClick={onCancel}
              className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-4 rounded-xl font-bold transition active:scale-95"
            >
              Bekor qilish
            </button>
            <button 
              type="submit" 
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-black shadow-lg shadow-red-600/30 transition active:scale-95"
            >
              Tasdiqlash
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}