# Migrating from 1.0.0 to 2.0

2.0 is a deliberate major release because supported runtimes, lifecycle, safe HTTP behavior and
storage ownership become explicit. The target stable version is **2.0.0**; the
[release checklist](RELEASE.md) records preparation and publication status.

## Before upgrading

1. Stop the 1.x application. Back up its actual SQLite database and upload directory together.
2. Upgrade to Node.js 22.23.4+ within 22.x or 24.22.1+ within 24.x. Node 18/20 are no longer supported.
3. Install 2.0.0 in a test copy of the application and paired data backup first.
4. Ensure the database is outside the dedicated storage directory and its parent exists. Configure
   the existing paths explicitly so a working-directory change cannot create a different empty store.
5. Run upload/list/download/delete and restart checks against that copy before deploying.

## Application changes

| 1.x behavior | 2.0 action |
| --- | --- |
| README showed `const BlobStorage = require(...)` | Use `const { BlobStorage } = require(...)`; the published package already had named exports. |
| `start(port)` returned void and did not expose startup failures | Await `start(port, host?)`; it returns the HTTP server and rejects on initialization/bind failure. |
| `start()` bound on all interfaces | Loopback `127.0.0.1` is the default. Supply a host explicitly when network exposure is intended. |
| Library installed SIGINT/SIGTERM handlers and called process.exit | Handle signals in your application and await `storage.close()`. |
| No public storage-close/readiness contract | Use `await storage.ready()` before mounting and `await storage.close()` during shutdown. |
| Middleware could be added after existing storage routes | Mount `app.use('/storage', authenticate, authorize, storage.router)`. |
| Downloads inferred inline content type from the extension | Downloads are attachments with `application/octet-stream` and `nosniff`; update tests/clients that assumed inline rendering. |
| `parseInt` accepted IDs such as `1abc` or `01` | Send canonical positive decimal safe-integer IDs only. |
| SQLite driver was sqlite3 | better-sqlite3 is now the native dependency; reinstall modules for the deployed Node version/platform. |
| Multiple instances could accidentally share data | One owner per database or storage directory is enforced. Remove cluster/multi-instance access. |
| Arbitrary multipart text fields were tolerated | Send exactly one `blob` file and no unrelated form fields. |

Constructor options are validated strictly. Defaults remain `./uploads`, `./blob-storage.db`, a 10 MiB
file limit, and all declared MIME types. New `shutdownTimeoutMs` defaults to 5000 ms. Review formerly
ignored empty or invalid values. `start()` and `close()` promises must be handled; the library does
not terminate the process on failure.

## Data compatibility and changed failure behavior

The `blob_metadata` table, metadata columns and numeric IDs are retained. Existing safe basename
paths remain valid; uploaded files are not renamed during migration. A pending-deletion table is
added for recovery. A `.easyblob-store.json` file and an `easyblob_store` table pair the directory
and database. Initial adoption requires neither identity to exist and no reserved managed UUID files;
a half-initialized or mismatched pair fails closed for investigation. Old-to-new fixture tests verify reading
and deleting legacy data.

New uploads use exclusive `easyblob-<UUID>.blob` names instead of timestamps. If the old release
already overwrote bytes through a timestamp collision, upgrading cannot recover the previous bytes.
Duplicate references or unsafe metadata fail readiness for manual inspection. Unreferenced files
remain preserved, including managed files from an interrupted request; inspect and clean them offline
only when their origin and disposability are established. Missing files remain
listed but download as `404`; explicit deletion can clear those records.

Deletion now removes metadata and records cleanup intent before unlinking. A `500` deletion response
can therefore mean the blob is logically absent while physical cleanup is pending. Restart retries
cleanup. After any lost response, reconcile state rather than assuming the operation did not happen.
There is no exactly-once or idempotency-key API.

The success response shapes and `200` upload/delete status codes remain unchanged. Upload limits
continue to use `400`. Error message wording is not a stable machine interface. The `path` metadata
field remains present but should not be parsed as a timestamp or used as a URL.

## Advanced Database users

`Database` remains a named export with its existing callback CRUD methods. It now offers awaited
`ready()` and `close()` methods and propagates initialization failures instead of throwing from an
asynchronous callback. Direct metadata CRUD does not manage blob bytes or provide the `BlobStorage`
ownership/recovery contract. Do not use it to mutate a database owned by a running storage instance.

## Rollback

Stop the 2.0 application and restore the original paired backup when rolling back. Do not run 1.x against
a database with pending 2.0 deletion work: 1.x does not understand that recovery journal. Preserve
post-upgrade user data separately before restoring a backup; rollback is not a safe way to discard
unreconciled operations. See [operations](OPERATIONS.md) for ownership-lock recovery.
