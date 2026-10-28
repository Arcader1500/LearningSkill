# Pre-course questionnaire implementation plan

Status: READY. Independent plan-critic found no blocking findings on 28 October 2026. No implementation performed.

Approved design: [2026-10-28-pre-course-questionnaire-design.md](../specs/2026-10-28-pre-course-questionnaire-design.md), approved 28 October 2026.

## Outcome and scope

Add optional conversational intake before new-course authoring: identify relevant prerequisites, ask a concise mixture of neutral choice and open-ended questions, interpret answers without scoring, and offer a focused Lesson 0 only when prerequisite gaps justify it. Respect skipping and an explicit request to learn the target topic from its basics. Save a structured questionnaire snapshot during existing course creation, with a readable summary in `course.md`.

This is a skill-guidance enhancement using existing runtime contracts. No new operations, record kinds, assessment lifecycle, schema version, dependencies, UI, or durable pre-initialization session are planned. Do not implement any of issue #1's other suggestions or update installed plugins.

## Repository evidence and engineering decisions

Paths below are relative to `D:/Code/LearningSkill`; run commands from that directory. Line anchors describe the checkout inspected during planning, not promised future line numbers.

| Existing interface | Verified source | Consequence |
| --- | --- | --- |
| `prepareCourseInitialization(request)` copies `request.learnerContext` into initial state | `src/course.mjs:64-74` | Add the snapshot in the existing initialization payload, preserving other context. |
| `validateState(state)` accepts object-valued learner context | `src/model.mjs:58-64` | Nested snapshot is a documented skill convention; no schema migration or new validator. |
| `bootstrapCourse(root, request)` uses normal initialization within one store transaction | `src/bootstrap.mjs:29-71` | Author material after intake, then use normal bootstrap with the final lesson sequence. |
| `resumeCourse(root)` returns committed state; `publicState` omits learner context | `src/course.mjs:217-234`; `src/dispatch.mjs:47-60` | After successful helper resume, read `state.json` with existing file tools to obtain context. Do not add a projection API or assume helper stdout contains it. |
| Publication requires lessons/outcomes and linked material; existing lessons remain on revision | `src/course.mjs:77-121`; `docs/protocol.md:23-25` | Include accepted Lesson 0 in initial lesson declarations and manifest. Keep ordinary lesson evidence rules. |
| Shared references are copied, adapters appended, package validator compares canonical bytes | `scripts/build-plugins.mjs:10,84-95`; `scripts/validate-plugins.mjs:95-105` | Extend existing references; no packaging source changes or new assets. |
| Node built-in tests, dependency-free scripts | `package.json:5-8` | Use `node --test`; no install step. |
| Checkout build updates marketplace registration | `scripts/build-plugins.mjs:136-145` | Use fixture-root builds for validation if checkout `.agents` writes are denied. Do not bypass permissions or modify hooks. |

The graph was stale, so source and tests were used as authority. No `AGENTS.md` or CI workflow was found by repository file search.

## Shared questionnaire contract

T1 documents these conventions; T2 fixtures and T3 examples consume them. This is additive learner context, not a helper-enforced schema.

- Store `learnerContext.preCourseAssessment` with `status`, `reason`, `questions`, `interpretation`, and `lesson0` as described in the approved design. Preserve existing learner context properties.
- `status`: `completed|skipped|partial|not_needed`. Absence means no recorded questionnaire. Only explicit learner action establishes skipped/partial; silence supplies no evidence.
- Each question records stable `questionId`, `purpose: prerequisite|topic_familiarity`, `concept`, `type: free_text|choice`, exact `prompt`, actual `response` or null, and `responseKind: self_report|explanation|unknown`. Choice options use ordered `{optionId,text}` objects; optional `selectedOptionId` records the explicit selection. Store explanations verbatim in `response`, including when accompanying a selection; never generate a learner response.
- `interpretation` has `strengths`, `possibleGaps`, `uncertainties`, and `courseAdjustments` arrays. Use entries `{summary, questionIds, learnerStatements}` so important conclusions cite saved question IDs or actual relevant learner statements. Empty evidence arrays are allowed for explicitly stated assumptions; label those assumptions in the summary rather than presenting them as observations.
- `lesson0`: `{decision: not_needed|accepted|declined, topics: [...], reason: ...}`. Accepted/declined requires the learner's explicit choice. After a skipped questionnaire, `not_needed` means no foundation lesson selected on available evidence, not proof that prerequisites were verified; state that uncertainty in the reason. An unanswered Lesson 0 offer stays in conversation until answered or the learner explicitly directs proceeding; an explicit direction to proceed without it records `declined`.
- Do not use graded `assessment.prepare`, `question.present`, `answer.record`, or `attempt.grade` for intake. Questionnaire answers never pass, exempt, or skip outcomes and never create graded pending questions or attempts.
- A real accepted Lesson 0 has a unique lesson ID, outcomes, reading material, estimates, and normal evidence requirements. Only use existing explicit quiz exclusions if the actual course design calls for them; the ungraded intake does not imply ungraded lessons.
- Resume uses a validated course and committed `state.json`; filtered helper output is insufficient to infer snapshot absence. No retrospective questionnaire requirement for legacy courses. Before initialization, there is no new durable resume guarantee.

## Execution Waves

| Wave | Tasks | Dependencies and ownership |
| --- | --- | --- |
| 1 | T1: shared contract and tutor/platform guidance | None. Owns canonical skill, existing references/template, protocol, and adapters. |
| 2 | T2: persistence and packaged workflow checks; T3: public docs and behavioral cases | Both depend on T1. T2 owns tests only; T3 owns public documentation and eval cases only. They may run in parallel. |

All tasks/waves complete before independent code review. Workers are not alone in the checkout: preserve others' edits and never revert unrelated work. Workers do not commit. The orchestrator alone commits if authorized. No source implementation is authorized in this planning chat.

## T1 — Establish the optional intake workflow and saved-context convention

**Wave:** 1. **Depends on:** None.

**Files Touched (modify):**

- `shared/skills/learn/SKILL.md`
- `shared/skills/learn/references/teaching.md`
- `shared/skills/learn/references/assessment.md`
- `shared/skills/learn/references/persistence.md`
- `shared/skills/learn/templates/course.md`
- `platforms/codex/adapter.md`
- `platforms/antigravity/adapter.md`
- `docs/protocol.md`

**Contracts and acceptance:**

1. Route new requests through goal/experience analysis, optional intake, qualitative interpretation and Lesson 0 choice, then final material authoring and existing bootstrap/init. Resume existing courses first; do not create a fresh questionnaire for a resume request.
2. Describe relevant prerequisite selection, ordinarily two to four initial questions, selective follow-ups, mixed choice/open responses, and accepting unknown/partial answers. No broad competency exam. Distinguish course content from prerequisites and self-report from explanations. Preserve requested basics even when familiarity is reported.
3. Briefly offer a skippable questionnaire only when uncertainty can change course design. No prerequisites means no unnecessary diagnostic. Explicit skip proceeds with provisional assumptions; no extra course-plan approval gate.
4. Present neutral options through available suitable tools, otherwise chat. Tools forcing recommendations or lacking needed free text require fallback. Do not change global modes/settings. Silence, timeout, cancellation, default selection, and acknowledgements are neither answers nor skip consent. Clarify ambiguous/late asynchronous replies.
5. Offer a concrete focused Lesson 0 based on response-supported prerequisite gaps. Wait for actual consent or explicit direction to continue. Add accepted Lesson 0 before the main sequence; declining creates no phantom requirement or skipped lesson. Suggest a separate prerequisite course if the bridge would become sprawling.
6. Document the shared snapshot contract above in protocol and link to it rather than duplicating incompatible schemas. Capture only learning-relevant context. Save a concise summary and provisional prerequisites in the course template; replace its current request for “verified prerequisites” with evidence-aware wording.
7. Clearly separate questionnaire instructions from the adapters' graded-question save/token/rubric requirements. Do not imply a pre-init intake has a durable pending token. On failed course creation report that it was not saved; retain existing retry/conflict and post-commit notes semantics.
8. Explain the resume file read and persistence boundary in both skill/persistence guidance. Learner context from a failed/corrupt resume must not be treated as validated history; never manually overwrite state to patch questionnaire data.

**Risks:** Treating one unfamiliar target concept as a prerequisite failure; overstating evidence; silently imposing grades or a Lesson 0; contradictory native-tool guidance; claiming pre-init durability. Instructions affect model behavior and require behavioral observation beyond structural checks.

**Task checks:** Review changes against spec acceptance criteria 1–8. Run `git diff --check` and `node --test --test-concurrency=1 tests/packaging.test.mjs` to validate existing assets, links, adapter composition, and fixture-root packages. No new runtime logic is expected, so do not manufacture a red test for prose edits. Do not mark behavioral cases passed from these checks.

## T2 — Verify snapshot persistence without graded-work side effects

**Wave:** 2. **Depends on:** T1.

**Files Touched (modify):**

- `tests/course.test.mjs`
- `tests/bootstrap.test.mjs`
- `tests/workflow-integration.test.mjs`

**Contracts and acceptance:**

Use existing real filesystem fixtures and cleanup conventions. These are contract regression checks for existing opaque context storage, not an invented questionnaire evaluator. Add assertions before considering runtime changes; they should pass with existing runtime. If they fail, diagnose the actual boundary and report any required scope change before extending the engine.

1. In course tests, use the initialization fixture (`tests/course.test.mjs:10-19`) and fresh-process `resumeCourse` pattern (`:150-190`) to check deep equality of nested questionnaire context, preserving existing learner properties and schema v1. Cover mixed choice/open answers with exact option order and explanations, plus a partial unanswered null response. Keep fixtures within the shared contract.
2. Include compact skipped/not-needed snapshots in a small table-driven context round-trip check, plus an absent-property legacy case. These verify preservation only; do not assert that the helper validates the convention's enum values.
3. In bootstrap tests, reuse `rootFor(t)` and initialization/manifest fixtures (`tests/bootstrap.test.mjs:10-42`). Create an accepted Lesson 0 before the main lesson with unique outcomes and contained linked reading. Verify order and `not_started` reading, exact saved context, only initialization/publication records when no assessment definitions or initialProgress are supplied, and no attempts or pending graded question.
4. Assert identical retries preserve the snapshot/revision/record count. A changed questionnaire under the same operation ID must conflict without rewriting state, using the existing changed-retry behavior (`tests/bootstrap.test.mjs:72-84`).
5. Check ordinary completion evidence is still required: an intake marked completed and confident answers do not satisfy required outcomes. Reuse `deriveProgress`/resume progress and existing pending assessment fixtures; do not introduce questionnaire scores or auto-exemptions. A declined Lesson 0 scenario contains only main-course lessons and no skip record for a nonexistent lesson.
6. Extend the packaged-helper workflow (`tests/workflow-integration.test.mjs:8-56`) to carry the questionnaire through compact bootstrap, retry, and fresh-process resume. Exercise both built platforms with independent course roots, reusing the fixture-root package build. Read committed `state.json` from each course root to assert exact context; helper stdout intentionally omits it. Verify the pending quiz remains pending, attempts remain empty, initial reading progress remains exactly what the request explicitly supplied, and private answer sentinel redaction still holds.

**Risks:** Testing raw resume only would miss packaged dispatch behavior. Comparing two generated values without comparing the explicit fixture would not prove exact preservation. Fixture answers are test data, never evidence of live teaching quality. Do not assert the snapshot appears in filtered stdout or add tests that merely search for instruction phrases.

**Task checks:** Run `node --test --test-concurrency=1 tests/course.test.mjs tests/bootstrap.test.mjs tests/workflow-integration.test.mjs`. Expected: new assertions and existing checks pass; identical replay stays idempotent; changed replay conflicts. No full-suite requirement for this task.

## T3 — Explain behavior and add observed-evidence scenarios

**Wave:** 2. **Depends on:** T1.

**Files Touched (modify):**

- `README.md`
- `docs/how-it-works.md`
- `docs/acceptance.md`
- `eval/cases.json`

**Contracts and acceptance:**

Explain optional ungraded intake before authoring, prerequisite versus topic familiarity, Lesson 0 acceptance/decline, saved context/summary, and the pre-init persistence limit. Update the workflow description so it does not imply course files are generated before useful intake is answered. Distinguish intake from post-lesson diagnostic/graded quizzes. Keep existing historical acceptance evidence intact and add a separate enhancement acceptance section; no fabricated current results, installation claims, or obsolete test counts presented as new verification.

Add focused behavioral cases using existing `eval/cases.json` fields and `outcome: not_run`; use a new feature requirement label such as `PCQ01` with a documented mapping rather than changing meanings of legacy R01–R16. Cases may cover multiple related acceptance criteria:

- Python intermediate to async from basics: mixed question delivery, relevant prerequisites, `async def` unfamiliarity alone is expected, requested basics retained.
- Supported prerequisite gap and accepted Lesson 0; a separate decline branch proves no insertion. A broad gap suggests a separate course.
- Explicit questionnaire skip and no-prerequisite topic: stated assumptions and no compulsory intake; saved statuses remain distinct.
- Vague/conflicting/partial answers: conservative interpretation, focused follow-up, no general proficiency label; explicit proceed preserves null answers.
- Restricted native tools and asynchronous delivery: neutral chat fallback, no recommendation bias, defaults/silence/cancellation are not answers or skips, and ambiguous late replies need clarification.
- Saved-course resume and legacy course: read validated context, do not repeat completed intake, preserve ordinary quiz requirements. Lost pre-init chat must not claim durable recovery; failed bootstrap must not claim a saved questionnaire.

For each case specify learner actions, forbidden shortcuts, actual required evidence (questions/responses, summary, state/context, real lesson files and decision where relevant), and supported harness/surface. Describe how to observe these in a fresh session in each supported harness without requiring automatic plugin installation during execution. Leave every new behavioral result `not_run` unless an operator actually runs it and supplies evidence.

**Risks:** Static instruction checks are not teaching acceptance. Avoid unrelated README repairs, new learner commands, or changes to past evidence. These cases specify what to observe rather than asserting the helper can judge pedagogical truth.

**Task checks:** `node -e 'JSON.parse(require("node:fs").readFileSync("eval/cases.json", "utf8")); console.log("eval JSON valid")'` and `git diff --check`. Manually check unique scenario IDs, required existing fields, requirement mapping, links, and complete spec coverage. Do not execute native installs or live model teaching as an implicit task check.

## Acceptance coverage

| Approved spec criterion | Implementation / evidence |
| --- | --- |
| 1–2: targeted mixed questions, target unfamiliarity, preserve basics | T1 guidance; T3 Python scenario |
| 3: actual accepted/declined Lesson 0 | T1 offer/author flow; T2 lesson fixtures; T3 both decision branches |
| 4: uncertainty/partial answers, no grades | T1 interpretation; T2 exact context/no credit; T3 ambiguity case |
| 5: skip/no prerequisites | T1 routing; T2 context statuses; T3 skip/no-prerequisite case |
| 6: native restrictions and actual replies | T1 both adapters; T3 restricted/asynchronous case |
| 7–8: creation/resume/legacy/retry, no grade side effects | T1 persistence; T2 raw and both packaged flows; T3 resume/failure case |
| 9: packaging and honest behavioral status | Existing package validation under T1/final verification; T3 `not_run` cases |

## Review, final verification, and delivery

Execute all waves, then dispatch the registered independent `code-reviewer` over the full diff against the approved spec. The orchestrator dispatches implementer fixes, then the same reviewer checks unresolved/modified areas until approved. Only then dispatch the registered independent `verifier`. No additional review gates or per-wave verifier runs.

Final verifier runs `node --version`, `npm test -- --test-concurrency=1`, the eval JSON parsing command above, and `git diff --check`. The full suite already builds/validates both platforms in isolated fixtures (`tests/packaging.test.mjs:19-68`) and exercises installed-style helper copies; report skips precisely.

For checkout artifacts run `npm run build` then `npm run validate` if normal permissions allow. Build writes the protected `.agents/plugins/marketplace.json`; if denied, use the existing isolated packaging/workflow test evidence for package generation and validation, and report checkout artifact build as blocked. Do not repeatedly escalate or edit permissions. If `agy` is available and a current Antigravity package was built, run `agy plugin validate dist/antigravity --strict --json`; otherwise report that native structural check as not run. Never validate stale dist output as evidence for the new feature.

Do not install, enable, publish, push, merge, or rewrite unrelated files. No need to rebuild the optional graph. Report changed files, actual commands/results/skips, and live behavioral cases still `not_run`. Independent review and verifier results establish only their stated scope; live questionnaire effectiveness, native cards, and genuine cross-harness teaching remain separate acceptance evidence.

After plan-critic READY, stop for manual handoff to `$team-run` with this plan path. Do not start implementation in this planning chat.
