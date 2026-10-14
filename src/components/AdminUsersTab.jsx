import React, { useState } from 'react';

export default function AdminUsersTab({ 
  users = [], 
  setUsers 
}) {
  // ==========================================
  // STATE'LAR (XOTIRA VA FORMALAR)
  // ==========================================
  const [editingId, setEditingId] = useState(null);
  const [showPins, setShowPins] = useState({}); // Qaysi xodimning parolini ochiq ko'rsatish
  
  // Yangi yoki tahrirlanayotgan xodim ma'lumotlari
  const [formData, setFormData] = useState({
    name: '',
    role: 'waiter',
    pin: ''
  });

  // Tizimdagi mavjud rollar va ularning PIN talablari
  const roleOptions = [
    { value: 'admin', label: 'Admin (6 xonali PIN)' },
    { value: 'warehouse', label: 'Omborchi (6 xonali PIN)' },
    { value: 'cashier', label: 'Kassir (4 xonali PIN)' },
    { value: 'waiter', label: 'Ofitsiant (4 xonali PIN)' },
    { value: 'kitchen', label: 'Oshpaz (4 xonali PIN)' }
  ];

  // Rol bo'yicha talab qilinadigan PIN uzunligini aniqlash (HIMOYA)
  const getRequiredPinLength = (role) => {
    return (role === 'admin' || role === 'warehouse') ? 6 : 4;
  };

  // ==========================================
  // CRUD FUNKSIYALARI (Qo'shish, Tahrirlash, O'chirish)
  // ==========================================

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Agar rol o'zgarsa, PIN-kodni tozalab yuboramiz (chunki uzunlik talabi o'zgarishi mumkin)
    if (name === 'role') {
      setFormData({ ...formData, role: value, pin: '' });
    } 
    // PIN kiritilayotganda faqat raqamlar va belgilangan uzunlikka ruxsat beramiz
    else if (name === 'pin') {
      const requiredLength = getRequiredPinLength(formData.role);
      // Faqat raqamlar va max uzunlikkacha ruxsat
      const onlyNums = value.replace(/[^0-9]/g, '').slice(0, requiredLength);
      setFormData({ ...formData, pin: onlyNums });
    } 
    // Boshqa maydonlar (Ism)
    else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validatsiya: Bo'sh maydonlarni tekshirish
    if (!formData.name.trim() || !formData.pin) {
      alert("Iltimos, ism va PIN-kodni to'liq kiriting!");
      return;
    }

    // Validatsiya: PIN uzunligini qat'iy tekshirish
    const requiredLength = getRequiredPinLength(formData.role);
    if (formData.pin.length !== requiredLength) {
      alert(`Xato! ${formData.role} roli uchun PIN-kod aynan ${requiredLength} xonali raqam bo'lishi shart!`);
      return;
    }

    if (editingId) {
      // Tahrirlash rejimida
      if (typeof setUsers === 'function') {
        setUsers(prev => prev.map(user => 
          user.id === editingId ? { ...user, ...formData } : user
        ));
      }
      setEditingId(null);
    } else {
      // Yangi xodim qo'shish rejimida
      const newUser = {
        id: Date.now(),
        name: formData.name.trim(),
        role: formData.role,
        pin: formData.pin
      };
      if (typeof setUsers === 'function') {
        setUsers(prev => [...prev, newUser]);
      }
    }

    // Formani tozalash
    setFormData({ name: '', role: 'waiter', pin: '' });
  };

  const handleEdit = (user) => {
    setEditingId(user.id);
    setFormData({
      name: user.name,
      role: user.role,
      pin: user.pin
    });
    // Ekranni tepasiga (formaga) olib chiqish
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id, role) => {
    // Eng oxirgi Adminni o'chirib yuborishdan himoya (tizimga kirolmay qolmaslik uchun)
    if (role === 'admin') {
      const adminCount = users.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        alert("⛔️ Diqqat! Tizimda kamida 1 ta Admin qolishi shart. Bu xodimni o'chira olmaysiz.");
        return;
      }
    }

    if (window.confirm("Rostdan ham bu xodimni o'chirmoqchimisiz?")) {
      if (typeof setUsers === 'function') {
        setUsers(prev => prev.filter(user => user.id !== id));
      }
    }
  };

  const togglePinVisibility = (id) => {
    setShowPins(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Bekor qilish tugmasi
  const handleCancel = () => {
    setEditingId(null);
    setFormData({ name: '', role: 'waiter', pin: '' });
  };

  // ==========================================
  // RENDER (UI DIZAYN)
  // ==========================================
  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      
      {/* 1. XODIM QO'SHISH YOKI TAHRIRLASH FORMASI */}
      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        
        <div className="mb-6">
          <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
            <span>{editingId ? '✏️' : '➕'}</span> 
            {editingId ? 'Xodim ma\'lumotlarini tahrirlash' : 'Yangi Xodim Qo\'shish'}
          </h2>
          <p className="text-sm font-bold text-gray-500 mt-1">
            Xodim ismini, vazifasini va tizimga kirish uchun maxfiy PIN-kodini belgilang.
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4">
          
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
              Xodim Ismi
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
          
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
              Vazifasi (Roli)
            </label>
            <select 
              name="role"
              value={formData.role} 
              onChange={handleInputChange}
              className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 outline-none focus:border-indigo-500 text-gray-900 dark:text-white font-bold transition cursor-pointer appearance-none"
            >
              {roleOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
              PIN-kod ({getRequiredPinLength(formData.role)} xonali)
            </label>
            <input 
              type="text" 
              name="pin"
              value={formData.pin} 
              onChange={handleInputChange} 
              placeholder={`Parol kiritish...`}
              required
              className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 outline-none focus:border-indigo-500 text-gray-900 dark:text-white font-black tracking-widest transition"
            />
          </div>
          
          <div className="flex items-end gap-2 mt-4 md:mt-0">
            {editingId && (
              <button 
                type="button" 
                onClick={handleCancel}
                className="p-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-xl font-bold transition active:scale-95"
              >
                Bekor
              </button>
            )}
            <button 
              type="submit" 
              className="flex-1 md:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-black shadow-lg shadow-indigo-600/30 transition active:scale-95 whitespace-nowrap"
            >
              {editingId ? 'Saqlash 💾' : 'Qo\'shish ➕'}
            </button>
          </div>

        </form>
      </div>

      {/* 2. MAVJUD XODIMLAR RO'YXATI */}
      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
        
        <div className="mb-6 flex justify-between items-end border-b border-gray-100 dark:border-gray-700 pb-4">
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white">
              👥 Hozirgi Xodimlar Ro'yxati
            </h3>
            <p className="text-sm font-bold text-gray-500 mt-1">
              Jami: {users.length} nafar xodim
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map(user => {
            const isLongPin = getRequiredPinLength(user.role) === 6;
            
            return (
              <div 
                key={user.id} 
                className="bg-gray-50 dark:bg-gray-900/50 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col justify-between hover:shadow-md transition-shadow group"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-black flex items-center justify-center text-xl shadow-sm">
                      {user.name.charAt(0)}
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full ${
                      user.role === 'admin' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                      user.role === 'warehouse' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {user.role}
                    </span>
                  </div>
                  
                  <h4 className="font-black text-lg text-gray-900 dark:text-white mb-1">
                    {user.name}
                  </h4>
                  
                  {/* PIN Kodni yashirish va ko'rsatish mantig'i */}
                  <div className="flex items-center gap-2 mt-2 bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-100 dark:border-gray-700 w-max">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                      PIN:
                    </span>
                    <span className="font-black text-gray-900 dark:text-white tracking-[0.3em]">
                      {showPins[user.id] ? user.pin : '•'.repeat(isLongPin ? 6 : 4)}
                    </span>
                    <button 
                      onClick={() => togglePinVisibility(user.id)}
                      className="ml-2 text-gray-400 hover:text-indigo-500 transition focus:outline-none"
                      title="Parolni ko'rsatish/yashirish"
                    >
                      {showPins[user.id] ? '👁️‍🗨️' : '👁️'}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button 
                    onClick={() => handleEdit(user)}
                    className="flex-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-sm font-black border border-gray-200 dark:border-gray-600 transition active:scale-95"
                  >
                    Tahrirlash
                  </button>
                  <button 
                    onClick={() => handleDelete(user.id, user.role)}
                    className="flex-1 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 py-2.5 rounded-xl text-sm font-black transition active:scale-95"
                  >
                    O'chirish
                  </button>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}