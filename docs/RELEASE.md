# 2.0.0 stable release checklist

Target version: **2.0.0**, published to npm's **latest** dist-tag with Git tag **v2.0.0**.
The maintainer chose a direct stable release; no RC publication is planned.
Status: release preparation, not yet tagged or published. The changelog remains **Unreleased**
until npm publication succeeds. Preparing this branch does not authorize publication.

## Release contents

Use [the prepared release notes](RELEASE_NOTES.md) for the GitHub release. The migration guide,
operations guide and verification report describe the supported behavior and remaining limits.
Existing safe legacy IDs and file data are retained; the runtime/lifecycle/security contracts are
breaking changes and require the 2.0 major version.

## Preparation gates

- [x] Storage, lifecycle, HTTP, packaging and documentation work merged in PR #22.
- [x] Code linting, unit/integration separation and process E2E merged in PR #24.
- [x] Dependency cleanup and the runnable client merged in PR #26.
- [x] Remaining audit findings resolved and reviewed in PR #28; issue #25 is closed.
- [x] Minimal CI/download/license badges merged in PR #29.
- [x] Superseded dependency PRs are closed; six obsolete remote branches were removed.
- [x] Package and lockfile identify stable 2.0.0; current instructions no longer require an RC.
- [x] Clean install and complete check pass locally for stable 2.0.0.
- [x] Full and runtime audits report zero findings for the prepared lockfile.
- [ ] Before tagging, confirm all six Node 22/24 × Linux/macOS/Windows jobs pass on final `main`.
  The preparation PR records its own exact passing head and run.
- [x] Inspect the preparation artifact file list, size and integrity; the PR records the result.
- [ ] Configure and validate npm publishing credentials for the release workflow.
  The repository Actions secrets page currently contains no secrets; `NPM_TOKEN` is missing.
  Add a valid publish credential before pushing the release tag. Never commit the token.

The release-preparation PR records the exact checked commit and CI evidence. An unchecked item
requires an observed result, not an assumption. [#27](https://github.com/jesselpalmer/easy-blob/issues/27)
tracks eventual retirement of three tested security overrides; it is maintenance and does not block
this release while audits and integration checks remain clean.

## Publication after maintainer authorization

1. Merge the verified preparation PR. Review CI on the exact final `main` commit.
2. Set the changelog's 2.0.0 publication date and update the README publication-status sentence.
   Run Markdown checks and CI on that final documentation commit.
3. Confirm `package.json` and the root lockfile records all say `2.0.0`; confirm npm has no existing
   2.0.0 release and `v2.0.0` does not already exist. Confirm the workflow's npm token can publish
   `@jesselpalmer/easy-blob`; a secret name alone does not prove validity or scope.
4. Only when publication is explicitly authorized, create and push `v2.0.0` at the tested commit.
   The workflow validates tag/version agreement, installs, runs the complete check and zero-advisory
   audits, then publishes publicly to `latest` and creates the GitHub release.
5. Verify `npm view @jesselpalmer/easy-blob@2.0.0 version dist.integrity` and the npm `latest` tag.
   In a new application outside the checkout, install that registry version and run the documented
   server/client lifecycle, including authentication, exact bytes, deletion and restart persistence.
6. Record registry verification and the GitHub release URL here, then update the roadmap's status.
   Begin the opt-in [adoption study](ADOPTION.md) when participants are available.

If npm succeeds but creating the GitHub release fails, confirm registry state before retrying.
Do not force-update a published version/tag or blindly rerun an immutable npm publication. Create
only the missing GitHub release or prepare a new corrective package version, as appropriate.
