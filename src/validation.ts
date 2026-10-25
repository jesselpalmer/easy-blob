import path from 'node:path';
import type { BlobMetadata } from './database';

export interface BlobStorageOptions {
  storageDir?: string;
  dbPath?: string;
  maxFileSize?: number;
  /** Client-declared MIME allowlist; this does not inspect file contents. */
  allowedMimeTypes?: string[];
  /** Grace period before active HTTP streams are cancelled. Defaults to 5000ms. */
  shutdownTimeoutMs?: number;
}
/** Internal input policy, without filesystem, database or HTTP side effects. */
export function normalizeOptions(options: BlobStorageOptions = {}): Required<BlobStorageOptions> {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }
  for (const key of ['storageDir', 'dbPath'] as const) {
    const value = options[key];
    if (
      value !== undefined &&
      (typeof value !== 'string' || !value.trim() || value.includes('\0'))
    ) {
      throw new TypeError(`${key} must be a non-empty path`);
    }
  }
  for (const key of ['maxFileSize', 'shutdownTimeoutMs'] as const) {
    const value = options[key];
    if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new TypeError(`${key} must be a positive safe integer`);
    }
  }
  if (options.dbPath === ':memory:')
    throw new TypeError('BlobStorage requires a persistent database');
  if (options.shutdownTimeoutMs !== undefined && options.shutdownTimeoutMs > 2147483647) {
    throw new TypeError('shutdownTimeoutMs exceeds the timer limit');
  }
  const allowed = options.allowedMimeTypes === undefined ? [] : options.allowedMimeTypes;
  if (
    !Array.isArray(allowed) ||
    allowed.some(
      (value) => typeof value !== 'string' || !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(value)
    )
  ) {
    throw new TypeError('allowedMimeTypes must be an array of MIME types');
  }
  return {
    storageDir: path.resolve(options.storageDir ?? './uploads'),
    dbPath: path.resolve(options.dbPath ?? './blob-storage.db'),
    maxFileSize: options.maxFileSize ?? 10 * 1024 * 1024,
    shutdownTimeoutMs: options.shutdownTimeoutMs ?? 5000,
    allowedMimeTypes: [...allowed],
  };
}

export function parseBlobId(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}

/** Reject path syntax on every supported OS, including Windows alternate streams. */
export function validateFilename(name: unknown): asserts name is string {
  if (
    typeof name !== 'string' ||
    name.length === 0 ||
    name.length > 255 ||
    name.startsWith('.') ||
    // eslint-disable-next-line no-control-regex -- Persisted filenames must reject ASCII controls.
    /[\\/:*?"<>|\x00-\x1f\x7f]/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ||
    name.endsWith('.') ||
    name.endsWith(' ')
  ) {
    throw new Error('Invalid persisted blob path');
  }
}

export function validateMetadata(row: BlobMetadata): void {
  validateFilename(row.path);
  if (
    !Number.isSafeInteger(row.id) ||
    row.id <= 0 ||
    typeof row.original_name !== 'string' ||
    typeof row.mime_type !== 'string' ||
    typeof row.upload_timestamp !== 'string'
  ) {
    throw new Error('Invalid persisted blob metadata');
  }
}
