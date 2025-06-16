/**
 * EasyBlob - Quick and easy local blob storage for Node.js applications
 *
 * This package provides a simple HTTP API for uploading, downloading, listing,
 * and deleting files stored locally with SQLite metadata tracking.
 *
 * @example
 * ```typescript
 * import { BlobStorage } from '@jesselpalmer/easy-blob';
 *
 * const storage = new BlobStorage({
 *   storageDir: './uploads',
 *   maxFileSize: 10 * 1024 * 1024 // 10MB
 * });
 *
 * storage.start(3000);
 * ```
 */

// Export the main BlobStorage class and its related interfaces
export { BlobStorage, BlobStorageOptions, UploadResponse, ErrorResponse } from './blob-storage';

// Export the Database class and its related interfaces for advanced usage
export { Database, BlobMetadata } from './database';
