# Changelog

Release dates record publication, not the date a working branch was prepared.

## [2.0.0] - Unreleased

### Added

- Awaitable readiness, startup and shutdown with application-owned process lifecycle.
- Mountable Express router for authentication and authorization before all storage routes.
- Exclusive collision-resistant upload filenames, ownership locks and journal recovery.
- Persistent database/directory identity pairing; unreferenced bytes preserved for offline inspection.
- Journaled deletion, safe stored-path validation and read/delete coordination.
- Isolated real-storage failure/concurrency tests and installed-package CJS, ESM and TypeScript checks.
- Runnable packaged example, operational guidance, migration guide and adoption-study plan.
- Packaged HTTP client walkthrough with byte verification, protected-mount usage and cleanup;
  exercised in separate processes against the installed artifact.
- Weekly grouped dependency maintenance and CI/release audit gates rejecting every advisory severity.

### Changed

- Supported runtimes are Node.js 22.23.4+ within 22.x and 24.22.1+ within 24.x.
- Replaced the unmaintained sqlite3 driver with better-sqlite3 while retaining metadata IDs/schema.
- Updated runtime and development dependencies and release validation; public declaration dependencies ship.
- Replaced Jest/ts-jest with Vitest and V8 coverage, retained all application cases and coverage floors,
  and added strict test/configuration type checking and tooling security regressions.
- Resolved all reported runtime/development audit findings; validated security overrides and their
  eventual upstream retirement are documented in dependency decisions and issue #27.
- Startup returns a promise and binds loopback by default; no library-installed signal handlers or process exit.
- Downloads use attachment headers, `application/octet-stream` and `nosniff`.
- Configuration, IDs, multipart inputs and persisted paths receive stricter validation.
- README uses the named CommonJS export and documents failure outcomes and deployment responsibilities.

### Fixed

- Same-millisecond uploads could overwrite files with matching extensions.
- Failed metadata insertion could leave uploaded bytes without deliberate recovery.
- Database failure during deletion could leave metadata referencing already removed content.
- Asynchronous initialization failures could escape as uncaught exceptions.
- Stream failures could attempt a second response after headers were sent.
- Clean TypeScript consumers lacked the Express declarations required by public types.

See [migration](docs/MIGRATION.md), [operations](docs/OPERATIONS.md) and
[release verification](docs/RELEASE.md). 2.0.0 is prepared for stable publication; no RC will be published. The
publication date remains
unset until the package is actually released.

## [1.0.0] - 2025-06-16

Initial published release with an Express HTTP API for upload, list, download and deletion;
SQLite metadata; TypeScript declarations; Multer limits/MIME declaration filtering; configurable
storage/database paths; and CI configured for Linux, macOS and Windows across Node 18/20/22/24.

The release used Express 5.1.0, Multer 2.0.1, sqlite3 5.1.7, TypeScript 5.8.3 and Jest 30.0.0.
Its original ten tests pass in the recorded 2.0 baseline, but do not establish crash recovery,
byte integrity under collision, or comprehensive failure handling. The historical README's direct
CommonJS constructor example was incorrect; the actual package exported named classes.

Earlier release notes described “zero vulnerabilities,” comprehensive validation and production
shutdown readiness. Those were broader than the evidence supports. Dependency results are dated,
MIME filtering does not validate bytes, and the initial shutdown implementation registered process
handlers and exited without an awaited database closure. The 2.0 assessment records these limitations
without changing the release's historical version or publication date.
