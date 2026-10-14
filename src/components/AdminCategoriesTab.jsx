import React, { useState } from 'react';

export default function AdminCategoriesTab({ menuCategories = [], setMenuCategories }) {
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [catName, setCatName] = useState('');

  const safeCategories = Array.isArray(menuCategories) ? menuCategories : ['Asosiy'];

  const handleOpenModal = (index = null) => {
    if (index !== null) {
      setEditingIndex(index);
      setCatName(safeCategories[index]);
    } else {
      setEditingIndex(null);
      setCatName('');
    }
    setIsCatModalOpen(true);
  };

  const handleSaveCategory = (e) => {
    e.preventDefault();
    const safeCat = catName.trim();
    if (!safeCat) return;

    // Bir xil nomli toifa qo'shilishidan himoya
    const isDuplicate = safeCategories.some((c, i) => c.toLowerCase() === safeCat.toLowerCase() && i !== editingIndex);
    if (isDuplicate) {
      alert("Bu toifa allaqachon mavjud!"); return;
    }

    if (editingIndex !== null) {
      // Tahrirlash
      const newCats = [...safeCategories];
      newCats[editingIndex] = safeCat;
      setMenuCategories(newCats);
      alert("✅ Toifa yangilandi!");
    } else {
      // Yangi qo'shish
      setMenuCategories([...safeCategories, safeCat]);
      alert("✅ Yangi toifa qo'shildi!");
    }
    setIsCatModalOpen(false);
  };

  const handleDeleteCategory = (index, name) => {
    if (window.confirm(`Rostdan ham "${name}" toifasini butunlay o'chirmoqchimisiz?`)) {
      setMenuCategories(prev => prev.filter((_, i) => i !== index));
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-gray-700 animate-fade-in max-w-3xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">📁 Toifalar (Kategoriyalar)</h2>
            <p className="text-xs font-bold text-gray-500 mt-1">Menyudagi bo'limlarni tahrirlash yoki yangi toifa qo'shish.</p>
          </div>
          <button 
            onClick={() => handleOpenModal(null)} 
            className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-black transition active:scale-95 shadow-md flex justify-center items-center gap-2"
          >
            <span>+</span> Yangi Toifa Qo'shish
          </button>
        </div>

        <div className="space-y-3">
          {safeCategories.length === 0 ? (
            <div className="text-center py-6 text-gray-400 font-bold">Toifalar mavjud emas.</div>
          ) : (
            safeCategories.map((cat, index) => (
              <div key={index} className="flex justify-between items-center p-4 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 transition hover:shadow-sm">
                <span className="font-bold text-gray-800 dark:text-gray-200">{cat}</span>
                <div className="flex gap-2">
                  <button onClick={() => handleOpenModal(index)} className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg font-bold text-xs transition">Tahrirlash</button>
                  <button onClick={() => handleDeleteCategory(index, cat)} className="px-3 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg font-bold text-xs transition">O'chirish</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* TOIFALAR MODALI (Asosiy qutidan tashqarida) */}
      {isCatModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3 dark:border-gray-700">
              <h3 className="font-black text-lg text-gray-900 dark:text-white">
                {editingIndex !== null ? '✏️ Toifani Tahrirlash' : '📁 Yangi Toifa'}
              </h3>
              <button onClick={() => setIsCatModalOpen(false)} className="text-gray-500 hover:text-red-500 font-bold text-xl">✕</button>
            </div>
            
            <form onSubmit={handleSaveCategory} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Toifa Nomi *</label>
                <input 
                  type="text" required autoFocus
                  value={catName} 
                  onChange={e => setCatName(e.target.value)} 
                  className="w-full p-3 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 font-bold text-gray-900 dark:text-white outline-none focus:border-emerald-500 transition" 
                  placeholder="Masalan: Ichimliklar" 
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setIsCatModalOpen(false)} className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white py-3 rounded-xl font-bold transition active:scale-95">Bekor qilish</button>
                <button type="submit" className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-black shadow-lg transition active:scale-95">Saqlash</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}