// Sinxronlash transporti: dvigatel (engine.js) bilan server orasidagi shartnoma.
// Amalga oshirishlar: supabaseTransport.js (bulut), hubTransport.ts (kafe mahalliy serveri),
// fakeTransport.js (faqat avtomatik sinovlar).

export type TransportKind = 'supabase' | 'hub' | 'fake';

export interface RecordRow {
  collection: string;
  id: string;
  data: unknown;
  deleted: boolean;
  created_at?: string;
  updated_at?: string;
  updated_by?: string | null;
}

export interface KvRow {
  key: string;
  value: unknown;
  updated_at?: string;
  updated_by?: string | null;
}

/** Mahalliy serverning bulut bilan aloqasi (server/upstream.mjs) */
export interface UpstreamStatus {
  state: 'disabled' | 'connecting' | 'online' | 'offline' | 'error';
  pending: number;
  lastSyncAt: number | null;
  error: string | null;
}

export type SyncEvent =
  | ({ type: 'record' } & RecordRow)
  | ({ type: 'kv' } & KvRow)
  | { type: 'hub'; upstream: UpstreamStatus };

export type RealtimeStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

export interface SyncSession {
  user?: { id?: string; email?: string | null } | null;
  /** Internet yo'q: saqlangan sessiya bilan ishlanmoqda */
  offline?: boolean;
}

/** Serverning yozish javobi (supabase/security.sql -> pos_push_records / pos_push_kv) */
export interface SecurePushResult {
  ok: number;
  rejected: { collection?: string; id?: string; key?: string; reason: string }[];
  changed?: { collection: string; id: string; data: unknown }[];
}

export interface SyncTransport {
  kind: TransportKind;
  /** Server xavfsizligini qo'llaydi (qurilma tasdig'i, PIN serverda): faqat Supabase */
  secure?: boolean;
  /** Qaysi server va hisob: o'zgarsa, qurilma birinchi marta ulangandek to'liq sinxronlanadi */
  identity(): Promise<string>;
  getSession(): Promise<SyncSession | null>;
  signIn(email: string, password: string): Promise<SyncSession | null>;
  signOut(): Promise<void>;
  fetchAll(since: string | null): Promise<{ records: RecordRow[]; kv: KvRow[] }>;
  rpc(fn: string, args: unknown): Promise<unknown>;
  pushRecords(rows: RecordRow[]): Promise<unknown>;
  pushKv(rows: KvRow[]): Promise<unknown>;
  subscribe(onEvent: (ev: SyncEvent) => void, onStatus?: (s: RealtimeStatus) => void): () => void;
  /**
   * Ochiq faylni (taom rasmi) bulut omboriga yuklab, uning doimiy havolasini qaytaradi.
   * Ixtiyoriy: yo'q bo'lsa rasm menyu yozuvining o'zida saqlanadi (src/utils/menuImages.ts).
   */
  uploadPublicFile?(path: string, file: Blob): Promise<string>;
  /** Ombordagi fayllarni o'chirish (taom yoki rasm o'chirilganda) */
  removePublicFiles?(paths: string[]): Promise<void>;
  /** Tanlangan to'plamlar va sozlamalarni to'liq olish */
  fetchSome?(what: { collections?: string[]; kvKeys?: string[] }): Promise<{ records: RecordRow[]; kv: KvRow[] }>;
  pushRecordsSecure?(rows: RecordRow[]): Promise<SecurePushResult>;
  pushKvSecure?(rows: KvRow[]): Promise<SecurePushResult>;
}

/** Server qurilmani tanimadi (parol o'zgargan yoki qurilma uzilgan): qayta ulash kerak */
export class AuthRequiredError extends Error {
  readonly authRequired = true;

  constructor(message = "Qurilma serverga qayta ulanishi kerak") {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export const isAuthRequiredError = (e: unknown): boolean =>
  Boolean(e && typeof e === 'object' && (e as { authRequired?: unknown }).authRequired === true);
