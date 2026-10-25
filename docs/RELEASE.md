# 2.0 release candidate and release checklist

Recommended stable version: **2.0.0**. Working candidate: **2.0.0-rc.1**.
No stable release is authorized by this document. Merging, release tags and npm publication require
an explicit maintainer decision after reviewing the candidate and verification evidence.

## Release notes

EasyBlob now has an awaited lifecycle, application-controlled process shutdown, protected Express
mounting and explicit local storage recovery. Exclusive UUID filenames prevent same-millisecond
upload collisions. Failed upload commits are compensated; deletion records recovery intent in SQLite
before unlinking bytes. Existing numeric IDs and safe legacy filenames remain usable.

The package updates maintained dependencies, replaces the archived sqlite3 driver with better-sqlite3,
ships declaration dependencies needed by clean TypeScript consumers, and verifies the packed package
rather than relying only on source-checkout tests. Persistent store identities reject mismatched
metadata/directory pairs, while unreferenced bytes are
preserved for inspection. Operational documentation explains crash windows, manual stale-lock recovery,
paired backups and single-owner constraints.

Breaking changes include the supported Node policy, promise-returning startup/shutdown, loopback
binding by default, no automatic process exit, stricter identifiers/configuration/multipart handling,
and attachment-only binary downloads. Read [the migration guide](MIGRATION.md) before upgrading.

## Candidate review gates

- [ ] `npm ci` succeeds from the committed lockfile on supported platforms/runtimes.
- [x] `npm run check` passes, including clean installed CJS, ESM and strict TypeScript consumers.
- [x] The actual packaged examples complete upload/list/download/delete and protected-route checks.
- [x] Real text and binary downloads match uploaded bytes; restart and legacy-data fixtures pass.
- [x] Collision, filesystem/database failure, cancellation, recovery and read/delete races pass.
- [x] Startup failure, protected middleware ordering and repeated shutdown leave no owned resources.
- [ ] Supported CI matrix passes for the candidate commit; unavailable checks remain unverified.
- [x] Runtime/development dependency findings are reviewed with exposure and remediation recorded.
- [x] Independent storage/security, API/package and onboarding reviews have no unresolved blocker.
- [x] README, migration, operations, roadmap and issue status match implemented behavior.

The [verification report](VERIFICATION.md) records outcomes for the current candidate. An unchecked
item is not evidence of failure by itself; it requires a recorded result before release readiness is claimed.

## Publication steps after authorization

1. Review the candidate PR and exact tested commit. Confirm changes in overlapping Dependabot PRs
   are accounted for without merging obsolete dependency changes into the candidate blindly.
2. Choose whether to publish a prerelease for external testing or finalize 2.0.0. Update package and
   lockfile versions, changelog date and README installation instructions consistently.
3. Rerun required checks and inspect `npm pack --dry-run`; exclude local data, credentials and artifacts.
4. Review GitHub Actions results, permissions, npm token availability and tag/version agreement.
5. Merge only after authorization. Create and push the matching `v<package-version>` tag only when
   publication is explicitly authorized; the release workflow can publish on that tag.
6. Verify the registry artifact and release notes after publication, using a clean install.
7. Begin the prepared [five-developer adoption experiment](ADOPTION.md) only with participant opt-in.

Do not force-update a published tag or version. If a release artifact is wrong, prepare a new version
with a clear correction. Keep backups and migration guidance available for operators upgrading data.
