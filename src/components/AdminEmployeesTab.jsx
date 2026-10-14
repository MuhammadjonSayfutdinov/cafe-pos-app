import React, { useState } from 'react';

export default function AdminEmployeesTab({ users = [], setUsers }) {
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [newEmployeeData, setNewEmployeeData] = useState({ name: '', role: 'waiter', pin: '', canSeeSales: false });

  const handleOpenEmployeeModal = (emp = null) => {
    if (emp) {
      setEditingEmployee(emp);
      setNewEmployeeData({ name: emp.name, role: emp.role, pin: emp.pin, canSeeSales: emp.canSeeSales || false });
    } else {
      setEditingEmployee(null);
      setNewEmployeeData({ name: '', role: 'waiter', pin: '', canSeeSales: false });
    }
    setIsEmployeeModalOpen(true);
  };

  const handleSaveEmployee = (e) => {
    e.preventDefault();
    const safeName = newEmployeeData.name.trim();
    const safePin = newEmployeeData.pin.trim();

    if (!safeName || !safePin) { alert("Ism va PIN shart!"); return; }

    const isPinTaken = users.some(u => u.pin === safePin && u.id !== editingEmployee?.id);
    if (isPinTaken) { alert("Bu PIN kod band!"); return; }

    if (editingEmployee) {
      setUsers(prev => prev.map(u => u.id === editingEmployee.id ? { ...u, ...newEmployeeData, name: safeName, pin: safePin } : u));
    } else {
      setUsers(prev => [...prev, { id: Date.now(), ...newEmployeeData, name: safeName, pin: safePin }]);
    }
    setIsEmployeeModalOpen(false);
  };

  const handleDeleteEmployee = (id, name, role) => {
    if (role === 'admin') { alert("Adminni o'chirib bo'lmaydi!"); return; }
    if (window.confirm(`"${name}" o'chirilsinmi?`)) {
      setUsers(prev => prev.filter(u => u.id !== id));
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-700 animate-fade-in">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h2 className="text-xl font-black text-gray-900 dark:text-white">👥 Xodimlar va Rollar</h2>
          <button onClick={() => handleOpenEmployeeModal(null)} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-black transition active:scale-95 shadow-md flex items-center justify-center gap-2">
            <span>+</span> Yangi Xodim
          </button>
        </div>

        <div className="overflow-x-auto bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700">
                <th className="p-4 text-xs font-bold text-gray-500 uppercase">Ismi</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase">Roli</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase">PIN</th>
                <th className="p-4 text-xs font-bold text-gray-500 uppercase text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {users.map(emp => (
                <tr key={emp.id} className="hover:bg-white dark:hover:bg-gray-800 transition">
                  <td className="p-4 font-bold text-gray-900 dark:text-gray-100">{emp.name}</td>
                  <td className="p-4 text-sm font-bold uppercase text-blue-500">{emp.role}</td>
                  <td className="p-4 font-black tracking-widest text-gray-600 dark:text-gray-300">{emp.pin}</td>
                  <td className="p-4 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => handleOpenEmployeeModal(emp)} className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg font-bold text-xs transition">Tahrir</button>
                    <button onClick={() => handleDeleteEmployee(emp.id, emp.name, emp.role)} disabled={emp.role === 'admin'} className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${emp.role === 'admin' ? 'bg-gray-100 text-gray-400' : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>O'chirish</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isEmployeeModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <h3 className="font-black text-lg text-gray-900 dark:text-white">{editingEmployee ? '✏️ Tahrirlash' : '👥 Yangi Xodim'}</h3>
              <button onClick={() => setIsEmployeeModalOpen(false)} className="text-gray-500 hover:text-red-500 font-bold text-xl">✕</button>
            </div>
            
            <form onSubmit={handleSaveEmployee} className="space-y-4 pt-2">
              <input type="text" required value={newEmployeeData.name} onChange={e => setNewEmployeeData({...newEmployeeData, name: e.target.value})} className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white outline-none" placeholder="Ismi" />
              <select value={newEmployeeData.role} onChange={e => setNewEmployeeData({...newEmployeeData, role: e.target.value})} className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white outline-none cursor-pointer">
                <option value="waiter">Ofitsiant</option>
                <option value="cashier">Kassir</option>
                <option value="kitchen">Oshpaz</option>
                {/* YANNGI ROL: OMBORCHI */}
                <option value="warehouse">Omborchi (Manager)</option>
                <option value="admin">Admin</option>
              </select>
              <input type="number" required min="1000" value={newEmployeeData.pin} onChange={e => setNewEmployeeData({...newEmployeeData, pin: e.target.value})} className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 font-black tracking-widest text-gray-900 dark:text-white outline-none" placeholder="PIN KOD" />
              {newEmployeeData.role === 'waiter' && (
                <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600">
                  <input type="checkbox" id="canSeeSales" checked={newEmployeeData.canSeeSales} onChange={e => setNewEmployeeData({...newEmployeeData, canSeeSales: e.target.checked})} className="w-5 h-5 accent-blue-600" />
                  <label htmlFor="canSeeSales" className="text-sm font-bold text-gray-700 dark:text-gray-300 cursor-pointer">Savdo pullarini ko'rishi mumkin</label>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsEmployeeModalOpen(false)} className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-3 rounded-xl font-bold transition active:scale-95">Bekor</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black shadow-lg transition active:scale-95">Saqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}