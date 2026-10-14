import React from 'react';
import StatsOverviewCards from './StatsOverviewCards';
import StatsPaymentBreakdown from './StatsPaymentBreakdown';
import StatsPopularItems from './StatsPopularItems';

export default function StatsMode({ 
  orders = [], 
  setOrders, 
  currentUser 
}) {
  // Barcha xavfsizlik (Safe Mode) tekshiruvlari
  const safeOrders = Array.isArray(orders) ? orders : [];
  
  // Faqat joriy smenada "To'langan" statusidagi cheklarni olamiz
  const completedOrders = safeOrders.filter(o => o?.status === 'To\'langan');
  
  // ===============================================
  // 1. ASOSIY MOLIYAVIY HISOB-KITOBLAR
  // ===============================================
  const totalRevenue = completedOrders.reduce((sum, order) => {
    return sum + (Number(order?.finalTotal) || 0);
  }, 0);

  const totalDiscount = completedOrders.reduce((sum, order) => {
    return sum + (Number(order?.discountAmount) || 0);
  }, 0);

  const totalServiceFee = completedOrders.reduce((sum, order) => {
    return sum + (Number(order?.serviceFeeAmount) || 0);
  }, 0);

  const totalOrdersCount = completedOrders.length;
  
  const averageReceipt = totalOrdersCount > 0 
    ? Math.round(totalRevenue / totalOrdersCount) 
    : 0;
  
  // ===============================================
  // 2. TO'LOV TURLARI BO'YICHA HISOB-KITOB
  // ===============================================
  const paymentStats = completedOrders.reduce((acc, order) => {
    // Agar to'lov turi noma'lum bo'lsa, 'Naqd' deb qabul qilamiz
    const method = order?.paymentMethod || 'Naqd';
    const finalTotal = Number(order?.finalTotal) || 0;
    
    // Obyektda shu to'lov turi oldin bo'lsa unga qo'shamiz, yo'q bo'lsa yangi yaratamiz
    acc[method] = (acc[method] || 0) + finalTotal;
    
    return acc;
  }, {});

  // ===============================================
  // 3. TAOMLAR BO'YICHA STATISTIKA (TOP-5)
  // ===============================================
  const itemsStats = {};
  
  completedOrders.forEach(order => {
    if (Array.isArray(order?.items)) {
      order.items.forEach(item => {
        const itemName = item?.name || 'Noma\'lum taom';
        const itemQuantity = Number(item?.quantity) || 0;
        const itemPrice = Number(item?.price) || 0;

        if (!itemsStats[itemName]) {
          itemsStats[itemName] = { count: 0, revenue: 0 };
        }
        
        itemsStats[itemName].count += itemQuantity;
        itemsStats[itemName].revenue += (itemPrice * itemQuantity);
      });
    }
  });
  
  // Obyektni Array ga aylantirib, eng ko'p sotilgani bo'yicha saralaymiz va Top-5 ni qirqib olamiz
  const popularItems = Object.entries(itemsStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5); 

  // ===============================================
  // 4. Z-OTCHYOT (SMENANI YOPISH MANTIG'I)
  // ===============================================
  const handleCloseShift = () => {
    if (!window.confirm("⚠️ Diqqat! Z-Otchyotni yopmoqchimisiz? Barcha yopilgan cheklar arxivga o'tadi va kassa nollanadi.")) {
      return;
    }

    if (typeof setOrders === 'function') {
      // Hozirgi "To'langan" cheklarni "Arxiv" ga o'zgartiramiz, 
      // Kutilayotgan yoki Qarz cheklar o'z joyida (yangi smenada) qolaveradi.
      setOrders(prev => prev.map(order => {
        if (order.status === 'To\'langan') {
          return { ...order, status: 'Arxiv', archiveDate: new Date().toLocaleString() };
        }
        return order;
      }));
    }

    alert("✅ Smena muvaffaqiyatli yopildi! Kassa yozuvlari tozalandi.");
  };

  // ===============================================
  // RENDER (UI KOMPONENTLAR)
  // ===============================================
  return (
    <div className="animate-fade-in max-w-7xl mx-auto pb-12">
      
      {/* Sarlavha qismi */}
      <div className="mb-6 md:mb-8">
        <h2 className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
          <span className="text-4xl">📈</span> Boshqaruv Paneli va Z-Otchyot
        </h2>
        <p className="text-sm font-bold text-gray-500 mt-2 pl-12">
          Hozirgi smena tushumlari, sof foyda va to'liq moliyaviy nazorat markazi.
        </p>
      </div>

      {/* 1. KPI Kartochkalar (Tushum, Cheklar, Foyda) */}
      <StatsOverviewCards 
        totalRevenue={totalRevenue}
        totalOrdersCount={totalOrdersCount}
        totalServiceFee={totalServiceFee}
        totalDiscount={totalDiscount}
      />

      {/* 2. To'lov Turlari (Naqd, Plastik, Payme, Click...) va O'rtacha Chek */}
      <StatsPaymentBreakdown 
        paymentStats={paymentStats}
        averageReceipt={averageReceipt}
      />

      {/* 3. Top Taomlar va Smenani Yopish tugmasi */}
      <StatsPopularItems 
        popularItems={popularItems}
        onCloseShift={handleCloseShift}
      />
      
    </div>
  );
}