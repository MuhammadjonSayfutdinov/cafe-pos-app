// Server xavfsizligi (6-bosqich, 2-qadam): PIN keshi, server belgilari, 6 xonali PIN.
// SQL tomoni (supabase/security.sql) bilan bir xil hisob: pastdagi xesh SQL'dagi pos_pin_digest dan olingan.
import { describe, expect, it } from 'vitest';
import {
  checkPin, copyPinFrom, hasLocalPin, hasPin, nextPinSetAt, pinLengthOf, withPin
} from '../src/utils/pinHash';
import {
  backupCodesLeft, disableTwoFactor, hasLocalTwoFactor, hasTwoFactor, keepTwoFactorFrom, withTwoFactor
} from '../src/utils/twoFactor';
import { base32Decode, hotp } from '../src/utils/totp';
import {
  VERIFIER_TTL_MS, decorateUser, decorateUsers, dropCachedBackupCode, forgetVerifier, isEntryValid,
  pruneVerifiers, refreshFromOwnWrite, rememberVerifier, seedFromUsers, touchVerifier
} from '../src/utils/verifierCache';
import { getRequiredPinLength, minKeptPinLength } from '../src/constants/roles';
import { verifyStaffPin } from '../src/sync/staffAuth';

const NOW = 1_800_000_000_000;

describe('server bilan bir xil hisob', () => {
  it("PIN xeshi SQL (pos_pin_digest) bilan bir xil", () => {
    const user = {
      pinHash: 's1$2000$00112233445566778899aabbccddeeff$6bc5e0de61525a09a89299152a7742c03098215851d2029708591083129f267e'
    };
    expect(checkPin(user, '123456')).toBe(true);
    expect(checkPin(user, '123457')).toBe(false);
    const short = { pinHash: 's1$10$a1b2c3d4e5f60718293a4b5c6d7e8f90$6b4051b56c7012369940cdaf4066217b6a6ab624cad2158ac71b9673ca537e77' };
    expect(checkPin(short, '1111')).toBe(true);
  });

  it('TOTP: RFC 4226 vektori (SQL dagi pos_hotp ham shuni beradi)', () => {
    const key = base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(hotp(key, 0)).toBe('755224');
    expect(hotp(key, 1)).toBe('287082');
  });
});

describe('PIN belgilari (xesh serverda)', () => {
  it("pinOn - PIN bor, lekin shu qurilmada tekshirib bo'lmaydi", () => {
    const u = { id: 3, pinOn: true, pinLength: 4, pinSetAt: 0 };
    expect(hasPin(u)).toBe(true);
    expect(hasLocalPin(u)).toBe(false);
    expect(pinLengthOf(u, 6)).toBe(4);
    expect(checkPin(u, '2222')).toBe(false);
  });

  it("yangi PIN vaqti doim eskisidan katta (soat orqada bo'lsa ham)", () => {
    expect(nextPinSetAt({ pinSetAt: NOW + 5000 }, NOW)).toBe(NOW + 5001);
    expect(nextPinSetAt({ pinSetAt: 0 }, NOW)).toBe(NOW);
    const u = withPin({ id: 1, name: 'A', pinOn: true, pinSample: true, pinSetAt: 5 }, '246810');
    expect(u.pinSetAt).toBeGreaterThan(5);
    expect(u.pinLength).toBe(6);
    expect(u.pinOn).toBeUndefined();
    expect(u.pinSample).toBeUndefined();
    expect(checkPin(u, '246810')).toBe(true);
  });

  it("zaxiradan tiklash PIN vaqtini o'zgartirmaydi (server yangi PIN deb olmaydi)", () => {
    const restored = copyPinFrom({ id: 1, name: 'fayldan' }, { id: 1, pinOn: true, pinLength: 6, pinSetAt: 42 });
    expect(restored).toMatchObject({ pinOn: true, pinLength: 6, pinSetAt: 42 });
    expect(restored.pinHash).toBeUndefined();
  });

  it('yangi PIN - hamma uchun 6 xonali, eski 4 xonali faqat xodimlarda qoladi', () => {
    expect(getRequiredPinLength('waiter')).toBe(6);
    expect(getRequiredPinLength('admin')).toBe(6);
    expect(minKeptPinLength('cashier')).toBe(4);
    expect(minKeptPinLength('warehouse')).toBe(6);
  });
});

describe('ikki bosqichli kirish belgilari', () => {
  it('twoFactorOn - yoqilgan, sir shu qurilmada emas', () => {
    const u = { id: 1, twoFactorOn: true, backupCodesLeft: 7, twoFactorAt: 10 };
    expect(hasTwoFactor(u)).toBe(true);
    expect(hasLocalTwoFactor(u)).toBe(false);
    expect(backupCodesLeft(u)).toBe(7);
  });

  it("o'chirish: twoFactor null va yangi vaqt (server ham o'chiradi)", () => {
    const off = disableTwoFactor({ id: 1, twoFactorOn: true, backupCodesLeft: 3, twoFactorAt: NOW * 2 });
    expect(off.twoFactor).toBeNull();
    expect(off.twoFactorAt).toBe(NOW * 2 + 1);
    expect(off.twoFactorOn).toBeUndefined();
    expect(hasTwoFactor(off)).toBe(false);
  });

  it('yoqish: yangi vaqt bilan', () => {
    const on = withTwoFactor({ id: 1, twoFactorAt: 5 }, 'JBSWY3DPEHPK3PXP', ['1234567890']);
    expect(on.twoFactorAt).toBeGreaterThan(5);
    expect(hasLocalTwoFactor(on)).toBe(true);
    expect(on.twoFactor.backupCodes[0]).toMatch(/^b1\$[0-9a-f]{16}\$[0-9a-f]{64}$/);
  });

  it('tiklashda serverdagi belgilar saqlanadi', () => {
    const kept = keepTwoFactorFrom({ id: 1, name: 'fayl' }, { id: 1, twoFactorOn: true, twoFactorAt: 77 });
    expect(kept).toMatchObject({ twoFactorOn: true, twoFactorAt: 77 });
    expect('twoFactor' in kept).toBe(false); // server sirini o'zgartirmaydi
  });
});

describe('PIN keshi (internetsiz kirish)', () => {
  const hashed = withPin({ id: 3, name: 'Ali', role: 'waiter' }, '246810');
  const verifier = { pinHash: hashed.pinHash, pinLength: 6, pinSetAt: hashed.pinSetAt, twoFactor: null, twoFactorAt: 0 };
  const serverRecord = { id: 3, name: 'Ali', role: 'waiter', pinOn: true, pinLength: 6, pinSetAt: hashed.pinSetAt };

  it("server bergan ma'lumot yozuvga qo'shiladi va PIN qurilmada tekshiriladi", () => {
    const cache = rememberVerifier({}, 3, verifier, NOW);
    const decorated = decorateUser(serverRecord, cache['3'], NOW);
    expect(checkPin(decorated, '246810')).toBe(true);
    expect(decorateUsers([serverRecord], cache, NOW)[0].pinHash).toBe(hashed.pinHash);
  });

  it("PIN boshqa qurilmada o'zgarsa kesh ishlatilmaydi", () => {
    const cache = rememberVerifier({}, 3, verifier, NOW);
    const changed = { ...serverRecord, pinSetAt: hashed.pinSetAt + 1000 };
    expect(isEntryValid(cache['3'], changed, NOW)).toBe(false);
    expect(decorateUser(changed, cache['3'], NOW)).toBe(changed);
  });

  it("2FA yoqilsa yoki o'chirilsa ham kesh eskiradi", () => {
    const cache = rememberVerifier({}, 3, verifier, NOW);
    expect(isEntryValid(cache['3'], { ...serverRecord, twoFactorAt: 5 }, NOW)).toBe(false);
  });

  it('30 kun shu qurilmada kirmagan xodimning keshi o\'chadi', () => {
    const cache = rememberVerifier({}, 3, verifier, NOW);
    expect(isEntryValid(cache['3'], serverRecord, NOW + VERIFIER_TTL_MS + 1)).toBe(false);
    expect(pruneVerifiers(cache, [serverRecord], NOW + VERIFIER_TTL_MS + 1)).toEqual({});
    const touched = touchVerifier(cache, 3, NOW + VERIFIER_TTL_MS - 10);
    expect(isEntryValid(touched['3'], serverRecord, NOW + VERIFIER_TTL_MS + 1)).toBe(true);
  });

  it("o'chirilgan xodimning keshi o'chadi", () => {
    const cache = rememberVerifier({}, 3, verifier, NOW);
    expect(pruneVerifiers(cache, [{ id: 9 }], NOW)).toEqual({});
    expect(forgetVerifier(cache, 3)).toEqual({});
  });

  it("yangilanishdan oldingi qurilma xeshlari keshga o'tadi (eski PIN - pinSetAt 0)", () => {
    const legacy = withPin({ id: 1, name: 'Admin', role: 'admin' }, '123456');
    delete legacy.pinSetAt;
    const cache = seedFromUsers({}, [legacy, { id: 2, pinOn: true }], NOW);
    expect(Object.keys(cache)).toEqual(['1']);
    // Server xeshni olib tashlagan yozuv (pinSetAt: 0) - kesh mos keladi
    const fromServer = { id: 1, name: 'Admin', role: 'admin', pinOn: true, pinLength: 6, pinSetAt: 0 };
    expect(checkPin(decorateUser(fromServer, cache['1'], NOW), '123456')).toBe(true);
  });

  it("qurilma o'zi yangi PIN bergan xodimning keshi yangilanadi", () => {
    const cache = rememberVerifier({}, 3, verifier, NOW);
    const newPin = withPin(serverRecord, '135790');
    const next = refreshFromOwnWrite(cache, newPin, NOW);
    expect(next['3'].pinSetAt).toBe(newPin.pinSetAt);
    expect(checkPin(decorateUser({ ...serverRecord, pinSetAt: newPin.pinSetAt }, next['3'], NOW), '135790')).toBe(true);
    // keshda bo'lmagan xodim - qo'shilmaydi
    expect(refreshFromOwnWrite({}, newPin, NOW)).toEqual({});
  });

  it('ishlatilgan zaxira kod keshdan ham olinadi', () => {
    const tf = withTwoFactor({ id: 5 }, 'JBSWY3DPEHPK3PXP', ['1234567890', '0987654321']).twoFactor;
    const cache = rememberVerifier({}, 5, { ...verifier, twoFactor: tf }, NOW);
    const next = dropCachedBackupCode(cache, 5, 0);
    expect(next['5'].twoFactor.backupCodes).toHaveLength(1);
    expect(dropCachedBackupCode(next, 5, 9)).toBe(next);
  });

  it("o'zgarish bo'lmasa ro'yxatning o'zi qaytadi (keraksiz yozuv va yuborish yo'q)", () => {
    const list = [serverRecord];
    expect(decorateUsers(list, {}, NOW)).toBe(list);
  });
});

describe('PIN tekshiruvi (server ulanmagan)', () => {
  const users = [
    withPin({ id: 1, name: 'Admin', role: 'admin' }, '123456'),
    withPin({ id: 3, name: 'Ali', role: 'waiter' }, '2222'),
    { id: 4, name: 'Server', role: 'waiter', pinOn: true, pinLength: 6 }
  ];

  it('qurilmada topiladi', async () => {
    const r = await verifyStaffPin({ users, pin: '2222', mode: 'login', group: 'staff', filter: u => u.role !== 'admin' });
    expect(r).toMatchObject({ ok: true, source: 'local', needCode: false });
    expect(r.user.name).toBe('Ali');
  });

  it("guruh filtri: ofitsiant PIN'i boshqaruvda o'tmaydi", async () => {
    const r = await verifyStaffPin({ users, pin: '2222', mode: 'login', filter: u => u.role === 'admin' });
    expect(r.ok).toBe(false);
  });

  it("qurilmada yo'q, server ulanmagan - noto'g'ri", async () => {
    const r = await verifyStaffPin({ users, pin: '999999', mode: 'verify' });
    expect(r).toMatchObject({ ok: false, reason: 'wrong' });
  });
});
