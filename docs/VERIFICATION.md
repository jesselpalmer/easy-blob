# Release-candidate verification

Candidate: **2.0.0-rc.1**. Reviewed October 24, 2026. Recommended stable version: **2.0.0**.
Starting commit: `f99d39107c97a33c76edadcbc7801ff9f48a9803`.
No npm publication, release tag or merge has been performed.

## Baseline and reproducibility

At the starting revision, `npm ci`, `npm run build`, `npm run lint` and all 10 original tests passed
on Linux x64 / Node 24.22.1. Native sqlite3 installation compiled locally and took about two minutes.
An early test attempt before native installation finished could not load the addon; the completed
installation and subsequent test run passed. That transient attempt is not a baseline code defect.

The actual published 1.0.0 tarball was inspected. Named CommonJS/ESM exports worked, the README's
direct constructor import failed, and a strict clean TypeScript consumer failed on missing Express
declarations. The confirmed source defects are recorded in [the assessment](ASSESSMENT.md).

Run `npm ci` followed by `npm run check` to reproduce candidate build, formatting/Markdown checks,
integration tests and installed-tarball consumers. `npm run test:coverage` supplies coverage;
`npm audit --omit=dev` and `npm audit` distinguish runtime and complete dependency findings.

## Local results

| Check | Result |
| --- | --- |
| Node 24.22.1, Linux x64: complete `npm run check` | Passed |
| Node 22.23.4, Linux x64: complete `npm run check` | Passed |
| Isolated real SQLite/filesystem/HTTP tests | 88 passed in three suites on each runtime |
| Packed CJS and native ESM consumers | Passed complete upload/list/download/delete and close/reopen lifecycle |
| Strict TypeScript `.cts` and `.mts` consumers | Passed with `skipLibCheck: false` outside the source checkout |
| Packaged standalone and authenticated examples | Passed actual lifecycle, protected routes and incomplete-header shutdown |
| Exact text, empty and binary downloads | Passed, including restart persistence |
| Legacy SQLite schema and timestamp filenames | Existing numeric IDs and exact bytes preserved |
| Coverage on Node 24 | 88.77% statements, 81.12% branches, 90.73% lines |
| Runtime dependency audit | No known advisories reported on review date |
| Complete dependency audit | Four low records from one development-only KaTeX advisory; see dependency decision |

Coverage is diagnostic, not a release threshold or proof of correctness. Residual branches include
exceptional configuration, corrupted identity/schema and resource-cleanup errors. Fault tests target
material user contracts rather than attempting to simulate every operating-system failure.

The pack check validates allowed files and excludes local databases, secrets and test artifacts.
It prints artifact file count, unpacked size and SHA-512 integrity for the exact generated tarball;
documentation edits change that integrity. No package depends on development dependencies or source files
to execute. The consumer type check intentionally uses a compiler supplied by the test harness.

## Failure and concurrency evidence

Tests cover forced UUID collisions without overwrite, parallel identical-name uploads, failed file
creation and metadata insertion, real SQLite deletion rollback, failed unlink and journal replay,
malformed IDs/URI encodings/multipart, MIME and size limits, live missing files, symlinks and unsafe
paths, request cancellation, stream errors, read/delete races, concurrent deletes, authorization on
every route, pre-readiness requests, initialization failures, port conflicts and repeated close cycles.

Recovery regressions cover incorrect/missing database paths, mismatched storage/database identity,
missing markers, interrupted initial pairing, and restoration of an older matching database.
Acknowledged and unreferenced bytes survive those cases. Only an explicit committed deletion journal
authorizes automatic physical deletion. Integer sequence exhaustion rolls back its insertion.

Tests use isolated temporary directories, explicit resource closure and event synchronization.
They do not use arbitrary sleeps or forced process exit to hide leaks. Stalled-transfer tests exercise
the configured shutdown deadline as the behavior under test.

## Independent adversarial review

Three independent reviewers examined storage/security, API/package compatibility, and first-time
integration/documentation. Findings were reproduced and fixed before the candidate report:

- Wrong database paths could cause destructive orphan cleanup: add persistent pairing and preserve orphans.
- Async database callbacks awaiting close could deadlock: decouple callback promises from the resource queue.
- Integer exhaustion could acknowledge an inaccessible blob: validate IDs inside the insert transaction.
- Express URL-decoding errors exposed HTML stacks: add a quiet router JSON error boundary.
- Download stat failures retained attachment headers: set headers after stat and reset generic error headers.
- The quick start omitted failed-start cleanup, and the protected example could hang on incomplete headers:
  await cleanup and give the external server its own shutdown deadline.
- The ESM example used TypeScript syntax: provide separate executable JavaScript and TypeScript snippets.

Reviewers rechecked fixes and reported no remaining material blocker within the declared support model.
The HTTP error-header and example-shutdown findings have retained regression checks.

## CI evidence and remaining limits

The GitHub CI matrix runs Node 22/24 on Ubuntu, Windows Server 2022 and macOS, plus a coverage job.
All seven jobs passed in [CI run 34](https://github.com/jesselpalmer/easy-blob/actions/runs/40167330150)
for source commit `0a6b00010c0c59250357b2fc273560b87b550fad`: six supported OS/runtime entries and coverage.
Each matrix entry ran clean installation, the complete check including tarball reinstall/consumers,
and the runtime audit. This does not establish every architecture shipped by the native dependency.
The first CI run passed both Linux/macOS runtimes, Windows Node 24 and coverage, but Windows Node 22
failed during installation: npm's upstream implicit-build bug invoked node-gyp, which could not
detect Visual Studio 2026. The matrix now uses the compatible Visual Studio 2022 runner, and package
verification also performs `npm ci` after the first clean installation. Native build-toolchain
prerequisites are documented; no blanket script bypass or SQLite downgrade hides the failure.

The enhanced local consumer reinstall initially hit a sandbox-specific Node-header extraction error
(`fchown` returned `EINVAL`). Repeating the checks with official matching Node headers extracted
without changing ownership, supplied through `npm_config_nodedir`, passed on both Node versions.
Hosted CI passed normal installs/reinstalls without that local environment adjustment.
The candidate meets the declared release-readiness criteria; merge, tags and publication remain
explicit maintainer decisions. Final report-only changes do not alter the verified source or lockfile.
No power-loss fault campaign, network-filesystem qualification, multi-process support or external
adoption study is claimed. Those capabilities are outside this release's support contract.

The operating model is one local owner, application-owned authentication/TLS/timeouts, synchronous
metadata operations and unpaginated listing. Stale ownership locks, partial identity binding and
orphan files require deliberate offline inspection. A slow read with a queued deletion can delay
the global metadata queue. See [operations](OPERATIONS.md) and [migration](MIGRATION.md).

The [release checklist](RELEASE.md) and [adoption experiment](ADOPTION.md) separate release authorization
from the prepared five-developer study. No developers have been contacted.
