# Dependency and packaging decisions

Reviewed October 24, 2026 for the 2.0.0-rc.1 candidate. Registry metadata, the actual published
1.0.0 tarball and upstream documentation were checked; versions below are observations from that review.
The committed lockfile records the exact resolved dependency tree.

## October 31, 2026 follow-up

The original review below is historical. Fresh registry metadata and full/runtime audits were checked
again after PR #24 merged. Runtime direct dependencies are already on their current supported stable
versions. Compatible updates include ESLint 10.14.0, typescript-eslint 8.72.1, qs 6.17.1 and other
transitive fixes in the lockfile. TypeScript 5.9.3 and Node declarations 22.20.5 remain intentional
compatibility choices; registry `latest` is not a reason to break their peer/runtime policy.

The new full audit initially reported 35 affected records: 3 high, 26 moderate and 6 low. A record
count includes parent packages affected through a dependency; it is not a count of distinct defects.
The high RE2JS finding and moderate minimatch/glob findings are development-only. The runtime
`npm audit --omit=dev` still reports zero findings.

### Temporary development security overrides

| Dependency | Validated override | Reason and scope |
| --- | --- | --- |
| minimatch | 11.0.3 | Fix globparts amplification (GHSA-g3hv-75wg-m249); used by lint/test file matching. |
| glob | 14.0.3 | Fix cancellation bypass (GHSA-3g3m-2fjr-6pw4); used by Jest/coverage tooling. |
| markdownlint → re2js | 2.8.7 | First patched release for lookbehind denial of service (GHSA-gg6h-894w-4m9c); parent pins affected 2.8.6. |

These exact overrides intentionally bypass the parents' published ranges. Glob and minimatch cross
major versions; their Node engines include our supported runtimes, and their consumed CommonJS/ESM
APIs remain available. Local checks compare the actual Markdown/source glob results, ESLint file
selection and Jest test discovery before/after the overrides. The complete check verifies lint,
all 172 unit/integration cases, unchanged coverage and real installed consumers. Hosted CI must also
pass the Node/OS matrix before merging. These are tested development-tool choices, not an assumption
that arbitrary major overrides are compatible. No runtime dependency uses these overrides.

The resulting audit reports **zero runtime findings, zero high/moderate findings and ten low
records from two root advisories**:

- [KaTeX GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7):
  four records through Markdown tooling. The parser still requires KaTeX `^0.16.0`, while the fix
  starts at 0.18.2. EasyBlob does not render KaTeX or ship it to runtime consumers. Keep the reviewed
  exposure until upstream adopts a patched compatible range; no unvalidated KaTeX major override.
- [deepmerge GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4):
  six records through Jest/ts-jest. Registry latest 4.3.1 is affected; no patched release is published.
  Jest uses it to merge repository-controlled test configuration, not uploaded blob data. Do not feed
  untrusted data into that configuration. Downgrading Jest to npm audit's obsolete suggested release
  is not a suitable fix.

Follow-up [#25](https://github.com/jesselpalmer/easy-blob/issues/25) tracks both low advisories and
removal of each override once upstream adopts the security fix. CI and release validation now fail
on moderate-or-higher full-audit findings, in addition to the runtime high/critical gate. Low findings
remain visible in audit output. Weekly Dependabot groups compatible runtime and development updates
separately; compiler and Node-declaration majors require a deliberate compatibility review.

The seven old dependency PRs target changes already incorporated or removed in merged PR #22:

| PR | Proposed change | Current lockfile evidence |
| --- | --- | --- |
| #9 | Multer 2.0.2 | Multer 2.5.0 |
| #10 | form-data 4.0.4 | form-data 4.0.6 (development only) |
| #11 | tar-fs 2.1.4 | tar-fs absent after SQLite driver replacement |
| #12 | js-yaml 3.14.2 / 4.1.1 | js-yaml 3.15.2 / 5.5.0 |
| #13 | body-parser 2.2.1 | body-parser 2.4.0 |
| #14 | Express 5.2.0 | Express 5.3.0 |
| #16 | qs 6.14.2 | qs 6.17.1 (6.16.1 already present when #22 merged) |

They are superseded; merging their old lockfiles would not provide additional fixes.
The remaining native-install limitation is still documented below. Local installation again needed
matching official Node headers extracted without ownership changes because of the sandbox `fchown`
error. This is an environment workaround, not a disabled install script or a package requirement.

## Original October 24 review

### Runtime and compatibility

Support maintained Node.js LTS 22 and 24, using security patch floors 22.23.4 and 24.22.1.
`engines`, CI and the examples use this policy. Node 18 and 20 are end of life; Node 26 is Current
at review time and is not yet a supported EasyBlob release line. This policy is an explicit 2.0 change.
Keep Node updated within the supported lines: an engines minimum cannot predict future security fixes.

| Dependency | Selected baseline | Reason |
| --- | --- | --- |
| Express | 5.3.0 | Current stable Express 5; keep the existing runtime major and update transitive fixes. |
| Multer | 2.5.0 | Current stable with multipart teardown and error-handling security fixes. |
| better-sqlite3 | 13.0.3 | Maintained SQLite binding; packaged native binaries and simpler transaction ownership. |
| Express declarations | 5.0.6 | Match the actual Express 5 API; install with consumers because public declarations reference Express. |
| Node declarations | 22.20.5 | Check against the oldest supported Node API; ship declarations required by the public types. |

The former `sqlite3` dependency's official repository is archived and explicitly unmaintained.
Although its latest release is 6.0.1, replacing it has concrete maintenance and installation benefits.
`better-sqlite3` 13.0.3 embeds SQLite 3.53.4 and includes native binaries in its npm artifact for
Linux glibc/musl, macOS and Windows on x64 and arm64. This removes the former package dependency chain
through `prebuild-install`/`node-gyp`/`tar`, but does not guarantee a toolchain-free install; see below.
Native loading and packed-consumer lifecycle checks
passed on Linux x64 with Node 22.23.4 and 24.22.1.
The CI matrix checks Node 22/24 on Ubuntu, Windows and macOS; that matrix does not prove every architecture.

Metadata queries now run synchronously. They are small local operations, but can block the event loop;
EasyBlob does not promise suitability for heavy database workloads. The SQLite file format and legacy
metadata upgrade path are verified by integration tests. Node's built-in `node:sqlite` was considered;
it remains experimental on Node 22 and a release candidate on Node 24, so it was not selected here.

## Known native installation issue

An initial package installation can succeed while a clean installation from its lockfile fails.
The confirmed upstream issue [npm/cli#9837](https://github.com/npm/cli/issues/9837) loses
`gypfile: false` metadata and can infer a `node-gyp rebuild` step for better-sqlite3 13.0.3,
even though a prebuilt binary is present. The upstream fix
[#10061](https://github.com/npm/cli/pull/10061) remains open at review time.
Reports include npm 10 and 11 on multiple operating systems, so upgrading to npm 11 alone
is not a reliable fix. EasyBlob's first Windows / Node 22 CI run reproduced the failure.

Until the upstream fix is released and validated, have a native toolchain available for clean
lockfile installs: Python and a supported C/C++ build environment (Visual Studio 2022 C++ Build Tools
on Windows, Xcode Command Line Tools on macOS, and standard build-essential tools on Linux).
Follow [node-gyp's installation guidance](https://github.com/nodejs/node-gyp#installation).
The Windows / Node 22 CI job uses a runner with Visual Studio 2022 because its bundled npm 10
uses node-gyp that does not recognize the newer Visual Studio on windows-latest.
No scripts are disabled to make the native installation check pass.

Keep better-sqlite3 13.0.3 and its current bundled SQLite fixes rather than hiding this issue
with a blanket script bypass or claiming an unverified npm version requirement.
Revisit the toolchain prerequisite when the upstream fix ships and passes both fresh installation
and clean lockfile installation across the supported matrix. See also
[better-sqlite3#1516](https://github.com/WiseLibs/better-sqlite3/issues/1516).

## Development tooling

Jest 30.5.2, ts-jest 29.4.15 and Jest declarations 30.0.0 are a supported combination:
ts-jest explicitly declares Jest `^29.0.0 || ^30.0.0`. Major numbers alone do not establish compatibility.
TypeScript is deliberately kept on the stable 5.9.3 line. Registry latest is 7.0.2, while ts-jest's
declared TypeScript peer range is `>=4.3 <7`; adopting that compiler would require separate validation.

Multer declarations 2.3.0, better-sqlite3 declarations 9.6.0, Supertest 7.3.1,
Supertest declarations 7.2.1, Prettier 3.9.10 and markdownlint-cli 0.50.0 were also reviewed and updated.
The lockfile refresh updates transitive dependencies inside their supported ranges.

The follow-up quality audit adds ESLint 10.13.0, `@eslint/js` 10.0.1, typescript-eslint 8.72.0
and globals 17.13.0 as development dependencies only. Their declared Node engines include both
supported runtimes; typescript-eslint supports ESLint 10 and TypeScript `>=4.8.4 <6.1.0`.
This is an additional reason to retain TypeScript 5.9.3. Production TypeScript receives the
recommended type-checked rules; test/fixture TypeScript receives recommended syntax rules, while
Jest and the isolated consumer compiler check its types. Scripts and examples receive recommended
JavaScript rules. Configuration follows the official
[typed-linting guidance](https://typescript-eslint.io/getting-started/typed-linting/) and
[ESLint flat configuration](https://eslint.org/docs/latest/use/configure/configuration-files).
Formatting is a separate Prettier check, including examples, consumer fixtures and configuration.
The post-install dependency audit still reports zero runtime findings and the same four low
development records described below; `npm ls --depth=0` reports no invalid direct dependencies.

GitHub Actions use checkout 7.0.1, setup-node 7.1.0 and action-gh-release 3.0.3.
Ordinary branch and pull-request validation cannot publish. Release automation requires a `v*` tag
that matches the package version, runs the same verification, and publishes prereleases to npm's `next`
dist-tag. A stable version uses `latest`. Creating those tags remains a maintainer release action.
No tag or package was published while preparing this candidate.

## Security audit scope

The starting lockfile's `npm audit --json` reported 32 affected dependency records:
3 critical, 21 high, 2 moderate and 6 low. Counts include transitive development and install tooling;
they are not a count of demonstrated exploitable application vulnerabilities.

After dependency and lockfile updates, the full audit reports four low-severity records, all arising
from one KaTeX advisory through markdownlint-cli → markdownlint → micromark-extension-math → KaTeX.
The advisory is [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7): an existing
prototype pollution condition can bypass KaTeX trust restrictions. These packages are development-only;
markdownlint uses the math syntax parser, and EasyBlob does not render KaTeX or ship these packages
to production consumers. The upstream dependency range remains on KaTeX 0.16, while the fix is 0.18.2.
Do not force an unvalidated incompatible override or downgrade the maintained linter to hide the finding.
Recheck when the upstream parser updates its KaTeX range, then update and rerun lint and the full audit.

`npm audit --omit=dev` reported no known advisories for the candidate runtime dependency tree on the review date.
Audit results describe the advisory
database at execution time, not a guarantee of absence of security defects. CI fails on reported high
or critical runtime findings. Maintainers should also review the complete audit before each release.

The historical dependency PRs [#9](https://github.com/jesselpalmer/easy-blob/pull/9),
[#10](https://github.com/jesselpalmer/easy-blob/pull/10),
[#11](https://github.com/jesselpalmer/easy-blob/pull/11),
[#12](https://github.com/jesselpalmer/easy-blob/pull/12),
[#13](https://github.com/jesselpalmer/easy-blob/pull/13),
[#14](https://github.com/jesselpalmer/easy-blob/pull/14) and
[#16](https://github.com/jesselpalmer/easy-blob/pull/16) overlap this work.
Their target versions have been superseded by later fixes or removed dependency chains.
The October 31 follow-up above records their reconciliation; do not merge their old lockfiles.

## Artifact verification

The published 1.0.0 tarball's `gitHead` is `f99d39107c97a33c76edadcbc7801ff9f48a9803`.
It contains 15 files, exposing named `BlobStorage` and `Database` exports from compiled CommonJS.
Named ESM imports work through Node interoperability. The old README's direct-constructor `require`
example does not match this artifact. A strict clean TypeScript consumer also fails because the
published declarations reference Express without installing its declaration package.

The candidate preserves named CommonJS exports and ESM interoperability without adding an exports map
that would silently prohibit existing deep imports. Compiled declarations are shipped with their public
type dependencies. Build cleans `dist` first, and `prepack` builds before creating the npm artifact.
Source/declaration maps pointing to omitted TypeScript source are no longer included.

`npm run test:package` installs the actual tarball in an operating-system temporary directory outside
the checkout, with no `NODE_PATH` inheritance. It runs both the first `npm install` and a subsequent
clean `npm ci` from the generated consumer lockfile. It checks CJS and ESM imports, real HTTP upload/list/download/
delete, exact binary bytes, close/reopen persistence, repeated close, strict TypeScript `.cts` and `.mts`
consumers with `skipLibCheck: false`, and the packaged runnable example with and without authentication.
It checks the package file allowlist and removes the temporary consumer when finished.
`npm run check` includes this verification; CI runs the same command on every supported matrix entry.

## Upstream evidence

- [Node release schedule](https://github.com/nodejs/Release)
- [October 2026 Node security updates](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [Express releases](https://github.com/expressjs/express/releases)
- [Multer releases and security fixes](https://github.com/expressjs/multer/releases)
- [sqlite3 maintenance status](https://github.com/TryGhost/node-sqlite3)
- [better-sqlite3 release](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.3)
- [Node 22 SQLite status](https://nodejs.org/docs/latest-v22.x/api/sqlite.html)
- [Node 24 SQLite status](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
- [ts-jest peer declarations](https://github.com/kulshekhar/ts-jest/blob/main/package.json)
- [checkout releases](https://github.com/actions/checkout/releases)
- [setup-node releases](https://github.com/actions/setup-node/releases)
- [release action releases](https://github.com/softprops/action-gh-release/releases)
