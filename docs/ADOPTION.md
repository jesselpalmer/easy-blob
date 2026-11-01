# Five-developer adoption experiment

## Decision to make

Determine whether EasyBlob saves developers enough integration and maintenance work to justify
continued investment. This plan prepares a small study; no developers have been contacted or enrolled.
Run it after the release-readiness gates pass. A smooth demo alone is not adoption evidence.

## Participants and task

Invite five independent developers, each integrating 2.0.0 into a real small application,
local tool or internal service with a legitimate local-storage need. At least two should use an
existing Express app and its authentication; at least one should use TypeScript. Seek a mix of
Linux, macOS and Windows where available. Exclude integrations created only to flatter the project.
Do not ask participants to use it where they need multi-process or distributed storage.

Each participant should start with the public README and a clean project/application branch,
choose their actual alternative, and implement upload, list, byte-accurate download, deletion,
shutdown and restart. For an authenticated application, verify that unauthorized requests cannot
upload, list, download or delete. Ask them to narrate confusion without prescribing the solution.

## Record one report per participant

| Field | Record |
| --- | --- |
| Context | Project purpose, Node/platform, CJS/ESM/TypeScript, existing server/authentication |
| Alternative | Direct fs + SQLite, existing upload library, cloud object storage, or no feature; why |
| Setup time | Minutes from README arrival to first complete successful lifecycle, excluding unrelated interruptions |
| Assistance | Every hint, undocumented step or maintainer intervention |
| Failures | Error text, native-install issue, data/path confusion, shutdown/restart problem, reproduction |
| Work avoided | Concrete code/configuration or operational work the package replaced; estimate with rationale |
| Fit limits | Missing necessary capability, unsupported deployment shape or unacceptable failure behavior |
| Two-week follow-up | Still installed and used in the real project? What actual activity? Removed/replaced? Why? |
| Recommendation | Retain, revise or stop, with specific evidence |

Capture opt-in notes and minimal anonymized evidence. Do not collect actual uploaded user documents,
credentials, personal metadata or production databases. Ask separately before quoting identifiable
feedback in public documentation.

## Success criteria and interpretation

Target at least four of five participants completing the core lifecycle without maintainer code
changes; a median unassisted setup time at or below 30 minutes; no observed file corruption or
unauthorized route exposure; and at least three still using it after two weeks for their original need.
These are study decision thresholds, not promised performance or statistically significant estimates.
Report the denominators, outliers and failures rather than only averages.

A storage-integrity or access-control failure pauses expansion and creates a release-blocking issue.
If installation dominates failures, improve installation/onboarding before adding features. If most
participants prefer an alternative even after a successful integration, reassess the problem and
positioning. If the deployment model excludes their real needs, record that mismatch rather than
expanding the project into distributed storage by default.

## Decision and next work

After five completed reports and the two-week follow-up, write a short evidence table and choose:

- **Retain:** continued real use and work saved meet the thresholds; maintain the focused scope.
- **Revise:** a repeatable, solvable integration problem blocks a useful use case; create one cohesive
  issue with evidence and a follow-up check.
- **Stop or narrow:** little continued use or stronger alternatives make maintenance cost unjustified.

Promote a later roadmap capability only when observed needs explain who benefits, why the existing
API is insufficient and what measurable acceptance test will demonstrate improvement.
