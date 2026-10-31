import { describe, expect, test } from 'vitest';
import path from 'node:path';
import type { BlobMetadata } from '../../src/database';
import {
  BlobStorageOptions,
  normalizeOptions,
  parseBlobId,
  validateFilename,
  validateMetadata,
} from '../../src/validation';

describe('configuration policy without IO', () => {
  test('defaults resolve relative paths and establish bounded upload/shutdown limits', () => {
    expect(normalizeOptions()).toEqual({
      storageDir: path.resolve('uploads'),
      dbPath: path.resolve('blob-storage.db'),
      maxFileSize: 10 * 1024 * 1024,
      shutdownTimeoutMs: 5000,
      allowedMimeTypes: [],
    });
  });

  test('copies MIME policy and respects valid boundary values', () => {
    const allowedMimeTypes = ['application/vnd.example+json'];
    const config = normalizeOptions({
      allowedMimeTypes,
      maxFileSize: Number.MAX_SAFE_INTEGER,
      shutdownTimeoutMs: 2147483647,
    });
    allowedMimeTypes.push('text/plain');
    expect(config.allowedMimeTypes).toEqual(['application/vnd.example+json']);
    expect(config.maxFileSize).toBe(Number.MAX_SAFE_INTEGER);
    expect(config.shutdownTimeoutMs).toBe(2147483647);
    expect(normalizeOptions({ maxFileSize: 1, shutdownTimeoutMs: 1 }).maxFileSize).toBe(1);
  });

  test.each([
    null,
    [],
    'options',
    { storageDir: '' },
    { storageDir: 12 },
    { dbPath: ' ' },
    { dbPath: ':memory:' },
    { dbPath: 'bad\0path' },
    { maxFileSize: 0 },
    { maxFileSize: -1 },
    { maxFileSize: 1.5 },
    { maxFileSize: NaN },
    { maxFileSize: Infinity },
    { maxFileSize: '42' },
    { maxFileSize: Number.MAX_SAFE_INTEGER + 1 },
    { shutdownTimeoutMs: 0 },
    { shutdownTimeoutMs: 2147483648 },
    { allowedMimeTypes: null },
    { allowedMimeTypes: 'text/plain' },
    { allowedMimeTypes: [1] },
    { allowedMimeTypes: ['text/*'] },
    { allowedMimeTypes: ['text/plain; charset=utf-8'] },
  ])('rejects invalid runtime input %j', (input) => {
    expect(() => normalizeOptions(input as BlobStorageOptions)).toThrow(TypeError);
  });
});

describe('canonical HTTP identifiers', () => {
  test.each(['1', '42', String(Number.MAX_SAFE_INTEGER)])('accepts %s', (value) => {
    expect(parseBlobId(value)).toBe(Number(value));
  });
  test.each([
    undefined,
    null,
    1,
    ['1'],
    '',
    '0',
    '-1',
    '01',
    '+1',
    '1.0',
    '1e2',
    ' 1',
    '1 ',
    '١',
    'Infinity',
    String(Number.MAX_SAFE_INTEGER + 1),
  ])('rejects ambiguous or unsafe ID %j', (value) => {
    expect(parseBlobId(value)).toBeUndefined();
  });
});

describe('persisted path policy on every OS', () => {
  test.each(['1700000000000.txt', 'file with spaces.bin', 'résumé.txt', 'x'.repeat(255)])(
    'accepts a portable ordinary filename %s',
    (name) => {
      expect(() => validateFilename(name)).not.toThrow();
    }
  );
  test.each([
    null,
    1,
    '',
    '.',
    '..',
    '../secret',
    'dir/file',
    'dir\\file',
    '/tmp/file',
    'C:\\file',
    'file:stream',
    '.hidden',
    'name.',
    'name ',
    'name\0',
    'name\n',
    'name\x7f',
    'file?',
    'file*',
    'file"',
    'file<',
    'file>',
    'file|',
    'CON',
    'nul.txt',
    'COM1.blob',
    'lPt9.txt',
    'x'.repeat(256),
  ])('rejects unsafe persisted name %j', (name) => {
    expect(() => validateFilename(name)).toThrow('Invalid persisted blob path');
  });

  const row: BlobMetadata = {
    id: 1,
    original_name: 'client.txt',
    mime_type: 'text/plain',
    path: '1700000000000.txt',
    upload_timestamp: '2026-10-24T00:00:00.000Z',
  };
  test('accepts a legacy metadata row without rewriting it', () => {
    const saved = { ...row };
    expect(() => validateMetadata(saved)).not.toThrow();
    expect(saved).toEqual(row);
  });
  test.each([
    { id: 0 },
    { id: -1 },
    { id: 1.5 },
    { id: Number.MAX_SAFE_INTEGER + 1 },
    { original_name: null },
    { mime_type: null },
    { upload_timestamp: null },
    { path: '../secret' },
  ])('rejects corrupt persisted metadata %j', (change) => {
    expect(() => validateMetadata({ ...row, ...change } as BlobMetadata)).toThrow();
  });
});
