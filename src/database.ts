import sqlite3 from 'sqlite3';

/**
 * Represents a blob metadata record from the database
 */
export interface BlobMetadata {
  /** Unique identifier for the blob */
  id: number;
  /** Original filename when uploaded */
  original_name: string;
  /** MIME type of the file */
  mime_type: string;
  /** Filename where the file is stored on disk */
  path: string;
  /** ISO string timestamp of when the file was uploaded */
  upload_timestamp: string;
}

/**
 * Database abstraction layer for blob metadata storage using SQLite.
 *
 * Handles all database operations including creating tables, inserting blob metadata,
 * retrieving blob information, and managing the blob lifecycle.
 *
 * @example
 * ```typescript
 * const db = new Database('./my-blobs.db');
 * db.insertBlob('document.pdf', 'application/pdf', '12345.pdf', (err, id) => {
 *   if (!err) console.log(`Blob stored with ID: ${id}`);
 * });
 * ```
 */
export class Database {
  /** SQLite database connection instance */
  private db: sqlite3.Database;

  /**
   * Creates a new Database instance and establishes connection to SQLite.
   *
   * Automatically creates the blob_metadata table if it doesn't exist.
   *
   * @param dbPath - Path to the SQLite database file
   * @throws Error if database connection fails
   */
  constructor(dbPath: string) {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error(`Error initializing SQLite database: ${err.message}`);
        throw err;
      }
      console.log('Connected to the SQLite database.');
      this.initialize();
    });
  }

  /**
   * Creates the blob_metadata table if it doesn't already exist.
   *
   * Table schema:
   * - id: INTEGER PRIMARY KEY AUTOINCREMENT
   * - original_name: TEXT (original filename)
   * - mime_type: TEXT (file MIME type)
   * - path: TEXT (stored filename)
   * - upload_timestamp: TEXT (ISO timestamp)
   */
  private initialize(): void {
    this.db.run(
      `CREATE TABLE IF NOT EXISTS blob_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT,
      mime_type TEXT,
      path TEXT,
      upload_timestamp TEXT
    )`,
      (err) => {
        if (err) {
          console.error(`Error creating blob_metadata table: ${err.message}`);
        } else {
          console.log('blob_metadata table initialized or already exists.');
        }
      }
    );
  }

  /**
   * Inserts a new blob record into the database.
   *
   * @param originalName - The original filename as uploaded by the user
   * @param mimeType - The MIME type of the file (e.g., 'image/jpeg')
   * @param filePath - The filename where the file is stored on disk
   * @param callback - Callback function with (error, insertedId)
   *
   * @example
   * ```typescript
   * db.insertBlob('photo.jpg', 'image/jpeg', '1640995200000.jpg', (err, id) => {
   *   if (err) {
   *     console.error('Failed to save blob metadata:', err);
   *   } else {
   *     console.log('Blob saved with ID:', id);
   *   }
   * });
   * ```
   */
  insertBlob(
    originalName: string,
    mimeType: string,
    filePath: string,
    callback: (err: Error | null, id?: number) => void
  ): void {
    const statement = this.db.prepare(
      `INSERT INTO blob_metadata(original_name, mime_type, path, upload_timestamp) VALUES(?, ?, ?, ?)`
    );

    statement.run(
      originalName,
      mimeType,
      filePath,
      new Date().toISOString(),
      function (this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          console.error(`Error inserting blob metadata into database: ${err.message}`);
        } else {
          console.log(
            `Inserted blob metadata:`,
            JSON.stringify({
              filename: filePath,
              mimeType: mimeType,
              originalName: originalName,
            })
          );
        }
        callback(err, this.lastID);
        statement.finalize();
      }
    );
  }

  /**
   * Retrieves blob metadata by its unique ID.
   *
   * @param id - The unique identifier of the blob to retrieve
   * @param callback - Callback function with (error, blobMetadata)
   *
   * @example
   * ```typescript
   * db.getBlob(1, (err, blob) => {
   *   if (err) {
   *     console.error('Error fetching blob:', err);
   *   } else if (blob) {
   *     console.log('Found blob:', blob.original_name);
   *   } else {
   *     console.log('Blob not found');
   *   }
   * });
   * ```
   */
  getBlob(id: number, callback: (err: Error | null, row?: BlobMetadata) => void): void {
    this.db.get(
      `SELECT * FROM blob_metadata WHERE id = ?`,
      [id],
      (err: Error | null, row: BlobMetadata) => {
        if (err) {
          console.error(`Error fetching blob with id: ${id}, Error: ${err.message}`);
        } else if (row) {
          console.log(`Fetched blob metadata for id ${id}:`, JSON.stringify(row));
        }
        callback(err, row);
      }
    );
  }

  /**
   * Retrieves all blob metadata records from the database.
   *
   * Results are ordered by upload timestamp in descending order (newest first).
   *
   * @param callback - Callback function with (error, blobMetadataArray)
   *
   * @example
   * ```typescript
   * db.getAllBlobs((err, blobs) => {
   *   if (err) {
   *     console.error('Error fetching blobs:', err);
   *   } else {
   *     console.log(`Found ${blobs.length} blobs`);
   *     blobs.forEach(blob => console.log(blob.original_name));
   *   }
   * });
   * ```
   */
  getAllBlobs(callback: (err: Error | null, rows?: BlobMetadata[]) => void): void {
    this.db.all(
      `SELECT * FROM blob_metadata ORDER BY upload_timestamp DESC`,
      [],
      (err: Error | null, rows: BlobMetadata[]) => {
        if (err) {
          console.error(`Error fetching all blobs: ${err.message}`);
        } else {
          console.log(`Fetched ${rows.length} blob records`);
        }
        callback(err, rows);
      }
    );
  }

  /**
   * Deletes a blob record from the database by its unique ID.
   *
   * Note: This only removes the database record. The physical file must be
   * deleted separately using filesystem operations.
   *
   * @param id - The unique identifier of the blob to delete
   * @param callback - Callback function with (error, wasDeleted)
   *
   * @example
   * ```typescript
   * db.deleteBlob(1, (err, deleted) => {
   *   if (err) {
   *     console.error('Error deleting blob:', err);
   *   } else if (deleted) {
   *     console.log('Blob record deleted successfully');
   *   } else {
   *     console.log('Blob record not found');
   *   }
   * });
   * ```
   */
  deleteBlob(id: number, callback: (err: Error | null, deleted?: boolean) => void): void {
    this.db.run(
      `DELETE FROM blob_metadata WHERE id = ?`,
      [id],
      function (this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          console.error(`Error deleting blob with id: ${id}, Error: ${err.message}`);
          callback(err, false);
        } else {
          const deleted = this.changes > 0;
          console.log(`Deleted blob with id ${id}: ${deleted}`);
          callback(null, deleted);
        }
      }
    );
  }

  /**
   * Closes the database connection gracefully.
   *
   * This should be called when shutting down the application to ensure
   * proper cleanup of database resources.
   *
   * @example
   * ```typescript
   * const db = new Database('./blobs.db');
   * // ... use database
   * db.close(); // Clean shutdown
   * ```
   */
  close(): void {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error(`Error closing database: ${err.message}`);
        } else {
          console.log('Database connection closed.');
        }
      });
    }
  }
}
