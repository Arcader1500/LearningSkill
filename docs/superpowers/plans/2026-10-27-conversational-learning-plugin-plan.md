# LearningSkill implementation plan

Date: 27 October 2026  
Status: READY — registered plan-critic approved on 27 October 2026; execution awaits manual team-run handoff  
Approved spec: `docs/superpowers/specs/2026-10-27-conversational-learning-plugin-design.md` (explicit user approval in this chat, including conversational-only v1)  
Implementation root: `D:/Code/LearningSkill`

## Goal and scope

Build a small conversational learning plugin for Codex and Antigravity using a shared teaching skill, self-contained platform packages, Markdown course material, and validated local progress/evidence records. Satisfy R01–R16 of the approved spec. Two hours of reading remains a suggested ceiling, never a target. No standalone app, model API client, server, background monitor, automatic lab provisioning, or complete DevOps curriculum.

This document introduces **new** module paths, symbols, commands, and test contracts. They do not exist yet. The existing workspace contains `DESIGN.md` and the approved spec only; no Git repository, package manifest, test runner configuration, application code, or CI was found. Do not treat a command below as already executed or a new interface as an existing symbol.

## Grounding and execution rules

- Node `v26.3.0` and npm `11.16.0` were observed at `C:/Program Files/nodejs/node.exe`; built-in imports `node:test`, `node:assert/strict`, `node:fs/promises`, `node:path`, `node:crypto`, and `node:child_process` succeed. `node --help` exposes `--test` and `--test-concurrency`. Intended minimum Node 22 remains untested; do not download a runtime implicitly.
- Local Codex is `codex-cli 0.164.0-alpha.11.1`; local AGY is `1.4.7`. CLI help confirms `codex plugin marketplace add <SOURCE>`, `codex plugin add <PLUGIN[@MARKETPLACE]>`, and `agy plugin validate <path> --strict --json`. `codex plugin add` does not take a directory. AGY install-specific help is unavailable; the existing installer invokes `agy plugin install <directory>` (`D:/Code/antigravity-coding-team/antigravity/install.ps1:76`).
- Existing Codex compatibility manifest and marketplace shapes are verified at `D:/Code/antigravity-coding-team/codex/.codex-plugin/plugin.json:1` and `.agents/plugins/marketplace.json:1`. Native AGY manifest shape is verified at `antigravity/plugin.json:1`. These are precedents, not proof this new package will install or execute.
- Graph preflight reports this workspace is not an indexed project (no `.git`, `.svn`, or graph directory). Use source/created-file review fallback; do not add graph tooling or hooks to the product. No Git initialization, branch switch, worktree creation, commit, push, or merge is required by this plan. If the user initializes Git before execution, preserve their branch and unrelated changes. Only the orchestrator may commit if separately authorized.
- Execute only after the user's manual team-run handoff. Use registered implementer roles, focused context, and disjoint ownership. Implementers run their task checks; no per-wave independent verifier. After all waves: independent code-reviewer → implementer fixes → reviewer recheck until approved → final independent verifier. A verification failure returns through fixes and reviewer approval before another verifier run.
- All runtime dependencies are Node built-ins. No npm install is needed. Test fixtures use `fs.mkdtemp()` and real files/directories, with cleanup of only the fixture roots they created. Filesystem fault injection is an internal test seam, not a new user-facing flag. No test may pass merely because a fixture path does not exist.

## Shared contracts established before consumers

### Course data and authority

Schema version is `1`. A course root contains `course.md`, `lessons/`, `assignments/`, `answers/`, `assessments/`, `records/`, `submissions/`, `classnotes.md`, and `state.json`. Material/key files are authored from templates through normal file tools; helper registration validates their location and required content/manifest references. Keys are separate from the reading material. `state.json` is the authority for committed progress; it references immutable records and submission snapshots. Unreferenced files are not completed history.

State fields: `schemaVersion`, `courseId`, integer `revision`, integer `contentRevision`, `phase` (`draft|active|completed|closed_with_exceptions`), learner context, course goal/prerequisites/reading-rate assumptions, lesson definitions/outcome IDs, per-lesson reading state, assessment and assignment indexes, one active `pendingQuestion` or null, record references, operation fingerprints, unresolved topics, and `nextAction`. Store relative paths and hashes rather than absolute developer paths. The notes projection receipt records the last successfully rendered committed revision and hash; it is nonauthoritative and cannot award progress.

Reading states: `not_started|in_progress|reported_complete|skipped`. Assessment/assignment states: `not_required|pending|in_progress|submitted|ungraded|needs_review|passed|skipped`. Lesson completion is derived from required outcomes/evidence. `completed` requires all required work passed; an explicit finish with exceptions records `closed_with_exceptions` and its unresolved/skipped requirements. A changed rubric/content revision cannot mutate existing attempts.

Record envelopes contain schema version, stable operation/record ID, kind, timestamp, course/content revision, relevant lesson/assessment/question/attempt IDs, normalized operation fingerprint, and typed payload. Supported kinds cover course publication/revision, Q&A, reading/progress, question preparation/presentation, assistance, answer/submission, grade, retry, skip, and closing. `validateRecord` rejects missing fields and inconsistent references; free-form narrative payloads are not substitutes for typed grade/answer fields.

IDs use a bounded safe identifier format (letters, digits, underscore, hyphen; no path separators, dot segments, drive syntax, or control characters). Mutation requests contain `operationId` and `expectedRevision`; reads do not require them. Paths are resolved under the explicitly selected course root and checked against real ancestors/reparse links before writes. An explicitly submitted source path may be outside that root; snapshot its selected bytes under the root without changing the source, and refuse links that escape the explicitly selected submission tree. No helper operation executes source files.

### Questions, evidence, and grades

An assessment fixes IDs, content revision, objectives, exact prompts, question type, stable option IDs/order where relevant, answer key, criterion rubric, and point maxima before presentation. Each criterion has an ID, positive maximum points, essential flag, and independence requirement. Public learner views omit keys and expected answers. The helper enforces structural completeness; the tutor is responsible for content correctness and question quality.

The question presentation record holds a stable question/attempt/presentation token before invoking the native tool. Bind host routing IDs if the surface actually supplies them; otherwise use the saved single active question and exact prompt/options to correlate, and clarify ambiguity. Do not invent host IDs. `acceptAnswer` requires the matching saved IDs/token and an explicit learner response. A delivered tool card, timeout, cancellation, default option, absent response, or stale/duplicate routing cannot create an answer or overwrite a new question. Cancellation/defer preserves the unanswered instance; reoffer retains the question/option order and issues a new presentation token.

An attempt references its fixed rubric revision, learner response or immutable submission, assistance records (`none|hint|worked_example|solution_shown|tutor_performed|unknown`), and evidence provenance (`tutor_observed|learner_supplied|not_run`). Record the observation/claim without claiming verified authorship. A fresh comparable assessment creates another attempt; changing only the help label on an old attempt cannot make it independent.

Grade input contains one result per saved criterion and evidence references, with feedback and awarded points. Validate finite numeric scores in range, exactly the expected criterion set, point sums, matching rubric/snapshot references, and required evidence. Derive criterion status from points (`unmet|partial|met`) and aggregate percentage; the model cannot override derived totals. Passing requires all essential criteria met and their independence/evidence conditions satisfied. Correct assisted work may earn points while requiring a fresh independent check. Grading failure creates/retains an ungraded record, never a default score. Regrades preserve earlier grades as history rather than overwriting them.

### New module interfaces

All signatures below are contracts to implement, not existing APIs. Functions are asynchronous when touching files; pure model functions are synchronous. Typed errors expose a stable `code` and useful diagnostic without swallowing filesystem failures.

| New module | Exported contract |
| --- | --- |
| `src/model.mjs` | `validateState(state)`, `validateRecord(record)`, `validateMutation(request)`, `reduceState(state, records)`, `deriveProgress(state, records)`; validation throws typed domain errors. Only `reduceState` accepts null prior state, exclusively with a valid `course_initialized` first record. |
| `src/errors.mjs` | `LearningError(code, message, details)`; shared codes include `INVALID_INPUT`, `UNSUPPORTED_SCHEMA`, `CONFLICT`, `LOCKED`, `CORRUPT_STATE`, `PATH_ESCAPE`, `STALE_QUESTION`, `INVALID_GRADE`, `NOT_READY`, and `IO_ERROR`. |
| `src/paths.mjs` | `resolveCourseRoot({workspaceRoot, courseRoot?, courseId?})`, `resolveContained(root, relativePath, {allowMissing?})`; never silently scan/write outside the selected roots. |
| `src/store.mjs` | `readCourse(root)`, `commit(root, {operationId, expectedRevision, records, snapshots?}, options?)`, `withCourseLock(root, callback, options?)`, `recoverLock(root, {ownerToken, confirmedInactive})`; return committed revision/records or a typed error, never a false success. `options` holds injected filesystem/failure seams for tests only. The callback under `withCourseLock` must not call lock-taking mutations recursively. |
| `src/assessment.mjs` | `prepareAssessment(root, request)`, `presentQuestion(root, request)`, `acceptAnswer(root, request)`, `recordAssistance(root, request)`, `submitWork(root, request)`, `gradeAttempt(root, request)`; reuse model guards/store transactions. |
| `src/course.mjs` | `discoverCourses(workspaceRoot)`, `initializeCourse(root, request)`, `publishCourse(root, request)`, `recordQA(root, request)`, `recordProgress(root, request)`, `resumeCourse(root)`; publication validates required material before phase becomes active. |
| `src/notes.mjs` | `renderClassnotes(root)`; rebuild from committed records, preserve unexpected edits, report notes status separately from checkpoint status. |
| `scripts/learning-state.mjs` | Internal entry accepts exactly one UTF-8 JSON request-file path; dispatches an allowlisted operation and prints one JSON result to stdout. No model API, shell evaluation, arbitrary import, or lab execution. |

Internal operations: `course.discover`, `course.init`, `course.publish`, `course.resume`, `qa.record`, `progress.record`, `assessment.prepare`, `question.present`, `answer.record`, `assistance.record`, `submission.record`, `attempt.grade`, `notes.render`, and `lock.recover`. Versioned request envelope: `protocolVersion:1`, `op`, `workspaceRoot`, optional `courseRoot/courseId`, mutation IDs/revision where needed, and typed `payload`. Read results provide `ok`, current state/next action, and pending learner-safe question; mutation results distinguish `committed` and `notesStatus`. Errors are JSON `{ok:false,error:{code,message,details}}` with nonzero exit. A post-commit notes failure returns committed progress plus the notes problem, never pretends the mutation rolled back.

## Execution Waves

| Wave | Tasks | Dependency reason and ownership boundary |
| --- | --- | --- |
| 1 | T01 | Establish schema, transition, error, fixture, and protocol contracts before consumers. |
| 2 | T02, T03 | Transactional store and teaching assets are independent consumers of T01; own disjoint paths. |
| 3 | T04, T05 | Assessment/submission service and course/notes service share completed model/store contracts but own separate modules/tests. |
| 4 | T06, T07 | Internal dispatch integration and platform adapter/metadata authoring are disjoint; both consume established interfaces. |
| 5 | T08 | Build and validate self-contained packages after helper, resources, and adapters exist. |
| 6 | T09 | End-to-end replay, behavioral acceptance kit, and install/resume guidance use the finished package contracts. |

## T01 — Establish the data model, transitions, and project checks

**Wave:** 1  
**Depends on:** None  
**Files Touched:** create `package.json`, `.gitignore`, `src/model.mjs`, `src/errors.mjs`, `tests/helpers.mjs`, `tests/model.test.mjs`, `docs/protocol.md`.

**Contracts and acceptance criteria:** Implement the shared model/error contracts above and document request/payload schemas, record variants, state transitions, grade derivation, and read-versus-mutation semantics in `docs/protocol.md`. This is the normative internal contract for later tasks. `package.json` sets private ESM, Node `>=22`, and `test` = `node --test`; no dependencies or lockfile are necessary. Ignore generated `dist/`, bounded temporary test roots, and learner course data without hiding source fixtures.

The pure reducer rejects reading→pass shortcuts, fabricated unanswered-question grades, wrong rubric IDs, invalid point values, partial/assisted essential criteria masquerading as independent, unsupported versions, duplicate/missing references, silent rubric mutation, and invalid close/completion states. It supports explicit retry/skip/continue, unresolved topics, material revision identifiers, and next-action updates without erasing history. Define published-material manifests, assessment indexes, immutable records, and projection receipt semantics completely before consumer dispatch.

**Risks:** A loosely typed universal event object would shift guarantees into prompts. Keep typed variants and derived progress; do not build a generic workflow engine. Test API signatures agree with the protocol before parallel consumers begin.

**Task checks:** Write failing behavioral tests first; run `node --test tests/model.test.mjs`, implement, then rerun to pass. Include every listed state/score error plus successful unaided, assisted→fresh-check, skipped, closed-with-exceptions, and missing-evidence cases. Fixtures are concrete in-memory records; any path-existence test creates real files through `tests/helpers.mjs`. Check module syntax with `node --check src/model.mjs` and `node --check src/errors.mjs`. These are task checks, not an independent verifier run.

## T02 — Implement contained transactional persistence

**Wave:** 2  
**Depends on:** T01  
**Files Touched:** create `src/paths.mjs`, `src/store.mjs`, `tests/paths.test.mjs`, `tests/store.test.mjs`.

**Contracts and acceptance criteria:** Implement root selection, safe path containment, read validation, exclusive short mutation locks, expected-revision checks, immutable records/snapshots, and checkpoint replacement. A new course can commit from expected revision zero; existing corrupt/unsupported state is never reset by initialization.

Create records/snapshots before committing `state.json` by same-directory temporary replacement. Compute stable fingerprints over semantic operation input plus submitted-byte hashes, excluding newly generated timestamps. Existing operation ID + same fingerprint returns its original committed result; changed content with that ID is a conflict. Reconcile idempotent retries against the checkpoint before applying the caller's now-stale expected revision. A pre-commit interruption leaves the prior state authoritative and ignores orphan artifacts; matching owned orphan files may be reused safely, differing bytes conflict. Never overwrite a committed immutable file.

Lock ownership includes an unpredictable token and useful process/host diagnostics. Release only a lock owned by the operation; do not auto-expire/steal. Explicit recovery requires confirmed inactive ownership plus matching token. Failed/ambiguous owner checks remain locked. Lock cleanup after a committed checkpoint must not turn committed progress into a false failure/retry. Resolve existing ancestors to catch escaping symlinks/junctions before writes; distinguish source snapshot selection from contained destination writes. If an externally adversarial filesystem race cannot be ruled out, document that the guarantee concerns cooperating local sessions, not hostile concurrent link replacement.

**Risks:** Windows rename/locking failures and partial multi-file writes. Preserve prior checkpoint on replace failure and report committed-versus-uncommitted accurately. No broad delete/repair operations. Fault seams must exercise real temporary files rather than mocking away containment/existence checks.

**Task checks:** Red→green `node --test tests/paths.test.mjs tests/store.test.mjs`. Cover first create, real read, stale revision, concurrent writers (separate child processes), operation retry/content mismatch, permission/open/rename failure, pre/post-commit interruption, committed retry after stale caller revision, immutable file collision, orphan records, corrupt JSON, missing record, future schema, traversal, a real symlink/junction escape where the OS supports it, and recovery-token mismatch. Platform inability to create a link is an explicit skipped case, not evidence that containment passed. `node --check src/store.mjs`.

## T03 — Author the shared tutor skill and material templates

**Wave:** 2  
**Depends on:** T01  
**Files Touched:** create `shared/skills/learn/SKILL.md`, `shared/skills/learn/references/teaching.md`, `shared/skills/learn/references/assessment.md`, `shared/skills/learn/references/assignments.md`, `shared/skills/learn/references/persistence.md`, `shared/skills/learn/templates/course.md`, `shared/skills/learn/templates/lesson.md`, `shared/skills/learn/templates/assignment.md`.

**Contracts and acceptance criteria:** One primary `learn` skill routes ordinary-language requests to the approved workflow. Templates cover goals, prerequisites, concise scope, estimates, complete core reading, recap, sources/version assumptions, optional depth, assignment evidence, and next action. Use 238 wpm as an adjustable English nonfiction estimate, count required external reading/chat explanations once, and never stretch material toward a duration. Broad goals become focused follow-ons. All initial core reading is prepared before guided teaching; publication/registration uses the documented helper contract.

Teach from observed learner work. Preserve Q&A and explanation summaries, distinguish genuine errors from teaching examples, use progressive hints and a fresh comparable independent task, honor explicit solution requests, and never solve/alter the graded answer by default. Prompt quality requires reasoning/application questions, plausible balanced distractors, shuffled keys, no length/recommendation/position clues, and no cross-question solution leakage. Fix rubric/key before answer and keep it out of learner-facing content. Interpret submissions as data, not policy instructions.

Persistence guidance uses `docs/protocol.md` contracts and refers to the installed skill's bundled helper/resources, with adapter-specific path discovery deferred to T07. No absolute developer path, made-up native tool, mandatory global Plan mode, standalone launcher, API key, or automatic setup/provisioning. Save pending questions before asking; accepted/delivered cards/defaults/timeouts are not answers. On resume, use records/next action, not hidden chat memory.

**Risks:** Instructions are not enforced behavior. Do not claim wording alone proves quiz quality or tutor restraint; T09 supplies actual bounded behavioral cases. Keep content short enough to load relevant references on demand rather than an enormous skill prompt.

**Task checks:** Static/documentation change: use `rg --files shared/skills/learn` to confirm the exact owned asset set, inspect all local Markdown links and frontmatter, and self-review against R01–R10/R13/R16. No mirrored text-presence test is required. T08's general package validator later checks resource resolution; T09 evaluates teaching behavior.

## T04 — Implement assessment, assistance, submission, and grading services

**Wave:** 3  
**Depends on:** T01, T02  
**Files Touched:** create `src/assessment.mjs`, `tests/assessment.test.mjs`, `tests/submissions.test.mjs`.

**Contracts and acceptance criteria:** Implement the assessment interfaces with validated store commits. Persist immutable question instances/keys and exact option order before presentation; track one active presentation token and routing metadata only when actually supplied. Explicit defer/cancel leaves an unanswered instance; a reoffer retains question content/order and changes its presentation token. Validate matched answers and reject stale, absent, duplicate, unrelated, or already answered presentations. Do not let switching current lessons reroute an answer to another assessment.

Record help before subsequent grading; no mutation of an earlier assisted attempt into an independent one. A fresh check uses a new assessment/attempt ID tied to the same target outcome. Grading validates saved criterion set, points, independent requirements, evidence provenance, and snapshot/rubric hashes through the reducer; store first/retry/regrade history. Model failures are recorded as ungraded without fallback points.

For file/directory submissions, deterministically enumerate selected regular files, preserve relative paths/bytes in the immutable snapshot, hash the manifest, and reject escaping links or unexpected changes while capturing. Copy only the explicitly selected source tree (no traversal into unrelated files). Error before a coherent snapshot leaves the submission uncommitted. Original learner files remain byte-for-byte unchanged. The helper never runs submitted code or lab commands.

**Risks:** Confusing tool acknowledgment with an answer and accepting changed live files as old evidence. Keep answer recording, snapshot capture, and grade events distinct; missing/not-run evidence cannot be silently upgraded to tutor-observed proof.

**Task checks:** Red→green `node --test tests/assessment.test.mjs tests/submissions.test.mjs`. Cover prepared-before-presented, exact option preservation, delivered/default/timeout/cancel not answered, late/duplicate/wrong-token response, changed current lesson, malformed grade, absent/extra/NaN/negative/out-of-range criteria, missing essential runtime evidence, assisted correct points without independent pass, fresh-check success, retries/regrades, changed-rubric refusal, single-file and nested-directory snapshots, external explicit source selection, changed-during-copy failure, source hash unchanged, symlink escape, and changed-file retry-ID conflict. Use real filesystem fixtures.

## T05 — Implement course lifecycle, discovery, resume, and classnotes

**Wave:** 3  
**Depends on:** T01, T02  
**Files Touched:** create `src/course.mjs`, `src/notes.mjs`, `tests/course.test.mjs`, `tests/notes.test.mjs`.

**Contracts and acceptance criteria:** Implement course initialization/publication, bounded discovery, Q&A/progress recording, and resume. Default discovery considers immediate course directories under the selected workspace's `courses/` only; an explicit course path bypasses guessing. Missing directories give an empty discovery result; corrupt candidates are reported, not silently treated as valid courses. Ambiguity is returned for tutor clarification. An existing valid/corrupt course is not overwritten by initialization.

Course publication records the goal, prerequisites, scope, lesson/outcome manifest, sources/version assumptions, separate time estimates, and required reading/assignment paths/hashes. Verify required local resources exist, are contained regular files, have instantiated content rather than blank/template-only files, and have resolvable local reading links before activating the course. The helper does not fetch URLs or decide whether prose is pedagogically correct. An optional reading ceiling is advisory, not a word minimum or a condition that automatically splits content. Material revisions are explicit and preserve old question/rubric/attempt records. Resume detects changed/missing registered material and reports the mismatch rather than pretending the saved revision still matches.

Q&A records include the learner's actual question, useful explanation summary, evidence-backed misconception if any, follow-up, and related lesson. Progress mutations support begin/read-complete, defer, retry, skip, unresolved-topic updates, next action, and explicit finish. Post-lesson quiz remains pending after read-complete unless the learner explicitly excluded/skipped it. Resume reads the committed index/relevant records, reoffers unanswered questions, and resumes grading submitted-ungraded work without replacing it. Return a minimal read-only metadata/error view on unsupported/corrupt schema where safe; never infer undocumented states.

Classnotes are deterministic Markdown from committed records, including Q&A, explanations, grades, help conditions, and next steps with evidence IDs. Use a separate `.notes-projection.json` receipt containing rendered revision/hash. A missing/stale receipt can be repaired when the existing output matches a provable earlier generated rendering; unexpected edits cause `CONFLICT` and preserve the file. Serialize projection writes under the same short course lock as state writes; never render a mixture of revisions or reenter a held mutation lock. Notes failures leave already committed progress intact and are reported separately.

**Risks:** Flattening notes into an unreliable summary, silently overwriting learner edits, and changing content without its revision. Keep committed records authoritative and the resume pointer small. Do not load every lesson on resume or depend on a transcript.

**Task checks:** Red→green `node --test tests/course.test.mjs tests/notes.test.mjs`. Cover empty/single/ambiguous/corrupt discovery, explicit external course root, init without overwrite, missing/incomplete/escaping material, successful publish, revised material and old attempts, reading completion without pass, notes from real Q&A and assistance/grades, fresh-process resume in pending/submitted/graded/skipped states, closed-with-exceptions, material-hash mismatch, missing referenced evidence, stale render rebuild, manual-edit conflict, interrupted receipt write, concurrent notes/state writes, and repair after a committed mutation's failed render. No model-generated summary can create a missing learner event.

## T06 — Integrate the internal request-file helper

**Wave:** 4  
**Depends on:** T01, T02, T04, T05  
**Files Touched:** create `scripts/learning-state.mjs`, `src/dispatch.mjs`, `tests/helper.test.mjs`.

**Contracts and acceptance criteria:** Implement `dispatch(request)` in `src/dispatch.mjs` against the allowlisted operations and protocol established by T01. The entry script reads exactly one explicitly supplied UTF-8 JSON request file, handles a UTF-8 BOM intentionally, validates protocol/envelope/payload, invokes dispatch, and emits one structured JSON result. Missing/extra arguments, unknown operation, invalid JSON/version, bad path, stale revision, and filesystem failures yield typed JSON and nonzero exit. Do not evaluate shell/JavaScript in request content or offer generic file execution.

Mutation dispatch performs one domain operation, then renders notes as a separate projection. If commit succeeded but render failed, return `committed:true`, the saved revision, and `notesStatus` identifying the conflict/error; do not retry the semantic mutation as if it had failed. Read-only operations do not mutate course data. Returned learner views exclude answer keys, expected answers, and private rubric rationale; grading operations may access saved keys internally. Log diagnostics separately without extra stdout chatter.

Packaging will place this script at `skills/learn/scripts/learning-state.mjs` and the runtime modules at `skills/learn/src/`; use relative imports that work in both source and this installed layout. Requests belong in a writable workspace scratch location, not the installed plugin. File paths are passed as arguments to Node; adapters must not inline JSON in shell strings or use eval-style command construction.

**Risks:** Shell quoting on Windows, helper output leaking keys, and treating post-commit render error as transaction failure. Test the entry as a real child process with paths containing spaces and JSON strings containing shell metacharacters.

**Task checks:** Red→green `node --test tests/helper.test.mjs`. Exercise all dispatch operations through the real entry, error/nonzero behavior, BOM handling, paths with spaces, metacharacters remaining inert, read-only no-write hashes, learner-safe question output, explicit pending/no-answer results, and committed-with-notes-failure semantics. `node --check scripts/learning-state.mjs` and `node --check src/dispatch.mjs`.

## T07 — Author native adapters and manifest sources

**Wave:** 4  
**Depends on:** T01, T03, T04, T05  
**Files Touched:** create `platforms/codex/adapter.md`, `platforms/codex/plugin.json`, `platforms/antigravity/adapter.md`, `platforms/antigravity/plugin.json`.

**Contracts and acceptance criteria:** Use machine plugin name `learning-skill`, display name LearningSkill, version `0.1.0`. Codex source manifest is the supported compatibility overlay with `name`, `version`, `description`, `skills:"./skills/"`, and interface metadata; omit unused MCP/apps/hooks/agents. The builder places it at `dist/codex/.codex-plugin/plugin.json`. Antigravity source manifest follows the locally observed `name`, `description`, `version`, and string-array `suggestedPrompts` shape at `dist/antigravity/plugin.json`. Suggested prompts demonstrate conversational create/resume/submit behavior without introducing a new command language.

Adapter fragments append to the shared `SKILL.md` and bind only actual exposed tool capabilities. Resolve the loaded skill's real path from harness-provided skill metadata/native inspection, then locate its bundled helper relative to that directory. The process working directory and source checkout are not plugin-path authorities. If the harness does not reveal a resolvable installation path, ask for that missing path or keep persistence unavailable rather than guessing an unrelated cached version.

Codex supports discovered native asynchronous/free-text questions when exposed, suitable neutral choices when permitted, and chat/file fallback. Legacy blocking/Plan-only or recommendation-forcing schemas do not justify changing global mode or marking a correct answer Recommended. Antigravity uses native `ask_question` only when actually exposed and suitable; headless/print is not assumed interactive. Tool acknowledgments, defaults, and timeouts are not answers. Correlate real returned responses to saved question/presentation tokens; late/ambiguous callbacks are clarified, not applied to the current lesson by guesswork.

File and shell tools respect existing harness permissions. Lab instructions are for learner execution; the helper is only for course records. Research bindings prefer official sources/current local versions and accurately flag unavailable browsing. Neither adapter changes global model settings, hooks, or unrelated plugins.

**Risks:** Packaged path resolution and native tools are runtime behavior, not guaranteed by manifest shape. T08 checks isolated layout; T09 defines live loading/widget/resume evidence. Omitted optional metadata remains subject to actual native validation rather than assumption.

**Task checks:** Static/config change: parse both JSON files with `node --input-type=module -e "import fs from 'node:fs'; for (const p of ['platforms/codex/plugin.json','platforms/antigravity/plugin.json']) JSON.parse(fs.readFileSync(p,'utf8'));"`. Review adapter text against the actual observed native schemas and the saved-response contract. Native/package validators run after T08 has built real packages. No mirrored text-assertion test is required.

## T08 — Build and validate self-contained plugin packages

**Wave:** 5  
**Depends on:** T01, T02, T03, T04, T05, T06, T07  
**Files Touched:** modify `package.json`; create `scripts/build-plugins.mjs`, `scripts/validate-plugins.mjs`, `.agents/plugins/marketplace.json`, `tests/packaging.test.mjs`; generated owned outputs `dist/codex/**`, `dist/antigravity/**` only (not source-owned files or learner courses).

**Contracts and acceptance criteria:** Add `build` = `node scripts/build-plugins.mjs` and `validate` = `node scripts/validate-plugins.mjs`. No build dependency or npm install. The builder copies canonical skill/references/templates, appends the appropriate adapter to `skills/learn/SKILL.md`, bundles the helper under `skills/learn/scripts/` plus all `src/*.mjs` under `skills/learn/src/`, and emits the correct manifest for each platform. No package imports or links escape its own tree. Do not duplicate canonical content by hand in each adapter.

Use a deterministic builder inventory and stage the two outputs before replacement. It may replace only its explicitly resolved `dist/codex` and `dist/antigravity` children after verifying containment and expected ownership; never recursively remove a computed path outside the generated root. Do not follow source symlinks or copy learner courses, arbitrary files, tests, credentials, or caches. Building again cannot mutate existing course/configuration data. Preserve unrelated files outside the builder's owned outputs.

Create the local marketplace with root `name:"learning-skill-local"`, `interface.displayName:"LearningSkill Local"`, and one `plugins` entry: `name:"learning-skill"`, `source:{path:"./dist/codex",source:"local"}`, `category:"Productivity"`, and `policy:{installation:"AVAILABLE",authentication:"ON_INSTALL"}`. These exact metadata values follow the inspected local precedent and the [official marketplace metadata contract](https://developers.openai.com/plugins/build/plugins), which requires category and both policy fields. The authentication policy is package metadata; no MCP server, separate credential integration, or model API key is added. The marketplace resolves from the repository root, not from the nested manifest file's directory. Record native validation/install results to establish actual behavior; package validation must not fake those results. The workspace's `.agents` directory may be protected by the execution sandbox; use the normal authorized tool escalation if needed, preserve unrelated entries if a marketplace has since been created, and report any denied write rather than silently substituting a global registration file.

The validator checks metadata/version consistency; frontmatter and declared skill; canonical copy parity; appended adapter; helper/module inclusion; all local resource/import links within package roots; required templates; strict JSON; and JS syntax by invoking `node --check` on source/packaged modules. It must fail on intentionally omitted/tampered/escaping assets. Validation is read-only. Use no hardcoded `D:/Code` paths in deliverable resources.

**Risks:** Builder cleanup escaping owned roots, metadata accepted structurally but not natively, and installed script imports relying on checkout paths. An isolated copy of each generated package must function with the original source tree inaccessible to that test.

**Task checks:** Red→green `node --test tests/packaging.test.mjs`; tests build in real temporary directories with fake *source fixtures as real files*, exercise deterministic rebuild, source/destination containment, escaping links, missing/tampered resources, manifest mismatch, no outside deletion, unchanged external course/config sentinels, and read-only validation. Run `npm run build`, `npm run validate`, then `agy plugin validate dist/antigravity --strict --json` using the discovered binary when available. An unavailable native validator is a reported acceptance gap, never a structural PASS. From an isolated copied package, invoke its bundled helper with a real request to initialize/resume a temporary course; no source-directory resolution is allowed. Codex native registration/loading belongs to the bounded live acceptance below, not an invented validate subcommand.

## T09 — Add integration replay and bounded live acceptance guidance

**Wave:** 6  
**Depends on:** T01, T02, T03, T04, T05, T06, T07, T08  
**Files Touched:** create `tests/integration.test.mjs`, `eval/cases.json`, `docs/acceptance.md`, `README.md`.

**Contracts and acceptance criteria:** Add a deterministic fresh-process replay using the built helper in isolated package copies. Flow: initialize a concise fixture course → publish core material → record an actual fixture Q&A → report reading complete → prepare/present a diagnostic question → retain unanswered state → resume in another process/package → record explicit answer → grade → record assistance → perform a fresh independent check → snapshot learner-authored fixture file → grade submitted evidence → resume → skip an optional item/close accurately. All simulated personas and responses are labeled test fixtures; no fictitious real learner activity or proof of educational outcomes.

`eval/cases.json` defines bounded manual/model-driven cases with scenario ID, requirement IDs, initial learner context/material, exact starting prompt, learner actions, forbidden shortcuts, required observed evidence, and outcome fields (`not_run|pass|fail|blocked`). Cases include short-topic/no-padding, broad-topic splitting, reasoning/distractor quality, explanation-led Q&A notes, no automatic pass from read-complete, restricted-tool/headless fallback, timeout/late answer, assistance→fresh check, preserved coding submission, missing runtime lab evidence, failed persistence, and cross-harness resume. Inspect generated questions/materials and real tool events; never accept an evaluator's PASS prose alone. Default evidence is not_run, not prefilled success.

`docs/acceptance.md` records exact commands/surfaces/versions, artifact hashes/revisions, prompts/responses, tool events/denials, observed results, and limitations. Distinguish deterministic replay, source/native structural validation, installed skill loading, interactive widget behavior, and actual model teaching quality. Include the installation and fresh-chat sequence below. README explains Node requirement, build, native installation, conversational create/resume/quiz/submit, course folder selection, honest reading-time estimates, learner-owned files, record/notes recovery, and current compatibility evidence. No complete DevOps syllabus or paid infrastructure setup.

**Risks:** Passing simulated state replay without testing real tutor behavior, or claiming live success from a headless exit code. Keep actual unrun scenarios visible. Do not write a new model API/evaluation service or automation framework to hide a manual surface limitation.

**Task checks:** Write failing end-to-end cases first, then red→green `node --test tests/integration.test.mjs`. Run the explicit helper from copied packages with the source checkout excluded. Verify all scenario IDs map to R01–R16, all evidence statuses start not_run, and the guide contains actionable expected observations. Live acceptance is performed/reported by the final verifier after reviewer approval; documentation alone does not satisfy it.

## Bounded installed-surface acceptance

These checks are part of final verification where the environment supports them. They are not permission requests now, and no installation occurs in the planning chat. During authorized execution, act only on this plugin's distinct native registration; preserve unrelated plugin/settings state. Record what the native tools actually changed. If the execution environment requires permission/reload/user interaction, report the specific pending action and actual evidence instead of marking it passed.

1. Record `node --version`, `codex --version`, `agy --version`; run automated checks below first. If a CLI is not on PATH, use the discovered executable through a structured argument invocation. Do not hardcode the current versioned Codex binary directory into delivered resources.
2. Run `agy plugin validate dist/antigravity --strict --json`. Inspect actual diagnostics and exit status. Install the generated package through `agy plugin install dist/antigravity` only in authorized execution, inspect its reported load/installation state, and start a fresh interactive Antigravity session using its normal installed interface. Do not invent plugin-launch flags when they have not been verified.
3. For Codex, run `codex plugin marketplace add .` from the implementation root, then `codex plugin add learning-skill@learning-skill-local --json`. Inspect registration/install output; if the installed desktop surface requires normal Plugins Directory activation or reload, follow that actual flow and record the requirement. Do not edit unrelated personal marketplace/config files or claim registration means the skill loaded.
4. In each supported interactive surface, invoke LearningSkill in a fresh chat with: “Create a concise course on container image layers for someone who knows basic Linux. Keep it focused; include a diagnostic quiz and a small learner-authored Dockerfile assignment. Save it in the workspace courses folder.” Confirm the actual loaded skill/helper path is inside the installed package, core reading was saved, estimates are separate, and no material was padded toward two hours.
5. Ask a real follow-up question about a generated lesson, report its reading complete, and request its quiz. Inspect the generated question for reasoning, plausible choices, answer leakage, and alignment. Actually submit a response through the available native card; record delivered-versus-answered events and the saved IDs. Where native neutral cards cannot be used, observe the honest fallback and report native-widget capability separately.
6. Give a small learner/test-operator-authored answer file. Hash it before/after grading, inspect saved snapshot/rubric/grade, and show that unrun build/runtime checks are not labeled observed. A Docker/cluster run is optional for fixture evaluation; if a course assigns it and it cannot run, keep its essential runtime outcome pending rather than claiming a completed practical check.
7. Leave a saved quiz unanswered or a submission ungraded, open the same course in a fresh chat of the other harness, and confirm the exact question/options or submitted artifact/next action resumes. Repeat in the reverse direction for a graded state with notes and assistance conditions. Reinstall/rebuild only this plugin and confirm the external course hashes remain unchanged.
8. Run the bounded short-topic, broad-topic, wrong-answer/help/fresh-check, and restricted-tool cases from `eval/cases.json`. For a headless-only surface, test pending/file-answer behavior and report interactive widgets not tested. Never pass widget acceptance based on print/stream-json behavior alone.
9. If Node 22 is already available, run the same automated suite/build/validator with that runtime in an explicitly isolated invocation and record its actual version. Otherwise report minimum-version compatibility not run; README's tested-runtime matrix names Node 26.3.0/current tested versions only, while distinguishing the intended minimum.

## Requirement-to-task map

| Spec requirement | Implementation coverage | Evidence coverage |
| --- | --- | --- |
| R01 concise personalized courses | T03, T05 | T09 short/broad topic cases. |
| R02 written sourced reading before teaching | T03, T05 | Publication tests, T09 actual material review. |
| R03 real Q&A/classnotes | T05, T06 | Notes tests, fresh-session T09 case. |
| R04 reading separate from assessment | T01, T04, T05 | Reducer/service/integration tests and actual read-complete case. |
| R05 fair reasoning quizzes | T03, T07 | T09 question inspection; static rules alone insufficient. |
| R06 native/fallback behavior | T06, T07 | T09 actual interactive/restricted/headless evidence. |
| R07 correct answer correlation | T01, T04, T06, T07 | Timeout/stale/cancel/default tests and actual native responses. |
| R08 learner-owned assignments | T03, T04 | Snapshot/hash tests and live submission case. |
| R09 fixed evidence-based grades | T01, T04 | Rubric/score/regrade/error tests and actual feedback inspection. |
| R10 assisted versus independent | T01, T03, T04 | State/service tests and fresh comparable challenge case. |
| R11 cross-session/harness resume | T05, T06, T07 | Integration replay plus actual bidirectional installed-surface resume. |
| R12 recoverable validated writes | T01, T02, T05, T06 | Fault/concurrency/path/notes/idempotency tests. |
| R13 honest practical evidence | T01, T03, T04, T07 | Not-run provenance tests and unavailable-prerequisite case. |
| R14 isolated native packages | T07, T08 | Isolated imports/helpers, native validation, actual loading. |
| R15 preserve data/config | T02, T08 | Sentinels/rebuild tests and plugin-update course hashes. |
| R16 learner controls completion | T01, T03, T05 | Retry/skip/close integration and tutor behavior cases. |

## Final independent verification and completion claims

After all task checks and independent review/fixes are approved, the verifier runs from `D:/Code/LearningSkill`:

```text
node --version
npm test -- --test-concurrency=1
npm run build
npm run validate
agy plugin validate dist/antigravity --strict --json
```

Inspect the real generated packages and run applicable installed-surface/behavioral cases above. Do not add a nonexistent linter, typechecker, CI gate, or build framework. Node's built-in test runner is the runner introduced by T01, and build/validate are scripts introduced by T08; before those tasks exist these commands are not claimed available. Reuse unchanged matching post-review verification evidence rather than rerunning full suites without a reason.

Report separate verdicts for code review, automated checks, native structural validation, installation/loading, interactive assessment quality, and bidirectional resume. Missing permissions, unavailable tools, minimum-runtime coverage, or required user reload are explicit not-run/blocked acceptance items. A READY plan, successful process exit, structural validator, test transcript, or evaluator prose is not verified end-to-end delivery.

If automated checks pass but required live cases cannot be performed, report implementation/automated verification with **native acceptance pending**; do not call the entire approved learning experience verified complete. Fix verifier findings through implementers and reviewer approval before rerunning affected verification. Only the orchestrator reports integration/commits, and only commits if authorized. No pushes/merges/branch deletion.

## Planning handoff

The planner may change this document to resolve critic findings but does not implement any task. After the registered plan-critic returns READY with no unresolved findings, update this plan's review status and present its path plus the approved spec for manual handoff to `$coding-team:team-run`. Do not auto-start execution or add another plan-approval question.

Review record: the registered plan-critic returned READY with no blocking findings on the complete plan, then returned READY with no new/unresolved findings on the targeted T08 marketplace clarification. This is planning review evidence only; no implementation, installation, automated application tests, or live acceptance has been performed.
