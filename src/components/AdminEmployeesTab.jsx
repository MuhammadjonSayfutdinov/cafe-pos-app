import React, { useState, useMemo } from 'react';

export default function AdminEmployeesTab({ 
  users = [], 
  setUsers,
  currentUser,
  addAuditLog
}) {
  // ==========================================
  // 1. STATE'LAR VA XAVFSIZ MA'LUMOTLAR
  // ==========================================
  const safeUsers = Array.isArray(users) ? users : [];

  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [showPins, setShowPins] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  const [newEmployeeData, setNewEmployeeData] = useState({ 
    name: '', 
    role: 'waiter', 
    pin: '', 
    canSeeSales: false 
  });

  // Rollar va ularning PIN talablari
  const roleOptions = [
    { value: 'waiter', label: '📝 Ofitsiant (4 xonali PIN)', pinLen: 4, badge: 'Ofitsiant' },
    { value: 'cashier', label: '💳 Kassir (4 xonali PIN)', pinLen: 4, badge: 'Kassir' },
    { value: 'kitchen', label: '👨‍🍳 Oshpaz (4 xonali PIN)', pinLen: 4, badge: 'Oshpaz' },
    { value: 'warehouse', label: '📦 Omborchi (6 xonali PIN)', pinLen: 6, badge: 'Omborchi' },
    { value: 'admin', label: '👑 Admin (6 xonali PIN)', pinLen: 6, badge: 'Admin' }
  ];

  const getRequiredPinLength = (role) => {
    return (role === 'admin' || role === 'warehouse') ? 6 : 4;
  };

  const getRoleBadge = (role) => {
    const found = roleOptions.find(r => r.value === role);
    return found ? found.badge : role;
  };

  // ==========================================
  // 2. MODAL VA FORMA BOSHQARUVI
  // ==========================================
  const handleOpenEmployeeModal = (emp = null) => {
    if (emp) {
      setEditingEmployee(emp);
      setNewEmployeeData({ 
        name: emp.name || '', 
        role: emp.role || 'waiter', 
        pin: String(emp.pin || ''), 
        canSeeSales: Boolean(emp.canSeeSales) 
      });
    } else {
      setEditingEmployee(null);
      setNewEmployeeData({ 
        name: '', 
        role: 'waiter', 
        pin: '', 
        canSeeSales: false 
      });
    }
    setIsEmployeeModalOpen(true);
  };

  const handleRoleChange = (newRole) => {
    const reqLen = getRequiredPinLength(newRole);
    const currentPin = String(newEmployeeData.pin || '');
    setNewEmployeeData(prev => ({
      ...prev,
      role: newRole,
      pin: currentPin.length === reqLen ? currentPin : '',
      canSeeSales: newRole === 'waiter' ? prev.canSeeSales : (newRole === 'admin')
    }));
  };

  const handlePinChange = (rawVal) => {
    const reqLen = getRequiredPinLength(newEmployeeData.role);
    const onlyNums = String(rawVal).replace(/[^0-9]/g, '').slice(0, reqLen);
    setNewEmployeeData(prev => ({ ...prev, pin: onlyNums }));
  };

  // Takrorlanmas (bo'sh) PIN-kodni avtomatik topib berish
  const handleGenerateAutoPin = () => {
    const len = getRequiredPinLength(newEmployeeData.role);
    const min = len === 6 ? 100000 : 1000;
    const max = len === 6 ? 999999 : 9999;

    let generated = '';
    let tries = 0;
    do {
      generated = String(Math.floor(min + Math.random() * (max - min + 1)));
      tries += 1;
    } while (
      safeUsers.some(u => String(u.pin) === generated && u.id !== editingEmployee?.id) &&
      tries < 100
    );

    setNewEmployeeData(prev => ({ ...prev, pin: generated }));
  };

  // ==========================================
  // 3. SAQLASH VA O'CHIRISH MANTIG'I
  // ==========================================
  const handleSaveEmployee = (e) => {
    e.preventDefault();
    const safeName = (newEmployeeData.name || '').trim();
    const safePin = String(newEmployeeData.pin || '').trim();
    const requiredLength = getRequiredPinLength(newEmployeeData.role);

    if (!safeName || !safePin) { 
      alert("Iltimos, xodim ismini va PIN-kodni kiriting!"); 
      return; 
    }

    if (safePin.length !== requiredLength) {
      alert(`Xato! "${getRoleBadge(newEmployeeData.role)}" lavozimi uchun PIN-kod aynan ${requiredLength} xonali raqam bo'lishi shart!`);
      return;
    }

    const isNameTaken = safeUsers.some(
      u => u && String(u.name || '').trim().toLowerCase() === safeName.toLowerCase() && u.id !== editingEmployee?.id
    );
    if (isNameTaken) {
      alert(`"${safeName}" ismli xodim allaqachon mavjud!`);
      return;
    }

    const isPinTaken = safeUsers.some(
      u => u && String(u.pin || '').trim() === safePin && u.id !== editingEmployee?.id
    );
    if (isPinTaken) { 
      alert("Bu PIN-kod boshqa xodimda band! Iltimos, boshqa PIN-kod tanlang."); 
      return; 
    }

    if (editingEmployee) {
      if (typeof setUsers === 'function') {
        setUsers(prev => prev.map(u => 
          u.id === editingEmployee.id 
            ? { 
                ...u, 
                ...newEmployeeData, 
                name: safeName, 
                pin: safePin,
                canSeeSales: newEmployeeData.role === 'waiter' ? Boolean(newEmployeeData.canSeeSales) : (newEmployeeData.role === 'admin')
              } 
            : u
        ));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Xodim tahrirlandi", `${safeName} (${newEmployeeData.role}) ma'lumotlari yangilandi`);
      }
    } else {
      const createdUser = { 
        id: Date.now(), 
        ...newEmployeeData, 
        name: safeName, 
        pin: safePin,
        canSeeSales: newEmployeeData.role === 'waiter' ? Boolean(newEmployeeData.canSeeSales) : (newEmployeeData.role === 'admin')
      };
      if (typeof setUsers === 'function') {
        setUsers(prev => [...prev, createdUser]);
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Yangi xodim qo'shildi", `${safeName} (${newEmployeeData.role}) tizimga qo'shildi`);
      }
    }
    setIsEmployeeModalOpen(false);
  };

  const handleDeleteEmployee = (emp) => {
    if (currentUser && emp.id === currentUser.id) {
      alert("⛔️ Siz hozir ushbu profil orqali tizimda o'tiribsiz! O'zingizni o'chira olmaysiz.");
      return;
    }

    if (emp.role === 'admin') {
      const adminCount = safeUsers.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        alert("⛔️ Tizimda kamida 1 ta Admin qolishi shart!");
        return;
      }
    }

    if (window.confirm(`Rostdan ham "${emp.name}" (${getRoleBadge(emp.role)}) xodimini o'chirmoqchimisiz?`)) {
      if (typeof setUsers === 'function') {
        setUsers(prev => prev.filter(u => u.id !== emp.id));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Xodim o'chirildi", `${emp.name} (${emp.role}) o'chirildi`);
      }
    }
  };

  const togglePinVisibility = (id) => {
    setShowPins(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredEmployees = useMemo(() => {
    return safeUsers.filter(emp => {
      if (!emp) return false;
      const matchesRole = filterRole === 'all' || emp.role === filterRole;
      const matchesSearch = !searchQuery.trim() || 
        String(emp.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase());
      return matchesRole && matchesSearch;
    });
  }, [safeUsers, filterRole, searchQuery]);

  // ==========================================
  // 4. RENDER (UI DIZAYN)
  // ==========================================
  const modalReqPinLen = getRequiredPinLength(newEmployeeData.role);

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-700 animate-fade-in space-y-5">
        
        {/* SARLAVHA VA YANGI XODIM TUGMASI */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">
              👥 Xodimlar va Rollar Jadvali
            </h2>
            <p className="text-xs font-bold text-gray-500 mt-1">
              Boshqaruv (6 xonali PIN) va Xodimlar (4 xonali PIN) ro'yxati
            </p>
          </div>
          <button 
            type="button"
            onClick={() => handleOpenEmployeeModal(null)} 
            className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-black transition active:scale-95 shadow-md flex items-center justify-center gap-2"
          >
            <span>+</span> Yangi Xodim
          </button>
        </div>

        {/* QIDIRUV VA ROL FILTRI */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-gray-50 dark:bg-gray-900/50 p-3 rounded-2xl border border-gray-100 dark:border-gray-700">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 Xodim ismini qidiring..."
            className="flex-1 px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500"
          />

          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-black text-gray-700 dark:text-gray-200 outline-none cursor-pointer"
          >
            <option value="all">👥 Barcha lavozimlar ({safeUsers.length})</option>
            {roleOptions.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* XODIMLAR JADVALI */}
        <div className="overflow-x-auto bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700">
                <th className="p-4 text-xs font-bold text-gray-500 uppercase">Ismi</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase">Lavozimi (Roli)</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase">PIN-Kod</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase">Qo'shimcha huquq</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center font-bold text-gray-400">
                    Xodimlar topilmadi.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => {
                  const isManagement = emp.role === 'admin' || emp.role === 'warehouse';
                  const adminCount = safeUsers.filter(u => u.role === 'admin').length;
                  const isLastAdmin = emp.role === 'admin' && adminCount <= 1;

                  return (
                    <tr key={emp.id} className="hover:bg-white dark:hover:bg-gray-800 transition">
                      <td className="p-4 font-black text-gray-900 dark:text-gray-100">
                        {emp.name}
                      </td>
                      <td className="p-4">
                        <span className={`text-xs font-black uppercase px-3 py-1 rounded-full ${
                          emp.role === 'admin' 
                            ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' 
                            : emp.role === 'warehouse'
                            ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {getRoleBadge(emp.role)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-black tracking-widest text-gray-700 dark:text-gray-300">
                            {showPins[emp.id] ? emp.pin : '•'.repeat(isManagement ? 6 : 4)}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePinVisibility(emp.id)}
                            className="text-gray-400 hover:text-blue-500 transition text-sm"
                            title="PIN-kodni ko'rsatish/yashirish"
                          >
                            {showPins[emp.id] ? '🙈' : '👁️'}
                          </button>
                        </div>
                      </td>
                      <td className="p-4 text-xs font-bold">
                        {emp.role === 'waiter' ? (
                          <span className={emp.canSeeSales ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}>
                            {emp.canSeeSales ? '📊 Savdoni ko\'radi' : '🔒 Savdo yopiq'}
                          </span>
                        ) : isManagement ? (
                          <span className="text-indigo-500">👔 Boshqaruv</span>
                        ) : (
                          <span className="text-gray-400">Standart</span>
                        )}
                      </td>
                      <td className="p-4 text-right space-x-2 whitespace-nowrap">
                        <button 
                          type="button"
                          onClick={() => handleOpenEmployeeModal(emp)} 
                          className="px-3.5 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 rounded-lg font-bold text-xs transition"
                        >
                          Tahrir
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleDeleteEmployee(emp)} 
                          disabled={isLastAdmin} 
                          className={`px-3.5 py-1.5 rounded-lg font-bold text-xs transition ${
                            isLastAdmin 
                              ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed' 
                              : 'bg-red-50 dark:bg-red-900/30 hover:bg-red-100 text-red-600 dark:text-red-400'
                          }`}
                        >
                          O'chirish
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* XODIM QO'SHISH / TAHRIRLASH MODALI */}
      {isEmployeeModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <h3 className="font-black text-lg text-gray-900 dark:text-white">
                {editingEmployee ? '✏️ Xodimni Tahrirlash' : '👥 Yangi Xodim'}
              </h3>
              <button 
                type="button"
                onClick={() => setIsEmployeeModalOpen(false)} 
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-red-500 font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSaveEmployee} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                  Xodim Ismi *
                </label>
                <input 
                  type="text" 
                  required 
                  value={newEmployeeData.name} 
                  onChange={e => setNewEmployeeData({ ...newEmployeeData, name: e.target.value })} 
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 font-bold text-gray-900 dark:text-white outline-none focus:border-blue-500" 
                  placeholder="Masalan: Sardor" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">
                  Lavozimi (Roli) *
                </label>
                <select 
                  value={newEmployeeData.role} 
                  onChange={e => handleRoleChange(e.target.value)} 
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 font-bold text-gray-900 dark:text-white outline-none cursor-pointer"
                >
                  {roleOptions.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase">
                    PIN-Kod ({modalReqPinLen} xonali raqam) *
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateAutoPin}
                    className="text-xs font-black text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    🎲 Avto-PIN
                  </button>
                </div>
                <input 
                  type="text" 
                  inputMode="numeric"
                  required 
                  value={newEmployeeData.pin} 
                  onChange={e => handlePinChange(e.target.value)} 
                  className="w-full p-3.5 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 font-black tracking-[0.25em] text-gray-900 dark:text-white outline-none focus:border-blue-500" 
                  placeholder={`${modalReqPinLen} xonali PIN kiriting...`} 
                />
              </div>

              {newEmployeeData.role === 'waiter' && (
                <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 p-3.5 rounded-xl border border-gray-200 dark:border-gray-600">
                  <input 
                    type="checkbox" 
                    id="canSeeSalesModal" 
                    checked={Boolean(newEmployeeData.canSeeSales)} 
                    onChange={e => setNewEmployeeData({ ...newEmployeeData, canSeeSales: e.target.checked })} 
                    className="w-5 h-5 accent-blue-600 cursor-pointer" 
                  />
                  <label htmlFor="canSeeSalesModal" className="text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
                    📊 Shaxsiy savdo summasini ko'rishi mumkin
                  </label>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsEmployeeModalOpen(false)} 
                  className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-3 rounded-xl font-bold transition active:scale-95"
                >
                  Bekor qilish
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-black shadow-lg shadow-blue-600/30 transition active:scale-95"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}