# Release-candidate verification

Candidate: **2.0.0-rc.1**. Reviewed October 24, 2026. Recommended stable version: **2.0.0**.
Starting commit: `f99d39107c97a33c76edadcbc7801ff9f48a9803`.
The initial work was merged by the maintainer in
[#22](https://github.com/jesselpalmer/easy-blob/pull/22) at
`3697b5184f11a036d7b5f95625543340f5566aa4`. This follow-up does not publish or tag a release.

## Issue #25 remediation

The maintainer requested immediate resolution after PR #26 merged. Replace Jest/ts-jest with Vitest
5.0.5 and V8 coverage to remove deepmerge; remove the now-unused glob override; verify patched
KaTeX 0.18.2 through the existing Markdown math integration. Production source and resolved runtime
dependency versions are unchanged. Full and runtime audits report **zero findings**, with low
severity now rejected in CI/release automation as well. Necessary secure overrides are tracked in
[#27](https://github.com/jesselpalmer/easy-blob/issues/27); they are not accepted vulnerabilities.

On Linux / Node 24.22.1, all 172 original unit/integration cases pass with strict test/configuration
type checking. V8 reports 89.90% statements / 85.01% branches / 88.42% functions / 94.70% lines.
All five production files are present in the coverage JSON; pure validation reports 100% in each
metric. Counter mapping differs from Jest, so percentages are not evidence of added coverage.
The original validation and non-validation aggregate floors remain. Deliberately impossible
thresholds in each group produce the expected failures, verifying neither gate is silently skipped.

Five tooling cases verify math rendering, explicit trust, ordinary Markdown lint rules, absence of
the removed dependency chains and the inherited-trust bypass. The security regression runs in an
isolated child and was confirmed to fail through the old KaTeX 0.16.47 parser/renderer integration,
then pass through patched 0.18.2. No private fork, severity exclusion or linter downgrade is used.
The HTTP read/delete race now compares Buffer bytes natively, avoiding generic matcher enumeration
of millions of Buffer keys under coverage while retaining the same byte equality assertion.

The remediation PR records the final clean-install/complete-check results and hosted OS/runtime
matrix. The older review and audit observations below describe their respective earlier revisions.

## October 31 dependency and usage follow-up

PR #24 merged at `276726e0b2b953ebfd95c9f8e723c25624917bb6`. The next follow-up refreshes
compatible dependencies, validates temporary development security overrides and adds the packaged
`examples/client.mjs` walkthrough. It runs against the actual installed server in another process,
using standalone and authenticated mounts. Checks include real binary input, paths containing spaces,
the returned upload ID, byte-accurate local downloads, remote cleanup, refusal to replace an existing
file and rejected credentials. The five existing process scenarios now include these client checks.

Local complete checks on Linux / Node 24.22.1 pass: all 172 Jest cases, enforced coverage,
clean installed CJS/ESM/TypeScript consumers and all five process scenarios. Coverage remains
89.42% statements / 82.38% branches / 86.76% functions / 91.51% lines. Normal install scripts run;
the previously documented matching-header sandbox workaround remains necessary locally.
Before/after comparisons confirm the actual Markdown/source globs, ESLint file selection and Jest
test discovery stay unchanged with the glob/minimatch overrides. `npm ls --depth=0` reports no
invalid direct dependencies. The follow-up PR's Actions results establish hosted OS/runtime status;
local results alone do not establish that matrix.

The fresh full audit initially reported 35 affected records (3 high / 26 moderate / 6 low).
After remediation it reports zero high/moderate and ten low records from two development-only
advisories: KaTeX and deepmerge. Runtime audit remains zero. These current results supersede the
older audit observations below. [Dependency decisions](DEPENDENCIES.md) explains the tested overrides,
exposure, upstream constraints and removal conditions; [#25](https://github.com/jesselpalmer/easy-blob/issues/25)
tracks the remaining findings. CI and release validation reject moderate-or-higher full-audit findings.
No tag or package publication is part of this follow-up.

## Quality audit follow-up

The follow-up in [#23](https://github.com/jesselpalmer/easy-blob/issues/23) adds actual ESLint checks,
formats maintained code/configuration, separates 84 pure unit cases from the retained 88 integration
cases, and adds five separate-process HTTP E2E scenarios against the installed tarball. CJS/ESM,
strict TypeScript, fresh/locked installation and existing packaged example checks remain in place.
See [architecture and testing](TESTING.md) for commands, boundaries and coverage gates.

On Linux / Node 22.23.4 and 24.22.1, the complete check passed locally, including all five
process scenarios. The local native-header workaround documented below was retained.
Measured Jest coverage is 89.42% statements, 82.38% branches, 86.76% functions and 91.51% lines.
The production audit reports zero findings; the full audit retains the same four low development
records from one KaTeX advisory. ESLint's declared peers and `npm ls --depth=0` are consistent.
The current follow-up PR checks provide the OS/runtime evidence; the earlier seven-job run below
belongs to the initial implementation, not this follow-up. Coverage now runs in each of the six
matrix jobs as part of `npm run check`.

The remaining sections preserve the initial release-readiness evidence and independent reviews.
Their earlier test counts and coverage policy describe that revision.

## Baseline and reproducibility

At the starting revision, `npm ci`, `npm run build`, `npm run lint` and all 10 original tests passed
on Linux x64 / Node 24.22.1. Native sqlite3 installation compiled locally and took about two minutes.
An early test attempt before native installation finished could not load the addon; the completed
installation and subsequent test run passed. That transient attempt is not a baseline code defect.

The actual published 1.0.0 tarball was inspected. Named CommonJS/ESM exports worked, the README's
direct constructor import failed, and a strict clean TypeScript consumer failed on missing Express
declarations. The confirmed source defects are recorded in [the assessment](ASSESSMENT.md).

Run `npm ci` followed by `npm run check` to reproduce build, code/Markdown/formatting checks,
unit/integration coverage gates and installed-tarball E2E. `npm run test:coverage` runs coverage alone;
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

At the initial revision coverage was diagnostic, not a release threshold. The follow-up adds
regression floors; neither percentages nor passing tests are proof of correctness. Residual branches include
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

The initial GitHub CI matrix ran Node 22/24 on Ubuntu, Windows Server 2022 and macOS, plus a coverage job.
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
