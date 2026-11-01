# 2.0.0 release verification

Target: **2.0.0 stable**, without an RC publication. Release preparation starts from merged `main`
commit `a1e195150be54d4e5b2e44dbd9c3496f4ade6128`. The preparation changes version metadata,
current release documentation and release notes; it does not change production source or dependency
versions. Publication remains a separate maintainer action.

## Current checks

Run `npm ci`, `npm run check`, `npm audit --omit=dev --audit-level=low` and
`npm audit --audit-level=low`. The complete check builds clean output, lints code/Markdown, checks
formatting, typechecks tests/configuration, enforces coverage, tests tooling security and installs
the actual tarball into a temporary consumer outside the checkout.

| Layer | Evidence |
| --- | --- |
| Pure validation | 84 unit cases without disk, network or SQLite |
| Integration | 88 cases using real temporary files, SQLite and HTTP, including failure/recovery/concurrency |
| Tooling | Five checks covering Markdown/math compatibility, removed dependency chains and isolated inherited-trust regression |
| Installed-package E2E | Five separate-process scenarios covering CJS/ESM hosts, protected/standalone examples, restart persistence, deletion and startup failure |
| Consumer packaging | Fresh install and locked reinstall, named CJS/ESM imports, strict `.cts`/`.mts` declarations, executable packaged client/server |
| Coverage | V8 includes all five production source files; aggregate non-validation floors remain 85% statements / 75% branches / 85% functions / 90% lines |
| Validation coverage | 100% statements/functions/lines and at least 95% branches required separately |
| Audits | Full and runtime trees must have zero findings, including low severity |
| Hosted matrix | Node 22/24 on Ubuntu, macOS and Windows Server 2022; the final preparation PR records exact commit/run results |

The preparation PR records fresh local results and the final six-job CI run for **2.0.0**. Earlier
passing runs on the unreleased working version do not substitute for checking the final artifact.
The stable-version local check measured 89.90% statements / 85.01% branches / 88.42% functions /
94.70% lines; validation measured 100% across metrics. V8 and the former Jest provider count code
differently, so changing percentages are not evidence of additional application coverage.

Both validation and non-validation gates were independently checked with impossible thresholds and
failed as expected. Fresh-context review also inserted an unimported source probe in an isolated
copy and confirmed it appeared at 0% coverage. No application case was removed, skipped or given
a longer deadline during the runner migration. Native Buffer comparison preserves exact-byte
assertions for large read/delete races.

## Storage and HTTP guarantees exercised

Checks cover exact text, empty and binary bytes; duplicate original names; forced UUID collision;
restarts and legacy IDs/schema; upload compensation; SQLite rollback; deletion journals and replay;
mismatched/missing identities; older restored databases; orphan preservation; unsafe paths/symlinks;
missing files; unsafe IDs and malformed multipart/URLs; authentication before every route; cancelled
requests; download stream/stat failures; read/delete races; startup/bind failures and repeated close.

Fixtures use temporary directories and explicit cleanup. Forced child termination is emergency
cleanup, not proof of graceful shutdown. CJS/ESM consumer processes exercise public `close()` on all
platforms. CLI SIGINT/SIGTERM behavior is qualified on Linux/macOS; Windows forcibly terminates
processes for those signals, so portable close/restart evidence comes from the consumer host.

The artifact allowlist excludes test fixtures, source-only tools, local databases, credentials and
build artifacts not intended for consumers. Package verification prints the generated tarball's file
count, size and SHA-512 integrity. Documentation changes alter that integrity; the release workflow
checks and builds the exact tagged commit again before publication.

## Independent review and merged evidence

- [PR #22](https://github.com/jesselpalmer/easy-blob/pull/22): storage/security, API/package and onboarding
  reviews; findings reproduced, fixed and rechecked. The baseline assessment is preserved in
  [ASSESSMENT.md](ASSESSMENT.md).
- [PR #24](https://github.com/jesselpalmer/easy-blob/pull/24): code linting, pure unit cases, retained
  integrations and separate-process E2E; all six matrix jobs passed.
- [PR #26](https://github.com/jesselpalmer/easy-blob/pull/26): actual packaged client, compatible updates,
  security overrides and initial full-audit gates; six matrix jobs passed.
- [PR #28](https://github.com/jesselpalmer/easy-blob/pull/28): zero full/runtime audit findings, Vitest/V8
  migration, strict test types and KaTeX regression. Three fresh-context reviewers found no material blockers;
  six jobs passed in [run 41230984219](https://github.com/jesselpalmer/easy-blob/actions/runs/41230984219).

Reviewers executed independently on Linux / Node 24.22.1; hosted CI provides the other OS/runtime
execution evidence. The KaTeX trust regression fails through the old 0.16.47 parser/renderer and
passes through patched 0.18.2 in a disposable child process.

## Installation and qualification limits

Local native installation can require matching official Node headers extracted without ownership
changes because this workspace returns `EINVAL` for node-gyp's `fchown`. Supplying those headers via
`npm_config_nodedir` retains normal install scripts. Hosted CI installs normally. A separate upstream
npm metadata issue can invoke a native rebuild despite bundled SQLite binaries; the compatible
C++ toolchain prerequisite remains documented in [DEPENDENCIES.md](DEPENDENCIES.md).

The supported operating model is one local owner, synchronous metadata, unpaginated listing and
application-owned authentication, TLS and transfer deadlines. A deletion queued behind a slow read
can delay other metadata operations. Stale locks, partial identities and orphans require deliberate
offline inspection. Backups pair the database and files while stopped.

No power-loss fault campaign, network-filesystem qualification, multi-process support, every-native-
architecture qualification or completed external adoption study is claimed. See
[operations](OPERATIONS.md), [migration](MIGRATION.md) and [release steps](RELEASE.md).
