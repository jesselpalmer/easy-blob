# Contributing

Use Node.js 22.23.4+ within 22.x or 24.22.1+ within 24.x and npm. The selected native SQLite
dependency bundles binaries for common platforms. A known npm issue can nevertheless invoke node-gyp:
have Python and a compatible C++ toolchain available (Visual Studio 2022 with Desktop development
with C++ on Windows). CI uses Windows Server 2022 for that supported toolchain.
See [dependency decisions](docs/DEPENDENCIES.md) and [installation troubleshooting](README.md#troubleshooting).

```sh
npm ci
npm run check
```

`check` builds declarations/JavaScript, runs ESLint, Markdown lint and formatting checks, enforces
test/configuration type checks, unit/integration coverage floors and tooling security checks,
then installs the tarball into a temporary clean consumer and
runs CJS, ESM, TypeScript, example and separate-process HTTP checks. It does not publish anything.
See [testing architecture and commands](docs/TESTING.md) for the layers, coverage policy and limits.

Use `npm run test:unit` for pure input-policy tests, `npm run test:integration` for real local
resources, and `npm run test:e2e` for installed-package checks. `npm test` runs unit and integration
projects together with Vitest. `npm run test:tooling` checks the real Markdown/math integration and
the inherited-trust regression in an isolated process. `npm run check` runs all of these layers.
CI and release automation also require zero findings from full and runtime `npm audit` checks.
Run `npm run format` to apply the
repository's formatting to code, examples, tests and configuration. Markdown uses `npm run lint:md`.

Tests use real temporary directories, real SQLite and HTTP with explicit cleanup. Do not use shared
project data paths, arbitrary sleeps, forced runner exit or ignored close failures to conceal leaks.
Fault injection should prove a user-visible guarantee. Keep each change focused, record relevant
verification and update the operational contract when behavior changes.

Use [the roadmap](ROADMAP.md) and existing issues before opening duplicate work. A useful issue
states the concrete use case, reproduction, expected/observed outcome, supported Node/platform,
priority, compatibility implications and observable acceptance criteria. Remove secrets, local paths
and sensitive uploaded filenames from examples and logs. Report vulnerabilities privately as described
in [SECURITY.md](SECURITY.md).

Follow [the release checklist](docs/RELEASE.md). Ordinary pushes and pull requests run validation only.
The tag-triggered workflow can publish; pushing a release tag, merging and npm publication require an
explicit maintainer decision. Never use publication as a packaging test. The prepared stable version is 2.0.0
because lifecycle, runtime and security behavior change;
see the migration guide. An RC is not required for this release.
