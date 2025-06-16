# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-06-16

### 🎉 Initial Release

First stable release of EasyBlob - Quick and easy local blob storage for Node.js applications.

### ✨ Features

- **Simple HTTP API** for file operations (upload, download, list, delete)
- **SQLite database** for metadata storage with automatic table initialization
- **Express 5.x server** with built-in middleware and routing
- **TypeScript support** with full type definitions
- **Multer integration** for multipart file uploads
- **Configurable options** for storage directory, database path, file size limits, and MIME type restrictions
- **Graceful shutdown** handling for production deployments
- **Cross-platform compatibility** with proper line ending handling

### 🔧 Configuration Options

- `storageDir`: Custom upload directory (default: `./uploads`)
- `dbPath`: SQLite database file path (default: `./blob-storage.db`)
- `maxFileSize`: File size limit in bytes (default: 10MB)
- `allowedMimeTypes`: Array of allowed MIME types (default: all types)

### 📡 API Endpoints

- `POST /upload` - Upload files with multipart/form-data
- `GET /files` - List all uploaded files with metadata
- `GET /blob/:id` - Download file by ID
- `DELETE /blob/:id` - Delete file and metadata by ID

### 🛡️ Security & Quality

- **Zero vulnerabilities** - All dependencies updated to latest secure versions
- **Comprehensive test suite** - 10/10 tests passing with Jest 30.x
- **Code quality** - Prettier formatting, Markdown linting, TypeScript strict mode
- **Error handling** - Proper HTTP status codes and error responses
- **File validation** - MIME type filtering and size limits

### 🏗️ Technical Stack

- **Express**: 5.1.0 (latest stable)
- **Multer**: 2.0.1 (latest with security fixes)
- **SQLite3**: 5.1.7
- **TypeScript**: 5.8.3
- **Jest**: 30.0.0
- **Node.js**: Compatible with 18.x, 20.x, 22.x, 24.x

### 🚀 Installation

```bash
npm install @jesselpalmer/easy-blob
```

### 📖 Documentation

- Complete TypeScript examples in README
- JSDoc comments throughout codebase
- API endpoint documentation with examples
- Configuration options with defaults

### 🧪 Testing

- Comprehensive test coverage for all API endpoints
- File upload/download testing
- Error handling validation
- Cross-platform CI/CD with GitHub Actions

---

## Package Information

**Package Name**: `@jesselpalmer/easy-blob`  
**License**: MIT  
**Repository**: <https://github.com/jesselpalmer/easy-blob>  
**Issues**: <https://github.com/jesselpalmer/easy-blob/issues>

### Badges

[![CI](https://github.com/jesselpalmer/easy-blob/actions/workflows/ci.yml/badge.svg)](https://github.com/jesselpalmer/easy-blob/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@jesselpalmer%2Feasy-blob.svg)](https://www.npmjs.com/package/@jesselpalmer/easy-blob)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
