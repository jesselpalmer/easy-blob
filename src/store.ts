import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BlobMetadata, Database } from './database';

const MANAGED = /^easyblob-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.blob$/;

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Reject path syntax on every supported OS, including Windows alternate streams. */
function validateFilename(name: unknown): asserts name is string {
  if (
    typeof name !== 'string' ||
    name.length === 0 ||
    name.length > 255 ||
    name.startsWith('.') ||
    /[\\/:*?"<>|\x00-\x1f\x7f]/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ||
    name.endsWith('.') ||
    name.endsWith(' ')
  ) {
    throw new Error('Invalid persisted blob path');
  }
}

function validateMetadata(row: BlobMetadata): void {
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

/** Internal local filesystem/SQLite coordinator. One owner per storage directory and database. */
export class LocalStore {
  private storageDir: string;
  private dbPath: string;
  private db?: Database;
  private readonly initialization: Promise<void>;
  private readonly locks: string[] = [];
  private readonly operations = new Set<Promise<unknown>>();
  private readonly pendingUploads = new Set<string>();
  private readonly readers = new Map<number, Set<Promise<void>>>();
  private mutations: Promise<void> = Promise.resolve();
  private closing = false;
  private closure?: Promise<void>;

  constructor(storageDir: string, dbPath: string) {
    for (const value of [storageDir, dbPath]) {
      if (typeof value !== 'string' || !value || value.includes('\0')) {
        throw new TypeError('Storage and database paths must be non-empty strings');
      }
    }
    if (dbPath === ':memory:') throw new TypeError('BlobStorage requires a persistent database');
    this.storageDir = path.resolve(storageDir);
    this.dbPath = path.resolve(dbPath);
    this.initialization = this.initialize();
    void this.initialization.catch(() => undefined);
  }

  ready(): Promise<void> {
    return this.initialization;
  }

  private async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true, mode: 0o700 });
      this.storageDir = await fs.realpath(this.storageDir);
      const dbParent = await fs.realpath(path.dirname(this.dbPath));
      this.dbPath = path.join(dbParent, path.basename(this.dbPath));
      const relative = path.relative(this.storageDir, this.dbPath);
      if (
        !relative ||
        (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
      ) {
        throw new Error('The database must be outside the storage directory');
      }
      try {
        const stat = await fs.lstat(this.dbPath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
          throw new Error('The database must be a regular file without links');
        }
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      const lockPaths = [
        path.join(this.storageDir, '.easyblob-owner.lock'),
        `${this.dbPath}.easyblob-lock`,
      ].sort();
      for (const lockPath of lockPaths) {
        try {
          await fs.mkdir(lockPath, { mode: 0o700 });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new Error(`Storage is already owned or has a stale lock: ${lockPath}`);
          }
          throw error;
        }
        this.locks.push(lockPath);
        await fs.writeFile(
          path.join(lockPath, 'owner.json'),
          JSON.stringify({ pid: process.pid, hostname: os.hostname() }),
          { flag: 'wx', mode: 0o600 }
        );
      }
      this.db = new Database(this.dbPath);
      await this.db.ready();
      const entries = await fs.readdir(this.storageDir, { withFileTypes: true });
      await this.verifyIdentity(entries.map((entry) => entry.name));
      const rows = this.db.listSync();
      const paths = new Set<string>();
      for (const row of rows) {
        validateMetadata(row);
        if (paths.has(row.path)) throw new Error('Multiple metadata records reference one file');
        paths.add(row.path);
        await this.assertRegularFile(row.path, true);
      }
      const pending = this.db.pendingDeletionsSync();
      // Validate the complete database before performing any recovery deletion.
      for (const item of pending) {
        validateFilename(item.path);
        if (!Number.isSafeInteger(item.id) || item.id <= 0 || paths.has(item.path)) {
          throw new Error('Invalid pending deletion metadata');
        }
        await this.assertRegularFile(item.path, true);
      }
      for (const entry of entries) {
        if (MANAGED.test(entry.name) && !entry.isFile()) {
          throw new Error('Managed storage contains a non-regular file');
        }
      }
      for (const item of pending) {
        await this.unlinkFile(item.path);
        this.db.finishDeleteSync(item.id);
      }
      // Unreferenced bytes may belong to a newer database backup. Preserve them for
      // operator inspection; only explicit, transactionally recorded deletes are replayed.
    } catch (error) {
      await this.db?.close();
      await this.releaseLocks();
      throw error;
    }
  }

  private async verifyIdentity(entries: string[]): Promise<void> {
    const identityPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const markerPath = path.join(this.storageDir, '.easyblob-store.json');
    let markerIdentity: string | undefined;
    try {
      const stat = await fs.lstat(markerPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw new Error('Storage identity marker must be a regular file without links');
      }
      const marker: unknown = JSON.parse(await fs.readFile(markerPath, 'utf8'));
      if (
        !marker ||
        typeof marker !== 'object' ||
        (marker as { version?: unknown }).version !== 1 ||
        typeof (marker as { id?: unknown }).id !== 'string' ||
        !identityPattern.test((marker as { id: string }).id)
      ) {
        throw new Error('Invalid storage identity marker');
      }
      markerIdentity = (marker as { id: string }).id;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const databaseIdentity = this.db!.storeIdentitySync();
    if (
      databaseIdentity !== undefined &&
      (typeof databaseIdentity !== 'string' || !identityPattern.test(databaseIdentity))
    ) {
      throw new Error('Invalid database storage identity');
    }
    if (markerIdentity === undefined && databaseIdentity === undefined) {
      if (entries.some((name) => MANAGED.test(name))) {
        throw new Error('Unbound managed files require manual storage identity recovery');
      }
      const identity = randomUUID();
      // A crash between these writes intentionally fails closed on the next open.
      this.db!.bindStoreIdentitySync(identity);
      await fs.writeFile(markerPath, JSON.stringify({ version: 1, id: identity }), {
        flag: 'wx',
        mode: 0o600,
      });
      return;
    }
    if (!markerIdentity || !databaseIdentity || markerIdentity !== databaseIdentity) {
      throw new Error('Storage and database identity mismatch; restore the matching pair');
    }
  }

  private filePath(filename: string): string {
    validateFilename(filename);
    const result = path.resolve(this.storageDir, filename);
    if (path.dirname(result) !== this.storageDir) throw new Error('Blob path escaped storage');
    return result;
  }

  private async assertRegularFile(filename: string, allowMissing = false): Promise<void> {
    try {
      const stat = await fs.lstat(this.filePath(filename));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw new Error('Blob must be a regular file without links');
      }
    } catch (error) {
      if (!allowMissing || !isMissing(error)) throw error;
    }
  }

  private async unlinkFile(filename: string): Promise<void> {
    await this.assertRegularFile(filename, true);
    await fs.unlink(this.filePath(filename)).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }

  private work<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new Error('Storage is closing'));
    const pending = this.ready().then(operation);
    this.operations.add(pending);
    void pending.then(
      () => this.operations.delete(pending),
      () => this.operations.delete(pending)
    );
    return pending;
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    return this.work(() => {
      const pending = this.mutations.then(operation);
      this.mutations = pending.then(
        () => undefined,
        () => undefined
      );
      return pending;
    });
  }

  writeUpload(stream: Readable, signal?: AbortSignal): Promise<{ filename: string; size: number }> {
    return this.work(async () => {
      const filename = `easyblob-${randomUUID()}.blob`;
      // The file is inaccessible through the API until metadata insertion succeeds.
      // Exclusive creation prevents replacement even if the identifier generator collides.
      const handle = await fs.open(this.filePath(filename), 'wx', 0o600);
      let size = 0;
      try {
        const counter = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            size += chunk.length;
            callback(null, chunk);
          },
        });
        await pipeline(stream, counter, handle.createWriteStream(), { signal });
        this.pendingUploads.add(filename);
        return { filename, size };
      } catch (error) {
        await handle.close().catch(() => undefined);
        await this.unlinkFile(filename);
        throw error;
      }
    });
  }

  commitUpload(filename: string, originalName: string, mimeType: string): Promise<number> {
    return this.mutate(async () => {
      if (!this.pendingUploads.has(filename)) throw new Error('Upload is not pending');
      try {
        await this.assertRegularFile(filename);
        const id = this.db!.insertSync(originalName, mimeType, filename);
        this.pendingUploads.delete(filename);
        return id;
      } catch (error) {
        await this.unlinkFile(filename);
        this.pendingUploads.delete(filename);
        throw error;
      }
    });
  }

  discardUpload(filename: string): Promise<void> {
    return this.mutate(async () => {
      if (!this.pendingUploads.has(filename)) return;
      await this.unlinkFile(filename);
      this.pendingUploads.delete(filename);
    });
  }

  list(): Promise<BlobMetadata[]> {
    return this.mutate(async () => {
      const rows = this.db!.listSync();
      rows.forEach(validateMetadata);
      return rows;
    });
  }

  open(
    id: number
  ): Promise<{ metadata: BlobMetadata; handle: FileHandle; release: () => void } | undefined> {
    return this.mutate(async () => {
      const metadata = this.db!.getSync(id);
      if (!metadata) return undefined;
      validateMetadata(metadata);
      let handle: FileHandle;
      try {
        await this.assertRegularFile(metadata.path);
        handle = await fs.open(
          this.filePath(metadata.path),
          constants.O_RDONLY | (constants.O_NOFOLLOW || 0)
        );
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.nlink !== 1) throw new Error('Blob is not a regular file');
      } catch (error) {
        await handle.close();
        throw error;
      }
      let release!: () => void;
      const lease = new Promise<void>((resolve) => {
        release = resolve;
      });
      const leases = this.readers.get(id) || new Set<Promise<void>>();
      leases.add(lease);
      this.readers.set(id, leases);
      let released = false;
      return {
        metadata,
        handle,
        release: () => {
          if (released) return;
          released = true;
          leases.delete(lease);
          if (leases.size === 0) this.readers.delete(id);
          release();
        },
      };
    });
  }

  delete(id: number): Promise<boolean> {
    return this.mutate(async () => {
      const metadata = this.db!.getSync(id);
      if (!metadata) return false;
      validateMetadata(metadata);
      await this.assertRegularFile(metadata.path, true);
      await Promise.all(this.readers.get(id) || []);
      const pending = this.db!.beginDeleteSync(id);
      if (!pending) return false;
      await this.unlinkFile(pending.path);
      this.db!.finishDeleteSync(id);
      return true;
    });
  }

  private async releaseLocks(): Promise<void> {
    for (const lockPath of [...this.locks].reverse()) {
      await fs.unlink(path.join(lockPath, 'owner.json')).catch((error: unknown) => {
        if (!isMissing(error)) throw error;
      });
      await fs.rmdir(lockPath);
      this.locks.splice(this.locks.indexOf(lockPath), 1);
    }
  }

  close(): Promise<void> {
    if (!this.closure) {
      this.closing = true;
      this.closure = (async () => {
        await this.initialization.catch(() => undefined);
        await Promise.allSettled([...this.operations]);
        await Promise.all([...this.readers.values()].flatMap((leases) => [...leases]));
        await this.db?.close();
        await this.releaseLocks();
      })();
    }
    return this.closure;
  }
}
