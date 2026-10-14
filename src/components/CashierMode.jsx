import React, { useState } from 'react';
import CashierOrderList from './CashierOrderList';
import CashierReceipt from './CashierReceipt';
import CashierPaymentControls from './CashierPaymentControls';

export default function CashierMode({ 
  orders = [], 
  setOrders, 
  menuItems = [], 
  serviceFee = 10, 
  onCloseOrder, 
  onPrintCheck, 
  currentUser,
  inventory = [],
  setInventory,
  setInventoryLogs,
  requireAdminOverride // RAHBAR RUXSATI (HIMOYA QATLAMI)
}) {
  // ==========================================
  // 1. STATE'LAR (XOTIRA)
  // ==========================================
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  const [paymentMethod, setPaymentMethod] = useState('Naqd'); 
  const [mixedCash, setMixedCash] = useState('');
  const [mixedCard, setMixedCard] = useState('');
  const [debtorName, setDebtorName] = useState('');
  
  const [discountType, setDiscountType] = useState('none'); 
  const [discountValue, setDiscountValue] = useState('');

  // Faqat aktiv (to'lanmagan va qarz bo'lmagan) cheklarni ajratib olish
  const activeOrders = orders.filter((order) => {
    return order.status !== 'To\'langan' && order.status !== 'Qarz';
  });

  // ==========================================
  // 2. CHEKNI TANLASH VA TOZALASH
  // ==========================================
  const handleSelectOrder = (order) => {
    setSelectedOrder(order);
    
    // Yangi chek tanlanganda barcha to'lov holatlarini nollaymiz
    setDiscountType('none');
    setDiscountValue('');
    setPaymentMethod('Naqd');
    setMixedCash('');
    setMixedCard('');
    setDebtorName('');
  };

  // ==========================================
  // 3. MATEMATIK HISOB-KITOB (TOTALS)
  // ==========================================
  const calculateTotals = (order) => {
    if (!order || !order.items) {
      return { 
        subTotal: 0, 
        serviceFeeAmount: 0, 
        discountAmount: 0, 
        finalTotal: 0 
      };
    }
    
    let subTotal = 0;
    
    // Har bir taom narxini miqdoriga ko'paytirib jami summaga qo'shamiz
    order.items.forEach((item) => {
      const price = Number(item.price) || 0;
      const quantity = Number(item.quantity) || 0;
      subTotal += (price * quantity);
    });
    
    // Xizmat haqi (Service Fee) ni hisoblash
    let serviceFeeAmount = Math.round(subTotal * (serviceFee / 100));
    
    // Chegirmani hisoblash
    let discountAmount = 0;
    
    if (discountType === 'percent' && discountValue) {
      const percentage = Number(discountValue) / 100;
      discountAmount = Math.round((subTotal + serviceFeeAmount) * percentage);
    } else if (discountType === 'sum' && discountValue) {
      discountAmount = Number(discountValue);
    }
    
    // Yakuniy mijoz to'lashi kerak bo'lgan summa
    let finalTotal = (subTotal + serviceFeeAmount) - discountAmount;
    
    // Manfiy raqam chiqib qolishidan himoya
    if (finalTotal < 0) {
      finalTotal = 0;
    }

    return { 
      subTotal: subTotal, 
      serviceFeeAmount: serviceFeeAmount, 
      discountAmount: discountAmount, 
      finalTotal: finalTotal 
    };
  };

  const totals = calculateTotals(selectedOrder);

  // ==========================================
  // 4. TO'LOVNI TASDIQLASH VA HIMOYA (OVERRIDE)
  // ==========================================
  const handlePaymentSubmit = () => {
    if (!selectedOrder) {
      return;
    }

    // Aralash to'lov yig'indisi to'g'riligini tekshirish
    if (paymentMethod === 'Aralash') {
      const totalMixed = Number(mixedCash) + Number(mixedCard);
      if (totalMixed !== totals.finalTotal) {
        alert(`Aralash to'lov summasi xato! Jami kutilayotgan summa: ${totals.finalTotal} so'm. Siz kiritdingiz: ${totalMixed} so'm.`);
        return;
      }
    }
    
    // Qarz daftariga ism yozilganligini tekshirish
    if (paymentMethod === 'Qarz') {
      if (!debtorName || debtorName.trim() === '') {
        alert("Qarzga yozish uchun mijoz ismini yoki telefon raqamini kiritish shart!");
        return;
      }
    }

    if (!window.confirm(`${selectedOrder.table} - To'lovni tasdiqlaysizmi?`)) {
      return;
    }

    // 🔥 RAHBAR HIMOYA QATLAMI: Agar chegirma qilingan bo'lsa
    if (totals.discountAmount > 0) {
      requireAdminOverride(`Mijozga chegirma qilish: ${totals.discountAmount} so'm`, () => {
        executePayment(); // Admin ruxsat bersagina to'lov bajariladi
      });
    } else {
      executePayment(); // Chegirma yo'q, to'g'ridan-to'g'ri to'lov bajariladi
    }
  };

  // ==========================================
  // 5. ASOSIY OPERATSIYA: TO'LOV VA OMBOR
  // ==========================================
  const executePayment = () => {
    let hasDeductions = false;
    const newInventory = [...inventory];
    const deductedItemsLog = [];

    // 5.1. OMBORDAN XOMASHYONI AYIRISH LOGIKASI
    selectedOrder.items.forEach((cartItem) => {
      const menuItem = menuItems.find((m) => m.id === cartItem.id);
      
      // Agar taomning retsepti (kalkulyatsiyasi) bazada mavjud bo'lsa
      if (menuItem && menuItem.recipe && menuItem.recipe.length > 0) {
        
        menuItem.recipe.forEach((rec) => {
          const invIndex = newInventory.findIndex((i) => i.id === rec.inventoryId);
          
          if (invIndex !== -1) {
            const totalDeduct = rec.qty * cartItem.quantity;
            const oldQuantity = newInventory[invIndex].quantity;
            const newQuantity = Math.max(0, oldQuantity - totalDeduct);
            
            // Qoldiqni yangilash
            newInventory[invIndex] = {
              ...newInventory[invIndex],
              quantity: newQuantity,
              lastUpdated: new Date().toLocaleString()
            };
            
            hasDeductions = true;
            deductedItemsLog.push(`${menuItem.name} uchun: ${totalDeduct} ${newInventory[invIndex].unit} ${newInventory[invIndex].name}`);
          }
        });
      }
    });

    // Agar omborda o'zgarish bo'lgan bo'lsa, bazaga va tarixga saqlaymiz
    if (hasDeductions) {
      if (typeof setInventory === 'function') {
        setInventory(newInventory);
      }
      
      if (typeof setInventoryLogs === 'function') {
        setInventoryLogs((prevLogs) => {
          return [
            {
              id: Date.now().toString(),
              date: new Date().toLocaleString(),
              type: 'Sotuv',
              itemName: `Chek: ${selectedOrder.table}`,
              diffAmount: `-`,
              unit: 'Avtomat',
              note: `Sotuvdan yechildi: ${deductedItemsLog.join(', ')}`,
              user: currentUser?.name || 'Kassir'
            }, 
            ...prevLogs
          ];
        });
      }
    }

    // 5.2. TO'LOV DETALLARINI SHAKLLANTIRISH (Barcha to'lov turlari kiritildi)
    const paymentDetails = {
      method: paymentMethod,
      cashAmount: paymentMethod === 'Aralash' ? Number(mixedCash) : (paymentMethod === 'Naqd' ? totals.finalTotal : 0),
      cardAmount: paymentMethod === 'Aralash' ? Number(mixedCard) : (paymentMethod === 'Plastik' ? totals.finalTotal : 0),
      paymeAmount: paymentMethod === 'Payme' ? totals.finalTotal : 0,
      clickAmount: paymentMethod === 'Click' ? totals.finalTotal : 0,
      debtorName: paymentMethod === 'Qarz' ? debtorName : null
    };

    // 5.3. BUYURTMANI YOPISH VA MA'LUMOTLARNI YANGILASH
    const updatedOrder = {
      ...selectedOrder,
      status: paymentMethod === 'Qarz' ? 'Qarz' : 'To\'langan',
      paymentMethod: paymentMethod,
      paymentDetails: paymentDetails,
      subTotal: totals.subTotal,
      serviceFeeAmount: totals.serviceFeeAmount,
      discountAmount: totals.discountAmount,
      finalTotal: totals.finalTotal,
      cashierName: currentUser?.name || 'Kassir',
      closeTime: new Date().toLocaleString()
    };

    // App.jsx dagi global funksiyani chaqirib, buyurtmani arxivga jo'natish
    if (typeof onCloseOrder === 'function') {
      onCloseOrder(updatedOrder);
    }
    
    // 5.4. CHEK CHIQARISH YOKI QARZ XABARNOMASI
    if (paymentMethod !== 'Qarz') {
      if (typeof onPrintCheck === 'function') {
        onPrintCheck(updatedOrder, totals);
      }
    } else {
      alert(`Qarz daftariga yozildi: Mijoz - ${debtorName}`);
    }

    // Ekrandagi tanlangan chekni tozalab, keyingi mijozni kutish holatiga o'tish
    handleSelectOrder(null);
  };

  // ==========================================
  // 6. RENDER QISMI (UI / DIZAYN)
  // ==========================================
  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-80px)] animate-fade-in">
      
      {/* 1-Qism: Kassa Cheklari Ro'yxati (Chap panel) */}
      <CashierOrderList 
        activeOrders={activeOrders}
        selectedOrder={selectedOrder}
        onSelectOrder={handleSelectOrder}
      />

      <div className="w-full lg:w-2/3 bg-gray-100 dark:bg-gray-900 rounded-3xl p-4 md:p-6 shadow-inner border border-gray-200 dark:border-gray-700 flex flex-col h-full overflow-y-auto">
        
        {/* Agar chek tanlanmagan bo'lsa, kutish ekrani chiqadi */}
        {!selectedOrder ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <span className="text-6xl mb-4 opacity-50">💵</span>
            <h3 className="text-xl font-black text-gray-500">
              To'lov qabul qilish uchun chap tomondan chekni tanlang
            </h3>
          </div>
        ) : (
          
          /* Chek tanlangan bo'lsa, uni ikki ustunga bo'lib ko'rsatamiz */
          <div className="flex flex-col lg:flex-row gap-6 h-full">
            
            {/* 2-Qism: Chek detali va hisob kitobi */}
            <CashierReceipt 
              selectedOrder={selectedOrder}
              totals={totals}
              serviceFee={serviceFee}
            />
            
            {/* 3-Qism: Chegirma va To'lov usullarini tanlash boshqaruvi */}
            <CashierPaymentControls 
              discountType={discountType} 
              setDiscountType={setDiscountType}
              
              discountValue={discountValue} 
              setDiscountValue={setDiscountValue}
              
              paymentMethod={paymentMethod} 
              setPaymentMethod={setPaymentMethod}
              
              mixedCash={mixedCash} 
              setMixedCash={setMixedCash}
              
              mixedCard={mixedCard} 
              setMixedCard={setMixedCard}
              
              debtorName={debtorName} 
              setDebtorName={setDebtorName}
              
              onPaymentSubmit={handlePaymentSubmit}
            />
            
          </div>
        )}

      </div>

    </div>
  );
}