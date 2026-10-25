# EasyBlob roadmap

Planning baseline: `f99d39107c97a33c76edadcbc7801ff9f48a9803`, reviewed October 24, 2026.
This roadmap and the linked issues were created before implementation.

## Release readiness — 2.0 candidate

Outcome: a dependable, documented local storage library that works from the npm tarball.
Status: in progress. Publication, release tags and merging require maintainer authorization.

| Work | Priority | Ticket | Status |
| --- | --- | --- | --- |
| Storage identity, consistency, recovery and ownership | Critical | [#17](https://github.com/jesselpalmer/easy-blob/issues/17) | Planned |
| Awaitable lifecycle, protected mounting and HTTP contracts | Critical | [#18](https://github.com/jesselpalmer/easy-blob/issues/18) | Planned |
| Dependencies, supported runtimes and packaged consumers | High | [#19](https://github.com/jesselpalmer/easy-blob/issues/19) | Planned |
| Isolated contract tests and verification evidence | High | [#20](https://github.com/jesselpalmer/easy-blob/issues/20) | Planned |
| Onboarding, operations, migration and release documentation | High | [#21](https://github.com/jesselpalmer/easy-blob/issues/21) | Planned |

Storage and lifecycle contracts establish the foundation. Package and integration tests verify those
contracts; documentation and the release checklist depend on verified final behavior.
Existing dependency PRs #9, #10, #11, #12, #13, #14 and #16 are reviewed as overlapping work,
not duplicated as individual upgrade tickets.

Exit conditions: clean installation, CJS/ESM/TypeScript consumers, tested examples, exact byte
preservation, old-data compatibility, documented failure/recovery and concurrency behavior,
predictable startup/shutdown, supported dependency and CI policy, and no unresolved release blocker.
An unavailable check must remain explicitly unverified. Independent storage, integration and
documentation reviews must be resolved before declaring the candidate ready.

Scope: one local owner of a storage directory and SQLite metadata file. Preserve existing integer
IDs and metadata where safe. Breaking lifecycle, security and runtime changes require 2.0 migration notes.
No distributed storage, cloud adapters, admin UI, background service or speculative framework layer.

## Adoption validation

Outcome: five independent developers integrate the candidate into real local tools, small applications
or internal services. Depends on release readiness. Prepare an opt-in study without contacting anyone.
Measure time to first successful complete lifecycle, assistance required, failures, alternatives,
work avoided and continued use after two weeks. Record reasons for abandonment as well as successes.
Exit: five completed reports and a documented retain, revise or stop decision; no feature expansion
solely on survey enthusiasm.

## Later improvements

Only prioritize capabilities supported by the adoption evidence. Pagination, quotas, richer metadata,
content validation and additional integrations are deferred pending demonstrated user need.
Each promoted capability requires an independent issue, user evidence, support cost and acceptance test.
