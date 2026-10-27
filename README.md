# LearningSkill

LearningSkill is a conversational tutor plugin for Codex and Antigravity. The harness supplies the model and tools; this package supplies shared teaching guidance, course templates, platform bindings, and a local Node helper for validated progress and evidence records.

## Requirements

- Node.js `>=22` is the intended minimum. The runtime exercised in the current workspace is Node `v26.3.0`; Node 22 compatibility has not been tested.
- No npm dependencies or `npm install` are required.

## Build and validate

From this repository root:

```text
npm run build
npm run validate
agy plugin validate dist/antigravity --strict --json
```

The build creates self-contained packages in `dist/codex` and `dist/antigravity`. Local validation checks package structure and contents. AGY strict validation checks its native manifest/package format. Successful installation/listing still does not prove fresh-chat skill loading or interactive assessment behavior.

Codex local marketplace registration and `learning-skill@learning-skill-local` installation have completed. The plugin is enabled at `C:/Users/athar/.codex/plugins/cache/learning-skill-local/learning-skill/0.1.0`. Antigravity strict validation and installation of `dist/antigravity` have also completed; the CLI reported `[ok] learning-skill`, with one skill enabled. These actions preserved unrelated plugins. The Codex listing emitted a remote catalog network warning, while local install state remained visible. Fresh-chat loading, helper resolution, interactive widgets, and learner-facing behavior remain unverified. See [bounded acceptance](docs/acceptance.md) for the exact evidence and remaining checks.

Final verification at HEAD `a645aa2417148eccf71081a0e03aea26895def09` used Node `v26.3.0`, Codex `0.164.0-alpha.11.1`, and AGY `1.4.7`. `npm test -- --test-concurrency=1` passed 52 of 56 tests, with 0 failures and 4 Windows symlink/junction fixture skips; `npm run build`, `npm run validate`, and AGY strict validation passed. Node 22 was unavailable. Fresh interactive sessions, actual teaching quality, live learner-file grading, and bidirectional genuine cross-harness resume remain untested. See [bounded acceptance](docs/acceptance.md) for exact results and source asset hashes.

## Use in conversation

Ask normally, for example: “Teach me container image layers for my basic Linux background. Keep the course focused, include a diagnostic quiz and a small Dockerfile assignment, and save it in this workspace's courses folder.” You can also ask to resume a course, discuss a lesson, report reading complete, request a quiz or hint, submit your own file, review feedback, retry, skip work, or finish with remaining work recorded.

Courses are stored in the selected workspace's `courses/` folder by default. You may explicitly choose another course root. Course folders contain Markdown reading, assignment material, assessment records, snapshots, a progress checkpoint, and readable `classnotes.md`. Select the intended root when resuming from another chat or harness; both need access to that same folder.

Reading-time estimates describe required prose at an assumed reading rate. Practice and setup have separate estimates. A short topic should stay short; estimates are not a duration target or proof of learning. The helper records the learner's own answers and submitted files. It snapshots selected submission bytes before grading and does not edit or execute the source file. Runtime checks that were not actually run remain pending/not run. Reporting reading complete does not pass an assessment. Help is recorded, and independent success after assistance requires a fresh comparable check. A learner may skip work or finish with exceptions; the saved course records what remains.

If a checkpoint write fails, the tutor should report that the affected change was not saved. If a commit succeeds but rendering notes fails, progress and notes status are reported separately. For recovery, reopen the same course root and inspect its checkpoint and committed records; do not treat unreferenced files or unsaved chat as course history.
