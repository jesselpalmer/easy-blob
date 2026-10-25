# Starting-state assessment

Reviewed October 24, 2026 at `f99d39107c97a33c76edadcbc7801ff9f48a9803`.
No repository-specific AGENTS.md instructions or existing GitHub issues were present.
The published 1.0.0 package reports this same git revision; artifact inspection is tracked in #19.

## Confirmed source defects

| Severity | Evidence at baseline | Affected behavior | Resolution |
| --- | --- | --- | --- |
| Critical | `blob-storage.ts` filename uses `Date.now()` and extension | Same-millisecond upload can overwrite existing bytes | Exclusive collision-resistant file creation |
| High | Failed insert returns 500 without unlink | Orphan uploaded file | Compensation and restart recovery |
| High | Delete unlinks before metadata operation | DB failure leaves metadata pointing at deleted content | Journaled deletion |
| High | Database open callback throws; table error only logs | Uncaught startup failure and unclear readiness | Awaitable readiness and propagated failures |
| High | Delete joins stored row.path without validation | Corrupt/untrusted metadata can escape storage | Strict basenames, regular-file checks and containment |
| High | start installs process signals and calls process.exit | Library hijacks host process lifecycle | Application-owned signals, awaited close |
| High | expressApp routes exist before later app.use middleware | Suggested auth placement cannot protect storage | Document and test auth before mounted handler |
| Medium | README directly constructs require result | First CommonJS integration fails | Named export examples and packed consumer test |
| Medium | parseInt on route identifiers | Partial numeric strings accepted | Canonical safe integer validation |
| Medium | sendFile callback sends JSON after transfer error | Duplicate responses or uncaught HTTP errors | Stream-aware error handling |
| Medium | CRUD console logs contain filenames and metadata | Sensitive operational logging | Quiet default and controlled diagnostics |
| Medium | Shared test paths, no awaited close, MIME-only download assertion | Missed corruption and cleanup races | Isolated real storage/HTTP contract tests |

## Risks requiring verification

Crash durability, recovery after interruption, competing owners, supported module consumption,
native installation across platforms and dependency security require experiments beyond source review.
No claim of power-loss durability or multi-process support is justified by the baseline.
Baseline installation, build, lint and test results will be recorded in the final verification report.

## Dependency work already open

Dependabot PRs #9 (Multer), #10 (form-data), #11 (tar-fs), #12 (js-yaml), #13 (body-parser),
#14 (Express), #16 (qs) overlap the dependency milestone. Current registry and official advisories,
not just those proposed versions, determine selected updates.
