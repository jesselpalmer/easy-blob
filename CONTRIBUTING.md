# Contributing

Use Node.js 22.23.4+ within 22.x or 24.22.1+ within 24.x and npm. The selected native SQLite
dependency bundles binaries for common platforms; see [dependency decisions](docs/DEPENDENCIES.md).

```sh
npm ci
npm run check
```

`check` builds declarations/JavaScript, lints Markdown and formatting, runs isolated integration
tests, packs the library, installs it into a temporary clean consumer, and verifies CJS, ESM,
TypeScript and the packaged examples. It does not publish anything. `npm run test:coverage` helps
identify untested branches; critical failure contracts matter more than a headline percentage.

Tests use real temporary directories, real SQLite and HTTP with explicit cleanup. Do not use shared
project data paths, arbitrary sleeps, forced Jest exit or ignored close failures to conceal leaks.
Fault injection should prove a user-visible guarantee. Keep each change focused, record relevant
verification and update the operational contract when behavior changes.

Use [the roadmap](ROADMAP.md) and existing issues before opening duplicate work. A useful issue
states the concrete use case, reproduction, expected/observed outcome, supported Node/platform,
priority, compatibility implications and observable acceptance criteria. Remove secrets, local paths
and sensitive uploaded filenames from examples and logs. Report vulnerabilities privately as described
in [SECURITY.md](SECURITY.md).

Follow [the release checklist](docs/RELEASE.md). Ordinary pushes and pull requests run validation only.
The tag-triggered workflow can publish; pushing a release tag, merging and npm publication require an
explicit maintainer decision. Never use publication as a packaging test. The recommended next stable
version is 2.0.0 because lifecycle, runtime and security behavior change; see the migration guide.
