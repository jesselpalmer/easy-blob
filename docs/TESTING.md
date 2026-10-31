# Architecture and testing

The quality audit follows the merged release-readiness work in
[#22](https://github.com/jesselpalmer/easy-blob/pull/22). Follow-up scope and acceptance criteria are
tracked in [#23](https://github.com/jesselpalmer/easy-blob/issues/23).

## Responsibilities and files

| Layer | Responsibility | Boundary verified |
| --- | --- | --- |
| `src/index.ts` | Public exports and declarations | Public imports plus clean CJS/ESM/TypeScript consumers |
| `src/blob-storage.ts` | HTTP parsing, responses, admission, streaming and server lifecycle | Real HTTP, cancellation, auth mounting and shutdown |
| `src/store.ts` | Ownership, identity, file/metadata coordination, leases and recovery | Temporary filesystem and real SQLite with fault injection |
| `src/database.ts` | Fixed SQL, transactions and callback compatibility | Rollback, legacy schema, IDs and callback lifecycle |
| `src/validation.ts` | Pure option, ID, filename and metadata policy | Unit tests with no filesystem, server or database |
| `examples/server.cjs` | Application-owned configuration, authentication and signals | Installed example API and actual CLI process |
| `examples/client.mjs` | User-facing upload/list/download/delete walkthrough | Installed client process against standalone/protected servers; binary verification and cleanup |
| `scripts/verify-package.cjs` | Artifact allowlist, clean install/reinstall and consumer orchestration | Actual npm tarball outside the checkout |

The existing layers suit a single local owner and small workloads. Input policy is separated from
IO so boundary cases are cheap to exercise. Public exports and existing deep import paths remain
compatible. Test fixtures are ordinary source files, subject to lint/format checks; they are not
shipped in the npm artifact. Package metadata, declarations, examples and documentation are checked
through the installed artifact rather than relying on the source tree.

## Test layers

| Layer | Command | What it proves |
| --- | --- | --- |
| Unit | `npm run test:unit` | Defaults, limits, MIME policy copying, canonical IDs, portable paths and metadata validation |
| Integration | `npm run test:integration` | Actual SQLite/filesystem/HTTP interactions, fault compensation, recovery, concurrency and lifecycle |
| Installed-package E2E | `npm run test:e2e` | Clean installation, CJS/ESM/types, examples and separate-process user flows |
| Unit + integration | `npm test` | Strict test/config type checks and both Vitest projects |
| Coverage | `npm run test:coverage` | Strict test/config type checks and both Vitest projects with enforced V8 coverage floors |
| Tooling | `npm run test:tooling` | Markdown/math compatibility, isolated inherited-trust regression and removed dependency chains |
| Test types | `npm run typecheck:tests` | Strict TypeScript checking of production source, tests and runner configuration |
| Complete check | `npm run check` | Build, ESLint, Markdown, formatting, test types, coverage, tooling and installed-package E2E |

The suite has 84 unit cases and 88 integration cases, retained during the migration from Jest to
Vitest 5 to remove the affected deepmerge chain. Unit and integration projects are explicitly
selected by directory. They run sequentially in isolated fork processes. Tests import APIs explicitly;
`tsconfig.tests.json` checks their types separately before execution. Integration tests use real temporary
directories, SQLite and HTTP. Fault injection is reserved for failures such as metadata insertion,
unlink, stream errors and identity binding; it establishes observable compensation or recovery.

### Outside-in execution

The package verifier builds and packs the library, checks the artifact paths, installs the tarball
in a temporary consumer **outside the checkout**, and repeats installation with `npm ci --omit=dev`.
`NODE_PATH` is empty. Consumer imports resolve the installed package. The only tool borrowed from
the checkout is the TypeScript compiler; `.cts` and `.mts` declarations are checked against the
consumer's dependency tree with `strict: true` and `skipLibCheck: false`.

Five Node test-runner scenarios launch separate processes and send real HTTP requests from the
client process. No source imports, internal storage objects, database edits or storage mocks are
used in these scenarios:

- CJS and native ESM applications: upload duplicate names, verify independent exact binary bytes,
  list, reject invalid IDs/missing uploads/oversize input, close, restart, verify persistence,
  delete, restart again and verify the deletions persisted.
- The actual documented CLI, in standalone and protected modes: parse stdout readiness, perform
  the HTTP lifecycle, and reject missing/wrong authentication on every protected route. Run the
  shipped client in a separate process with a real binary input and paths containing spaces;
  verify the saved bytes, remote cleanup, rejected credentials and refusal to overwrite a local file.
- Invalid CLI configuration: report failure, exit nonzero and never advertise readiness.

Separate consumers use IPC only to ask their host application to invoke public `close()`, then
disconnect and exit naturally. This verifies graceful close and restart on every supported OS.
Actual CLI `SIGTERM` and `SIGINT` handling is verified on Linux/macOS. Windows forcibly terminates
processes for those signals, so its CLI tests verify HTTP behavior and report that signal limitation;
the portable consumer tests still verify graceful library shutdown there.

Readiness and shutdown are event-driven with failure deadlines. Forced termination is emergency
test cleanup only, never evidence of graceful shutdown. Existing installed consumer and example
checks are retained, including the protected host's incomplete-header connection deadline.

## Linting, formatting and coverage

`npm run lint:code` applies ESLint recommended JavaScript rules to scripts/configuration/examples
and recommended TypeScript rules to all TS files. Production TypeScript also gets recommended
type-aware checks, including floating/misused promises and unsafe values. The single local rule
exception documents intentional ASCII-control rejection in a persisted-filename regex.
`npm run lint:md` checks Markdown. `npm run format:check` covers source, tests, consumer fixtures,
scripts, examples, root configuration and workflows. Generated output, dependencies, coverage and
the npm-owned lockfile are excluded from Prettier. `npm run format` applies these same rules.

Coverage floors prevent broad regressions: the non-validation group requires 85% statements,
75% branches, 85% functions and 90% lines. Pure validation separately requires 100% statements,
functions and lines, and 95% branches. Vitest does not subtract separately gated files from global
totals, so `src/**/!(validation).ts` has its own aggregate floor in addition to the global floor.
Both the validation and non-validation gates were verified with intentionally impossible thresholds.
The include list retains every production TypeScript file, including unexecuted code. The provider
is V8; changed counter mapping means its percentages are not directly comparable with earlier Jest
reports. These floors are regression guards, not a claim of complete coverage. E2E and the five Node
tooling tests run uninstrumented JavaScript outside the production coverage percentage.

Every Node 22/24 job on Ubuntu, macOS and Windows Server 2022 runs the complete check, including
coverage, tooling tests and process E2E, followed by runtime and complete dependency audits.
Both audits now fail on every reported severity, including low; no advisory allowlist is used. A 15-minute job timeout bounds
unexpected hangs. A separate duplicate coverage job is unnecessary. The release workflow uses the
same complete check before its explicitly tag-triggered publication.

## Boundaries and remaining risks

This suite verifies the supported local-storage contract. It does not qualify network filesystems,
distributed/multiple owners, power loss, every native CPU architecture or unbounded load. SQLite
operations are synchronous, listing is unpaginated, and a deletion waiting on a slow read can block
the metadata queue. Those constraints remain documented in [operations](OPERATIONS.md).

The issue #25 remediation reports zero full and runtime audit findings. The affected Jest/deepmerge
chain is removed; patched KaTeX 0.18.2 is verified through the real Markdown/math parent integration.
A disposable child process verifies inherited prototype `trust` cannot opt into trusted rendering;
the old package fails that same regression. Three tested development overrides remain necessary
until parent ranges adopt fixed versions; [#27](https://github.com/jesselpalmer/easy-blob/issues/27)
tracks their eventual removal. No runtime source or resolved runtime version changes.
A known npm/native-build issue still requires a compatible compiler toolchain in some installations.
See [dependency decisions](DEPENDENCIES.md). Audit results and the supported matrix do not establish
the absence of all security or platform defects.
