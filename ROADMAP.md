# EasyBlob roadmap

Planning baseline: `f99d39107c97a33c76edadcbc7801ff9f48a9803`, reviewed October 24, 2026.
This roadmap and the linked issues were created before implementation.

## Release readiness — 2.0 candidate

Outcome: a dependable, documented local storage library that works from the npm tarball.
Status: release-readiness implementation complete, independently reviewed and verified on the supported CI matrix.
Publication, release tags and merging require maintainer authorization.

| Work | Priority | Ticket | Status |
| --- | --- | --- | --- |
| Storage identity, consistency, recovery and ownership | Critical | [#17](https://github.com/jesselpalmer/easy-blob/issues/17) | Implemented; reviewed |
| Awaitable lifecycle, protected mounting and HTTP contracts | Critical | [#18](https://github.com/jesselpalmer/easy-blob/issues/18) | Implemented; reviewed |
| Dependencies, supported runtimes and packaged consumers | High | [#19](https://github.com/jesselpalmer/easy-blob/issues/19) | Verified locally and in CI |
| Isolated contract tests and verification evidence | High | [#20](https://github.com/jesselpalmer/easy-blob/issues/20) | 88 tests pass across CI |
| Onboarding, operations, migration and release documentation | High | [#21](https://github.com/jesselpalmer/easy-blob/issues/21) | Implemented; reviewed |

Storage and lifecycle contracts establish the foundation. Package and integration tests verify those
contracts; documentation and the release checklist depend on verified final behavior.
Existing dependency PRs #9, #10, #11, #12, #13, #14 and #16 are reviewed as overlapping work,
not duplicated as individual upgrade tickets.
See [verification evidence](docs/VERIFICATION.md), [release checklist](docs/RELEASE.md) and
[migration guidance](docs/MIGRATION.md). Implementation merged in PR #22; issues #17–#21 are closed.

Exit conditions: clean installation, CJS/ESM/TypeScript consumers, tested examples, exact byte
preservation, old-data compatibility, documented failure/recovery and concurrency behavior,
predictable startup/shutdown, supported dependency and CI policy, and no unresolved release blocker.
An unavailable check must remain explicitly unverified. Independent storage, integration and
documentation reviews must be resolved before declaring the candidate ready.

Scope: one local owner of a storage directory and SQLite metadata file. Preserve existing integer
IDs and metadata where safe. Breaking lifecycle, security and runtime changes require 2.0 migration notes.
No distributed storage, cloud adapters, admin UI, background service or speculative framework layer.

## Quality audit follow-up

[#23](https://github.com/jesselpalmer/easy-blob/issues/23): add production code linting,
format maintained code and configuration, separate pure unit and real integration suites,
and exercise cleanly installed packages from a separate client process. Preserve the existing
storage and lifecycle contracts and verify every layer through the supported CI matrix.
Status: merged in PR #24; all six OS/runtime jobs passed before merge. Issue #23 is closed.
See [testing architecture](docs/TESTING.md).

## Dependency cleanup and client walkthrough

After the quality audit merge, refresh compatible dependencies, reconcile seven superseded dependency
PRs, validate development security overrides and keep remaining low advisories explicit in
[#25](https://github.com/jesselpalmer/easy-blob/issues/25). Add weekly dependency maintenance and
moderate-or-higher development audit gates. Ship a [client walkthrough](examples/README.md) that
uploads a real file, lists its returned ID, downloads and checks exact bytes, saves locally and
cleans up its remote upload. Verify the packaged client against standalone/authenticated servers.
The follow-up PR records local results and hosted CI before merge; publication remains separate.

## Adoption validation

Outcome: five independent developers integrate the candidate into real local tools, small applications
or internal services. Depends on release readiness. Prepare an opt-in study without contacting anyone.
The [study plan](docs/ADOPTION.md) is prepared; no outreach has occurred. Measure time to first
successful complete lifecycle, assistance required, failures, alternatives,
work avoided and continued use after two weeks. Record reasons for abandonment as well as successes.
Exit: five completed reports and a documented retain, revise or stop decision; no feature expansion
solely on survey enthusiasm.

## Later improvements

Only prioritize capabilities supported by the adoption evidence. Pagination, quotas, richer metadata,
content validation and additional integrations are deferred pending demonstrated user need.
Each promoted capability requires an independent issue, user evidence, support cost and acceptance test.
