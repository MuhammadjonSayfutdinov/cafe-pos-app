// Sinxron dvigateli + server xavfsizligi (src/sync/engine.js, 8-band): soxta "security.sql" server bilan.
// Tasdiqlanmagan qurilma, yashirin to'plamni o'chirish, rad etilgan yozuv (held) va xodim kirgach qayta
// yuborish, server qaytargan (PIN xeshisiz) xodim yozuvi + qurilmadagi PIN keshi.
import { beforeAll, describe, expect, it } from 'vitest';

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

const win = new EventTarget();
win.localStorage = new MemStorage();
globalThis.window = win;
globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });

const ls = () => window.localStorage;
const readLs = (k) => JSON.parse(ls().getItem(k) || 'null');

// ---------- soxta server ----------
const server = {
  status: 'pending',
  staff: null,
  hidden: ['pos_customers', 'pos_expenses', 'pos_shifts', 'pos_inv_logs', 'pos_audit_logs'],
  records: new Map(),
  kv: new Map([['pos_cafe_name', 'Kafe']]),
  state() {
    return { installed: true, status: this.status, staff: this.staff, hidden: this.status === 'trusted' ? this.hidden : ['*'], label: '' };
  },
  visible() {
    return [...this.records.values()].filter(r => this.status === 'trusted' && !this.hidden.includes(r.collection));
  },
  put(collection, id, data) {
    this.records.set(`${collection}:${id}`, { collection, id, data, deleted: false, updated_at: new Date().toISOString() });
  }
};
server.put('pos_users', '1', { id: 1, name: 'Admin', role: 'admin', pinOn: true, pinLength: 6, pinSetAt: 0 });
server.put('pos_customers', 'c1', { id: 'c1', name: 'Mijoz', phone: '+998' });
server.put('pos_menu', 'm1', { id: 'm1', name: 'Osh', price: 30000 });

const transport = {
  kind: 'supabase',
  secure: true,
  identity: async () => 'test|cafe',
  getSession: async () => ({ user: { email: 'kafe@test.uz' } }),
  signIn: async () => ({}),
  signOut: async () => {},
  fetchAll: async () => ({ records: server.visible(), kv: [...server.kv].map(([key, value]) => ({ key, value })) }),
  fetchSome: async ({ collections = [] }) => ({
    records: server.visible().filter(r => collections.includes(r.collection)),
    kv: []
  }),
  rpc: async (fn) => {
    if (fn === 'pos_device_hello') return server.state();
    throw new Error(`kutilmagan rpc ${fn}`);
  },
  pushRecords: async () => { throw new Error("to'g'ridan-to'g'ri yozish yopiq"); },
  pushKv: async () => { throw new Error("to'g'ridan-to'g'ri yozish yopiq"); },
  pushRecordsSecure: async (rows) => {
    const rejected = [];
    const changed = [];
    rows.forEach(r => {
      if (r.collection === 'pos_menu' && server.staff?.id !== '1') {
        rejected.push({ collection: r.collection, id: r.id, reason: 'menu_right' });
        return;
      }
      let data = r.data;
      if (r.collection === 'pos_users') {
        const { pinHash: _h, twoFactor: _t, ...rest } = data;
        data = { ...rest, pinOn: true };
        changed.push({ collection: r.collection, id: r.id, data });
      }
      server.put(r.collection, r.id, data);
    });
    return { ok: rows.length - rejected.length, rejected, changed };
  },
  pushKvSecure: async (rows) => ({ ok: rows.length, rejected: [] }),
  subscribe: () => () => {}
};

let engine;
beforeAll(async () => {
  // Qurilmada yangilanishdan oldingi ma'lumot: mijozlar (endi yashirin) va eski PIN xeshi bilan admin
  const { withPin } = await import('../src/utils/pinHash');
  const legacyAdmin = withPin({ id: 1, name: 'Admin', role: 'admin' }, '123456');
  delete legacyAdmin.pinSetAt;
  ls().setItem('pos_users', JSON.stringify([legacyAdmin]));
  ls().setItem('pos_customers', JSON.stringify([{ id: 'c1', name: 'Mijoz', phone: '+998' }]));
  ls().setItem('pos_menu', JSON.stringify([{ id: 'm1', name: 'Osh', price: 30000 }]));
  engine = await import('../src/sync/engine');
  engine.configureSync(transport);
});

describe('server xavfsizligi bilan sinxron', () => {
  it("tasdiqlanmagan qurilma sinxronlanmaydi ('device' holati)", async () => {
    await engine.bootSync();
    expect(engine.getSyncStatus().state).toBe('device');
    expect(engine.getSyncStatus().security.status).toBe('pending');
  });

  it("tasdiqlangach: yashirin to'plam qurilmadan o'chadi, xodimga PIN keshi qo'shiladi", async () => {
    server.status = 'trusted';
    await engine.bootSync();
    expect(engine.getSyncStatus().state).toBe('online');
    expect(readLs('pos_customers')).toEqual([]);
    const admin = readLs('pos_users').find(u => String(u.id) === '1');
    expect(admin.pinOn).toBe(true);
    // Server xeshni bermadi, lekin qurilmadagi eski xesh keshdan qo'shildi: internetsiz ham kiradi
    const { checkPin } = await import('../src/utils/pinHash');
    expect(checkPin(admin, '123456')).toBe(true);
    expect(engine.isServerSecurityActive()).toBe(true);
  });

  it("ruxsat yo'q o'zgarish navbatni to'xtatmaydi: kutmoqda (held)", async () => {
    const next = [{ id: 'm1', name: 'Osh', price: 1 }];
    ls().setItem('pos_menu', JSON.stringify(next));
    engine.localWrite('pos_menu', next);
    await engine.flush();
    expect(engine.getSyncStatus().held).toBe(1);
    expect(engine.getSyncStatus().pending).toBe(0);
    expect(engine.getHeldChanges()[0]).toMatchObject({ collection: 'pos_menu', id: 'm1', reason: 'menu_right' });
    expect(server.records.get('pos_menu:m1').data.price).toBe(30000);
  });

  it("admin serverda kirdi: yashirin to'plam yuklanadi, kutayotgan o'zgarish qayta yuboriladi", async () => {
    server.staff = { id: '1', name: 'Admin' };
    server.hidden = [];
    engine.applyDeviceState(server.state());
    expect(engine.getSyncStatus().held).toBe(0);
    await engine.flush();
    expect(server.records.get('pos_menu:m1').data.price).toBe(1);
    await new Promise(r => setTimeout(r, 20));
    expect(readLs('pos_customers')).toEqual([{ id: 'c1', name: 'Mijoz', phone: '+998' }]);
  });

  it('server PIN xeshisiz qaytargan xodim yozuvi qurilmaga yoziladi', async () => {
    const { withPin } = await import('../src/utils/pinHash');
    const users = readLs('pos_users');
    const next = [...users, withPin({ id: 'user_2', name: 'Ali', role: 'waiter' }, '246810')];
    ls().setItem('pos_users', JSON.stringify(next));
    engine.localWrite('pos_users', next);
    await engine.flush();
    const ali = readLs('pos_users').find(u => u.id === 'user_2');
    expect(ali.pinOn).toBe(true);
    expect(ali.pinHash).toBeUndefined(); // admin qurilmasida ofitsiantning xeshi qolmaydi
    expect(server.records.get('pos_users:user_2').data.pinHash).toBeUndefined();
  });

  it("chiqqach (umumiy ruxsat) maxfiy to'plam yana o'chadi", () => {
    server.staff = null;
    server.hidden = ['pos_customers'];
    engine.applyDeviceState(server.state());
    expect(readLs('pos_customers')).toEqual([]);
  });

  it("bloklangan qurilma: maxfiy ma'lumot va PIN keshi o'chadi", async () => {
    server.status = 'revoked';
    engine.applyDeviceState(server.state());
    expect(engine.getSyncStatus().state).toBe('device');
    expect(readLs('pos_menu')).toEqual([]);
    expect(ls().getItem('cafe_pin_cache')).toBe('{}');
  });
});
