// src/utils/telegramNotifier.js

export const DEFAULT_TELEGRAM_CONFIG = {
  enabled: false,
  botToken: '',
  chatId: '',
  notifyOnZReport: true,       // Smena yopilganda (Z-Otchyot)
  notifyOnDebt: true,          // Chek qarzga yozilganda
  notifyOnDiscount: true,      // Chegirma berilganda
  notifyOnLowStock: true,      // Omborda xomashyo kam qolganda
  notifyOnEverySale: false,    // Har bir oddiy sotuvda
  notifyOnSecurity: true       // Muhim o'chirish va xavfsizlik amallarida
};

// LocalStorage'dan Telegram sozlamalarini xavfsiz o'qish
export const getTelegramConfig = () => {
  try {
    const raw = window.localStorage.getItem('pos_telegram_config');
    if (!raw) return DEFAULT_TELEGRAM_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_TELEGRAM_CONFIG, ...(parsed || {}) };
  } catch {
    return DEFAULT_TELEGRAM_CONFIG;
  }
};

// HTML belgilarni xavfsiz kodlash (Taom nomida <, >, & bo'lsa xato bermasligi uchun)
const escapeHtml = (str) => {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

// Asosiy xabar yuboruvchi funksiya (Bir yoki vergul bilan ajratilgan bir nechta Chat ID ga yuboradi)
export async function sendTelegramMessage(htmlText, eventType = 'general', customConfig = null) {
  const config = customConfig || getTelegramConfig();

  if (!config.enabled && eventType !== 'test') {
    return { ok: false, skipped: true, reason: "Telegram xabarnoma o'chirilgan" };
  }

  // Hodisa turiga qarab ruxsatni tekshirish
  if (eventType === 'z_report' && !config.notifyOnZReport) return { ok: false, skipped: true };
  if (eventType === 'debt' && !config.notifyOnDebt) return { ok: false, skipped: true };
  if (eventType === 'discount' && !config.notifyOnDiscount) return { ok: false, skipped: true };
  if (eventType === 'low_stock' && !config.notifyOnLowStock) return { ok: false, skipped: true };
  if (eventType === 'sale' && !config.notifyOnEverySale) return { ok: false, skipped: true };
  if (eventType === 'security' && !config.notifyOnSecurity) return { ok: false, skipped: true };

  const token = String(config.botToken || '').trim();
  const rawChatIds = String(config.chatId || '').trim();

  if (!token || !rawChatIds) {
    return { ok: false, error: 'Bot Token yoki Chat ID kiritilmagan!' };
  }

  // Vergul bilan bir nechta Chat ID yozilgan bo'lsa, har biriga yuboradi
  const chatIds = rawChatIds
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  try {
    const results = await Promise.all(
      chatIds.map(async (targetChatId) => {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChatId,
            text: htmlText,
            parse_mode: 'HTML',
            disable_web_page_preview: true
          })
        });
        return response.json();
      })
    );

    const firstError = results.find(r => !r.ok);
    if (firstError) {
      return { ok: false, error: firstError.description || 'Telegram API xatosi' };
    }

    return { ok: true, results };
  } catch (err) {
    console.warn('Telegram xabarini yuborishda internet xatosi:', err);
    return { ok: false, error: "Internet aloqasi yo'q yoki Telegram serveriga ulanib bo'lmadi." };
  }
}

// Botga /start bosgan rahbarning Chat ID sini avtomatik topib berish
export async function detectTelegramChatId(botToken) {
  const cleanToken = String(botToken || '').trim();
  if (!cleanToken) {
    return { ok: false, error: 'Avval Bot Tokenni kiriting!' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${cleanToken}/getUpdates`);
    const data = await res.json();

    if (!data.ok) {
      return { ok: false, error: data.description || "Bot Token noto'g'ri!" };
    }

    const updates = Array.isArray(data.result) ? data.result : [];
    if (updates.length === 0) {
      return {
        ok: false,
        error: "Xabarlar topilmadi! Telegramda botingizga kirib '/start' tugmasini bosing va qayta urinib ko'ring."
      };
    }

    // Eng oxirgi yozgan foydalanuvchi yoki guruhning Chat ID sini olamiz
    for (let i = updates.length - 1; i >= 0; i--) {
      const msg = updates[i].message || updates[i].my_chat_member || updates[i].channel_post;
      if (msg && msg.chat && msg.chat.id) {
        const chatTitle = msg.chat.title || `${msg.chat.first_name || ''} ${msg.chat.last_name || ''}`.trim() || msg.chat.username || 'Foydalanuvchi';
        return {
          ok: true,
          chatId: String(msg.chat.id),
          chatName: chatTitle
        };
      }
    }

    return { ok: false, error: "Chat ID topilmadi. Botga '/start' deb yozib qayta bosing." };
  } catch {
    return { ok: false, error: "Internet aloqasini tekshiring!" };
  }
}

// 1. Kassada chek yopilganda (Qarz, Chegirma, Oddiy sotuv va Kam qolgan mahsulotlar haqida xabar)
export async function notifyOrderClosedTelegram({
  order,
  totals,
  cafeName = 'Premium Cafe',
  lowStockAlerts = []
}) {
  if (!order) return;
  const config = getTelegramConfig();
  if (!config.enabled) return;

  const isDebt = order.paymentMethod === 'Qarz' || order.status === 'Qarz';
  const discountAmt = Number(totals?.discountAmount ?? order.discountAmount ?? 0) || 0;
  const finalAmt = Number(totals?.finalTotal ?? order.finalTotal ?? order.total ?? 0) || 0;
  const subTotalAmt = Number(totals?.subTotal ?? order.subTotal ?? finalAmt) || 0;
  const serviceAmt = Number(totals?.serviceFeeAmount ?? order.serviceFeeAmount ?? 0) || 0;

  const shouldSendOrderMsg =
    (isDebt && config.notifyOnDebt) ||
    (discountAmt > 0 && config.notifyOnDiscount) ||
    config.notifyOnEverySale;

  if (shouldSendOrderMsg) {
    const headerIcon = isDebt ? '📝 <b>YANGI NASIYA (QARZ) CHEKI!</b>' : discountAmt > 0 ? '🎁 <b>CHEGIRMALI CHEK YOPILDI</b>' : '🧾 <b>YANGI CHEK YOPILDI</b>';
    const itemsList = Array.isArray(order.items)
      ? order.items
          .map(i => {
            const q = Number(i?.quantity ?? i?.qty ?? 1) || 1;
            const p = Number(i?.price ?? i?.variants?.[0]?.price ?? 0) || 0;
            return `  • ${escapeHtml(i?.name)} (x${q}) — ${(p * q).toLocaleString()} s`;
          })
          .join('\n')
      : '';

    const lines = [
      `🏪 <b>${escapeHtml(cafeName)}</b>`,
      headerIcon,
      `━━━━━━━━━━━━━━━━━━`,
      `🪑 <b>Joy:</b> ${escapeHtml(order.table || 'Stol')}`,
      `👤 <b>Ofitsiant:</b> ${escapeHtml(order.waiterName || order.waiter || 'Ofitsiant')}`,
      `💻 <b>Kassir:</b> ${escapeHtml(order.cashierName || 'Kassir')}`,
      `🕒 <b>Vaqt:</b> ${escapeHtml(order.closeTime || new Date().toLocaleString())}`,
      isDebt ? `⚠️ <b>Qarzdor mijoz:</b> ${escapeHtml(order.debtorName || order.paymentDetails?.debtorName || "Kiritilmagan")}` : null,
      `━━━━━━━━━━━━━━━━━━`,
      `🍽 <b>Taomlar:</b>\n${itemsList}`,
      `━━━━━━━━━━━━━━━━━━`,
      `💵 Taomlar summasi: ${subTotalAmt.toLocaleString()} so'm`,
      serviceAmt > 0 ? `🛎 Xizmat haqi: +${serviceAmt.toLocaleString()} so'm` : null,
      discountAmt > 0 ? `🎁 <b>Chegirma: -${discountAmt.toLocaleString()} so'm</b>` : null,
      `💰 <b>JAMI TO'LOV: ${finalAmt.toLocaleString()} so'm</b>`,
      `💳 <b>To'lov usuli:</b> ${escapeHtml(order.paymentMethod || 'Naqd')}`
    ].filter(Boolean).join('\n');

    const eventType = isDebt ? 'debt' : discountAmt > 0 ? 'discount' : 'sale';
    await sendTelegramMessage(lines, eventType, config);
  }

  // Agar shu sotuvdan keyin omborda mahsulotlar qizil chegaradan kam qolgan bo'lsa
  if (config.notifyOnLowStock && Array.isArray(lowStockAlerts) && lowStockAlerts.length > 0) {
    const stockLines = [
      `⚠️ <b>OMBOR OGOHLANTIRISHI (${escapeHtml(cafeName)})</b>`,
      `Quyidagi mahsulotlar zaxirasi kam qoldi yoki tugadi:`,
      `━━━━━━━━━━━━━━━━━━`,
      ...lowStockAlerts.map(
        item => `🔻 <b>${escapeHtml(item.name)}:</b> ${item.quantity} ${escapeHtml(item.unit)} <i>(Min. me'yor: ${item.minLimit} ${escapeHtml(item.unit)})</i>`
      ),
      `━━━━━━━━━━━━━━━━━━`,
      `📦 Iltimos, omborga kirim qiling!`
    ].join('\n');

    await sendTelegramMessage(stockLines, 'low_stock', config);
  }
}

// 2. Z-Otchyot (Smena hisoboti) ni Telegramga yuborish
export async function sendZReportTelegram({
  cafeName = 'Premium Cafe',
  userName = 'Admin',
  scopeLabel = 'Joriy Smena',
  totalOrdersCount = 0,
  totalRevenue = 0,
  totalFoodCost = 0,
  totalNetProfit = 0,
  totalServiceFee = 0,
  totalDiscount = 0,
  averageReceipt = 0,
  paymentStats = {},
  popularItems = [],
  openTablesCount = 0,
  openTablesAmount = 0,
  totalDebtAmount = 0,
  forceSend = false
}) {
  const config = getTelegramConfig();
  if (!forceSend && (!config.enabled || !config.notifyOnZReport)) {
    return { ok: false, skipped: true };
  }

  const marginPct = totalRevenue > 0 ? ((totalNetProfit / totalRevenue) * 100).toFixed(1) : '0.0';
  const foodCostPct = totalRevenue > 0 ? ((totalFoodCost / totalRevenue) * 100).toFixed(1) : '0.0';

  const paymentLines = Object.entries(paymentStats)
    .map(([method, amt]) => `  • <b>${escapeHtml(method)}:</b> ${Number(amt || 0).toLocaleString()} so'm`)
    .join('\n');

  const topItemsLines = Array.isArray(popularItems) && popularItems.length > 0
    ? popularItems
        .map(([name, st], idx) => {
          const count = Number(st?.count ?? 0);
          const rev = Number(st?.revenue ?? 0);
          return `  ${idx + 1}. <b>${escapeHtml(name)}</b> — ${count} pors (${rev.toLocaleString()} s)`;
        })
        .join('\n')
    : '  • Sotuvlar mavjud emas';

  const message = [
    `📊 <b>Z-OTCHYOT | MOLIYAVIY HISOBOT</b>`,
    `🏪 <b>Kafe:</b> ${escapeHtml(cafeName)}`,
    `📌 <b>Holat:</b> ${escapeHtml(scopeLabel)}`,
    `👤 <b>Mas'ul:</b> ${escapeHtml(userName)}`,
    `📅 <b>Sana:</b> ${new Date().toLocaleString()}`,
    `━━━━━━━━━━━━━━━━━━`,
    `💰 <b>JAMI SAVDO TUSHUMI:</b> ${Number(totalRevenue).toLocaleString()} so'm`,
    `🥩 <b>Xomashyo Tannarxi (COGS):</b> -${Number(totalFoodCost).toLocaleString()} so'm (${foodCostPct}%)`,
    `💎 <b>HAQIQIY SOF FOYDA:</b> <b>+${Number(totalNetProfit).toLocaleString()} so'm (${marginPct}%)</b>`,
    `━━━━━━━━━━━━━━━━━━`,
    `🧾 <b>Yopilgan cheklar:</b> ${totalOrdersCount} ta`,
    `📈 <b>O'rtacha chek:</b> ${Number(averageReceipt).toLocaleString()} so'm`,
    `🛎 <b>Xizmat haqi ulushi:</b> ${Number(totalServiceFee).toLocaleString()} so'm`,
    `🎁 <b>Berilgan chegirmalar:</b> ${Number(totalDiscount).toLocaleString()} so'm`,
    `━━━━━━━━━━━━━━━━━━`,
    `💳 <b>TO'LOV TURLARI BO'YICHA:</b>\n${paymentLines}`,
    `━━━━━━━━━━━━━━━━━━`,
    `🔥 <b>TOP-5 XARIDORGIR TAOMLAR:</b>\n${topItemsLines}`,
    openTablesCount > 0 || totalDebtAmount > 0 ? `━━━━━━━━━━━━━━━━━━` : null,
    openTablesCount > 0 ? `🍽 <b>Zalda ochiq stollar:</b> ${openTablesCount} ta (${Number(openTablesAmount).toLocaleString()} s)` : null,
    totalDebtAmount > 0 ? `📓 <b>Jami kutilayotgan qarzlar:</b> ${Number(totalDebtAmount).toLocaleString()} so'm` : null
  ].filter(Boolean).join('\n');

  return sendTelegramMessage(message, forceSend ? 'test' : 'z_report', config);
}