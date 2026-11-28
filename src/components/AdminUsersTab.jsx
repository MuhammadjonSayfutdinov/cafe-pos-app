import React, { useState, useMemo } from 'react';
import { notify, confirmAsync } from '../utils/notify';
import { newId } from '../utils/ids';
import { ROLE_OPTIONS, TITLE_SUGGESTIONS, getRequiredPinLength, minKeptPinLength } from '../constants/roles';
import { findPinOwner, hasPin, pinLengthOf, withPin } from '../utils/pinHash';
import { BACKUP_CODE_COUNT, backupCodesLeft, disableTwoFactor, hasTwoFactor, withTwoFactor } from '../utils/twoFactor';
import { isPinFreeOnServer } from '../sync/staffAuth';
import TwoFactorSetupModal from './TwoFactorSetupModal';
import TwoFactorCodeModal from './TwoFactorCodeModal';
import AdminRightsModal, { AdminRightsEditor } from './AdminRightsModal';
import {
  ALL_RIGHTS, canAddAdmins, canManageUser, clampRights, countRights, defaultAdminRights,
  describeRightsChange, getUserRights, grantableRights, hasRight, isAdminUser, isOwnerUser,
  makeOwnerRecord, userIdOf
} from '../utils/adminRights';
import { getPinLockRemainingMs, registerPinFailure } from '../utils/pinGuard';

const EMPTY_FORM = { name: '', title: '', role: 'waiter', pin: '', canSeeSales: true };
// Band PIN haqidagi javob: kimniki ekani aytilmaydi va urinishlar cheklanadi (aks holda admin
// PIN'larni birma-bir sinab, Ega PIN'ini bilib olishi mumkin edi)
const PIN_ASSIGN_SCOPE = 'pin_assign';

export default function AdminUsersTab({ 
  users = [], 
  setUsers,
  currentUser,
  // Ega (src/utils/adminRights.ts): uni hech kim o'zgartira olmaydi, adminlarga huquqni u beradi
  ownerId = null,
  setOwnerRecord,
  requireOwnerConfirm,
  cafeName = 'Kafe POS',
  addAuditLog
}) {
  // ==========================================
  // 1. STATE'LAR VA XAVFSIZ RO'YXAT
  // ==========================================
  const safeUsers = Array.isArray(users) ? users : [];

  // Kim amal qilyapti va nima qila oladi (bazadagi eng so'nggi yozuvdan)
  const actor = (currentUser && safeUsers.find(u => u && userIdOf(u) === userIdOf(currentUser))) || currentUser || null;
  const actorId = userIdOf(actor);
  const actorIsOwner = isOwnerUser(actor, ownerId);
  const canStaff = hasRight(actor, ownerId, 'staff');
  const canAdmins = canAddAdmins(actor, ownerId);
  const blankForm = () => ({ ...EMPTY_FORM, role: !canStaff && canAdmins ? 'admin' : 'waiter' });

  const [editingId, setEditingId] = useState(null);
  const [filterGroup, setFilterGroup] = useState('all'); // 'all' | 'management' | 'staff'
  const [searchQuery, setSearchQuery] = useState('');
  
  // Yangi yoki tahrirlanayotgan xodim ma'lumotlari.
  // title - lavozim nomi (admin o'zi yozadi), role - qaysi bo'limga kira oladi
  const [formData, setFormData] = useState(blankForm);
  // Formadagi admin huquqlari (null - standart: Telegram kabi ko'pi ochiq, admin tayinlash yopiq)
  const [formRights, setFormRights] = useState(null);
  // "🛡️ Huquqlar" oynasi ochilgan admin
  const [rightsTarget, setRightsTarget] = useState(null);

  // Ikki bosqichli kirish (src/utils/twoFactor.ts): yoqish oynasi va o'z hisobidan o'chirish tasdig'i
  const [twoFactorSetupUser, setTwoFactorSetupUser] = useState(null);
  const [twoFactorDisableUser, setTwoFactorDisableUser] = useState(null);

  // PIN ochiq matnda saqlanmaydi (src/utils/pinHash.ts): tahrirlashda maydon bo'sh turadi.
  // Bo'sh qoldirilsa eski PIN qoladi (yangi PIN - 6 xonali; eski 4 xonali PIN faqat xodimlar
  // guruhida qoladi, boshqaruvga o'tkazilsa 6 xonali PIN kerak).
  const editingUser = editingId ? safeUsers.find(u => u && u.id === editingId) : null;
  const canKeepPin = Boolean(editingUser) && hasPin(editingUser) &&
    pinLengthOf(editingUser, 6) >= minKeptPinLength(formData.role);
  // PIN bandligi serverda tekshirilayotgan payt (tugma qayta bosilmasin)
  const [saving, setSaving] = useState(false);
  // O'zini tahrirlash: faqat ism, lavozim nomi va PIN (o'z rolini va huquqini o'zgartira olmaydi)
  const isSelfEdit = Boolean(editingUser) && userIdOf(editingUser) === actorId;
  const showForm = canStaff || canAdmins || isSelfEdit;
  // Formadagi admin huquqlari (bera olmaydigani - qulf)
  const formGrantable = grantableRights(actor, ownerId);
  const effectiveFormRights = formRights || clampRights(defaultAdminRights(), actor, ownerId);

  // Tizimdagi mavjud rollar va ularning PIN talablari (yagona joy: src/constants/roles.js)
  const roleOptions = ROLE_OPTIONS.map(r => ({
    value: r.value,
    label: r.label === r.section
      ? `${r.icon} ${r.label} (${r.pinLength} xonali PIN)`
      : `${r.icon} ${r.label} — ${r.section} (${r.pinLength} xonali PIN)`,
    group: r.group,
    icon: r.icon,
    badgeName: r.label
  }));

  // Formada tanlash mumkin rollar: admin - "Yangi admin tayinlash" huquqi bilan, qolganlari - "Xodimlar"
  // huquqi bilan. O'zini tahrirlayotganda rol qotirilgan
  const formRoleOptions = isSelfEdit
    ? roleOptions.filter(r => r.value === editingUser.role)
    : roleOptions.filter(r => (r.value === 'admin' ? canAdmins : canStaff) || r.value === formData.role);

  const getRoleMeta = (role) => {
    return roleOptions.find(r => r.value === role) || {
      value: role,
      label: role,
      group: 'staff',
      icon: '👤',
      badgeName: role
    };
  };

  // ==========================================
  // 2. FORMA VA AVTO-PIN FUNKSIYALARI
  // ==========================================
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }));
      return;
    }

    // Agar rol o'zgarsa, PIN-kod uzunligi mos kelmasa tozalaymiz
    if (name === 'role') {
      const nextRequiredLen = getRequiredPinLength(value);
      const currentPin = formData.pin || '';
      setFormData(prev => ({
        ...prev,
        role: value,
        pin: currentPin.length === nextRequiredLen ? currentPin : '',
        canSeeSales: value === 'waiter' ? prev.canSeeSales : false
      }));
    } 
    // PIN kiritilayotganda faqat raqamlar va belgilangan uzunlikka ruxsat beramiz
    else if (name === 'pin') {
      const requiredLength = getRequiredPinLength(formData.role);
      const onlyNums = value.replace(/[^0-9]/g, '').slice(0, requiredLength);
      setFormData(prev => ({ ...prev, pin: onlyNums }));
    } 
    // Boshqa maydonlar (Ism)
    else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Takrorlanmas (bo'sh) PIN-kodni avtomatik generatsiya qilish
  const handleGenerateRandomPin = () => {
    const len = getRequiredPinLength(formData.role);
    const min = len === 6 ? 100000 : 1000;
    const max = len === 6 ? 999999 : 9999;

    let generated = '';
    let attempts = 0;

    do {
      generated = String(Math.floor(min + Math.random() * (max - min + 1)));
      attempts += 1;
    } while (
      findPinOwner(safeUsers, generated, editingId) &&
      attempts < 100
    );

    setFormData(prev => ({ ...prev, pin: generated }));
  };

  // ==========================================
  // 3. SAQLASH, TAHRIRLASH VA O'CHIRISH (CRUD)
  // ==========================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    
    const cleanName = (formData.name || '').trim();
    const cleanTitle = (formData.title || '').trim();
    const cleanPin = String(formData.pin || '').trim();
    const target = editingUser;
    // O'z rolini hech kim o'zgartira olmaydi (Ega ham: avval egalikni topshiradi)
    const nextRole = isSelfEdit ? target.role : formData.role;

    // 0. Huquq: Egani hech kim o'zgartira olmaydi; adminni - Ega yoki uni tayinlagan admin;
    // oddiy xodimni - "Xodimlar" huquqi bor admin
    if (target && !isSelfEdit && !canManageUser(actor, target, ownerId)) {
      notify(isOwnerUser(target, ownerId)
        ? "⛔️ Ega ma'lumotlarini hech kim o'zgartira olmaydi."
        : "⛔️ Bu xodimni o'zgartirishga huquqingiz yo'q.");
      return;
    }
    if (!isSelfEdit && (nextRole === 'admin' ? !canAdmins : !canStaff)) {
      notify(nextRole === 'admin'
        ? "⛔️ Admin tayinlash huquqingiz yo'q (faqat Ega yoki u ruxsat bergan admin)."
        : "⛔️ Xodim qo'shish yoki o'zgartirish huquqingiz yo'q.");
      return;
    }

    // 1. Validatsiya: Bo'sh maydonlarni tekshirish
    if (!cleanName || (!cleanPin && !canKeepPin)) {
      notify(target && hasPin(target)
        ? "Bu xodimda eski qisqa PIN: Boshqaruv guruhi uchun yangi 6 xonali PIN-kod kiriting!"
        : "Iltimos, xodim ismini va PIN-kodni to'liq kiriting!");
      return;
    }

    // 2. Validatsiya: PIN uzunligini qat'iy tekshirish
    const requiredLength = getRequiredPinLength(nextRole);
    if (cleanPin && cleanPin.length !== requiredLength) {
      notify(`Xato! "${getRoleMeta(nextRole).badgeName}" lavozimi uchun PIN-kod aynan ${requiredLength} xonali raqam bo'lishi shart!`);
      return;
    }

    // 3. Validatsiya: Bir xil ismli xodim bor-yo'qligini tekshirish
    const duplicateNameUser = safeUsers.find(
      u => u && String(u.name || '').trim().toLowerCase() === cleanName.toLowerCase() && u.id !== editingId
    );
    if (duplicateNameUser) {
      notify(`⛔️ "${cleanName}" ismli xodim tizimda allaqachon mavjud! Hisobotlar adashib ketmasligi uchun boshqa ism (yoki familiya bosh harfi bilan) kiriting.`);
      return;
    }

    // 4. Validatsiya: Bir xil PIN-kod boshqa xodimda bor-yo'qligini tekshirish (LockScreen uchun juda muhim!).
    // Kimniki ekani aytilmaydi va ketma-ket urinishlar cheklanadi (PIN'larni terib topishdan himoya)
    if (cleanPin) {
      const lockLeftMs = getPinLockRemainingMs(PIN_ASSIGN_SCOPE);
      if (lockLeftMs > 0) {
        notify(`⛔️ Juda ko'p urinish: ${Math.ceil(lockLeftMs / 1000)} soniya kuting.`);
        return;
      }
      if (findPinOwner(safeUsers, cleanPin, editingId)) {
        registerPinFailure(PIN_ASSIGN_SCOPE);
        notify("⛔️ Bu PIN-kod band (boshqa xodimda bor). Boshqa PIN kiriting yoki \"🎲 Avto-PIN\" ni bosing.");
        return;
      }
      // Server barcha xodimlar orasida tekshiradi (PIN xeshlari faqat serverda, supabase/security.sql)
      setSaving(true);
      const free = await isPinFreeOnServer(cleanPin, editingId);
      setSaving(false);
      if (free && 'error' in free) {
        notify(`⛔️ Juda ko'p urinish: ${Math.max(1, Math.ceil(free.waitS || 0))} soniya kuting.`);
        return;
      }
      if (free && free.available === false) {
        registerPinFailure(PIN_ASSIGN_SCOPE);
        notify("⛔️ Bu PIN-kod band (boshqa xodimda bor). Boshqa PIN kiriting yoki \"🎲 Avto-PIN\" ni bosing.");
        return;
      }
    }

    // 5. Admin huquqlari: bera olmaydigan huquq o'zgarmaydi, yangi admin - kim tayinlagani bilan
    const wasAdmin = Boolean(target) && isAdminUser(target);
    const rightsBefore = wasAdmin && !isSelfEdit ? getUserRights(target, ownerId) : null;
    const nextRights = nextRole === 'admin' && !isSelfEdit
      ? clampRights(effectiveFormRights, actor, ownerId, rightsBefore)
      : null;
    const rightsNote = nextRights
      ? ` • Huquqlar: ${countRights(nextRights).on}/${countRights(nextRights).total}${
        rightsBefore ? ` (${describeRightsChange(rightsBefore, nextRights)})` : ''}`
      : '';

    if (editingId) {
      // TAHRIRLASH REJIMI
      if (typeof setUsers === 'function') {
        setUsers(prev => prev.map(user => {
          if (user.id !== editingId) return user;
          const updated = {
            ...user,
            name: cleanName,
            title: cleanTitle,
            role: nextRole,
            canSeeSales: nextRole === 'waiter' ? Boolean(formData.canSeeSales) : (nextRole === 'admin')
          };
          if (nextRole !== 'admin') {
            // Admindan oddiy xodimga: admin huquqlari o'chadi
            delete updated.adminRights;
            delete updated.appointedBy;
          } else if (nextRights) {
            updated.adminRights = nextRights;
            if (!wasAdmin) updated.appointedBy = actorId;
          }
          return cleanPin ? withPin(updated, cleanPin) : updated;
        }));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Xodim tahrirlandi", `${cleanName} (${cleanTitle || getRoleMeta(nextRole).badgeName}) ma'lumotlari yangilandi${rightsNote}`);
      }
      setEditingId(null);
    } else {
      // YANGI XODIM QO'SHISH REJIMI
      const newUser = withPin({
        id: newId('user_'),
        name: cleanName,
        title: cleanTitle,
        role: nextRole,
        canSeeSales: nextRole === 'waiter' ? Boolean(formData.canSeeSales) : (nextRole === 'admin'),
        ...(nextRights ? { adminRights: nextRights, appointedBy: actorId } : {})
      }, cleanPin);
      if (typeof setUsers === 'function') {
        setUsers(prev => [...prev, newUser]);
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog(
          nextRole === 'admin' ? 'Yangi admin tayinlandi' : "Yangi xodim qo'shildi",
          `${cleanName} (${cleanTitle || getRoleMeta(nextRole).badgeName}) tizimga qo'shildi${rightsNote}`
        );
      }
    }

    // Formani tozalash
    setFormData(blankForm());
    setFormRights(null);
  };

  const handleEdit = (user) => {
    const isSelf = userIdOf(user) === actorId;
    if (!isSelf && !canManageUser(actor, user, ownerId)) {
      notify(isOwnerUser(user, ownerId)
        ? "🔒 Ega ma'lumotlarini hech kim o'zgartira olmaydi."
        : "🔒 Bu xodimni o'zgartirishga huquqingiz yo'q.");
      return;
    }
    setEditingId(user.id);
    setFormData({
      name: user.name || '',
      title: user.title || '',
      role: user.role || 'waiter',
      pin: '',
      canSeeSales: user.canSeeSales !== undefined ? Boolean(user.canSeeSales) : true
    });
    setFormRights(isAdminUser(user) && !isSelf ? getUserRights(user, ownerId) : null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Ofitsiantning savdoni ko'rish ruxsatini kartochkaning o'zidan 1-bosishda o'zgartirish
  const handleToggleWaiterSalesPermission = (user) => {
    if (typeof setUsers !== 'function') return;
    if (!canManageUser(actor, user, ownerId)) {
      notify("🔒 Bu xodimni o'zgartirishga huquqingiz yo'q.");
      return;
    }
    const nextVal = !user.canSeeSales;

    setUsers(prev => prev.map(u => 
      u.id === user.id ? { ...u, canSeeSales: nextVal } : u
    ));

    if (typeof addAuditLog === 'function') {
      addAuditLog(
        "Ofitsiant huquqi o'zgardi",
        `${user.name}: Shaxsiy savdoni ko'rish -> ${nextVal ? 'Ruxsat berildi' : 'Taqiqlandi'}`
      );
    }
  };

  const handleDelete = async (user) => {
    // 0. Egani hech kim o'chira olmaydi (Telegram guruhidagi kabi)
    if (isOwnerUser(user, ownerId)) {
      notify("⛔️ Ega hisobini hech kim o'chira olmaydi. Ega boshqa adminga egalikni topshirgandan keyin o'chirish mumkin.");
      return;
    }

    // 1. O'zining aktiv profilini o'chirishdan himoya
    if (currentUser && user.id === currentUser.id) {
      notify("⛔️ Siz hozir ushbu Admin profili orqali tizimda o'tiribsiz! O'zingizning profilingizni o'chira olmaysiz.");
      return;
    }

    // 1.1 Huquq: adminni - Ega yoki uni tayinlagan admin, oddiy xodimni - "Xodimlar" huquqi bor admin
    if (!canManageUser(actor, user, ownerId)) {
      notify(isAdminUser(user)
        ? "⛔️ Bu adminni faqat Ega (yoki uni tayinlagan admin) o'chira oladi."
        : "⛔️ Xodimni o'chirishga huquqingiz yo'q.");
      return;
    }

    // 2. Eng oxirgi Adminni o'chirib yuborishdan himoya
    if (user.role === 'admin') {
      const adminCount = safeUsers.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        notify("⛔️ Diqqat! Tizimda kamida 1 ta Admin qolishi shart. Bu xodimni o'chira olmaysiz.");
        return;
      }
    }

    if (await confirmAsync(`Rostdan ham "${user.name}" (${getRoleMeta(user.role).badgeName}) xodimini tizimdan o'chirmoqchimisiz?`)) {
      if (typeof setUsers === 'function') {
        setUsers(prev => prev.filter(u => u.id !== user.id));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog("Xodim o'chirildi", `${user.name} (${user.role}) tizimdan o'chirildi`);
      }
      if (editingId === user.id) {
        handleCancel();
      }
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData(blankForm());
    setFormRights(null);
  };

  // ==========================================
  // 3.0 EGA: ADMIN HUQUQLARI VA EGALIKNI TOPSHIRISH
  // ==========================================
  const handleSaveRights = (rights, before) => {
    const target = rightsTarget;
    setRightsTarget(null);
    if (!target || typeof setUsers !== 'function') return;
    if (!canManageUser(actor, target, ownerId)) {
      notify("⛔️ Bu adminning huquqlarini o'zgartira olmaysiz.");
      return;
    }
    setUsers(prev => prev.map(u => (u && userIdOf(u) === userIdOf(target) ? { ...u, adminRights: rights } : u)));
    if (typeof addAuditLog === 'function') {
      addAuditLog("Admin huquqlari o'zgardi", `${target.name}: ${describeRightsChange(before, rights)}`);
    }
    notify(`✅ ${target.name}: huquqlar saqlandi`);
  };

  // Telegram kabi: Ega egalikni boshqa adminga beradi, o'zi barcha huquqli admin bo'lib qoladi.
  // Ega PIN'i (va yoqilgan bo'lsa Authenticator kodi) bilan tasdiqlanadi
  const handleTransferOwnership = async (user) => {
    if (!actorIsOwner || !isAdminUser(user) || userIdOf(user) === actorId || typeof setOwnerRecord !== 'function') return;
    const ok = await confirmAsync(
      `👑 Egalikni "${user.name}" ga topshirasizmi?\n\nU Ega bo'ladi: barcha huquqlar, uni hech kim o'zgartira olmaydi. Siz barcha huquqli admin bo'lib qolasiz, egalikni faqat u qaytara oladi.`,
      { confirmText: 'Ha, topshirish', danger: true }
    );
    if (!ok) return;
    const transfer = () => {
      setOwnerRecord(makeOwnerRecord(user.id, actor?.name));
      if (typeof setUsers === 'function') {
        setUsers(prev => prev.map(u => (u && userIdOf(u) === actorId
          ? { ...u, adminRights: { ...ALL_RIGHTS }, appointedBy: userIdOf(user) }
          : u)));
      }
      if (typeof addAuditLog === 'function') {
        addAuditLog('Egalik topshirildi', `${actor?.name || 'Ega'} → ${user.name}`);
      }
      notify(`👑 Endi Ega: ${user.name}`);
    };
    if (typeof requireOwnerConfirm === 'function') {
      requireOwnerConfirm(`Egalikni "${user.name}" ga topshirish`, transfer);
    } else {
      transfer();
    }
  };

  // ==========================================
  // 3.1 IKKI BOSQICHLI KIRISH (PIN + AUTHENTICATOR)
  // ==========================================
  // Faqat xodimning o'zi yoqadi (o'z telefoni bilan). Boshqa admin faqat o'chira oladi (telefon yo'qolsa)
  const handleEnableTwoFactor = (secret, backupCodes) => {
    const target = twoFactorSetupUser;
    setTwoFactorSetupUser(null);
    if (!target || typeof setUsers !== 'function') return;
    setUsers(prev => prev.map(u => (u && u.id === target.id ? withTwoFactor(u, secret, backupCodes) : u)));
    if (typeof addAuditLog === 'function') {
      addAuditLog('Ikki bosqichli kirish yoqildi', `${target.name}: PIN + Authenticator kodi`);
    }
    notify("✅ Ikki bosqichli kirish yoqildi. Endi PIN'dan keyin telefondagi kod so'raladi.");
  };

  const removeTwoFactor = (target, details) => {
    if (!target || typeof setUsers !== 'function') return;
    setUsers(prev => prev.map(u => (u && u.id === target.id ? disableTwoFactor(u) : u)));
    if (typeof addAuditLog === 'function') {
      addAuditLog("Ikki bosqichli kirish o'chirildi", details);
    }
  };

  // O'z hisobi: o'chirishdan oldin telefondagi kod (yoki zaxira kod) so'raladi
  const handleDisableOwnVerified = () => {
    const target = twoFactorDisableUser;
    setTwoFactorDisableUser(null);
    removeTwoFactor(target, `${target?.name || 'Admin'}: o'zi o'chirdi`);
    notify("⚠️ Ikki bosqichli kirish o'chirildi: endi faqat PIN bilan kiriladi.");
  };

  const handleResetOtherTwoFactor = async (user) => {
    if (!canManageUser(actor, user, ownerId)) {
      notify(isOwnerUser(user, ownerId)
        ? "⛔️ Ega hisobidagi ikki bosqichli kirishni faqat Eganing o'zi o'chiradi."
        : "⛔️ Bu xodimni o'zgartirishga huquqingiz yo'q.");
      return;
    }
    if (!await confirmAsync(`"${user.name}" hisobidagi ikki bosqichli kirish o'chirilsinmi?\n\nTelefoni va zaxira kodlari yo'qolgan bo'lsa shunday qiling: u PIN bilan kirib, yangi telefon bilan qayta yoqadi.`)) {
      return;
    }
    removeTwoFactor(user, `${user.name}: ${currentUser?.name || 'Admin'} o'chirdi (kirishni tiklash)`);
    notify(`⚠️ ${user.name}: ikki bosqichli kirish o'chirildi.`);
  };

  // ==========================================
  // 4. FILTRLASH VA GURUHLASH
  // ==========================================
  const filteredUsers = useMemo(() => {
    return safeUsers.filter(user => {
      if (!user) return false;
      const isManagement = user.role === 'admin' || user.role === 'warehouse';
      const matchesGroup = 
        filterGroup === 'all' ? true :
        filterGroup === 'management' ? isManagement : !isManagement;

      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q ||
        String(user.name || '').toLowerCase().includes(q) ||
        String(user.title || '').toLowerCase().includes(q) ||
        String(user.role || '').toLowerCase().includes(q) ||
        String(getRoleMeta(user.role).badgeName || '').toLowerCase().includes(q);

      return matchesGroup && matchesSearch;
    });
  }, [safeUsers, filterGroup, searchQuery]);

  const managementCount = safeUsers.filter(u => u?.role === 'admin' || u?.role === 'warehouse').length;
  const staffCount = safeUsers.length - managementCount;

  // ==========================================
  // 5. RENDER (UI DIZAYN)
  // ==========================================
  const requiredLenForForm = getRequiredPinLength(formData.role);

  const currentRecord = currentUser ? safeUsers.find(u => u && u.id === currentUser.id) : null;
  const suggestTwoFactor = currentRecord?.role === 'admin' && !hasTwoFactor(currentRecord);

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">

      {twoFactorSetupUser && (
        <TwoFactorSetupModal
          user={twoFactorSetupUser}
          cafeName={cafeName}
          onEnable={handleEnableTwoFactor}
          onCancel={() => setTwoFactorSetupUser(null)}
        />
      )}

      {twoFactorDisableUser && (
        <TwoFactorCodeModal
          user={twoFactorDisableUser}
          title="🔓 O'chirishni tasdiqlang"
          actionLabel="Ikki bosqichli kirishni o'chirish"
          onVerified={handleDisableOwnVerified}
          onCancel={() => setTwoFactorDisableUser(null)}
          onAudit={addAuditLog}
        />
      )}

      {rightsTarget && (
        <AdminRightsModal
          target={rightsTarget}
          actor={actor}
          ownerId={ownerId}
          users={safeUsers}
          onSave={handleSaveRights}
          onCancel={() => setRightsTarget(null)}
        />
      )}

      {/* Ega haqida qisqa tushuntirish (Telegram guruhidagi "Ega" kabi) */}
      <div className="flex items-start gap-3 p-4 rounded-3xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10">
        <span className="text-2xl shrink-0">👑</span>
        <p className="text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200 leading-relaxed">
          Ega: <b>{String(safeUsers.find(u => u && userIdOf(u) === ownerId)?.name || '—')}</b>{actorIsOwner ? ' (siz)' : ''}.
          Egani hech kim tahrirlay yoki o'chira olmaydi. Ega admin va xodimlarni tayinlaydi, har bir adminga
          qaysi bo'limlar ochiqligini "🛡️ Huquqlar" tugmasi bilan belgilaydi.
          {actorIsOwner ? ' Egalikni boshqa adminga uning kartasidagi "👑 Egalikni topshirish" bilan berasiz.' : ''}
        </p>
      </div>

      {suggestTwoFactor && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-3xl border border-brand-500/30 bg-brand-50 dark:bg-brand-500/10">
          <span className="text-2xl">🔐</span>
          <p className="flex-1 text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200">
            Tavsiya: admin hisobingizga ikki bosqichli kirishni yoqing. PIN'ni bilib olgan odam telefoningizdagi
            kodsiz kira olmaydi (Google yoki Microsoft Authenticator, bepul).
          </p>
          <button
            type="button"
            onClick={() => setTwoFactorSetupUser(currentRecord)}
            className="shrink-0 px-4 py-2.5 rounded-full bg-brand-600 hover:bg-brand-500 text-white text-xs font-black transition active:scale-95"
          >
            Yoqish
          </button>
        </div>
      )}
      
      {/* 1. XODIM QO'SHISH YOKI TAHRIRLASH FORMASI (huquqi yo'q admin - faqat o'z profili) */}
      {!showForm && actor && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white dark:bg-gray-800 p-5 md:p-6 rounded-3xl shadow-xs border border-gray-100 dark:border-gray-700">
          <div className="flex-1">
            <h2 className="text-lg font-black text-gray-900 dark:text-white">👤 Mening profilim</h2>
            <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1">
              Xodim qo'shish huquqi sizga ochilmagan. O'z ismingiz va PIN-kodingizni o'zgartira olasiz.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleEdit(actor)}
            className="shrink-0 px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-black transition active:scale-95"
          >
            ✏️ PIN va ismni o'zgartirish
          </button>
        </div>
      )}
      {showForm && (
      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-xs border border-gray-100 dark:border-gray-700">
        
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <span>{editingId ? '✏️' : '➕'}</span> 
              {isSelfEdit ? "Mening ma'lumotlarim" : editingId ? "Xodim ma'lumotlarini tahrirlash" : "Yangi Xodim Qo'shish"}
            </h2>
            <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1">
              Har bir xodimga 6 xonali noyob PIN-kod beriladi (eski 4 xonali PIN'lar ishlayveradi, o'zgartirilganda - 6 xonali).
            </p>
          </div>

          <span className={`text-xs font-black px-3 py-1.5 rounded-xl uppercase ${
            formData.role === 'admin' || formData.role === 'warehouse'
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
          }`}>
            {formData.role === 'admin' || formData.role === 'warehouse' ? '👔 Boshqaruv guruhi (6 xonali)' : '👥 Xodimlar guruhi (6 xonali)'}
          </span>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Xodim Ismi */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
                Xodim Ismi *
              </label>
              <input 
                type="text" 
                name="name"
                value={formData.name} 
                onChange={handleInputChange} 
                placeholder="Masalan: Alisher" 
                autoComplete="off"
                required
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 outline-hidden focus:border-brand-500 text-gray-900 dark:text-white font-bold transition"
              />
            </div>

            {/* Lavozim nomi: admin o'zi yozadi (ro'yxat faqat taklif) */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
                Lavozim nomi (o'zingiz yozing)
              </label>
              <input
                type="text"
                name="title"
                list="staff-title-suggestions"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="Masalan: Barmen, Bosh oshpaz"
                autoComplete="off"
                maxLength={40}
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 outline-hidden focus:border-brand-500 text-gray-900 dark:text-white font-bold transition"
              />
              <datalist id="staff-title-suggestions">
                {TITLE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
              </datalist>
              <p className="text-[11px] font-bold text-gray-400 mt-1.5">
                Ixtiyoriy. Bo'sh qolsa "{getRoleMeta(formData.role).badgeName}" deb ko'rinadi. Kirish huquqi pastdagi bo'limga qarab beriladi.
              </p>
            </div>
            
            {/* Qaysi bo'limga kiradi (Roli) */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
                Qaysi bo'limda ishlaydi *
              </label>
              <select 
                name="role"
                value={formData.role} 
                onChange={handleInputChange}
                disabled={isSelfEdit}
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 outline-hidden focus:border-brand-500 text-gray-900 dark:text-white font-bold transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
              >
                {formRoleOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {isSelfEdit && (
                <p className="text-[11px] font-bold text-gray-400 mt-1.5">
                  🔒 O'z bo'limingiz va huquqingizni o'zgartira olmaysiz{actorIsOwner ? ' (Ega: avval egalikni topshiring)' : ''}.
                </p>
              )}
            </div>
            
            {/* PIN-kod + Avto-generatsiya tugmasi */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {canKeepPin ? `Yangi PIN-kod (${requiredLenForForm} xonali)` : `PIN-kod (${requiredLenForForm} xonali) *`}
                </label>
                <button
                  type="button"
                  onClick={handleGenerateRandomPin}
                  className="text-[11px] font-black text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                  title="Takrorlanmas PIN-kodni avtomatik tanlash"
                >
                  🎲 Avto-PIN
                </button>
              </div>
              <input 
                type="text" 
                name="pin"
                inputMode="numeric"
                value={formData.pin} 
                onChange={handleInputChange} 
                placeholder={canKeepPin ? "O'zgartirmaslik uchun bo'sh qoldiring" : `${requiredLenForForm} ta raqam...`}
                required={!canKeepPin}
                className="w-full p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 outline-hidden focus:border-brand-500 text-gray-900 dark:text-white font-black tracking-[0.25em] transition"
              />
            </div>

          </div>

          {/* Admin huquqlari (Telegram uslubida): qaysi bo'limlar shu adminga ochiq */}
          {formData.role === 'admin' && !isSelfEdit && (
            <div className="space-y-2">
              <AdminRightsEditor
                value={effectiveFormRights}
                onChange={setFormRights}
                grantable={formGrantable}
              />
              {!actorIsOwner && (
                <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                  🔒 Qulf belgisi: bu huquq sizda yo'q, uni faqat Ega beradi.
                </p>
              )}
            </div>
          )}

          {/* Ofitsiant uchun qo'shimcha ruxsat (canSeeSales) va Tugmalar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2">
            <div>
              {formData.role === 'waiter' && (
                <label className="inline-flex items-center gap-2.5 cursor-pointer bg-gray-50 dark:bg-gray-900 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                  <input
                    type="checkbox"
                    name="canSeeSales"
                    checked={Boolean(formData.canSeeSales)}
                    onChange={handleInputChange}
                    className="w-4 h-4 accent-brand-600 cursor-pointer"
                  />
                  <span className="text-xs font-black text-gray-700 dark:text-gray-300">
                    📊 Ofitsiant o'zining shaxsiy savdo summasini ko'ra olsin
                  </span>
                </label>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {editingId && (
                <button 
                  type="button" 
                  onClick={handleCancel}
                  className="flex-1 sm:flex-none px-6 py-3.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-xl font-bold transition active:scale-95"
                >
                  Bekor qilish
                </button>
              )}
              <button 
                type="submit" 
                disabled={saving}
                className="flex-1 sm:flex-none bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white px-8 py-3.5 rounded-xl font-black shadow-lg shadow-brand-600/30 transition active:scale-95 whitespace-nowrap"
              >
                {saving ? 'Tekshirilmoqda...' : editingId ? 'Saqlash 💾' : formData.role === 'admin' ? 'Admin tayinlash 👑' : "Xodimni Qo'shish ➕"}
              </button>
            </div>
          </div>

        </form>
      </div>
      )}

      {/* 2. MAVJUD XODIMLAR RO'YXATI */}
      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-3xl shadow-xs border border-gray-100 dark:border-gray-700 space-y-6">
        
        {/* Sarlavha, Filtr Tablar va Qidiruv */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-gray-100 dark:border-gray-700 pb-4">
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white">
              👥 Hozirgi Xodimlar Ro'yxati
            </h3>
            <p className="text-xs sm:text-sm font-bold text-gray-500 mt-1">
              Jami: {safeUsers.length} nafar • Boshqaruv: {managementCount} • Xodimlar: {staffCount}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="🔍 Ism bo'yicha qidirish..."
              className="flex-1 sm:w-48 px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-900 dark:text-white outline-hidden focus:border-brand-500"
            />

            <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
              {[
                { id: 'all', label: `Barchasi (${safeUsers.length})` },
                { id: 'management', label: `👔 Boshqaruv (${managementCount})` },
                { id: 'staff', label: `👥 Xodimlar (${staffCount})` }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterGroup(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${
                    filterGroup === tab.id
                      ? 'bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-xs'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Xodimlar Kartochkalari */}
        {filteredUsers.length === 0 ? (
          <div className="text-center py-10 text-gray-400 font-bold">
            Xodimlar topilmadi.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map(user => {
              const shownPinLength = pinLengthOf(user, 6);
              const isLongPin = shownPinLength >= 6;
              const roleMeta = getRoleMeta(user.role);
              const safeName = String(user.name || 'Xodim');
              const isCurrentUser = currentUser && user.id === currentUser.id;
              // Ega va admin huquqlari (src/utils/adminRights.ts)
              const isOwnerCard = isOwnerUser(user, ownerId);
              const isAdminCard = isAdminUser(user) && !isOwnerCard;
              const canManageCard = canManageUser(actor, user, ownerId);
              const cardRights = isAdminCard ? getUserRights(user, ownerId) : null;
              const cardRightsCount = cardRights ? countRights(cardRights) : null;
              const appointer = isAdminCard && user.appointedBy !== undefined
                ? safeUsers.find(u => u && userIdOf(u) === String(user.appointedBy))
                : null;
              
              return (
                <div 
                  key={user.id} 
                  className={`bg-gray-50 dark:bg-gray-900/50 p-5 rounded-2xl border-2 flex flex-col justify-between hover:shadow-md transition-all group ${
                    editingId === user.id
                      ? 'border-brand-500 ring-2 ring-brand-500/20'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 font-black flex items-center justify-center text-xl shadow-xs">
                        {safeName.charAt(0).toUpperCase()}
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {isOwnerCard && (
                          <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-amber-400 text-amber-950 shadow-sm shadow-amber-500/30">
                            👑 Ega
                          </span>
                        )}
                        <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full ${
                          user.role === 'admin' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                          user.role === 'warehouse' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                          'bg-indigo-50 text-indigo-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {roleMeta.icon} {String(user.title || '').trim() || roleMeta.badgeName}
                        </span>

                        {isCurrentUser && (
                          <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded-md">
                            🟢 Sizning profilingiz
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <h4 className="font-black text-lg text-gray-900 dark:text-white mb-1">
                      {safeName}
                    </h4>
                    {String(user.title || '').trim() && (
                      <p className="text-[11px] font-bold text-gray-400">
                        Bo'lim: {roleMeta.icon} {roleMeta.badgeName}
                      </p>
                    )}
                    
                    {/* PIN Kodni yashirish va ko'rsatish mantig'i */}
                    <div className="flex items-center gap-2 mt-2 bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700 w-max">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        PIN ({shownPinLength}):
                      </span>
                      {hasPin(user) ? (
                        <span
                          className="font-black text-sm text-gray-900 dark:text-white tracking-[0.25em]"
                          title="PIN shifrlangan holda saqlanadi. Unutilgan bo'lsa, tahrirlab yangisini bering"
                        >
                          {'•'.repeat(shownPinLength)} 🔒
                          {!isLongPin && <span className="ml-1 text-[10px] tracking-normal font-black text-amber-600"> eski: 6 xonaliga almashtiring</span>}
                        </span>
                      ) : (
                        <span className="font-black text-xs text-rose-600">O'rnatilmagan</span>
                      )}
                    </div>

                    {/* Ega: barcha huquqlar. Admin: qaysi bo'limlar ochiq va kim tayinlagan */}
                    {isOwnerCard && (
                      <p className="mt-3 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                        👑 Barcha huquqlar • hech kim o'zgartira olmaydi
                      </p>
                    )}
                    {isAdminCard && cardRights && (
                      <div className="mt-3 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-black text-gray-600 dark:text-gray-300">
                            🛡️ Ochiq: {cardRightsCount.on}/{cardRightsCount.total}
                          </span>
                          {cardRights.addAdmins && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">👑 admin tayinlaydi</span>
                          )}
                          {cardRights.pinRules && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">🔐 PIN himoyasi</span>
                          )}
                          {!cardRights.approve && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">✅ tasdiqlay olmaydi</span>
                          )}
                        </div>
                        {appointer && (
                          <p className="text-[10px] font-bold text-gray-400">Tayinlagan: {String(appointer.name || '')}</p>
                        )}
                      </div>
                    )}

                    {/* Ikki bosqichli kirish (admin uchun) */}
                    {(user.role === 'admin' || hasTwoFactor(user)) && (
                      <div className="mt-3">
                        {hasTwoFactor(user) ? (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl px-3 py-2">
                            <span className="text-[11px] font-black text-emerald-700 dark:text-emerald-400">
                              🔐 2-bosqich yoqilgan
                            </span>
                            <span className={`text-[10px] font-bold ${backupCodesLeft(user) <= 2 ? 'text-red-500' : 'text-gray-400'}`}>
                              zaxira kod: {backupCodesLeft(user)}/{BACKUP_CODE_COUNT}
                            </span>
                            {(isCurrentUser || canManageCard) && (
                              <button
                                type="button"
                                onClick={() => (isCurrentUser ? setTwoFactorDisableUser(user) : handleResetOtherTwoFactor(user))}
                                className="ml-auto text-[10px] font-black text-red-500 hover:text-red-600 underline underline-offset-2"
                              >
                                {isCurrentUser ? "O'chirish" : "O'chirish (tiklash)"}
                              </button>
                            )}
                          </div>
                        ) : isCurrentUser ? (
                          <button
                            type="button"
                            onClick={() => setTwoFactorSetupUser(user)}
                            className="text-[11px] font-black px-3 py-1.5 rounded-xl border border-brand-500/40 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 transition active:scale-95"
                          >
                            🔐 Ikki bosqichli kirishni yoqish
                          </button>
                        ) : (
                          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                            🔓 2-bosqich o'chiq (admin o'zi yoqadi)
                          </span>
                        )}
                      </div>
                    )}

                    {/* Ofitsiant uchun savdoni ko'rish ruxsati tugmasi */}
                    {user.role === 'waiter' && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => handleToggleWaiterSalesPermission(user)}
                          disabled={!canManageCard}
                          className={`text-[11px] font-black px-3 py-1.5 rounded-xl border transition disabled:cursor-not-allowed ${
                            user.canSeeSales
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          {user.canSeeSales ? '📊 Savdoni ko\'ra oladi (Yoqilgan)' : '🔒 Savdo yashirilgan'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
                    {canManageCard ? (
                      <>
                        {isAdminCard && (
                          <button
                            type="button"
                            onClick={() => setRightsTarget(user)}
                            className="w-full bg-brand-50 dark:bg-brand-500/10 hover:bg-brand-100 dark:hover:bg-brand-500/20 text-brand-700 dark:text-brand-400 py-2.5 rounded-xl text-xs font-black border border-brand-500/30 transition active:scale-95"
                          >
                            🛡️ Huquqlar (bo'limlarni ochish / yopish)
                          </button>
                        )}
                        <button 
                          type="button"
                          onClick={() => handleEdit(user)}
                          className="flex-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-xs font-black border border-gray-200 dark:border-gray-600 transition active:scale-95"
                        >
                          ✏️ Tahrirlash
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleDelete(user)}
                          className="flex-1 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 py-2.5 rounded-xl text-xs font-black transition active:scale-95"
                        >
                          🗑 O'chirish
                        </button>
                        {actorIsOwner && isAdminCard && (
                          <button
                            type="button"
                            onClick={() => handleTransferOwnership(user)}
                            className="w-full bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 py-2 rounded-xl text-[11px] font-black border border-amber-300/60 dark:border-amber-500/30 transition active:scale-95"
                          >
                            👑 Egalikni topshirish
                          </button>
                        )}
                      </>
                    ) : isCurrentUser ? (
                      <button 
                        type="button"
                        onClick={() => handleEdit(user)}
                        className="flex-1 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl text-xs font-black border border-gray-200 dark:border-gray-600 transition active:scale-95"
                      >
                        ✏️ Ism va PIN'ni o'zgartirish
                      </button>
                    ) : (
                      <p className="flex-1 text-center text-[11px] font-bold text-gray-400 py-2">
                        {isOwnerCard
                          ? "🔒 Egani hech kim o'zgartira olmaydi"
                          : isAdminCard
                            ? "🔒 Faqat Ega (yoki tayinlagan admin) o'zgartiradi"
                            : "🔒 Xodimlarni o'zgartirish huquqingiz yo'q"}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}