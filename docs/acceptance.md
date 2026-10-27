# LearningSkill bounded acceptance

This record separates automated replay from native installation, live teaching behavior, and cross-harness resume. Fixture replay validates helper state transitions; it does not show that a model teaches well or that a native widget works.

## Recorded environment and existing evidence

| Check | Observed result | Limit |
| --- | --- | --- |
| Node | `v26.3.0` | Intended minimum Node `>=22` has not been tested. |
| Codex CLI | `codex-cli 0.164.0-alpha.11.1` | Version discovery emitted warnings about stale temp cleanup and PATH alias creation; no native registration/loading is established by this command. |
| Antigravity CLI | `1.4.7` | Native strict validation was reported as exit 0 with no findings in Wave 5. Installation and interactive loading remain pending. |
| Wave 5 package build | `npm run build` passed | Structural package creation only. |
| Wave 5 package validation | `npm run validate` passed | Local validator only; it does not establish native loading. |
| Native AGY structural validation | `agy plugin validate dist/antigravity --strict --json` passed with no findings | Does not establish install, loaded skill path, or interactive tool behavior. |
| Integration replay | `node --test tests/integration.test.mjs` passed on Node `v26.3.0` for copied Codex and Antigravity packages | Deterministic fixture data; no real learner or teaching-quality claim. |
| Codex/Antigravity installation and fresh interactive sessions | `not_run` | Native install, widget behavior, and genuine cross-harness sessions remain pending. |

The replay copies each built package to a project-local `.test-tmp-integration-*` root and invokes its bundled helper as a fresh Node process for every operation, with the copied package as the child working directory. An OS temporary directory was tried, but the sandbox denied the helper's atomic state rename there with `EPERM`; the project-local test fixture path is used instead. The replay exercises init, publication, Q&A, reading completion, saved unanswered question and independent-process resume, answer, assistance, assisted grade, a distinct fresh challenge, learner-file snapshot/hash/grade, resume, optional skip, and close with exceptions. Both package copies use explicitly labeled fixture course content, answers, evidence, and learner actions. No checks were run against a real learner, Docker daemon, cluster, or model teaching session.

## Automated checks

Run from the repository root after the review/fix loop:

```text
node --version
node --test tests/integration.test.mjs
npm test -- --test-concurrency=1
npm run build
npm run validate
agy plugin validate dist/antigravity --strict --json
```

The integration command is the scoped T09 replay; the full-suite command is the plan's final verifier check and should run after review approval. Record exact runtime and command exit codes. Current recorded Node is `v26.3.0`; if Node 22 is already installed, repeat the automated suite/build/validation under that runtime and record the actual executable/version. Do not download a runtime implicitly. Full suite verification belongs to the independent verifier after review approval.

For any live check, capture the package version and SHA-256 hashes of the built package manifests, shared skill, and helper before installation. Record course ID, content revision, state revision, exact prompt/response, actual tool events and denials, source/snapshot hashes, and observed result. Do not use evaluator prose or a successful headless process exit as evidence that a widget was answered.

## Installed-surface procedure

Perform only after the authorized final verifier reaches the live acceptance stage. Preserve unrelated personal plugin registrations and settings.

1. In the implementation root, record `node --version`, `codex --version`, and `agy --version`; run the automated checks above first.
2. Run `agy plugin validate dist/antigravity --strict --json`. Inspect diagnostics and exit status. Install only this package with `agy plugin install dist/antigravity`; inspect the reported install/load state and open a fresh interactive Antigravity session through its normal interface. Do not infer interactive mode from headless output.
3. Register the Codex local marketplace with `codex plugin marketplace add .`, then install with `codex plugin add learning-skill@learning-skill-local --json`. Inspect the returned registration/install state. If the desktop Plugins Directory requires activation or reload, use that normal flow and record the observed requirement. Registration alone does not prove the skill loaded.
4. In a fresh chat in each harness, ask: “Create a concise course on container image layers for someone who knows basic Linux. Keep it focused; include a diagnostic quiz and a small learner-authored Dockerfile assignment. Save it in the workspace courses folder.” Record the actual loaded skill/helper path, course root, saved material, estimates, source references, and tool events. Confirm estimates are separate and content is not padded toward two hours.
5. Ask a genuine lesson question, report reading complete, and request its quiz. Inspect the saved assessment and learner-facing question for taught-content alignment, reasoning, plausible distractors, answer leakage, and saved IDs. Submit an actual response through the available native card. Record delivered versus answered events. If cards are unsuitable/unavailable, record the chat/file fallback and report widget behavior as untested.
6. Create a small operator-authored answer file. Hash it, submit the explicit path, inspect the saved snapshot, rubric, evidence provenance, and feedback, then hash the original again. Keep unrun builds/runtime outcomes `not_run` or pending; do not imply the helper ran submitted code.
7. Leave a quiz unanswered or a submission ungraded. Open the same course in a fresh chat in the other harness and compare exact question/options or artifact/next action. Repeat in reverse with a graded attempt, notes, and assistance condition. Record course and content revisions. Rebuild/reinstall only this plugin and confirm learner course hashes are unchanged.
8. Run the short-topic, broad-topic, question-quality, reading-versus-assessment, restricted/headless, timeout/late-answer, assistance/fresh-check, preserved-submission, missing-runtime, persistence-failure, and cross-harness cases in `eval/cases.json`. Update outcomes only with direct evidence and a concise evidence pointer. For headless-only sessions, mark interactive widgets not tested.
9. If Node 22 is already available, repeat automated checks using it. Otherwise retain minimum-version compatibility as not run.

## Live evidence log

Default status for every scenario is `not_run` in [`../eval/cases.json`](../eval/cases.json). For each execution, append a dated record with:

```text
Scenario ID:
Harness and surface (interactive/headless):
CLI/runtime versions:
Package and helper SHA-256:
Course ID, content revision, state revision:
Exact starting prompt and learner response:
Observed tool events/denials:
Evidence paths and source/snapshot hashes:
Outcome (pass/fail/blocked) and evidence pointer:
Limitations:
```

Do not mark a scenario `pass` based only on structural validation, a fixture test, process exit 0, a generated artifact, or model/evaluator assertion. Native installation/loading, interactive widget behavior, actual tutor quality, and bidirectional installed cross-harness resume remain separate acceptance results.
