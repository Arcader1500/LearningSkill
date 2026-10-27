# LearningSkill bounded acceptance

This record separates automated replay from native installation, live teaching behavior, and cross-harness resume. Fixture replay validates helper state transitions; it does not show that a model teaches well or that a native widget works.

## Recorded environment and existing evidence

| Check | Observed result | Limit |
| --- | --- | --- |
| Node | `v26.3.0` | Intended minimum Node `>=22` has not been tested. |
| Codex CLI | `codex-cli 0.164.0-alpha.11.1` | Version discovery emitted warnings about stale temp cleanup and PATH alias creation; no native registration/loading is established by this command. |
| Antigravity CLI | `1.4.7` | Version observed during final verification. |
| Full automated suite | `npm test -- --test-concurrency=1` exit 0; 56 total, 52 passed, 0 failed, 4 skipped | Skips were Windows symlink/junction fixtures denied by the environment. |
| Package build | `npm run build` exit 0 | Required elevated write for the protected `.agents` marketplace file. |
| Package validation | `npm run validate` exit 0; `ok:true`, `errors:[]` | Local structural validation. |
| Native AGY structural validation | `agy plugin validate dist/antigravity --strict --json` exit 0; `findings:[]` | Establishes structural validation only. |
| Codex marketplace/plugin install | `codex plugin marketplace add .` and `codex plugin add learning-skill@learning-skill-local --json` succeeded with elevated execution | Installed at `C:/Users/athar/.codex/plugins/cache/learning-skill-local/learning-skill/0.1.0`; enabled plugin was visible in local plugin listing. A remote catalog network warning occurred, but local state was visible. |
| Antigravity plugin install | `agy plugin install dist/antigravity` succeeded with elevated execution | Output reported `[ok] learning-skill`; one skill was enabled and visible in local plugin listing. |
| Fresh interactive sessions, teaching quality, learner-file grading, bidirectional resume | `not_run` | Installation/listing is not proof of loaded skill/helper resolution, native cards, real tutor behavior, live grading, or genuine cross-harness resume. |
| Node 22 compatibility | `not_run` | Node 22 was unavailable; observed runtime was `v26.3.0`. |

The replay copies each built package to a project-local `.test-tmp-integration-*` root and invokes its bundled helper as a fresh Node process for every operation, with the copied package as the child working directory. An OS temporary directory was tried, but the sandbox denied the helper's atomic state rename there with `EPERM`; the project-local test fixture path is used instead. The replay exercises init, publication, Q&A, reading completion, saved unanswered question and independent-process resume, answer, assistance, assisted grade, a distinct fresh challenge, learner-file snapshot/hash/grade, resume, optional skip, and close with exceptions. Both package copies use explicitly labeled fixture course content, answers, evidence, and learner actions. No checks were run against a real learner, Docker daemon, cluster, or model teaching session.

Final review and verification were performed at HEAD `a645aa2417148eccf71081a0e03aea26895def09`; reviewer result: approved, all findings fixed. Runtime versions were Node `v26.3.0`, Codex `0.164.0-alpha.11.1`, and AGY `1.4.7`.

Source asset hashes recorded during verification (these are source manifests and canonical sources, not generated appended package skill files):

| Source asset | SHA-256 |
| --- | --- |
| Codex source manifest | `E99FD235B6F7E85310AEDD4F481581EECBB490E5E30527FFFF9EA121CE1A5F56` |
| Antigravity source manifest | `529D8017CEB9EEF07A3A04F7658FBEBC486737EC1C8879A25EB3AD7F6D936B49` |
| Shared canonical skill | `1A4EE26555F918C9FBFC7648790D455789EAE6398D3E009D2BBC4A91196216CF` |
| Bundled helper source | `B496D312CB842D63AD1CB129B415F08F3D2FE70DD0A10DA093A617DCD1A8C420` |

## Automated checks

Final automated verification from the repository root:

```text
node --version
node --test tests/integration.test.mjs
npm test -- --test-concurrency=1
npm run build
npm run validate
agy plugin validate dist/antigravity --strict --json
```

`npm test -- --test-concurrency=1` passed with 56 total tests, 52 passed, 0 failed, and 4 skipped because the Windows environment denied symlink/junction fixture creation. `npm run build`, `npm run validate`, and `agy plugin validate dist/antigravity --strict --json` also passed with the results above. Node 22 was unavailable and remains untested.

For any live check, capture the package version and SHA-256 hashes of the built package manifests, shared skill, and helper before installation. Record course ID, content revision, state revision, exact prompt/response, actual tool events and denials, source/snapshot hashes, and observed result. Do not use evaluator prose or a successful headless process exit as evidence that a widget was answered.

## Installed-surface procedure

Native installation checks were completed during final verification. Both installed plugins appeared in local enabled-plugin listings, and unrelated plugins were preserved. The Codex list also reported a remote catalog network warning; the local installed state remained visible. These checks establish registration/installation state, not fresh-chat skill loading or interactive acceptance.

1. In a fresh chat in each harness, ask: “Create a concise course on container image layers for someone who knows basic Linux. Keep it focused; include a diagnostic quiz and a small learner-authored Dockerfile assignment. Save it in the workspace courses folder.” Record the actual loaded skill/helper path, course root, saved material, estimates, source references, and tool events. Confirm estimates are separate and content is not padded toward two hours.
2. Ask a genuine lesson question, report reading complete, and request its quiz. Inspect the saved assessment and learner-facing question for taught-content alignment, reasoning, plausible distractors, answer leakage, and saved IDs. Submit an actual response through the available native card. Record delivered versus answered events. If cards are unsuitable/unavailable, record the chat/file fallback and report widget behavior as untested.
3. Create a small operator-authored answer file. Hash it, submit the explicit path, inspect the saved snapshot, rubric, evidence provenance, and feedback, then hash the original again. Keep unrun runtime outcomes `not_run` or pending; do not imply the helper ran submitted code.
4. Leave a quiz unanswered or a submission ungraded. Open the same course in a fresh chat in the other harness and compare exact question/options or artifact/next action. Repeat in reverse with a graded attempt, notes, and assistance condition. Record course and content revisions. Confirm learner course hashes remain unchanged.
5. Run the short-topic, broad-topic, question-quality, reading-versus-assessment, restricted/headless, timeout/late-answer, assistance/fresh-check, preserved-submission, missing-runtime, persistence-failure, and cross-harness cases in `eval/cases.json`. Update outcomes only with direct evidence and a concise evidence pointer. For headless-only sessions, mark interactive widgets not tested.
6. Node 22 was unavailable during final verification. Keep minimum-version compatibility as not run unless that runtime becomes available.

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
