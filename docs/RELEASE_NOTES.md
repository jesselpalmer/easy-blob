# EasyBlob 2.0.0

EasyBlob provides local file uploads, listing, byte-accurate downloads and deletion through an HTTP
API, with SQLite metadata and an explicit application-owned lifecycle.

## Changes

- Prevent upload-name collisions with exclusive UUID filenames.
- Coordinate file writes and metadata commits; record deletion recovery intent before removing bytes.
- Pair storage directories and databases with persistent identities; preserve unreferenced bytes for inspection.
- Add awaitable readiness/startup/shutdown and protected Express router mounting.
- Replace the unmaintained SQLite driver with better-sqlite3 and refresh maintained dependencies.
- Ship runnable server/client examples, public declarations, migration and operating guidance.

## Breaking changes

- Support Node.js 22.23.4+ within 22.x and 24.22.1+ within 24.x.
- Await startup and shutdown. Applications own signal handlers; the library does not exit the process.
- Standalone servers bind loopback by default. Mount authentication/authorization before the router.
- Downloads use attachment headers and `application/octet-stream`.
- Enforce canonical numeric IDs, stricter configuration and one multipart `blob` file per upload.
- Enforce one owner per local storage/database pair; clustered or distributed writers are unsupported.

Back up the database and files together while the old application is stopped, then validate the
upgrade against a copy. Existing numeric IDs and safe legacy filenames remain supported. Read the
[migration guide](https://github.com/jesselpalmer/easy-blob/blob/main/docs/MIGRATION.md) before upgrading.

## Verification and limits

The release preparation exercises 84 unit cases, 88 real filesystem/SQLite/HTTP integration cases,
five tooling/security checks and five separate-process installed-package scenarios. Clean CJS, ESM
and strict TypeScript consumers are checked across Node 22/24 on Linux, macOS and Windows. Full and
runtime audits must report zero findings; the release checklist records the exact passing commit.

This is single-owner local storage. Authentication, TLS, rate limits and per-user access control
belong to the host application. Listing is unpaginated; metadata operations are synchronous; native
build tooling can be needed during SQLite installation. Power-loss durability, network filesystems
and multi-process access are not qualified. See the
[operations guide](https://github.com/jesselpalmer/easy-blob/blob/main/docs/OPERATIONS.md).

Three tested development overrides supply security fixes pending compatible upstream parent updates;
[#27](https://github.com/jesselpalmer/easy-blob/issues/27) tracks their eventual removal.
