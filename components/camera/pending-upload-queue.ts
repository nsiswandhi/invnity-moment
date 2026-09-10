'use client';

export type PendingUploadState = 'ready' | 'uploading' | 'retrying' | 'saved' | 'failed';
export type PendingUploadItem = { id: string; blob: Blob; state: PendingUploadState; retries: number; createdAt: number; error?: string };
export type PendingUploadPersistence = { load(): Promise<PendingUploadItem[]>; save(items: PendingUploadItem[]): Promise<void> };
export type PendingUploadQueueOptions = { maxItems?: number; maxRetries?: number; maxTotalBytes?: number; maxAgeMs?: number; now?: () => number; persistence?: PendingUploadPersistence };

const DEFAULT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type StoredPendingUploadItem = Omit<PendingUploadItem, 'blob'> & { blob: { type: string; base64: string } };

function clone(item: PendingUploadItem): PendingUploadItem { return { ...item }; }
function pending(item: PendingUploadItem): boolean { return item.state !== 'saved' && item.state !== 'failed'; }

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

/** Browser-only persistence that keeps the bounded queue recoverable across reloads. */
export function createLocalStoragePendingUploadPersistence(storage: BrowserStorage, key = 'invnity-pending-uploads'): PendingUploadPersistence {
  return {
    async load() {
      const serialized = storage.getItem(key);
      if (!serialized) return [];
      try {
        const stored = JSON.parse(serialized) as StoredPendingUploadItem[];
        if (!Array.isArray(stored)) return [];
        return stored.filter((item) => item && typeof item.id === 'string' && typeof item.blob?.base64 === 'string' && typeof item.blob.type === 'string').map((item) => ({ ...item, blob: base64ToBlob(item.blob.base64, item.blob.type) }));
      } catch { return []; }
    },
    async save(items) {
      if (items.length === 0) { storage.removeItem(key); return; }
      const stored = await Promise.all(items.map(async (item): Promise<StoredPendingUploadItem> => ({ ...item, blob: { type: item.blob.type, base64: bytesToBase64(new Uint8Array(await item.blob.arrayBuffer())) } })));
      storage.setItem(key, JSON.stringify(stored));
    },
  };
}

export class PendingUploadQueue {
  private readonly items = new Map<string, PendingUploadItem>();
  private readonly maxItems: number;
  private readonly maxRetries: number;
  private readonly maxTotalBytes: number;
  private readonly maxAgeMs: number;
  private readonly now: () => number;
  private readonly persistence?: PendingUploadPersistence;
  private readonly restored: Promise<void>;

  constructor(options: PendingUploadQueueOptions = {}) {
    this.maxItems = Math.max(1, Math.min(options.maxItems ?? 10, 50));
    this.maxRetries = Math.max(0, Math.min(options.maxRetries ?? 3, 10));
    this.maxTotalBytes = Math.max(1, Math.min(options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES, 100 * 1024 * 1024));
    this.maxAgeMs = Math.max(1, Math.min(options.maxAgeMs ?? DEFAULT_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1_000));
    this.now = options.now ?? Date.now;
    this.persistence = options.persistence ?? (typeof window === 'undefined' ? undefined : createLocalStoragePendingUploadPersistence(window.localStorage));
    this.restored = this.restore();
  }

  async ready(): Promise<void> { await this.restored; }

  async enqueue(input: { id: string; blob: Blob }): Promise<void> {
    await this.ready();
    if (!input.id) throw new Error('PENDING_ITEM_ID_REQUIRED');
    if (this.items.has(input.id)) throw new Error('PENDING_ITEM_EXISTS');
    if (this.pendingItems().length >= this.maxItems) throw new Error('PENDING_QUEUE_FULL');
    if (this.totalBytes() + input.blob.size > this.maxTotalBytes) throw new Error('PENDING_QUEUE_BYTES_FULL');
    this.items.set(input.id, { ...input, state: 'ready', retries: 0, createdAt: this.now() });
    await this.persist();
  }

  list(): PendingUploadItem[] { return [...this.items.values()].map(clone); }
  get(id: string): PendingUploadItem | undefined { const item = this.items.get(id); return item ? clone(item) : undefined; }
  canRetry(id: string): boolean { const item = this.items.get(id); return Boolean(item && item.state === 'failed' && item.retries < this.maxRetries); }
  async markUploading(id: string): Promise<void> { await this.change(id, { state: 'uploading', error: undefined }); }
  async markRetrying(id: string, error?: string): Promise<void> { const item = this.require(id); await this.change(id, item.retries >= this.maxRetries ? { state: 'failed', error } : { state: 'retrying', retries: item.retries + 1, error }); }
  async retry(id: string): Promise<void> { if (!this.canRetry(id)) throw new Error('PENDING_ITEM_NOT_RETRYABLE'); const item = this.require(id); await this.change(id, { state: 'retrying', retries: item.retries + 1, error: undefined }); }
  async markSaved(id: string): Promise<void> { await this.change(id, { state: 'saved', error: undefined }); }
  async markFailed(id: string, error?: string): Promise<void> { await this.change(id, { state: 'failed', error }); }
  async remove(id: string): Promise<void> { await this.ready(); this.items.delete(id); await this.persist(); }

  private async restore(): Promise<void> {
    if (!this.persistence) return;
    const loaded = await this.persistence.load();
    let bytes = 0;
    for (const item of [...loaded].sort((left, right) => right.createdAt - left.createdAt)) {
      if (!this.isRestorable(item) || this.items.size >= this.maxItems || bytes + item.blob.size > this.maxTotalBytes || this.items.has(item.id)) continue;
      this.items.set(item.id, clone(item));
      bytes += item.blob.size;
    }
    await this.persist();
  }

  private isRestorable(item: PendingUploadItem): boolean {
    return Boolean(item.id) && item.blob instanceof Blob && pending(item) && Number.isInteger(item.retries) && item.retries < this.maxRetries && Number.isFinite(item.createdAt) && this.now() - item.createdAt <= this.maxAgeMs;
  }
  private pendingItems(): PendingUploadItem[] { return [...this.items.values()].filter(pending); }
  private totalBytes(): number { return this.pendingItems().reduce((total, item) => total + item.blob.size, 0); }
  private require(id: string): PendingUploadItem { const item = this.items.get(id); if (!item) throw new Error('PENDING_ITEM_NOT_FOUND'); return item; }
  private async change(id: string, patch: Partial<PendingUploadItem>): Promise<void> { await this.ready(); this.items.set(id, { ...this.require(id), ...patch }); await this.persist(); }
  private async persist(): Promise<void> { if (this.persistence) await this.persistence.save(this.pendingItems().map(clone)); }
}
