import React, { useState, useMemo } from 'react';

export default function AdminUsersTab({ 
  users = [], 
  setUsers,
  currentUser,
  addAuditLog
}) {
  // ==========================================
  // 1. STATE'LAR VA XAVFSIZ RO'YXAT
  // ==========================================
  const safeUsers = Array.isArray(users) ? users : [];

  const [editingId, setEditingId] = useState(null);
  const [showPins, setShowPins] = useState({}); // Qaysi xodimning parolini ochiq ko'rsatish
  const [filterGroup, setFilterGroup] = useState('all'); // 'all' | 'management' | 'staff'
  const [searchQuery, setSearchQuery] = useState('');
  
  // Yangi yoki tahrirlanayotgan xodim ma'lumotlari
  const [formData, setFormData] = useState({
    name: '',
    role: 'waiter',
    pin: '',
    canSeeSales: true
  });

  // Tizimdagi mavjud rollar va ularning PIN talablari
  const roleOptions = [
    { value: 'admin', label: '👑 Admin (6 xonali PIN)', group: 'management', icon: '👑', badgeName: 'Admin' },
    { value: 'warehouse', label: '📦 Omborchi (6 xonali PIN)', group: 'management', icon: '📦', badgeName: 'Omborchi' },
    { value: 'cashier', label: '💳 Kassir (4 xonali PIN)', group: 'staff', icon: '💳', badgeName: 'Kassir' },
    { value: 'waiter', label: '📝 Ofitsiant (4 xonali PIN)', group: 'staff', icon: '📝', badgeName: 'Ofitsiant' },
    { value: 'kitchen', label: '👨‍🍳 Oshpaz (4 xonali PIN)', group: 'staff', icon: '👨‍🍳', badgeName: 'Oshpaz' }
  ];

  // Rol bo'yicha talab qilinadigan PIN uzunligini aniqlash (HIMOYA)
  const getRequiredPinLength = (role) => {
    return (role === 'admin' || role === 'warehouse') ? 6 : 4;
  };

  const getRoleMeta = (role) => {
    return roleOptions.find(r => r.value === role) || {
      value: role,
      label: role,
      group: 'staff',
      icon: '👤',
      badgeName: role
    };
  };

  // ==========================================
  // 2. FORMA VA AVTO-PIN FUNKSIYALARI
  // ==========================================
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }));
      return;
    }

    // Agar rol o'zgarsa, PIN-kod uzunligi mos kelmasa tozalaymiz
    if (name === 'role') {
      const nextRequiredLen = getRequiredPinLength(value);
      const currentPin = formData.pin || '';
      setFormData(prev => ({
        ...prev,
        role: value,
        pin: currentPin.length === nextRequiredLen ? currentPin : '',
        canSeeSales: value === 'waiter' ? prev.canSeeSales : false
      }));
    } 
    // PIN kiritilayotganda faqat raqamlar va belgilangan uzunlikka ruxsat beramiz
    else if (name === 'pin') {
      const requiredLength = getRequiredPinLength(formData.role);
      const onlyNums = value.replace(/[^0-9]/g, '').slice(0, requiredLength);
      setFormData(prev => ({ ...prev, pin: onlyNums }));
    } 
    // Boshqa maydonlar (Ism)
    else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Takrorlanmas (bo'sh) PIN-kodni avtomatik generatsiya qilish
  const handleGenerateRandomPin = () => {
    const len = getRequiredPinLength(formData.role);
    const min = len === 6 ? 100000 : 1000;
    const max = len === 6 ? 999999 : 9999;

    let generated = '';
    let attempts = 0;

    do {
      generated = String(Math.floor(min + Math.random() * (max - min + 1)));
      attempts += 1;
    } while (
      safeUsers.some(u => String(u.pin) === generated && u.id !== editingId) &&
      attempts < 100
    );

    setFormData(prev => ({ ...prev, pin: generated }));
  };

  // ==========================================
  // 3. SAQLASH, TAHRIRLASH VA O'CHIRISH (CRUD)
  // ==========================================
  const handleSubmit = (e) => {
    e.preventDefault();
    
    const cleanName = (formData.name || '').trim();
    const cleanPin = String(formData.pin || '').trim();

    // 1. Validatsiya: Bo'sh maydonlarni tekshirish
    if (!cleanName || !cleanPin) {
      alert("Iltimos, xodim ismini va PIN-kodni to'liq kiriting!");
      return;
    }

    // 2. Validatsiya: PIN uzunligini qat'iy tekshirish
    const requiredLength = getRequiredPinLength(formData.role);
    if (cleanPin.length !== requiredLength) {
      alert(`Xato! "${getRoleMeta(formData.role).badgeName}" lavozimi uchun PIN-kod aynan ${requiredLength} xonali raqam bo'lishi shart!`);
      return;
    }

    // 3. Validatsiya: Bir xil ismli xodim bor-yo'qligini tekshirish
    const duplicateNameUser = safeUsers.find(
      u => u && String(u.name || '').trim().toLowerCase() === cleanName.toLowerCase() && u.id !== editingId
    );
    if (duplicateNameUser) {
      alert(`⛔️ "${cleanName}" ismli xodim tizimda allaqachon mavjud! Hisobotlar adashib ketmasligi uchun boshqa ism (yoki familiya bosh harfi bilan) kiriting.`);
      return;
    }

    // 4. Validatsiya: Bir xil PIN-kod boshqa xodimda bor-yo'qligini tekshirish (LockScreen uchun juda muhim!)
    const duplicatePinUser = safeUsers.find(
      u => u && String(u.pin || '').trim() === cleanPin && u.id !== editingId
    );
    if (duplicatePinUser) {
      alert(`⛔️ Ushbu PIN-kod boshqa xodimga (${duplicatePinUser.name}) biriktirilgan! Tizimga kirishda to'qnashuv bo'lmasligi uchun boshqa PIN-kod kiriting.`);
      return;
    }

    if (editingId) {
      // TAHRIRLASH REJIMI
      if (typeof setUsers === 'function') {
        setUsers(prev => prev.map(user => 
          user.id === editingId ? { 
            ...user, 
            name: cleanName,
            role: formData.role,
            pin: cleanPin,
            canSeeSales: formData.role === 'waiter' ? Boolean(formData.canSeeSales) : (formData.role === 'admin')
          } : user
        ));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Xodim tahrirlandi", `${cleanName} (${formData.role}) ma'lumotlari yangilandi`);
      }
      setEditingId(null);
    } else {
      // YANGI XODIM QO'SHISH REJIMI
      const newUser = {
        id: Date.now(),
        name: cleanName,
        role: formData.role,
        pin: cleanPin,
        canSeeSales: formData.role === 'waiter' ? Boolean(formData.canSeeSales) : (formData.role === 'admin')
      };
      if (typeof setUsers === 'function') {
        setUsers(prev => [...prev, newUser]);
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Yangi xodim qo'shildi", `${cleanName} (${formData.role}) tizimga qo'shildi`);
      }
    }

    // Formani tozalash
    setFormData({ name: '', role: 'waiter', pin: '', canSeeSales: true });
  };

  const handleEdit = (user) => {
    setEditingId(user.id);
    setFormData({
      name: user.name || '',
      role: user.role || 'waiter',
      pin: String(user.pin || ''),
      canSeeSales: user.canSeeSales !== undefined ? Boolean(user.canSeeSales) : true
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Ofitsiantning savdoni ko'rish ruxsatini kartochkaning o'zidan 1-bosishda o'zgartirish
  const handleToggleWaiterSalesPermission = (user) => {
    if (typeof setUsers !== 'function') return;
    const nextVal = !user.canSeeSales;

    setUsers(prev => prev.map(u => 
      u.id === user.id ? { ...u, canSeeSales: nextVal } : u
    ));

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        "Ofitsiant huquqi o'zgardi",
        `${user.name}: Shaxsiy savdoni ko'rish -> ${nextVal ? 'Ruxsat berildi' : 'Taqiqlandi'}`
      );
    }
  };

  const handleDelete = (user) => {
    // 1. O'zining aktiv profilini o'chirishdan himoya
    if (currentUser && user.id === currentUser.id) {
      alert("⛔️ Siz hozir ushbu Admin profili orqali tizimda o'tiribsiz! O'zingizning profilingizni o'chira olmaysiz.");
      return;
    }

    // 2. Eng oxirgi Adminni o'chirib yuborishdan himoya
    if (user.role === 'admin') {
      const adminCount = safeUsers.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        alert("⛔️ Diqqat! Tizimda kamida 1 ta Admin qolishi shart. Bu xodimni o'chira olmaysiz.");
        return;
      }
    }

    if (window.confirm(`Rostdan ham "${user.name}" (${getRoleMeta(user.role).badgeName}) xodimini tizimdan o'chirmoqchimisiz?`)) {
      if (typeof setUsers === 'function') {
        setUsers(prev => prev.filter(u => u.id !== user.id));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Xodim o'chirildi", `${user.name} (${user.role}) tizimdan o'chirildi`);
      }
      if (editingId === user.id) {
        handleCancel();
      }
    }
  };

  const togglePinVisibility = (id) => {
    setShowPins(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({ name: '', role: 'waiter', pin: '', canSeeSales: true });
  };

  // ==========================================
  // 4. FILTRLASH VA GURUHLASH
  // ==========================================
  const filteredUsers = useMemo(() => {
    return safeUsers.filter(user => {
      if (!user) return false;
      const isManagement = user.role === 'admin' || user.role === 'warehouse';
      const matchesGroup = 
        filterGroup === 'all' ? true :
        filterGroup === 'management' ? isManagement : !isManagement;

      const matchesSearch = !searchQuery.trim() || 
        String(user.name || '').toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        String(user.role || '').toLowerCase().includes(searchQuery.trim().toLowerCase());

      return matchesGroup && matchesSearch;
    });
  }, [safeUsers, filterGroup, searchQuery]);

  const managementCount = safeUsers.filter(u => u?.role === 'admin' || u?.role === 'warehouse').length;
  const staffCount = safeUsers.length - managementCount;

  // ==========================================
  // 5. RENDER (UI DIZAYN)
  // ==========================================
  const requiredLenForForm = getRequiredPinLength(formData.role);

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      
      {/* 1. XODIM QO'SHISH YOKI TAHRIRLASH FORMASI */}
      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <span>{editingId ? '✏️' : '➕'}</span> 
              {editingId ? "Xodim ma'lumotlarini tahrirlash" : "Yangi Xodim Qo'shish"}
            </h2>
            <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1">
              Boshqaruv (Admin/Omborchi) uchun 6 xonali, qolgan xodimlar uchun 4 xonali noyob PIN-kod beriladi.
            </p>
          </div>

          <span className={`text-xs font-black px-3 py-1.5 rounded-xl uppercase ${
            requiredLenForForm === 6
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
          }`}>
            {requiredLenForForm === 6 ? '👔 Boshqaruv guruhi (6 xonali)' : '👥 Xodimlar guruhi (4 xonali)'}
          </span>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Xodim Ismi */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
                Xodim Ismi *
              </label>
              <input 
                type="text" 
                name="name"
                value={formData.name} 
                onChange={handleInputChange} 
                placeholder="Masalan: Alisher" 
                required
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 outline-none focus:border-indigo-500 text-gray-900 dark:text-white font-bold transition"
              />
            </div>
            
            {/* Vazifasi (Roli) */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
                Vazifasi (Roli) *
              </label>
              <select 
                name="role"
                value={formData.role} 
                onChange={handleInputChange}
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 outline-none focus:border-indigo-500 text-gray-900 dark:text-white font-bold transition cursor-pointer"
              >
                {roleOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            
            {/* PIN-kod + Avto-generatsiya tugmasi */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                  PIN-kod ({requiredLenForForm} xonali) *
                </label>
                <button
                  type="button"
                  onClick={handleGenerateRandomPin}
                  className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  title="Takrorlanmas PIN-kodni avtomatik tanlash"
                >
                  🎲 Avto-PIN
                </button>
              </div>
              <input 
                type="text" 
                name="pin"
                inputMode="numeric"
                value={formData.pin} 
                onChange={handleInputChange} 
                placeholder={`${requiredLenForForm} ta raqam...`}
                required
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 outline-none focus:border-indigo-500 text-gray-900 dark:text-white font-black tracking-[0.25em] transition"
              />
            </div>

          </div>

          {/* Ofitsiant uchun qo'shimcha ruxsat (canSeeSales) va Tugmalar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2">
            <div>
              {formData.role === 'waiter' && (
                <label className="inline-flex items-center gap-2.5 cursor-pointer bg-gray-50 dark:bg-gray-900 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                  <input
                    type="checkbox"
                    name="canSeeSales"
                    checked={Boolean(formData.canSeeSales)}
                    onChange={handleInputChange}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                  <span className="text-xs font-black text-gray-700 dark:text-gray-300">
                    📊 Ofitsiant o'zining shaxsiy savdo summasini ko'ra olsin
                  </span>
                </label>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {editingId && (
                <button 
                  type="button" 
                  onClick={handleCancel}
                  className="flex-1 sm:flex-none px-6 py-3.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-xl font-bold transition active:scale-95"
                >
                  Bekor qilish
                </button>
              )}
              <button 
                type="submit" 
                className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3.5 rounded-xl font-black shadow-lg shadow-indigo-600/30 transition active:scale-95 whitespace-nowrap"
              >
                {editingId ? 'Saqlash 💾' : "Xodimni Qo'shish ➕"}
              </button>
            </div>
          </div>

        </form>
      </div>

      {/* 2. MAVJUD XODIMLAR RO'YXATI */}
      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
        
        {/* Sarlavha, Filtr Tablar va Qidiruv */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-gray-100 dark:border-gray-700 pb-4">
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white">
              👥 Hozirgi Xodimlar Ro'yxati
            </h3>
            <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1">
              Jami: {safeUsers.length} nafar • Boshqaruv: {managementCount} • Xodimlar: {staffCount}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 Ism bo'yicha qidirish..."
              className="flex-1 sm:w-48 px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-indigo-500"
            />

            <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
              {[
                { id: 'all', label: `Barchasi (${safeUsers.length})` },
                { id: 'management', label: `👔 Boshqaruv (${managementCount})` },
                { id: 'staff', label: `👥 Xodimlar (${staffCount})` }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterGroup(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                    filterGroup === tab.id
                      ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Xodimlar Kartochkalari */}
        {filteredUsers.length === 0 ? (
          <div className="text-center py-10 text-gray-400 font-bold">
            Xodimlar topilmadi.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map(user => {
              const isLongPin = getRequiredPinLength(user.role) === 6;
              const roleMeta = getRoleMeta(user.role);
              const safeName = String(user.name || 'Xodim');
              const isCurrentUser = currentUser && user.id === currentUser.id;
              
              return (
                <div 
                  key={user.id} 
                  className={`bg-gray-50 dark:bg-gray-900/50 p-5 rounded-2xl border-2 flex flex-col justify-between hover:shadow-md transition-all group ${
                    editingId === user.id
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black flex items-center justify-center text-xl shadow-sm">
                        {safeName.charAt(0).toUpperCase()}
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full ${
                          user.role === 'admin' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                          user.role === 'warehouse' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-indigo-50 text-indigo-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {roleMeta.icon} {roleMeta.badgeName}
                        </span>

                        {isCurrentUser && (
                          <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded-md">
                            🟢 Sizning profilingiz
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <h4 className="font-black text-lg text-gray-900 dark:text-white mb-1">
                      {safeName}
                    </h4>
                    
                    {/* PIN Kodni yashirish va ko'rsatish mantig'i */}
                    <div className="flex items-center gap-2 mt-2 bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700 w-max">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        PIN ({isLongPin ? '6' : '4'}):
                      </span>
                      <span className="font-black text-sm text-gray-900 dark:text-white tracking-[0.25em]">
                        {showPins[user.id] ? user.pin : '•'.repeat(isLongPin ? 6 : 4)}
                      </span>
                      <button 
                        type="button"
                        onClick={() => togglePinVisibility(user.id)}
                        className="ml-1 text-gray-400 hover:text-indigo-500 transition focus:outline-none"
                        title="Parolni ko'rsatish/yashirish"
                      >
                        {showPins[user.id] ? '🙈' : '👁️'}
                      </button>
                    </div>

                    {/* Ofitsiant uchun savdoni ko'rish ruxsati tugmasi */}
                    {user.role === 'waiter' && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => handleToggleWaiterSalesPermission(user)}
                          className={`text-[11px] font-black px-3 py-1.5 rounded-xl border transition ${
                            user.canSeeSales
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          {user.canSeeSales ? '📊 Savdoni ko\'ra oladi (Yoqilgan)' : '🔒 Savdo yashirilgan'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button 
                      type="button"
                      onClick={() => handleEdit(user)}
                      className="flex-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-xs font-black border border-gray-200 dark:border-gray-600 transition active:scale-95"
                    >
                      ✏️ Tahrirlash
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDelete(user)}
                      className="flex-1 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 py-2.5 rounded-xl text-xs font-black transition active:scale-95"
                    >
                      🗑 O'chirish
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}