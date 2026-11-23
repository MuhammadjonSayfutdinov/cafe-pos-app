// Bulutda sinxronlash: qaysi ma'lumot serverga chiqadi.
//
// RECORD_COLLECTIONS - har bir element alohida yozuv (id bo'yicha). Qiymat: boshqa qurilmadan
//   kelgan yangi yozuv ro'yxatning boshiga ('prepend') yoki oxiriga ('append') qo'shiladi.
// KV_KEYS - butun qiymat bitta yozuv (sozlamalar).
// Qolgan barcha kalitlar (tungi rejim, PIN bloki, oshxona ekrani sozlamalari, savatchalar)
// faqat shu qurilmada qoladi.

export const SAME_TAB_EVENT = 'local-storage-update';

export const RECORD_COLLECTIONS = Object.freeze({
  pos_orders: 'prepend',
  pos_menu: 'append',
  pos_users: 'append',
  pos_inventory: 'append',
  pos_inv_logs: 'prepend',
  pos_customers: 'prepend',
  pos_expenses: 'prepend',
  pos_audit_logs: 'prepend',
  pos_calls: 'append',
  pos_qr_requests: 'prepend' // mijoz telefonidan QR-buyurtma so'rovlari (supabase/qr.sql)
});

export const KV_KEYS = Object.freeze([
  'pos_cafe_name',
  'pos_service_fee',
  'pos_tables',
  'pos_categories',
  'pos_override_enabled',
  'pos_telegram_config',
  'pos_reservations',
  'pos_table_timers',
  'pos_waiter_payroll_rules',
  'pos_revenue_target_limit'
]);

export const isRecordCollection = (key) => Object.prototype.hasOwnProperty.call(RECORD_COLLECTIONS, key);
export const isKvKey = (key) => KV_KEYS.includes(key);
export const isSyncedKey = (key) => isRecordCollection(key) || isKvKey(key);

// Sinxronlashning o'z xizmat kalitlari (faqat qurilmada)
export const OUTBOX_KEY = 'pos_sync_outbox';
export const DEVICE_ID_KEY = 'pos_device_id';
export const INIT_IDENTITY_KEY = 'pos_sync_identity';
export const LAST_SERVER_TS_KEY = 'pos_sync_last_ts';
