# Dependency and packaging decisions

This report describes the prepared **2.0.0 stable** tree. The lockfile records exact resolutions;
[the release checklist](RELEASE.md) records publication gates. No RC publication is planned.

## Runtime and compatibility

Support Node.js 22.23.4+ within 22.x and 24.22.1+ within 24.x. The package engines declare
these supported lines; CI tests their current patch releases. Keep Node updated within them;
a minimum cannot predict future security fixes.

| Dependency | Selected baseline | Reason |
| --- | --- | --- |
| Express | 5.3.0 | Maintain Express 5 compatibility and incorporate transitive fixes. |
| Multer | 2.5.0 | Multipart teardown and error-handling fixes. |
| better-sqlite3 | 13.0.3 | Maintained SQLite binding with explicit transaction ownership. |
| Express declarations | 5.0.6 | Match Express 5 and install declarations referenced by public types. |
| Node declarations | 22.20.5 | Check against the oldest supported Node API. |

The former sqlite3 repository is archived and unmaintained. better-sqlite3 13.0.3 embeds SQLite
3.53.4 and bundles native binaries for common Linux, macOS and Windows architectures. It removes
the former prebuild-install/node-gyp/tar dependency chain. Bundled binaries do not guarantee a
toolchain-free installation, as described below. The six CI jobs cover Node 22/24 on Linux, macOS
and Windows, not every architecture or filesystem.

Metadata queries run synchronously and can block the event loop. They are small local operations;
EasyBlob does not promise suitability for heavy database workloads. Integration tests cover the
SQLite file format and legacy metadata upgrade. Node's built-in SQLite was not selected because
it did not have a stable API across both supported lines during the dependency review.

## Native installation prerequisite

The confirmed upstream issue [npm/cli#9837](https://github.com/npm/cli/issues/9837) can lose
`gypfile: false` metadata and infer a `node-gyp rebuild` step for better-sqlite3 13.0.3 even when
a prebuilt binary is present. Initial installation can succeed while a subsequent clean lockfile
installation fails. Upgrading npm alone is not a validated remedy; the issue has affected npm 10
and 11 on multiple operating systems. The initial Windows/Node 22 CI job reproduced it.

Have Python and a supported C/C++ toolchain available for clean lockfile installs: Visual Studio
2022 C++ Build Tools on Windows, Xcode Command Line Tools on macOS and standard build tools on
Linux. Follow [node-gyp's installation guidance](https://github.com/nodejs/node-gyp#installation).
Windows/Node 22 CI uses a runner with Visual Studio 2022 because its bundled npm/node-gyp does not
recognize the newer Visual Studio on windows-latest. Install scripts remain enabled.

Keep the maintained driver and its bundled SQLite fixes. Revisit the toolchain prerequisite only
after an upstream fix passes both fresh and clean lockfile installation across the supported matrix.
See [npm/cli#10061](https://github.com/npm/cli/pull/10061) and
[better-sqlite3#1516](https://github.com/WiseLibs/better-sqlite3/issues/1516).

## Development tooling and security

Vitest **5.0.5**, its matching V8 coverage provider and Vite **8.3.5** replace Jest, ts-jest and Jest
declarations. This removes the affected deepmerge/glob chains and the obsolete glob override.
All **84 unit and 88 integration cases** remain. Tests import Vitest explicitly, and
`tsc -p tsconfig.tests.json` checks their types with strict mode and library checking enabled.
The installed-package checks still verify the compiled CommonJS artifact independently of Vitest.

TypeScript **5.9.3** and Node declarations **22.20.5** are intentional compatibility choices.
typescript-eslint 8.72.1 supports TypeScript `>=4.8.4 <6.1.0` and ESLint 10. Registry `latest` alone
is not a reason to break these policies. ESLint 10.14.0 provides typed production-source rules;
Prettier and markdownlint check formatting and documentation separately.

Three tested development overrides remain necessary:

| Dependency | Override | Parent constraint requiring follow-up |
| --- | --- | --- |
| minimatch | 11.0.3 | ESLint, config-array, typescript-estree and markdownlint-cli still request 10.x. |
| markdownlint → re2js | 2.8.7 | markdownlint 0.42.0 pins affected 2.8.6. |
| micromark-extension-math → katex | 0.18.2 | The parser's `^0.16.0` range excludes the patched release. |

These overrides supply security fixes, not audit exceptions. None is a runtime dependency.
They intentionally cross parent constraints and are covered by actual file selection/lint checks
and five tooling/security cases. The latter exercise inline/block math, escaping, trust behavior,
ordinary lint rules, removed dependency chains and the inherited-trust regression through the
actual parent graph. The pollution probe runs in a disposable process. The regression fails with
the old KaTeX parent integration and passes with the override.

[#25](https://github.com/jesselpalmer/easy-blob/issues/25) was resolved by merged
[PR #28](https://github.com/jesselpalmer/easy-blob/pull/28). Full and runtime audits report **zero
findings** in the reviewed tree; CI and release checks reject findings at every severity.
[#27](https://github.com/jesselpalmer/easy-blob/issues/27) tracks removing overrides after compatible
parent updates. It does not block publication while audits and compatibility checks remain clean.
Weekly Dependabot groups compatible runtime and development updates separately; compiler and Node
declaration majors require deliberate review. Audit results describe the database at execution time,
not a guarantee that no security defects exist.

## Artifact verification

The published 1.0.0 artifact exposes named `BlobStorage` and `Database` CommonJS exports, with named
ESM interoperability. Its direct-constructor README example was incorrect, and its public declarations
omitted required Express types. Version 2.0 preserves the named exports and interoperability, installs
public declaration dependencies and avoids adding an exports map that could prohibit deep imports.
Build cleans dist first; prepack rebuilds it. Maps pointing to omitted source are not shipped.

`npm run check` installs the actual tarball outside the checkout without inherited NODE_PATH. It
checks initial install and clean npm ci, CJS/ESM imports, strict `.cts`/`.mts` consumers with
`skipLibCheck: false`, real HTTP operations with exact binary bytes, persistence, repeated close,
and the packaged client with and without authentication. Five separate-process scenarios exercise
readiness, signals, recovery and startup failures. The verifier enforces a package-file allowlist
and removes temporary consumers. CI runs the complete check on every supported Node/OS entry.

The release workflow requires an explicitly pushed `v*` tag matching package.json, reruns checks
and zero-advisory audits, publishes stable versions to `latest` and creates a GitHub release with
[prepared release notes](RELEASE_NOTES.md). Branch and PR checks cannot publish.

## Review history and references

The original dependency/packaging decisions landed in [PR #22](https://github.com/jesselpalmer/easy-blob/pull/22),
quality checks in [PR #24](https://github.com/jesselpalmer/easy-blob/pull/24), cleanup and the client in
[PR #26](https://github.com/jesselpalmer/easy-blob/pull/26), and final advisory remediation in PR #28.
Seven obsolete dependency PRs were closed because their changes were incorporated or their chains removed.
Earlier low-advisory exceptions and Jest/glob guidance are superseded by this report.

- [Node release schedule](https://github.com/nodejs/Release)
- [better-sqlite3 releases](https://github.com/WiseLibs/better-sqlite3/releases)
- [Vitest migration](https://vitest.dev/guide/migration/)
- [Coverage threshold semantics](https://vitest.dev/config/coverage)
- [TypeScript ESLint dependency policy](https://typescript-eslint.io/users/dependency-versions/)
- [KaTeX security release](https://github.com/KaTeX/KaTeX/releases/tag/v0.18.2)
