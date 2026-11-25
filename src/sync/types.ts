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

export interface SyncTransport {
  kind: TransportKind;
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
