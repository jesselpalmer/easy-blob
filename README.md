# EasyBlob

[![CI](https://github.com/jesselpalmer/easy-blob/actions/workflows/ci.yml/badge.svg)](https://github.com/jesselpalmer/easy-blob/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@jesselpalmer%2Feasy-blob.svg)](https://www.npmjs.com/package/@jesselpalmer/easy-blob)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

Quick and easy local blob storage for Node.js applications.

## Installation

```bash
npm install @jesselpalmer/easy-blob
```

## Quick Start

### JavaScript

```javascript
const BlobStorage = require('@jesselpalmer/easy-blob');

// Create storage instance
const storage = new BlobStorage({
  storageDir: './uploads',    // Optional: defaults to './uploads'
  dbPath: './blobs.db'        // Optional: defaults to './blob-storage.db'
});

// Start the server
storage.start(3000);
```

### TypeScript

```typescript
import { BlobStorage, BlobStorageOptions } from '@jesselpalmer/easy-blob';

// Create storage instance with type safety
const options: BlobStorageOptions = {
  storageDir: './uploads',
  dbPath: './blobs.db'
};

const storage = new BlobStorage(options);
storage.start(3000);
```

## API

### Constructor Options

- `storageDir` (string): Directory to store uploaded files. Defaults to `./uploads`
- `dbPath` (string): Path to SQLite database file. Defaults to `./blob-storage.db`
- `maxFileSize` (number): Maximum file size in bytes. Defaults to `10485760` (10MB)
- `allowedMimeTypes` (string[]): Array of allowed MIME types. Empty array allows all types.

### Methods

#### `start(port)`

Starts the Express server on the specified port with graceful shutdown handling.

### Endpoints

#### `POST /upload`

Upload a file as multipart/form-data with field name `blob`.

**Response:** `{"id": 1, "message": "File uploaded successfully"}`

**Errors:**

- `400` - File too large, invalid file type, or no file uploaded
- `500` - Server error

#### `GET /files`

Get a list of all uploaded files with metadata.

**Response:** Array of file objects with `id`, `original_name`, `mime_type`, `path`, and `upload_timestamp`.

#### `GET /blob/:id`

Retrieve a previously uploaded file by its ID.

**Response:** The actual file content

**Errors:**

- `400` - Invalid blob ID
- `404` - Blob not found
- `500` - Server error

#### `DELETE /blob/:id`

Delete a file by its ID (removes both database record and physical file).

**Response:** `{"message": "File deleted successfully"}`

**Errors:**

- `400` - Invalid blob ID
- `404` - Blob not found
- `500` - Server error

## Usage Examples

### Basic File Upload

**JavaScript:**

```javascript
const BlobStorage = require('@jesselpalmer/easy-blob');

const storage = new BlobStorage();
storage.start(3000);
```

**TypeScript:**

```typescript
import { BlobStorage } from '@jesselpalmer/easy-blob';

const storage = new BlobStorage();
storage.start(3000);
```

**Usage:**

```bash
# Upload a file
curl -X POST -F "blob=@myfile.pdf" http://localhost:3000/upload
# Response: {"id": 1, "message": "File uploaded successfully"}

# List all files
curl http://localhost:3000/files
# Response: [{"id": 1, "original_name": "myfile.pdf", "mime_type": "application/pdf", ...}]

# Download a file
curl http://localhost:3000/blob/1 --output downloaded-file.pdf

# Delete a file
curl -X DELETE http://localhost:3000/blob/1
# Response: {"message": "File deleted successfully"}
```

### Custom Configuration

**TypeScript:**

```typescript
import { BlobStorage, BlobStorageOptions } from '@jesselpalmer/easy-blob';
import path from 'path';

const options: BlobStorageOptions = {
  storageDir: path.join(__dirname, 'my-uploads'),
  dbPath: path.join(__dirname, 'my-database.db'),
  maxFileSize: 5 * 1024 * 1024, // 5MB limit
  allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'] // Only allow specific types
};

const storage = new BlobStorage(options);
storage.start(8080);
```

### Use Cases

- **Development & Prototyping**: Quick file storage without cloud setup
- **Internal Tools**: Simple file sharing in trusted environments
- **Local Applications**: Desktop/local services needing file storage
- **Testing**: Mock file storage for automated tests
- **Small Projects**: When you need basic file upload/download functionality

## License

MIT
