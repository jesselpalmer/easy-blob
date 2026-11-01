# EasyBlob

[![CI](https://github.com/jesselpalmer/easy-blob/actions/workflows/ci.yml/badge.svg?branch=main&event=push)](https://github.com/jesselpalmer/easy-blob/actions/workflows/ci.yml?query=branch%3Amain)
[![npm downloads per month](https://img.shields.io/npm/dm/%40jesselpalmer%2Feasy-blob?label=downloads%2Fmonth)](https://www.npmjs.com/package/@jesselpalmer/easy-blob)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

EasyBlob adds local file uploads, listing, downloads and deletion to a Node.js application.
It stores file bytes on disk and metadata in SQLite. It is intended for small applications,
local tools and internal services that have one process owning local storage.

It is not a distributed object store, a cloud-storage abstraction or an authentication system.
Use it when a local disk and one application instance meet your persistence and availability needs.

## Install the release candidate

This branch documents **2.0.0-rc.1**, which is not yet published. The existing npm `latest` release is
1.0.0 and does not provide the lifecycle and recovery behavior below. Build the candidate tarball
from this checkout:

```sh
npm ci
npm run check
npm pack
```

In a separate application directory, install the resulting tarball using its actual path:

```sh
npm init -y
npm install /path/to/jesselpalmer-easy-blob-2.0.0-rc.1.tgz
```

Supported runtimes are **Node.js 22.23.4+ within 22.x and 24.22.1+ within 24.x**.
CI targets Linux, macOS and Windows Server 2022 with Visual Studio 2022; consult the verification report.
Other Node majors and network filesystems are not supported. The native `better-sqlite3` dependency
ships bundled binaries for common platforms. An upstream npm issue can still invoke native build
tooling during installation; see [installation troubleshooting](#troubleshooting) before deploying.

Existing users should read the [2.0 migration guide](docs/MIGRATION.md) before opening their data.

## First successful integration

Save this as `server.cjs` in the application directory:

```js
const { BlobStorage } = require('@jesselpalmer/easy-blob');

async function main() {
  const storage = new BlobStorage({ storageDir: './uploads', dbPath: './blobs.db' });
  let server;
  try {
    server = await storage.start(3000); // Awaits readiness; binds loopback by default.
  } catch (error) {
    await storage.close();
    throw error;
  }
  console.log(`Listening on port ${server.address().port}`);

  const shutdown = () => {
    storage.close().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Run `node server.cjs`. In another terminal, upload a file and use the returned numeric ID:

```sh
curl -F 'blob=@myfile.pdf' http://127.0.0.1:3000/upload
curl http://127.0.0.1:3000/files
curl http://127.0.0.1:3000/blob/1 --output downloaded.pdf
curl -X DELETE http://127.0.0.1:3000/blob/1
```

The first command returns `{"id":1,"message":"File uploaded successfully"}` on a new database.
Restarting with the same storage and database paths retains files that have not been deleted.
The [complete runnable example](examples/server.cjs) includes configurable paths, protected mounting
and shutdown; the package checks execute that example after installing the tarball.

### Use it from a client application

The server owns storage; clients use its HTTP API. No EasyBlob import or extra HTTP library is
needed in a client. With the server above running, use the packaged
[JavaScript client](examples/client.mjs) from a second terminal:

```sh
node node_modules/@jesselpalmer/easy-blob/examples/client.mjs ./myfile.pdf ./downloaded.pdf
```

It uploads the actual file in the `blob` multipart field, uses the returned ID to find it in the
listing, downloads and compares the exact bytes, saves a local copy, then deletes its remote upload.
The input stays untouched, the download remains on disk, and an existing output file is never
overwritten. This is a small-file demonstration: it buffers the file in memory and the default
server upload limit is 10 MiB. The [walkthrough](examples/README.md) covers sample input,
authenticated requests and custom URLs, including a mounted `/storage` prefix.

For example, the upload request itself is:

```js
const form = new FormData();
form.append('blob', new Blob(['Hello from my application']), 'hello.txt');
const response = await fetch('http://127.0.0.1:3000/upload', {
  method: 'POST',
  body: form,
});
if (!response.ok) throw new Error(`Upload failed: HTTP ${response.status}`);
const { id } = await response.json();
console.log(`Download URL: http://127.0.0.1:3000/blob/${id}`);
```

Let `fetch` set the multipart `Content-Type` boundary. The complete client checks responses,
sets request deadlines, handles authentication and cleans up its own upload after a download failure.
If the upload response is lost, its outcome is uncertain; retrying can create another blob.

### JavaScript modules and TypeScript

CommonJS uses the named export shown above. Native JavaScript ESM (`.mjs`) uses:

```js
import { BlobStorage } from '@jesselpalmer/easy-blob';

const storage = new BlobStorage({ storageDir: './uploads', dbPath: './blobs.db' });
try {
  await storage.ready();
  // Mount storage.router or await storage.start(3000).
} finally {
  await storage.close();
}
```

TypeScript can also import configuration types:

```ts
import { BlobStorage, type BlobStorageOptions } from '@jesselpalmer/easy-blob';

const options: BlobStorageOptions = { storageDir: './uploads', dbPath: './blobs.db' };
const storage = new BlobStorage(options);
await storage.ready();
// Mount storage.router or await storage.start(3000).
await storage.close();
```

The package remains compiled CommonJS with named ESM interoperability and public declarations.
`Database` remains an advanced named export; direct metadata mutation bypasses file-consistency
rules and must not be used against a live `BlobStorage` instance.

## Mount in an existing Express application

Place authentication and authorization **before** the storage router:

```js
const express = require('express');
const { BlobStorage } = require('@jesselpalmer/easy-blob');

async function createApp(authenticate, authorizeStorageAccess) {
  const storage = new BlobStorage();
  await storage.ready();
  const app = express();
  app.use('/storage', authenticate, authorizeStorageAccess, storage.router);
  return { app, storage };
}
```

These middleware functions must enforce the application's permissions. Routes become
`/storage/upload`, `/storage/files` and `/storage/blob/:id`. The built-in listing exposes every
record to an authorized caller; EasyBlob does not provide per-user ownership or tenant isolation.
Use a separate store per permission boundary or enforce your access model in the application.

`storage.expressApp` is retained for standalone use and tests. Adding middleware to that app after
construction does **not** protect routes already registered on it. Mount `storage.router` as above.
When the application creates its own HTTP server, it must stop that server and await `storage.close()`
during shutdown. See [the complete example](examples/server.cjs).

## Lifecycle and configuration

| API | Contract |
| --- | --- |
| `new BlobStorage(options)` | Validates configuration and begins initialization. Invalid options throw. |
| `await storage.ready()` | Resolves after directories, ownership, SQLite schema and recovery are ready; rejects on failure. |
| `await storage.start(port, host?)` | Waits for readiness and returns an owned HTTP server; bind failures reject. Default host is `127.0.0.1`; port `0` selects an available port. |
| `storage.router` | Mountable Express router; requests wait for readiness. |
| `storage.expressApp` | Standalone Express application with storage routes already registered. |
| `await storage.close()` | Stops admitting work, drains or cancels active requests, closes owned server and database, and releases ownership. Repeated calls share completion. |

The library never installs process-wide signal handlers or calls `process.exit()`.
Create a new instance after closing an old one; an instance is not restarted after closure.

| Option | Default | Validation and meaning |
| --- | --- | --- |
| `storageDir` | `./uploads` | Nonempty filesystem path; dedicated local directory for blobs. Created recursively. |
| `dbPath` | `./blob-storage.db` | Nonempty local SQLite file path outside the blob directory; its parent must exist. `:memory:` is unsupported. |
| `maxFileSize` | `10485760` | Positive safe integer byte limit for each uploaded file. |
| `allowedMimeTypes` | `[]` | Array of exact `type/subtype` strings, without parameters or wildcards; empty allows all declared types. |
| `shutdownTimeoutMs` | `5000` | Integer from 1 to 2147483647; grace period before active requests are cancelled. |

Relative paths resolve from the process working directory. Use stable absolute paths in deployments.
MIME filtering checks the client's declaration. It does not inspect bytes, prove file type, detect
malware or make uploaded HTML, SVG or other active content safe.

## HTTP API

Uploads accept one multipart file in the `blob` field. Unexpected files, text fields, missing files,
oversized uploads and rejected MIME declarations return `400`. Error bodies use `{"error":"..."}`;
applications should branch on status rather than internal error wording.

| Method and path | Success | Other expected responses |
| --- | --- | --- |
| `POST /upload` | `200` with `id` and `message` | `400` invalid multipart/limits; `500` storage failure; `503` unavailable |
| `GET /files` | `200` array of metadata, newest first | `500` storage failure; `503` unavailable |
| `GET /blob/:id` | `200` exact file bytes | `400` malformed ID; `404` absent blob/file; `500` storage failure; `503` unavailable |
| `DELETE /blob/:id` | `200` with `message` | `400` malformed ID; `404` absent blob; `500` incomplete deletion/storage failure; `503` unavailable |

IDs must be canonical positive decimal safe integers. Values such as `1abc`, `1.5`, `01`, `0`, negative
numbers and values above `Number.MAX_SAFE_INTEGER` are rejected.

Metadata retains `id`, `original_name`, `mime_type`, `path` and `upload_timestamp`. The `path` field is
an implementation filename, not a public URL or authorization token. Downloads use attachment
headers, `application/octet-stream` and `X-Content-Type-Options: nosniff`; client MIME declarations
are not used to render content inline. A stream error after response headers can terminate the
connection, so callers must handle incomplete downloads.

## Persistence and operating limits

A successful upload acknowledges a completed file write and committed SQLite metadata. New filenames
use collision-resistant IDs with exclusive filesystem creation. Concurrent uploads with identical
original names do not replace one another.

Deletion commits metadata removal and a recovery journal entry before removing bytes. If removing
bytes fails, the request returns `500` but the blob may already be logically absent; startup retries
pending cleanup. Requests whose response is lost have an uncertain outcome. Upload retries can
create another blob; there is no idempotency-key API.

One live instance may own a storage directory or metadata database. Competing instances fail readiness.
Crash locks are not automatically stolen. Local filesystem access by other programs, manual database
edits and shared/network storage are outside the concurrency contract.

Persistent identities pair the blob directory with its database; a mismatched pair fails readiness
before recovery can remove files. Recovery replays explicitly journaled deletion work. Unreferenced
files, including interrupted managed uploads and legacy orphans, are preserved for manual inspection
so a stale database cannot silently discard newer bytes. Missing referenced files remain listed,
return `404` on download and can be explicitly deleted. Unsafe metadata, duplicate paths, symlinks
and nonregular referenced files fail readiness. Recovery does not reconstruct missing file
contents, and successful writes are not a promise of survival across power loss. SQLite transactions
and filesystem operations are not one atomic transaction.

See [operations and recovery](docs/OPERATIONS.md) for crash windows, stale locks, corrupted metadata,
read/delete races and backup/restore. Back up the database and files together **while the store is
stopped**. Restoring only one side can lose access to data or associate metadata with missing files.

EasyBlob does not supply TLS, user authentication, tenant authorization, quotas, antivirus scanning,
rate limiting or high availability. Protect network exposure in the hosting application and proxy.
Listing is unpaginated, and short SQLite metadata operations are synchronous. A deletion waiting
for a slow download can delay other queued operations; configure host transfer deadlines. This
library targets small workloads, not an unbounded public upload service. Routine operations do not log filenames
or complete metadata.

## Troubleshooting

- **Native SQLite installation/load fails:** better-sqlite3 13 ships binaries in its npm artifact for Linux
  glibc/musl, macOS and Windows on x64/arm64. Use a supported Node version and platform; do not reuse
  `node_modules` copied from a different OS or architecture. The packaged native binary must be present.
  A known npm issue can invoke `node-gyp rebuild` despite these binaries, including on clean lockfile
  reinstalls. Have Python and a compatible C++ toolchain available. On Windows, use Visual Studio 2022
  with the Desktop development with C++ workload; Node 22's bundled npm does not recognize the newer
  Visual Studio 2026 toolchain. Updating npm alone is not a proven fix. See the
  [upstream installation issue](https://github.com/WiseLibs/better-sqlite3/issues/1516) and
  [dependency decisions](docs/DEPENDENCIES.md). Other architectures need separately validated builds.
- **Storage already owned after a crash:** stop all applications using either path, then follow the
  [manual lock recovery procedure](docs/OPERATIONS.md). Do not remove locks from an active owner.
- **Permission or database-open failure:** verify the application can create files in both locations,
  that the database parent exists and that paths refer to local writable storage.
- **Readiness rejects existing data:** inspect the cause and restore a consistent backup or repair
  the offending record offline. Do not suppress the error or discard the entire database.
- **Routes unexpectedly return 401/403:** check the middleware before the mounted router. Middleware
  added after storage routes cannot retroactively protect them.

## Project information

- [Roadmap and issues](ROADMAP.md)
- [Starting-state assessment](docs/ASSESSMENT.md)
- [Dependency decisions](docs/DEPENDENCIES.md)
- [Architecture, test layers and quality checks](docs/TESTING.md)
- [Migration guide](docs/MIGRATION.md) and [changelog](CHANGELOG.md)
- [Contributor checks](CONTRIBUTING.md), [security reporting](SECURITY.md), [release checklist](docs/RELEASE.md)
- [Five-developer adoption study](docs/ADOPTION.md)

MIT licensed; see [LICENSE](LICENSE).
