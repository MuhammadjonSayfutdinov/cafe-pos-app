// Sinov ma'lumoti: eski formatdagi xodimlar (xesh, ochiq PIN, 2FA), chek, mijoz... SQL chiqaradi (run.sh).
import crypto from 'node:crypto';
const sha = (b) => crypto.createHash('sha256').update(b).digest();
function pinHash(pin, salt = crypto.randomBytes(16).toString('hex'), it = 2000) {
  const s = Buffer.from(salt, 'hex');
  let d = sha(Buffer.from(`${salt}|${pin}`, 'utf8'));
  for (let i = 1; i < it; i++) d = sha(Buffer.concat([d, s]));
  return `s1$${it}$${salt}$${d.toString('hex')}`;
}
const backup = (code) => {
  const salt = crypto.randomBytes(8).toString('hex');
  return `b1$${salt}$${crypto.createHash('sha256').update(`${salt}|${code}`).digest('hex')}`;
};
const users = [
  { id: 1, name: 'Admin', role: 'admin', pinHash: pinHash('123456'), pinLength: 6 },
  { id: 2, name: 'Sardor', role: 'cashier', pin: '1111' },
  { id: 3, name: 'Ali', role: 'waiter', pinHash: pinHash('2222'), pinLength: 4, canSeeSales: true },
  { id: 5, name: 'Omborchi', role: 'warehouse', pinHash: pinHash('444444'), pinLength: 6 },
  {
    id: 'user_1732000000000_ab', name: 'Admin2', role: 'admin', appointedBy: '1', pinHash: pinHash('654321'), pinLength: 6,
    adminRights: { stats: true, warehouse: false, waiter: true, cashier: false, kitchen: true, courier: true, menu: false, categories: false, staff: true, logs: false, settings: false, approve: true, pinRules: false, addAdmins: true }
  },
  {
    id: 'user_1732000000001_cd', name: 'TwoFA', role: 'admin', pinHash: pinHash('111222'), pinLength: 6,
    twoFactor: { type: 'totp', secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', enabledAt: 1, backupCodes: [backup('1234567890'), backup('0987654321')] }
  }
];
const q = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const rows = users.map(u => `('pos_users','${u.id}',${q(u)})`);
rows.push(`('pos_orders','o1',${q({ id: 'o1', table: '1-Stol', status: 'Yangi', items: [] })})`);
rows.push(`('pos_customers','c1',${q({ id: 'c1', name: 'Mijoz', phone: '+998901234567' })})`);
rows.push(`('pos_expenses','e1',${q({ id: 'e1', amount: 1000 })})`);
rows.push(`('pos_audit_logs','a1',${q({ id: 'a1', action: 'test' })})`);
rows.push(`('pos_menu','m1',${q({ id: 'm1', name: 'Osh', price: 30000, is_available: true })})`);
console.log(`insert into pos_records (collection,id,data) values ${rows.join(',\n')};`);
console.log(`insert into pos_kv (key,value) values ('pos_cafe_name','"Kafe"'),('pos_tables','["1-Stol"]');`);
console.log(`insert into auth.users values ('11111111-1111-1111-1111-111111111111','kafe@x.uz');`);
console.log(`insert into auth.sessions (id,user_id) values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111');`);
