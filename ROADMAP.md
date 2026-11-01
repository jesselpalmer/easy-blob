# EasyBlob roadmap

## 2.0.0 stable release

The 2.0.0 release plan uses a direct stable publication, with no RC. The implementation and quality
work are merged; [PR #30](https://github.com/jesselpalmer/easy-blob/pull/30) covers the stable version
and release documentation. For live publication status, check
[npm](https://www.npmjs.com/package/@jesselpalmer/easy-blob?activeTab=versions) and
[GitHub releases](https://github.com/jesselpalmer/easy-blob/releases).
[Release procedure](docs/RELEASE.md) · [Release notes](docs/RELEASE_NOTES.md) · [Verification](docs/VERIFICATION.md)

| Work | Evidence | Status |
| --- | --- | --- |
| Storage identity, consistency, recovery and ownership | Issue #17; PR #22 | Merged; issue closed |
| Awaitable lifecycle, protected mounting and HTTP contracts | Issue #18; PR #22 | Merged; issue closed |
| Dependencies, runtimes and packaged consumers | Issue #19; PR #22 | Merged; issue closed |
| Isolated contract tests | Issue #20; PR #22 | Merged; issue closed |
| Onboarding, operations and migration documentation | Issue #21; PR #22 | Merged; issue closed |
| Code linting, formatting, unit/integration separation and outside-in E2E | Issue #23; PR #24 | Merged; issue closed |
| Dependency cleanup and complete client walkthrough | PR #26 | Merged; superseded dependency PRs closed |
| Zero full/runtime audit findings, Vitest migration and tooling regressions | Issue #25; PR #28 | Merged; independently reviewed; issue closed |
| Minimal CI, weekly download and license badges | PR #29 | Merged |
| Stable version, final docs, release notes, package inspection and CI | PR #30 | Preparation and exact CI evidence recorded in the PR |
| Tag, npm publication and registry verification | `v2.0.0`; npm `latest` | Live status in npm, GitHub releases and the release workflow |

The six obsolete remote branches were removed after checking their closed/merged PRs. No open PR
remained before release preparation. Historical assessment and implementation evidence remain in
[the assessment](docs/ASSESSMENT.md) and merged PRs #22, #24, #26 and #28.

## Dependency maintenance

[#27](https://github.com/jesselpalmer/easy-blob/issues/27) tracks removal of the tested minimatch,
RE2JS and KaTeX overrides once all parent packages adopt compatible fixed ranges. Keeping these
validated fixes is supported configuration. The issue does not represent an accepted vulnerability
or block 2.0.0 while the zero-advisory audits and integration checks pass. Weekly Dependabot
maintenance remains enabled.

## Adoption validation

After publication, invite five opt-in developers to integrate 2.0.0 into real local tools, small apps
or internal services with a single-owner storage need. The [study plan](docs/ADOPTION.md) is ready;
no outreach or enrollment has occurred. Measure setup time, assistance, failures, work avoided,
alternatives and continued use after two weeks. Record abandonment as well as successes.

Exit: five completed reports and a documented retain, revise or stop decision. A storage-integrity or
access-control failure pauses expansion and creates a release-blocking issue. Adoption evidence is
not a prerequisite for the maintainer's chosen direct stable publication.

## Later improvements

Only prioritize capabilities supported by actual usage. Pagination, quotas, richer metadata, content
validation and additional integrations remain deferred. Each promoted capability needs a specific
user need, support-cost assessment and observable acceptance test. Distributed storage, cloud
adapters, an admin UI and speculative framework layers remain outside the current scope.
