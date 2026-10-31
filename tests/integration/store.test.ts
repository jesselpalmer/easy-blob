import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import BetterSqlite3 from 'better-sqlite3';
import { Database } from '../../src/database';
import { LocalStore } from '../../src/store';

// Keep real Node IO while giving named ESM imports a shared, spyable namespace.
// Spying on the CommonJS default does not update Node's named ESM bindings.
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
}));
vi.mock('node:crypto', async (original) => ({
  ...(await original<typeof import('node:crypto')>()),
}));

let directory: string;
let stores: LocalStore[];

function create(storage = 'files', db = 'metadata.db'): LocalStore {
  const store = new LocalStore(path.join(directory, storage), path.join(directory, db));
  stores.push(store);
  return store;
}

async function upload(store: LocalStore, bytes = Buffer.from('exact original bytes')) {
  const pending = await store.writeUpload(Readable.from([bytes]));
  const id = await store.commitUpload(pending.filename, 'same.txt', 'text/plain');
  return { ...pending, id, bytes };
}

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'easyblob-store-'));
  stores = [];
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(stores.map((store) => store.close()));
  await fs.rm(directory, { recursive: true, force: true });
});

test('round-trips binary bytes and persists numeric IDs across restart', async () => {
  const first = create();
  const item = await upload(first, Buffer.from([0, 255, 1, 254, 13, 10]));
  await first.close();
  const second = create();
  const opened = await second.open(item.id);
  expect(opened?.metadata.id).toBe(item.id);
  try {
    expect(await opened!.handle.readFile()).toEqual(item.bytes);
  } finally {
    await opened!.handle.close();
    opened!.release();
  }
  expect(await second.delete(item.id)).toBe(true);
  expect(await second.open(item.id)).toBeUndefined();
});

test('parallel identical original names retain every independent byte payload', async () => {
  const store = create();
  const items = await Promise.all(
    Array.from({ length: 24 }, (_, i) => upload(store, Buffer.from(`payload-${i}`)))
  );
  expect(new Set(items.map((item) => item.filename)).size).toBe(24);
  for (const item of items) {
    expect(await fs.readFile(path.join(directory, 'files', item.filename))).toEqual(item.bytes);
  }
});

test('a deterministic identifier collision fails without overwriting or unlinking the original', async () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
  const store = create();
  const first = await upload(store);
  await expect(store.writeUpload(Readable.from(['replacement']))).rejects.toMatchObject({
    code: 'EEXIST',
  });
  expect(await fs.readFile(path.join(directory, 'files', first.filename))).toEqual(first.bytes);
  expect(await store.list()).toHaveLength(1);
});

test('metadata insertion failure compensates physical file creation', async () => {
  const store = create();
  await store.ready();
  vi.spyOn(Database.prototype, 'insertSync').mockImplementationOnce(() => {
    throw new Error('injected SQLite failure');
  });
  const pending = await store.writeUpload(Readable.from(['uncommitted']));
  await expect(store.commitUpload(pending.filename, 'file.txt', 'text/plain')).rejects.toThrow(
    'injected'
  );
  await expect(fs.stat(path.join(directory, 'files', pending.filename))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  expect(await store.list()).toEqual([]);
});

test('failed deletion transaction preserves both committed bytes and metadata', async () => {
  const store = create();
  const item = await upload(store);
  vi.spyOn(Database.prototype, 'beginDeleteSync').mockImplementationOnce(() => {
    throw new Error('injected transaction failure');
  });
  await expect(store.delete(item.id)).rejects.toThrow('injected');
  expect(await store.list()).toHaveLength(1);
  expect(await fs.readFile(path.join(directory, 'files', item.filename))).toEqual(item.bytes);
});

test('failed unlink leaves durable tombstone which restart replays', async () => {
  const store = create();
  const item = await upload(store);
  const actualUnlink = fs.unlink;
  vi.spyOn(fs, 'unlink').mockImplementationOnce(async () => {
    throw Object.assign(new Error('injected unlink failure'), { code: 'EACCES' });
  });
  await expect(store.delete(item.id)).rejects.toThrow('injected');
  expect(await store.list()).toEqual([]);
  expect(await fs.readFile(path.join(directory, 'files', item.filename))).toEqual(item.bytes);
  vi.spyOn(fs, 'unlink').mockImplementation(actualUnlink);
  await store.close();
  const restarted = create();
  await restarted.ready();
  await expect(fs.stat(path.join(directory, 'files', item.filename))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  const db = new BetterSqlite3(path.join(directory, 'metadata.db'));
  expect(db.prepare('SELECT * FROM easyblob_pending_deletions').all()).toEqual([]);
  db.close();
});

test('restart preserves unreferenced managed files and unknown legacy orphans', async () => {
  const store = create();
  const pending = await store.writeUpload(Readable.from(['uncommitted']));
  await fs.writeFile(path.join(directory, 'files', '1234567890.txt'), 'unknown legacy file');
  await store.close();
  const restarted = create();
  await restarted.ready();
  expect(await fs.readFile(path.join(directory, 'files', pending.filename), 'utf8')).toBe(
    'uncommitted'
  );
  expect(await fs.readFile(path.join(directory, 'files', '1234567890.txt'), 'utf8')).toBe(
    'unknown legacy file'
  );
});

test('aborted upload removes partial bytes without creating metadata', async () => {
  const store = create();
  await store.ready();
  const stream = new PassThrough();
  const abort = new AbortController();
  const pending = store.writeUpload(stream, abort.signal);
  stream.write('partial data');
  abort.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(
    (await fs.readdir(path.join(directory, 'files'))).filter((file) => file.endsWith('.blob'))
  ).toEqual([]);
  expect(await store.list()).toEqual([]);
});

test('stream failure removes partial bytes', async () => {
  const store = create();
  const stream = Readable.from(
    (async function* () {
      yield Buffer.from('partial');
      throw new Error('injected stream failure');
    })()
  );
  await expect(store.writeUpload(stream)).rejects.toThrow('injected stream');
  expect(
    (await fs.readdir(path.join(directory, 'files'))).filter((file) => file.endsWith('.blob'))
  ).toEqual([]);
});

test('exclusive ownership covers shared storage and shared database separately', async () => {
  const first = create();
  await first.ready();
  const sameStorage = create('files', 'other.db');
  const sameDatabase = create('other-files', 'metadata.db');
  await expect(sameStorage.ready()).rejects.toThrow('already owned');
  await expect(sameDatabase.ready()).rejects.toThrow('already owned');
  await sameStorage.close();
  await sameDatabase.close();
  expect(await first.list()).toEqual([]);
  await first.close();
  await expect(create().ready()).resolves.toBeUndefined();
});

test.each(['../outside', 'CON', 'file:stream', 'with?wildcard'])(
  'invalid persisted path %s fails before cleanup and releases locks',
  async (invalidPath) => {
    const store = create();
    const pending = await store.writeUpload(Readable.from(['do not touch before validation']));
    await store.close();
    const db = new BetterSqlite3(path.join(directory, 'metadata.db'));
    db.prepare(
      "INSERT INTO blob_metadata(original_name,mime_type,path,upload_timestamp) VALUES('x','x',?,'x')"
    ).run(invalidPath);
    db.close();
    const invalid = create();
    await expect(invalid.ready()).rejects.toThrow('Invalid persisted blob path');
    await invalid.close();
    expect(await fs.readFile(path.join(directory, 'files', pending.filename), 'utf8')).toContain(
      'do not touch'
    );
    await expect(
      fs.stat(path.join(directory, 'files', '.easyblob-owner.lock'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  }
);

test('missing physical file retains metadata, returns no download, and can be deleted', async () => {
  const store = create();
  const item = await upload(store);
  await store.close();
  await fs.unlink(path.join(directory, 'files', item.filename));
  const restarted = create();
  await restarted.ready();
  expect(await restarted.list()).toHaveLength(1);
  expect(await restarted.open(item.id)).toBeUndefined();
  expect(await restarted.delete(item.id)).toBe(true);
});

test('delete waits for an acquired read and concurrent second delete returns false', async () => {
  const store = create();
  const item = await upload(store);
  const opened = (await store.open(item.id))!;
  let deleted = false;
  const deletion = store.delete(item.id).then((result) => {
    deleted = true;
    return result;
  });
  const second = store.delete(item.id);
  expect(await opened.handle.readFile()).toEqual(item.bytes);
  expect(deleted).toBe(false);
  await opened.handle.close();
  opened.release();
  expect(await deletion).toBe(true);
  expect(await second).toBe(false);
});

test('legacy SQLite table and timestamp filename upgrade without changing IDs or bytes', async () => {
  await fs.mkdir(path.join(directory, 'files'));
  await fs.writeFile(path.join(directory, 'files', '1700000000000.txt'), 'legacy bytes');
  const legacy = new BetterSqlite3(path.join(directory, 'metadata.db'));
  legacy.exec(
    'CREATE TABLE blob_metadata (id INTEGER PRIMARY KEY AUTOINCREMENT, original_name TEXT, mime_type TEXT, path TEXT, upload_timestamp TEXT)'
  );
  legacy
    .prepare('INSERT INTO blob_metadata VALUES (?,?,?,?,?)')
    .run(17, 'old.txt', 'text/plain', '1700000000000.txt', '2023-01-01T00:00:00.000Z');
  legacy.close();
  const store = create();
  const opened = (await store.open(17))!;
  expect(opened.metadata.id).toBe(17);
  try {
    expect(await opened.handle.readFile('utf8')).toBe('legacy bytes');
  } finally {
    await opened.handle.close();
    opened.release();
  }
  expect((await upload(store)).id).toBeGreaterThan(17);
});

test('database open failures reject ready and callback APIs without uncaught throws', async () => {
  const db = new Database(path.join(directory, 'missing-parent', 'db.sqlite'));
  await expect(db.ready()).rejects.toThrow();
  await expect(
    new Promise((resolve, reject) =>
      db.getAllBlobs((error, rows) => (error ? reject(error) : resolve(rows)))
    )
  ).rejects.toThrow();
  await db.close();
});

test('legacy database callbacks queue until ready and close waits admitted callbacks', async () => {
  const db = new Database(path.join(directory, 'metadata.db'));
  const inserted = new Promise<number>((resolve, reject) =>
    db.insertBlob('x', 'text/plain', 'x.txt', (error, id) => (error ? reject(error) : resolve(id!)))
  );
  const closed = db.close();
  expect(await inserted).toBe(1);
  await closed;
  await expect(
    new Promise((resolve, reject) =>
      db.getAllBlobs((error, rows) => (error ? reject(error) : resolve(rows)))
    )
  ).rejects.toThrow('closing');
});

test('SQLite rollback undoes a journal insertion when metadata deletion fails', async () => {
  const store = create();
  const item = await upload(store);
  const injector = new BetterSqlite3(path.join(directory, 'metadata.db'));
  injector.exec(
    "CREATE TRIGGER reject_delete BEFORE DELETE ON blob_metadata BEGIN SELECT RAISE(FAIL, 'injected SQL delete failure'); END"
  );
  await expect(store.delete(item.id)).rejects.toThrow('injected SQL');
  expect(injector.prepare('SELECT * FROM easyblob_pending_deletions').all()).toEqual([]);
  injector.close();
  expect(await store.list()).toHaveLength(1);
  expect(await fs.readFile(path.join(directory, 'files', item.filename))).toEqual(item.bytes);
});

test('file creation failure is reported without adding metadata', async () => {
  const store = create();
  await store.ready();
  vi.spyOn(fs, 'open').mockRejectedValueOnce(
    Object.assign(new Error('injected disk permission failure'), { code: 'EACCES' })
  );
  await expect(store.writeUpload(Readable.from(['unwritten']))).rejects.toThrow('injected disk');
  expect(await store.list()).toEqual([]);
});

test('referenced symlinks fail readiness without reading or deleting the external target', async () => {
  const store = create();
  const item = await upload(store);
  await store.close();
  const outside = path.join(directory, 'outside.txt');
  await fs.writeFile(outside, 'outside bytes');
  await fs.unlink(path.join(directory, 'files', item.filename));
  await fs.symlink(outside, path.join(directory, 'files', item.filename), 'file');
  await expect(create().ready()).rejects.toThrow('regular file');
  expect(await fs.readFile(outside, 'utf8')).toBe('outside bytes');
});

test('shutdown is idempotent and repeated lifecycles release both ownership locks', async () => {
  for (let i = 0; i < 5; i += 1) {
    const store = create();
    await store.ready();
    expect(store.close()).toBe(store.close());
    await store.close();
    await expect(store.list()).rejects.toThrow('closing');
  }
});

test('a new database path cannot rebind existing storage or remove acknowledged bytes', async () => {
  const first = create();
  const item = await upload(first);
  await first.close();
  const wrongDatabase = create('files', 'mistyped.db');
  await expect(wrongDatabase.ready()).rejects.toThrow('identity mismatch');
  await wrongDatabase.close();
  expect(await fs.readFile(path.join(directory, 'files', item.filename))).toEqual(item.bytes);
  const reopened = create();
  expect((await reopened.list()).map((row) => row.id)).toEqual([item.id]);
});

test('an existing database cannot bind to a new storage directory', async () => {
  const first = create();
  await upload(first);
  await first.close();
  const wrongStorage = create('wrong-files');
  await expect(wrongStorage.ready()).rejects.toThrow('identity mismatch');
  await expect(
    fs.stat(path.join(directory, 'wrong-files', '.easyblob-store.json'))
  ).rejects.toMatchObject({ code: 'ENOENT' });
});

test('mismatched known identities fail before replaying another stores deletion journal', async () => {
  const first = create();
  const firstItem = await upload(first);
  const second = create('other-files', 'other.db');
  await upload(second);
  await Promise.all([first.close(), second.close()]);
  const mismatched = create('files', 'other.db');
  await expect(mismatched.ready()).rejects.toThrow('identity mismatch');
  expect(await fs.readFile(path.join(directory, 'files', firstItem.filename))).toEqual(
    firstItem.bytes
  );
});

test('missing identity marker fails closed while preserving all managed bytes', async () => {
  const first = create();
  const item = await upload(first);
  await first.close();
  await fs.unlink(path.join(directory, 'files', '.easyblob-store.json'));
  await expect(create().ready()).rejects.toThrow('identity mismatch');
  expect(await fs.readFile(path.join(directory, 'files', item.filename))).toEqual(item.bytes);
});

test('unbound managed filenames cannot be silently adopted by an empty database', async () => {
  await fs.mkdir(path.join(directory, 'files'));
  const filename = 'easyblob-22222222-2222-4222-8222-222222222222.blob';
  await fs.writeFile(path.join(directory, 'files', filename), 'unmatched acknowledged data');
  await expect(create().ready()).rejects.toThrow('manual storage identity recovery');
  expect(await fs.readFile(path.join(directory, 'files', filename), 'utf8')).toBe(
    'unmatched acknowledged data'
  );
});

test('restoring an older matching database preserves newer unreferenced bytes', async () => {
  const first = create();
  const oldItem = await upload(first);
  await first.close();
  const snapshot = path.join(directory, 'snapshot.db');
  await fs.copyFile(path.join(directory, 'metadata.db'), snapshot);
  const second = create();
  const newItem = await upload(second, Buffer.from('newer acknowledged bytes'));
  await second.close();
  await fs.copyFile(snapshot, path.join(directory, 'metadata.db'));
  const restored = create();
  await restored.ready();
  expect((await restored.list()).map((row) => row.id)).toEqual([oldItem.id]);
  expect(await fs.readFile(path.join(directory, 'files', newItem.filename))).toEqual(newItem.bytes);
});

test('a partially written initial identity binding fails closed on retry', async () => {
  const originalWriteFile = fs.writeFile;
  vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
    if (String(args[0]).endsWith('.easyblob-store.json'))
      throw new Error('injected marker write failure');
    return originalWriteFile(...args);
  });
  const first = create();
  await expect(first.ready()).rejects.toThrow('injected marker');
  await first.close();
  vi.restoreAllMocks();
  await expect(create().ready()).rejects.toThrow('identity mismatch');
});

test('safe integer ID exhaustion rolls back metadata and compensates uploaded bytes', async () => {
  const store = create();
  await upload(store);
  const injector = new BetterSqlite3(path.join(directory, 'metadata.db'));
  injector
    .prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'blob_metadata'")
    .run(Number.MAX_SAFE_INTEGER);
  injector.close();
  await expect(upload(store, Buffer.from('cannot receive an unusable id'))).rejects.toThrow(
    'safe integer'
  );
  expect(await store.list()).toHaveLength(1);
  expect(
    (await fs.readdir(path.join(directory, 'files'))).filter((name) => name.endsWith('.blob'))
  ).toHaveLength(1);
});

test('an asynchronous legacy callback can await close without deadlocking', async () => {
  const db = new Database(path.join(directory, 'metadata.db'));
  await new Promise<void>((resolve, reject) => {
    db.insertBlob('x', 'text/plain', 'x.txt', async (error, id) => {
      try {
        if (error) throw error;
        expect(id).toBe(1);
        await db.close();
        resolve();
      } catch (failure) {
        reject(failure);
      }
    });
  });
});
