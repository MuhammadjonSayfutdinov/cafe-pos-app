import React, { useState, useMemo } from 'react';
import CashierOrderList from './CashierOrderList';
import CashierReceipt from './CashierReceipt';
import CashierPaymentControls from './CashierPaymentControls';

export default function CashierMode({ 
  orders = [], 
  setOrders, 
  menuItems = [], 
  serviceFee = 10, 
  onCloseOrder, 
  onUpdateStatus,
  onPrintCheck, 
  onPrintReceipt,
  currentUser,
  inventory = [],
  setInventory,
  setInventoryLogs,
  requireAdminOverride,
  addAuditLog
}) {
  // ==========================================
  // 1. STATE'LAR (XOTIRA)
  // ==========================================
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  
  const [paymentMethod, setPaymentMethod] = useState('Naqd'); 
  const [mixedCash, setMixedCash] = useState('');
  const [mixedCard, setMixedCard] = useState('');
  const [debtorName, setDebtorName] = useState('');
  
  const [discountType, setDiscountType] = useState('none'); 
  const [discountValue, setDiscountValue] = useState('');

  // Xavfsiz massivlar
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];
  const safeInventory = Array.isArray(inventory) ? inventory : [];

  // Faqat aktiv (to'lanmagan va qarz bo'lmagan) cheklarni ajratib olish
  const activeOrders = useMemo(() => {
    return safeOrders.filter((order) => {
      return order && order.status !== "To'langan" && order.status !== 'Qarz';
    });
  }, [safeOrders]);

  // Tanlangan chekni doim jonli bazadan o'qiymiz
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return null;
    return activeOrders.find((order) => order.id === selectedOrderId) || null;
  }, [activeOrders, selectedOrderId]);

  // ==========================================
  // 2. CHEKNI TANLASH VA TOZALASH
  // ==========================================
  const handleSelectOrder = (order) => {
    setSelectedOrderId(order ? order.id : null);
    
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
    if (!order || !Array.isArray(order.items)) {
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
      if (!item) return;
      const price = Number(item.price ?? item.variants?.[0]?.price ?? 0) || 0;
      const quantity = Number(item.quantity ?? item.qty ?? 1) || 0;
      subTotal += (price * quantity);
    });
    
    // "Olib ketish" uchun xizmat haqi 0% bo'ladi
    const isTakeaway = order.table === 'Olib ketish';
    const effectiveFeePercent = isTakeaway 
      ? 0 
      : (Number(order.serviceFee !== undefined ? order.serviceFee : serviceFee) || 0);

    const serviceFeeAmount = Math.round(subTotal * (effectiveFeePercent / 100));
    const grossTotal = subTotal + serviceFeeAmount;
    
    // Chegirmani xavfsiz hisoblash (0 dan grossTotal gacha)
    let discountAmount = 0;
    const rawDiscount = Math.max(0, Number(discountValue) || 0);
    
    if (discountType === 'percent' && rawDiscount > 0) {
      const validPercent = Math.min(100, rawDiscount);
      discountAmount = Math.round(grossTotal * (validPercent / 100));
    } else if (discountType === 'sum' && rawDiscount > 0) {
      discountAmount = Math.min(grossTotal, Math.round(rawDiscount));
    }
    
    // Yakuniy mijoz to'lashi kerak bo'lgan summa
    const finalTotal = Math.max(0, grossTotal - discountAmount);

    return { 
      subTotal, 
      serviceFeeAmount, 
      discountAmount, 
      finalTotal 
    };
  };

  const totals = calculateTotals(selectedOrder);

  // ==========================================
  // 4. TO'LOVNI TASDIQLASH VA HIMOYA (OVERRIDE)
  // ==========================================
  const handlePaymentSubmit = () => {
    if (!selectedOrder) return;

    // Aralash to'lov yig'indisi to'g'riligini tekshirish
    if (paymentMethod === 'Aralash') {
      const cashNum = Number(mixedCash) || 0;
      const cardNum = Number(mixedCard) || 0;
      const totalMixed = cashNum + cardNum;

      if (cashNum < 0 || cardNum < 0 || totalMixed !== totals.finalTotal) {
        alert(
          `Aralash to'lov summasi xato! Jami kutilayotgan summa: ${totals.finalTotal.toLocaleString()} so'm. Siz kiritdingiz: ${totalMixed.toLocaleString()} so'm.`
        );
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
    if (totals.discountAmount > 0 && typeof requireAdminOverride === 'function') {
      requireAdminOverride(
        `Mijozga chegirma qilish: ${totals.discountAmount.toLocaleString()} so'm (${selectedOrder.table})`, 
        () => {
          executePayment(); // Admin ruxsat bersagina to'lov bajariladi
        }
      );
    } else {
      executePayment(); // Chegirma yo'q, to'g'ridan-to'g'ri to'lov bajariladi
    }
  };

  // ==========================================
  // 5. ASOSIY OPERATSIYA: TO'LOV VA OMBOR
  // ==========================================
  const executePayment = () => {
    if (!selectedOrder) return;

    // 5.1. OMBORDAN XOMASHYONI AYIRISH LOGIKASI (Faqat avval ayrilmagan bo'lsa)
    if (!selectedOrder.inventoryDeducted && safeInventory.length > 0 && safeMenuItems.length > 0) {
      let hasDeductions = false;
      const newInventory = [...safeInventory];
      const deductedItemsLog = [];

      (selectedOrder.items || []).forEach((cartItem) => {
        const menuItem = safeMenuItems.find(
          (m) => m && (String(m.id) === String(cartItem.id) || m.name === cartItem.baseName || m.name === cartItem.name)
        );
        
        const recipeList = menuItem?.recipe || menuItem?.ingredients;
        if (Array.isArray(recipeList) && recipeList.length > 0) {
          const itemQuantity = Number(cartItem.quantity ?? cartItem.qty ?? 1) || 1;

          recipeList.forEach((rec) => {
            const targetInvId = String(rec.inventoryId ?? rec.productId ?? rec.id ?? '');
            const invIndex = newInventory.findIndex((i) => i && String(i.id) === targetInvId);
            
            if (invIndex !== -1) {
              const recQty = Number(rec.qty ?? rec.amount ?? 0) || 0;
              const totalDeduct = recQty * itemQuantity;
              const oldQuantity = Number(newInventory[invIndex].quantity ?? newInventory[invIndex].qty ?? 0) || 0;
              const newQuantity = Math.max(0, Number((oldQuantity - totalDeduct).toFixed(3)));
              
              newInventory[invIndex] = {
                ...newInventory[invIndex],
                quantity: newQuantity,
                qty: newQuantity,
                lastUpdated: new Date().toLocaleString()
              };
              
              hasDeductions = true;
              deductedItemsLog.push(
                `${menuItem.name} uchun: ${totalDeduct} ${newInventory[invIndex].unit || ''} ${newInventory[invIndex].name}`
              );
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
          setInventoryLogs((prevLogs) => [
            {
              id: `${Date.now()}_${Math.random()}`,
              date: new Date().toLocaleString(),
              type: 'Sotuv',
              itemName: `Chek: ${selectedOrder.table}`,
              productName: `Chek: ${selectedOrder.table}`,
              diffAmount: '-',
              amount: '-',
              unit: 'Avtomat',
              note: `Sotuvdan yechildi: ${deductedItemsLog.join(', ')}`,
              reason: `Sotuvdan yechildi: ${deductedItemsLog.join(', ')}`,
              user: currentUser?.name || 'Kassir'
            }, 
            ...(Array.isArray(prevLogs) ? prevLogs : [])
          ]);
        }
      }
    }

    // 5.2. TO'LOV DETALLARINI SHAKLLANTIRISH
    const cleanDebtor = debtorName.trim();
    const paymentDetails = {
      method: paymentMethod,
      cashAmount: paymentMethod === 'Aralash' ? Number(mixedCash) : (paymentMethod === 'Naqd' ? totals.finalTotal : 0),
      cardAmount: paymentMethod === 'Aralash' ? Number(mixedCard) : (paymentMethod === 'Plastik' ? totals.finalTotal : 0),
      paymeAmount: paymentMethod === 'Payme' ? totals.finalTotal : 0,
      clickAmount: paymentMethod === 'Click' ? totals.finalTotal : 0,
      debtorName: paymentMethod === 'Qarz' ? cleanDebtor : null
    };

    const nextStatus = paymentMethod === 'Qarz' ? 'Qarz' : "To'langan";

    // 5.3. BUYURTMANI YOPISH VA MA'LUMOTLARNI YANGILASH
    const updatedOrder = {
      ...selectedOrder,
      status: nextStatus,
      paymentMethod: paymentMethod,
      paymentDetails: paymentDetails,
      debtorName: paymentMethod === 'Qarz' ? cleanDebtor : null,
      subTotal: totals.subTotal,
      subtotal: totals.subTotal,
      serviceFeeAmount: totals.serviceFeeAmount,
      discountAmount: totals.discountAmount,
      finalTotal: totals.finalTotal,
      total: totals.finalTotal,
      inventoryDeducted: true,
      cashierName: currentUser?.name || 'Kassir',
      closeTime: new Date().toLocaleString(),
      date: selectedOrder.date || new Date().toLocaleDateString()
    };

    // Global orders state'ni yangilash (setOrders, onCloseOrder va onUpdateStatus bilan mos)
    if (typeof setOrders === 'function') {
      setOrders((prev) =>
        (Array.isArray(prev) ? prev : []).map((o) =>
          o.id === selectedOrder.id ? updatedOrder : o
        )
      );
    }

    if (typeof onCloseOrder === 'function') {
      onCloseOrder(updatedOrder);
    } else if (typeof onUpdateStatus === 'function') {
      onUpdateStatus(selectedOrder.id, nextStatus, updatedOrder);
    }

    // Audit Log'ga yozish
    if (typeof addAuditLog === 'function') {
      addAuditLog(
        paymentMethod === 'Qarz' ? "Chek Qarzga Yopildi" : "Chek To'landi",
        `${selectedOrder.table} • ${totals.finalTotal.toLocaleString()} so'm (${paymentMethod})` +
        (paymentMethod === 'Qarz' ? ` • Qarzdor: ${cleanDebtor}` : '')
      );
    }
    
    // 5.4. CHEK CHIQARISH YOKI QARZ XABARNOMASI
    const printHandler = onPrintCheck || onPrintReceipt;
    if (paymentMethod !== 'Qarz') {
      if (typeof printHandler === 'function') {
        printHandler(updatedOrder, totals);
      }
    } else {
      alert(`Qarz daftariga yozildi: Mijoz - ${cleanDebtor}`);
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
            
            {/* 2-Qism: Chek detali va hisob-kitobi */}
            <CashierReceipt 
              selectedOrder={selectedOrder}
              totals={totals}
              serviceFee={selectedOrder.table === 'Olib ketish' ? 0 : serviceFee}
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