import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CLOSED_ORDER_STATUSES,
  DELIVERY_STATUS,
  KITCHEN_ORDER_STATUSES,
  ORDER_STATUS,
  PAYMENT_METHOD,
  isDeliveryOrder
} from '../constants/orderStatus';
import { getDeliveryStatus, mapsUrl, telUrl } from '../utils/delivery';
import { getCreatedTimeMs, isTodayMs } from '../utils/dates';
import { notify, confirmAsync } from '../utils/notify';

// Kuryer mijozdan qanday pul oldi (kassir shu usul bilan chekni yopadi)
const COLLECT_METHODS = [
  { id: PAYMENT_METHOD.CASH, label: '💵 Naqd' },
  { id: PAYMENT_METHOD.CARD, label: '💳 Karta (terminal)' },
  { id: PAYMENT_METHOD.CLICK, label: '📲 Click' },
  { id: PAYMENT_METHOD.PAYME, label: '📱 Payme' }
];

const playCourierBeep = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.12);
    osc.frequency.setValueAtTime(1100, now + 0.24);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);
  } catch {
    // brauzer ovozni bloklagan bo'lishi mumkin
  }
};

const money = (n) => `${(Number(n) || 0).toLocaleString()} so'm`;
const isOpen = (o) => !CLOSED_ORDER_STATUSES.includes(o.status);
const minutesSince = (ms, nowMs) => (ms ? Math.max(0, Math.floor((nowMs - Number(ms)) / 60000)) : null);
const agoText = (mins) => (mins === null ? '' : mins < 1 ? 'hozirgina' : mins < 60 ? `${mins} daq oldin` : `${Math.floor(mins / 60)} soat ${mins % 60} daq oldin`);

const KITCHEN_BADGE = {
  [ORDER_STATUS.NEW]: { text: '👨‍🍳 Oshxonada: yangi', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  [ORDER_STATUS.COOKING]: { text: '🔥 Tayyorlanmoqda', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  [ORDER_STATUS.READY]: { text: '✅ Tayyor, olib ketish mumkin', cls: 'bg-emerald-500 text-white' },
  [ORDER_STATUS.DELIVERED]: { text: '🍽 Topshirildi', cls: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300' }
};

export default function CourierMode({
  orders = [],
  setOrders,
  users = [],
  currentUser,
  addAuditLog
}) {
  const safeOrders = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);
  const isCourier = currentUser?.role === 'courier';
  const myName = String(currentUser?.name || '').trim();

  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'mine' | 'done'
  const [courierFilter, setCourierFilter] = useState('all'); // admin: kuryer bo'yicha filtr
  const [payingOrderId, setPayingOrderId] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const couriers = useMemo(
    () => (Array.isArray(users) ? users : []).filter(u => u && u.role === 'courier'),
    [users]
  );

  const log = (action, details) => {
    if (typeof addAuditLog === 'function') addAuditLog(action, details);
  };

  // ==========================================
  // 1. YETKAZISH BUYURTMALARINI GURUHLASH
  // ==========================================
  const deliveries = useMemo(
    () => safeOrders
      .filter(o => o && isDeliveryOrder(o) && o.status !== ORDER_STATUS.ARCHIVED)
      .sort((a, b) => (getCreatedTimeMs(a) || 0) - (getCreatedTimeMs(b) || 0)),
    [safeOrders]
  );

  // Avval id bo'yicha (kuryer ismi keyin o'zgartirilgan bo'lsa ham), keyin ism bo'yicha
  const isMine = (o) => {
    const d = o?.delivery;
    if (!d) return false;
    if (d.courierId != null && currentUser?.id != null) return String(d.courierId) === String(currentUser.id);
    return Boolean(myName) && String(d.courier || '').trim() === myName;
  };

  const groups = useMemo(() => {
    const active = deliveries.filter(o => isOpen(o) && getDeliveryStatus(o) !== DELIVERY_STATUS.DELIVERED);
    const unassigned = active.filter(o => !o.delivery?.courier);
    const assigned = active.filter(o => o.delivery?.courier);
    const doneToday = deliveries
      .filter(o => getDeliveryStatus(o) === DELIVERY_STATUS.DELIVERED && isTodayMs(o.delivery?.deliveredAt))
      .sort((a, b) => (Number(b.delivery?.deliveredAt) || 0) - (Number(a.delivery?.deliveredAt) || 0));
    // Mijozga topshirilgan, lekin kassir hali chekni yopmagan (pul kuryer qo'lida)
    const awaitingCashier = deliveries.filter(o => isOpen(o) && getDeliveryStatus(o) === DELIVERY_STATUS.DELIVERED);
    return { active, unassigned, assigned, doneToday, awaitingCashier };
  }, [deliveries]);

  const byCourierFilter = (list) => {
    if (isCourier) return list.filter(isMine);
    if (courierFilter === 'all') return list;
    return list.filter(o => String(o.delivery?.courier || '') === courierFilter);
  };

  const tabLists = {
    new: groups.unassigned,
    mine: byCourierFilter(groups.assigned),
    done: byCourierFilter(groups.doneToday)
  };
  const visibleOrders = tabLists[activeTab] || [];

  // Yangi buyurtma kelsa yoki menga biriktirilgani tayyor bo'lsa - ovoz
  const attentionCount = groups.unassigned.length +
    groups.assigned.filter(o => (isCourier ? isMine(o) : true) && o.status === ORDER_STATUS.READY).length;
  const prevAttentionRef = useRef(attentionCount);
  useEffect(() => {
    if (attentionCount > prevAttentionRef.current) playCourierBeep();
    prevAttentionRef.current = attentionCount;
  }, [attentionCount]);

  // ==========================================
  // 2. KUNLIK HISOBOT (kuryer bo'yicha)
  // ==========================================
  const courierStats = useMemo(() => {
    const map = {};
    const ensure = (name) => {
      const key = String(name || '').trim() || 'Biriktirilmagan';
      if (!map[key]) map[key] = { name: key, active: 0, deliveredToday: 0, feesToday: 0, cashInHand: 0, avgMinutes: 0, _mins: [] };
      return map[key];
    };
    couriers.forEach(c => ensure(c.name));
    groups.assigned.forEach(o => { ensure(o.delivery.courier).active += 1; });
    groups.doneToday.forEach(o => {
      const row = ensure(o.delivery?.courier);
      row.deliveredToday += 1;
      row.feesToday += Number(o.delivery?.fee) || 0;
      const picked = Number(o.delivery?.pickedAt) || 0;
      const done = Number(o.delivery?.deliveredAt) || 0;
      if (picked && done > picked) row._mins.push(Math.round((done - picked) / 60000));
    });
    groups.awaitingCashier.forEach(o => {
      if (o.delivery?.collectedMethod === PAYMENT_METHOD.CASH) {
        ensure(o.delivery?.courier).cashInHand += Number(o.total ?? o.finalTotal ?? 0) || 0;
      }
    });
    return Object.values(map).map(r => ({
      ...r,
      avgMinutes: r._mins.length ? Math.round(r._mins.reduce((s, m) => s + m, 0) / r._mins.length) : 0
    }));
  }, [couriers, groups]);

  const myStats = courierStats.find(r => r.name === myName) || { active: 0, deliveredToday: 0, feesToday: 0, cashInHand: 0, avgMinutes: 0 };

  // ==========================================
  // 3. AMALLAR
  // ==========================================
  // Buyurtmani yangilaydi. guard(o) false qaytarsa (boshqa qurilmada o'zgargan) - yozilmaydi
  const patchDelivery = (orderId, guard, buildPatch) => {
    let applied = false;
    setOrders(prev => (Array.isArray(prev) ? prev : []).map(o => {
      if (!o || String(o.id) !== String(orderId)) return o;
      if (guard && !guard(o)) return o;
      applied = true;
      const patch = buildPatch(o);
      return { ...o, ...patch.order, delivery: { ...(o.delivery || {}), ...patch.delivery } };
    }));
    return applied;
  };

  const handleAssign = (order, courierUser) => {
    if (!courierUser) return;
    const name = String(courierUser.name || '').trim();
    const ok = patchDelivery(
      order.id,
      o => isOpen(o) && getDeliveryStatus(o) !== DELIVERY_STATUS.ON_WAY && getDeliveryStatus(o) !== DELIVERY_STATUS.DELIVERED &&
        (!o.delivery?.courier || !isCourier),
      () => ({ delivery: { courier: name, courierId: courierUser.id ?? null, assignedAt: Date.now(), status: DELIVERY_STATUS.WAITING } })
    );
    if (!ok) {
      notify('⚠️ Bu buyurtmani boshqa kuryer olib bo\'lgan yoki u yo\'lda');
      return;
    }
    log(isCourier ? 'Kuryer buyurtmani oldi' : 'Kuryer biriktirildi', `${order.table}: ${name} • ${order.delivery?.address || ''}`);
    if (isCourier) setActiveTab('mine');
  };

  const handleUnassign = async (order) => {
    if (!await confirmAsync(`${order.table}: buyurtmadan voz kechasizmi? U yana "Yangi" ro'yxatiga qaytadi.`)) return;
    const prevCourier = order.delivery?.courier || '';
    const ok = patchDelivery(
      order.id,
      o => getDeliveryStatus(o) === DELIVERY_STATUS.WAITING && (!isCourier || isMine(o)),
      () => ({ delivery: { courier: '', courierId: null, assignedAt: null } })
    );
    if (ok) log('Kuryer voz kechdi', `${order.table}: ${prevCourier}`);
  };

  const handlePickUp = (order) => {
    if (KITCHEN_ORDER_STATUSES.includes(order.status)) {
      notify('⚠️ Buyurtma hali oshxonada tayyorlanmoqda');
      return;
    }
    const ok = patchDelivery(
      order.id,
      o => isOpen(o) && getDeliveryStatus(o) === DELIVERY_STATUS.WAITING && (!isCourier || isMine(o)),
      () => ({ delivery: { status: DELIVERY_STATUS.ON_WAY, pickedAt: Date.now() } })
    );
    if (ok) {
      log("Kuryer yo'lga chiqdi", `${order.table}: ${order.delivery?.courier || myName} • ${order.delivery?.address || ''} • ${money(order.total ?? order.finalTotal)}`);
    }
  };

  const handleDelivered = (order, method) => {
    const deliveredAt = Date.now();
    const ok = patchDelivery(
      order.id,
      o => isOpen(o) && getDeliveryStatus(o) === DELIVERY_STATUS.ON_WAY && (!isCourier || isMine(o)),
      () => ({
        order: { status: ORDER_STATUS.DELIVERED },
        delivery: { status: DELIVERY_STATUS.DELIVERED, deliveredAt, collectedMethod: method }
      })
    );
    setPayingOrderId(null);
    if (!ok) return;
    const mins = minutesSince(order.delivery?.pickedAt, deliveredAt);
    log(
      'Kuryer: mijozga yetkazildi',
      `${order.table}: ${order.delivery?.courier || myName} • ${money(order.total ?? order.finalTotal)} (${method})${mins !== null ? ` • yo'lda ${mins} daq` : ''}`
    );
    notify(`✅ ${order.table} yetkazildi. Pulni kassaga topshiring: ${money(order.total ?? order.finalTotal)} (${method})`);
  };

  // ==========================================
  // 4. KARTOCHKA
  // ==========================================
  const renderCard = (order) => {
    const d = order.delivery || {};
    const status = getDeliveryStatus(order);
    const inKitchen = KITCHEN_ORDER_STATUSES.includes(order.status);
    const kitchenBadge = KITCHEN_BADGE[order.status];
    const total = Number(order.total ?? order.finalTotal ?? 0) || 0;
    const dishes = (Array.isArray(order.items) ? order.items : []).filter(it => it && !it.isDeliveryFee);
    const createdMins = minutesSince(getCreatedTimeMs(order), nowMs);
    const onWayMins = minutesSince(d.pickedAt, nowMs);
    const canAct = !isCourier || !d.courier || isMine(order);
    const isPaid = order.status === ORDER_STATUS.PAID || order.status === ORDER_STATUS.DEBT;

    return (
      <div
        key={order.id}
        className={`bg-white dark:bg-gray-800 rounded-3xl border-2 p-4 flex flex-col gap-3 shadow-xs ${
          status === DELIVERY_STATUS.ON_WAY
            ? 'border-orange-400 dark:border-orange-500'
            : order.status === ORDER_STATUS.READY && status === DELIVERY_STATUS.WAITING
            ? 'border-emerald-400 dark:border-emerald-500'
            : 'border-gray-100 dark:border-gray-700'
        }`}
      >
        {/* Sarlavha */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-black text-lg text-gray-900 dark:text-white">🛵 {order.table}</h3>
            <p className="text-[11px] font-bold text-gray-400">
              🕒 {order.time || ''} • {agoText(createdMins)}{order.waiter ? ` • qabul qildi: ${order.waiter}` : ''}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="block font-black text-base text-orange-600 dark:text-orange-400">{money(total)}</span>
            {Number(d.fee) > 0 && (
              <span className="text-[10px] font-bold text-gray-400">shundan yetkazish: {money(d.fee)}</span>
            )}
          </div>
        </div>

        {/* Holat belgilari */}
        <div className="flex flex-wrap gap-1.5">
          {status === DELIVERY_STATUS.WAITING && kitchenBadge && (
            <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${kitchenBadge.cls}`}>{kitchenBadge.text}</span>
          )}
          {status === DELIVERY_STATUS.ON_WAY && (
            <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-orange-500 text-white">
              🛵 Yo'lda{onWayMins !== null ? `: ${onWayMins} daq` : ''}
            </span>
          )}
          {status === DELIVERY_STATUS.DELIVERED && (
            <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${
              isPaid
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
            }`}>
              {isPaid ? '✅ Kassaga topshirildi' : `💵 Kassaga topshirilmagan (${d.collectedMethod || 'Naqd'})`}
            </span>
          )}
          {d.courier && (
            <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
              👤 {d.courier}{isMine(order) ? ' (siz)' : ''}
            </span>
          )}
        </div>

        {/* Mijoz va manzil */}
        <div className="rounded-2xl bg-orange-50/70 dark:bg-gray-900/60 border border-orange-100 dark:border-gray-700 p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-black text-sm text-gray-900 dark:text-white truncate">
              {d.customerName || 'Mijoz'}
            </span>
            {d.phone && (
              <a
                href={telUrl(d.phone)}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-black text-xs active:scale-95"
              >
                📞 {d.phone}
              </a>
            )}
          </div>
          {d.address && (
            <a
              href={mapsUrl(d.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm font-bold text-indigo-700 dark:text-indigo-300 underline decoration-dotted break-words"
            >
              📍 {d.address}
            </a>
          )}
          {d.landmark && <p className="text-xs font-bold text-gray-600 dark:text-gray-300 break-words">🧭 Mo'ljal: {d.landmark}</p>}
          {d.note && <p className="text-xs font-black text-amber-700 dark:text-amber-300 break-words">📝 {d.note}</p>}
        </div>

        {/* Taomlar */}
        <ul className="text-xs font-bold text-gray-600 dark:text-gray-300 space-y-0.5">
          {dishes.map((it, idx) => (
            <li key={it.cartItemId || idx} className="flex justify-between gap-2">
              <span className="truncate">{Number(it.quantity ?? it.qty ?? 1) || 1}× {it.name || 'Taom'}</span>
              <span className="shrink-0 text-gray-400">{((Number(it.price) || 0) * (Number(it.quantity ?? it.qty ?? 1) || 1)).toLocaleString()}</span>
            </li>
          ))}
        </ul>

        {/* Amallar */}
        <div className="mt-auto pt-2 border-t border-gray-100 dark:border-gray-700 space-y-2">
          {status === DELIVERY_STATUS.WAITING && !d.courier && (
            isCourier ? (
              <button
                type="button"
                onClick={() => handleAssign(order, currentUser)}
                className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm shadow-md shadow-orange-500/25 active:scale-95 transition"
              >
                🙋 Men olib boraman
              </button>
            ) : couriers.length === 0 ? (
              <p className="text-xs font-bold text-red-600 dark:text-red-400">
                Kuryer yo'q. Boshqaruv → "Xodimlar va Parollar" bo'limida "🛵 Kuryer" bo'limli xodim qo'shing.
              </p>
            ) : (
              <select
                value=""
                onChange={e => handleAssign(order, couriers.find(c => String(c.id) === e.target.value))}
                className="w-full p-3 rounded-xl bg-orange-50 dark:bg-gray-900 border border-orange-200 dark:border-gray-700 font-black text-sm text-gray-900 dark:text-white cursor-pointer"
              >
                <option value="">👤 Kuryerni biriktirish...</option>
                {couriers.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
              </select>
            )
          )}

          {status === DELIVERY_STATUS.WAITING && d.courier && canAct && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleUnassign(order)}
                className="px-3 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-black text-xs active:scale-95 transition"
              >
                ↩️ Voz kechish
              </button>
              <button
                type="button"
                onClick={() => handlePickUp(order)}
                disabled={inKitchen}
                className={`flex-1 py-3 rounded-xl font-black text-sm transition active:scale-95 ${
                  inKitchen
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/25'
                }`}
              >
                {inKitchen ? '⏳ Oshxona tayyorlamoqda' : "🛵 Oldim, yo'lga chiqdim"}
              </button>
            </div>
          )}

          {status === DELIVERY_STATUS.ON_WAY && canAct && (
            String(payingOrderId) === String(order.id) ? (
              <div className="space-y-2">
                <p className="text-xs font-black text-gray-500">Mijoz qanday to'ladi? ({money(total)})</p>
                <div className="grid grid-cols-2 gap-2">
                  {COLLECT_METHODS.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleDelivered(order, m.id)}
                      className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs active:scale-95 transition"
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPayingOrderId(null)}
                  className="w-full py-2 rounded-xl text-gray-500 font-black text-xs"
                >
                  Bekor qilish
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPayingOrderId(order.id)}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md shadow-emerald-600/25 active:scale-95 transition"
              >
                ✅ Mijozga yetkazildi
              </button>
            )
          )}
        </div>
      </div>
    );
  };

  // ==========================================
  // 5. RENDER
  // ==========================================
  const statCards = isCourier
    ? [
        { label: 'Faol buyurtmalarim', value: myStats.active, cls: 'text-orange-600 dark:text-orange-400' },
        { label: 'Bugun yetkazdim', value: `${myStats.deliveredToday} ta`, cls: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Bugungi yetkazish haqi', value: money(myStats.feesToday), cls: 'text-indigo-600 dark:text-indigo-400' },
        { label: "Kassaga topshirish (naqd)", value: money(myStats.cashInHand), cls: myStats.cashInHand > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500' }
      ]
    : [
        { label: 'Kuryer kutmoqda', value: groups.unassigned.length, cls: 'text-red-600 dark:text-red-400' },
        { label: "Yo'lda / biriktirilgan", value: groups.assigned.length, cls: 'text-orange-600 dark:text-orange-400' },
        { label: 'Bugun yetkazildi', value: `${groups.doneToday.length} ta`, cls: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Kuryerlar qo\'lidagi naqd', value: money(courierStats.reduce((s, r) => s + r.cashInHand, 0)), cls: 'text-indigo-600 dark:text-indigo-400' }
      ];

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-8 animate-fade-in">
      {/* Sarlavha va ko'rsatkichlar */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-4 md:p-5 shadow-xs border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-500 text-white flex items-center justify-center text-2xl shadow-md shadow-orange-500/30">
              🛵
            </div>
            <div>
              <h2 className="font-black text-lg text-gray-900 dark:text-white leading-tight">Yetkazib berish</h2>
              <p className="text-xs font-bold text-gray-500">
                {isCourier
                  ? 'Buyurtmani oling, tayyor bo\'lgach yo\'lga chiqing, yetkazgach pulni kassaga topshiring'
                  : 'Yangi yetkazish buyurtmasi: Ofitsiant ekrani → "🛵 Yangi yetkazish"'}
              </p>
            </div>
          </div>

          {!isCourier && couriers.length > 0 && (
            <select
              value={courierFilter}
              onChange={e => setCourierFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-black text-gray-800 dark:text-white cursor-pointer"
            >
              <option value="all">👥 Barcha kuryerlar</option>
              {couriers.map(c => <option key={c.id} value={String(c.name)}>{c.name}</option>)}
            </select>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {statCards.map(s => (
            <div key={s.label} className="rounded-2xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{s.label}</p>
              <p className={`font-black text-base sm:text-lg mt-0.5 break-words ${s.cls}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tablar */}
      <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-white dark:bg-gray-800 rounded-2xl shadow-xs border border-gray-100 dark:border-gray-700">
        {[
          { id: 'new', label: '🆕 Yangi', count: tabLists.new.length },
          { id: 'mine', label: isCourier ? '🛵 Meniki' : "🛵 Yo'lda", count: tabLists.mine.length },
          { id: 'done', label: '✅ Bugun', count: tabLists.done.length }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-95 ${
              activeTab === tab.id
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {tab.label}
            <span className={`min-w-6 px-1.5 py-0.5 rounded-full text-[11px] ${
              activeTab === tab.id ? 'bg-white text-orange-600' : 'bg-gray-100 dark:bg-gray-700'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Buyurtmalar */}
      {visibleOrders.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-10 text-center text-gray-400 font-bold border border-gray-100 dark:border-gray-700">
          {activeTab === 'new'
            ? "Kuryer kutayotgan buyurtma yo'q"
            : activeTab === 'mine'
            ? "Faol yetkazish yo'q"
            : "Bugun hali yetkazilgan buyurtma yo'q"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleOrders.map(renderCard)}
        </div>
      )}

      {/* Admin: kuryerlar bo'yicha bugungi hisobot */}
      {!isCourier && courierStats.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-4 md:p-5 shadow-xs border border-gray-100 dark:border-gray-700">
          <h3 className="font-black text-base text-gray-900 dark:text-white mb-3">📊 Kuryerlar: bugungi natija</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400">
                  <th className="py-2 pr-3">Kuryer</th>
                  <th className="py-2 pr-3">Faol</th>
                  <th className="py-2 pr-3">Yetkazdi</th>
                  <th className="py-2 pr-3">O'rtacha yo'l</th>
                  <th className="py-2 pr-3">Yetkazish haqi</th>
                  <th className="py-2">Qo'lidagi naqd</th>
                </tr>
              </thead>
              <tbody className="font-bold text-gray-700 dark:text-gray-200">
                {courierStats.map(r => (
                  <tr key={r.name} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="py-2 pr-3 font-black">{r.name}</td>
                    <td className="py-2 pr-3">{r.active}</td>
                    <td className="py-2 pr-3">{r.deliveredToday} ta</td>
                    <td className="py-2 pr-3">{r.avgMinutes ? `${r.avgMinutes} daq` : '—'}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{money(r.feesToday)}</td>
                    <td className={`py-2 whitespace-nowrap ${r.cashInHand > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{money(r.cashInHand)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
