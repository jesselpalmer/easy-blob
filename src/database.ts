import BetterSqlite3 from 'better-sqlite3';

/** Metadata layout retained from EasyBlob 1.x. */
export interface BlobMetadata {
  id: number;
  original_name: string;
  mime_type: string;
  path: string;
  upload_timestamp: string;
}

export interface PendingDeletion {
  id: number;
  path: string;
}

/**
 * Low-level metadata access. Callback methods remain available for 1.x consumers.
 * This class does not coordinate physical files; use BlobStorage for file operations.
 */
export class Database {
  private db?: BetterSqlite3.Database;
  private readonly initialization: Promise<void>;
  private callbacks: Promise<void> = Promise.resolve();
  private closing = false;
  private closure?: Promise<void>;

  constructor(dbPath: string) {
    if (typeof dbPath !== 'string' || dbPath.length === 0 || dbPath.includes('\0')) {
      throw new TypeError('dbPath must be a non-empty path');
    }
    this.initialization = Promise.resolve().then(() => {
      const connection = new BetterSqlite3(dbPath);
      try {
        connection.pragma('busy_timeout = 5000');
        connection.pragma('synchronous = FULL');
        connection.exec(`
          CREATE TABLE IF NOT EXISTS blob_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_name TEXT,
            mime_type TEXT,
            path TEXT,
            upload_timestamp TEXT
          );
          CREATE TABLE IF NOT EXISTS easyblob_pending_deletions (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS easyblob_store (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            identity TEXT NOT NULL
          );
        `);
        this.db = connection;
      } catch (error) {
        connection.close();
        throw error;
      }
    });
    // Failures are observable through ready() and operations, never uncaught async throws.
    void this.initialization.catch(() => undefined);
  }

  ready(): Promise<void> {
    return this.initialization;
  }

  private connection(): BetterSqlite3.Database {
    if (!this.db?.open) throw new Error('Database is not open');
    return this.db;
  }

  /** @internal Synchronous operations are used only after ready(). */
  insertSync(originalName: string, mimeType: string, filePath: string): number {
    return this.connection().transaction(() => {
      const result = this.connection()
        .prepare(
          'INSERT INTO blob_metadata(original_name, mime_type, path, upload_timestamp) VALUES (?, ?, ?, ?)'
        )
        .safeIntegers(true)
        .run(originalName, mimeType, filePath, new Date().toISOString());
      const id = BigInt(result.lastInsertRowid);
      if (id <= 0n || id > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError('Blob ID exceeds the supported safe integer range');
      }
      return Number(id);
    })();
  }

  /** @internal */
  storeIdentitySync(): string | undefined {
    const rows = this.connection()
      .prepare('SELECT singleton, identity FROM easyblob_store')
      .all() as Array<{ singleton: number; identity: string }>;
    if (rows.length > 1 || (rows.length === 1 && rows[0].singleton !== 1)) {
      throw new Error('Invalid database storage identity');
    }
    return rows[0]?.identity;
  }

  /** @internal Initial binding only; never replace a prior identity. */
  bindStoreIdentitySync(identity: string): void {
    this.connection()
      .prepare('INSERT INTO easyblob_store(singleton, identity) VALUES (1, ?)')
      .run(identity);
  }

  /** @internal */
  getSync(id: number): BlobMetadata | undefined {
    return this.connection().prepare('SELECT * FROM blob_metadata WHERE id = ?').get(id) as
      BlobMetadata | undefined;
  }

  /** @internal */
  listSync(): BlobMetadata[] {
    return this.connection()
      .prepare('SELECT * FROM blob_metadata ORDER BY upload_timestamp DESC, id DESC')
      .all() as BlobMetadata[];
  }

  /** @internal Atomically hide a blob and retain the path needed for cleanup. */
  beginDeleteSync(id: number): PendingDeletion | undefined {
    return this.connection().transaction(() => {
      const row = this.getSync(id);
      if (!row) return undefined;
      this.connection()
        .prepare('INSERT INTO easyblob_pending_deletions(id, path) VALUES (?, ?)')
        .run(id, row.path);
      this.connection().prepare('DELETE FROM blob_metadata WHERE id = ?').run(id);
      return { id, path: row.path };
    })();
  }

  /** @internal */
  pendingDeletionsSync(): PendingDeletion[] {
    return this.connection()
      .prepare('SELECT id, path FROM easyblob_pending_deletions ORDER BY id')
      .all() as PendingDeletion[];
  }

  /** @internal */
  finishDeleteSync(id: number): void {
    this.connection().prepare('DELETE FROM easyblob_pending_deletions WHERE id = ?').run(id);
  }

  private callback<T>(
    operation: () => T,
    callback: (error: Error | null, value?: T) => void
  ): void {
    if (this.closing) {
      queueMicrotask(() => {
        try {
          void Promise.resolve(callback(new Error('Database is closing'))).catch(() => undefined);
        } catch {
          /* Application callbacks do not own the database queue. */
        }
      });
      return;
    }
    const pending = this.callbacks.then(() => this.ready()).then(operation);
    this.callbacks = pending.then(
      (value) => {
        // Observe async callbacks without making resource closure await their returned promise.
        // In particular, an async callback is allowed to await db.close().
        void Promise.resolve(callback(null, value)).catch(() => undefined);
      },
      (error: Error) => {
        void Promise.resolve(callback(error)).catch(() => undefined);
      }
    );
    // A throwing application callback must not poison later database operations.
    void this.callbacks.catch(() => undefined);
    this.callbacks = this.callbacks.catch(() => undefined);
  }

  insertBlob(
    originalName: string,
    mimeType: string,
    filePath: string,
    callback: (error: Error | null, id?: number) => void
  ): void {
    this.callback(() => this.insertSync(originalName, mimeType, filePath), callback);
  }

  getBlob(id: number, callback: (error: Error | null, row?: BlobMetadata) => void): void {
    this.callback<BlobMetadata | undefined>(() => this.getSync(id), callback);
  }

  getAllBlobs(callback: (error: Error | null, rows?: BlobMetadata[]) => void): void {
    this.callback(() => this.listSync(), callback);
  }

  deleteBlob(id: number, callback: (error: Error | null, deleted?: boolean) => void): void {
    this.callback(
      () => this.connection().prepare('DELETE FROM blob_metadata WHERE id = ?').run(id).changes > 0,
      callback
    );
  }

  close(): Promise<void> {
    if (!this.closure) {
      this.closing = true;
      this.closure = (async () => {
        await this.initialization.catch(() => undefined);
        await this.callbacks;
        this.db?.close();
      })();
    }
    return this.closure;
  }
}
