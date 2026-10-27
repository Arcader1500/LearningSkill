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

The build creates self-contained packages in `dist/codex` and `dist/antigravity`. Local validation checks package structure and contents. AGY strict validation checks its native manifest/package format. None of these checks proves that an installed skill loads or that an interactive assessment widget works.

For Codex, add this repository as a local marketplace with `codex plugin marketplace add .`, then install `learning-skill@learning-skill-local` with `codex plugin add learning-skill@learning-skill-local --json`. For Antigravity, validate and install `dist/antigravity` with `agy plugin validate dist/antigravity --strict --json` and `agy plugin install dist/antigravity`. Follow each host's normal activation/reload interface, then confirm the skill is available in a fresh chat. See [bounded acceptance](docs/acceptance.md) for evidence to capture and limitations.

Recorded workspace evidence: Node `v26.3.0`; Codex CLI `0.164.0-alpha.11.1`; AGY `1.4.7`; Wave 5 `npm run build` and `npm run validate` passed; AGY strict validation reported exit 0 with no findings. Native plugin installation, loaded skill paths, interactive widgets, and genuine cross-harness resume have not been verified. Minimum Node 22 compatibility remains untested.

## Use in conversation

Ask normally, for example: “Teach me container image layers for my basic Linux background. Keep the course focused, include a diagnostic quiz and a small Dockerfile assignment, and save it in this workspace's courses folder.” You can also ask to resume a course, discuss a lesson, report reading complete, request a quiz or hint, submit your own file, review feedback, retry, skip work, or finish with remaining work recorded.

Courses are stored in the selected workspace's `courses/` folder by default. You may explicitly choose another course root. Course folders contain Markdown reading, assignment material, assessment records, snapshots, a progress checkpoint, and readable `classnotes.md`. Select the intended root when resuming from another chat or harness; both need access to that same folder.

Reading-time estimates describe required prose at an assumed reading rate. Practice and setup have separate estimates. A short topic should stay short; estimates are not a duration target or proof of learning. The helper records the learner's own answers and submitted files. It snapshots selected submission bytes before grading and does not edit or execute the source file. Runtime checks that were not actually run remain pending/not run. Reporting reading complete does not pass an assessment. Help is recorded, and independent success after assistance requires a fresh comparable check. A learner may skip work or finish with exceptions; the saved course records what remains.

If a checkpoint write fails, the tutor should report that the affected change was not saved. If a commit succeeds but rendering notes fails, progress and notes status are reported separately. For recovery, reopen the same course root and inspect its checkpoint and committed records; do not treat unreferenced files or unsaved chat as course history.
