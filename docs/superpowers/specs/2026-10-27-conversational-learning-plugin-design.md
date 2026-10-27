# LearningSkill: conversational learning plugin

Date: 27 October 2026  
Status: approved by the user on 27 October 2026; implementation planning authorized  
Workspace: `D:/Code/LearningSkill`  
Prior proposal: `DESIGN.md` (research background; this spec governs implementation after approval)

## 1. Goal

Provide a conversational tutor inside Codex and Antigravity. A learner describes what they want to learn and their current experience; the tutor prepares a focused course, guides lessons, answers questions, assesses understanding, grades learner-authored work, and checkpoints durable progress for another session or supported harness.

The host harness supplies the model and tools. The plugin supplies teaching instructions, reusable material templates, platform bindings, and reliable local record keeping. No separate model API service is required.

## 2. Decisions already approved

- Courses must be concise. Approximately two hours of reading is a suggested ceiling against sprawling output, never a required duration or word target. Shorter topics receive shorter courses. Quizzes, labs, and setup have separate estimates.
- Initial native targets are Codex and Antigravity; portable instructions and files should be usable elsewhere without claiming universal native plugin compatibility.
- Required workflow: topic/level request, course plan, written reading material divided into lessons, guided Q&A, classnotes, post-lesson quizzes, optional practical/coding assignments, grading, and fresh-session resume.
- Approved improvements: reading completion is distinct from assessed understanding; quizzes emphasize reasoning and avoid guessable choices; the tutor preserves learner ownership of assignments; independent and assisted performance remain distinguishable.
- Default course location is a `courses/` folder in the chosen workspace. An explicit course/root path is supported. Both harnesses can open the same accessible folder.
- Research and low-level delegation use Luna researcher roles. This planning workflow produces a spec first, then an implementation plan after explicit spec approval; execution remains a separate manual handoff.

The user explicitly approved a conversational-only plugin named LearningSkill. No standalone application, network listener, new public command-line interface, fixed editorial copy, or public launcher flags are introduced by this design.

## 3. Scope and success

Success means a learner can create a small course in either supported harness, read its local material, discuss it, complete a meaningful assessment or submit work, and resume with accurate notes and evidence in another chat, including across the two harnesses.

The plugin is general-purpose. DevOps is the first use case and provides practical acceptance scenarios; it is not hard-coded into the course schema. A fully authored DevOps curriculum is not part of plugin delivery.

The tutor records observed task performance, not a scientifically validated mastery score. Completion and grades must remain traceable to learner responses, submissions, and actual checks.

## 4. Architecture

### 4.1 Shared teaching core

A primary learning skill handles creation, teaching, questions, assessment, submission, review, and resume. Supporting references hold the course/lesson/assignment conventions and assessment-quality checklist. Separate skills for every conversational verb are unnecessary in v1.

The teaching policy is shared across platforms. Bindings identify the actual question, file, shell, and research tools exposed in the current session. They never invent tool names, grant permissions, or require a particular provider/model.

### 4.2 Self-contained platform packages

Maintain one canonical copy of the teaching resources and state helper in source. Packaging creates separate, self-contained Codex and Antigravity plugin trees, each with its platform metadata and bindings and its own bundled resources. Packaging validation detects missing assets, escaping relative links, and divergence from canonical resources.

Installed packages cannot depend on sibling source directories, symlinks, or the developer's `D:/Code` checkout. Course data is outside installed plugin assets and survives package updates.

Codex packaging follows supported official plugin/skills formats. Antigravity packaging follows the locally inspected native manifest/skills format. Prefer native plugin registration/install mechanisms and documentation over new custom installers or global configuration rewrites. Do not carry over coding-team agent profiles, hooks, graph integrations, or MCP configuration that this plugin does not need.

### 4.3 Small deterministic persistence helper

Use dependency-free Node.js modules and its built-in test runner. Node 22 or newer is the intended minimum; Node 26.3.0 is available locally. Compatibility with the minimum version must be checked before advertising it as tested.

The helper validates records and transitions, creates immutable evidence records, updates the progress checkpoint, and renders classnotes. It does not call a model, determine pedagogical truth, execute student code, or run labs. Its internal machine interface is invoked by the tutor through the harness shell; it is not a separate learner-facing CLI.

When the required runtime or write permission is missing, explain the specific unavailable operation and retain accurate pending/read-only behavior. Do not silently replace validated persistence with improvised writes and claim equivalent reliability.

## 5. Conversational interface

The learner uses ordinary requests: learn a topic, open/resume a course, ask about a lesson, report reading completion, request a quiz or hint, submit a file, review feedback, retry, skip, or finish. No special phrase is required.

Use an explicit path when supplied. Otherwise search the current workspace's course folder: resume the sole matching active course, or ask which course when selection is ambiguous. Do not scan unrelated personal directories. A course folder identifies one learner's run in v1; cohorts and shared student accounts are out of scope.

Use the current prompt for topic, experience, goals, and constraints. Ask only missing questions that materially change the course. Do not repeatedly reconfirm supplied details or add a mandatory questionnaire. A short diagnostic is useful when self-report does not establish prerequisites; existing learner work can substitute.

Show the compact proposed outline and assumptions. A request to create a course authorizes preparing its material; avoid an additional approval gate unless the learner asked for plan-only output or an unresolved decision genuinely blocks the course. The learner may revise the outline conversationally.

## 6. Course material and pacing

Each course states its outcome, prerequisites, included/excluded scope, lesson order, expected evidence, and separate reading/practice/setup estimates. Each lesson states what the learner should be able to explain or do, then supplies a coherent explanation, useful examples, common mistakes, recap, sources, and next action.

Write the core reading for the selected course into linked Markdown files before beginning the guided lesson sequence. Keep optional depth separate. Preserve the outline and existing material rather than regenerating the entire course after every interaction. Revise specific material as learning needs change and retain revision identifiers for existing assessments.

Use required prose word count divided by a configurable reading rate for a reading estimate. The starting English nonfiction reference is 238 words/minute; technical content, language, accessibility requirements, and learner feedback may require another rate. It is an estimate, not a timer proving understanding. Count assigned external reading and required chat explanations once; separate optional reading, code study, and command execution.

Do not pad material to reach a duration. Split a broad objective into focused follow-on courses when needed. Source current product behavior, commands, and version-sensitive claims from official documentation or inspected local versions. Record relevant lab versions and references. If current research tools are unavailable, distinguish material grounded in supplied/local sources from unverified current claims.

## 7. Teaching and adaptation

Direct the learner to a specific lesson/section, then wait for a learner response. During Q&A, explain the requested concept and save the actual question plus a useful answer summary and follow-up. Label a misconception only when the response supplies evidence for it; do not invent errors from hypothetical examples.

On a practice task, start from an unaided attempt when appropriate. Provide targeted hints, a prerequisite explanation, or a worked example on a different problem. Leave the next meaningful reasoning/action to the learner. Explicit requests for a solution may be honored, with solution exposure recorded.

After assistance, use a fresh comparable task without the key hint before describing that outcome as independent success. Do not make an unexpectedly harder or untaught task the condition for passing the original outcome. Strong evidence can justify skipping redundant teaching; uncertainty should lead to a small diagnostic rather than a fixed ability label.

The tutor must not solve, modify, or execute the graded task on behalf of the learner without an explicit request. When requested help changes the task conditions, record the assistance. Do not treat tutor-generated work as a learner submission.

## 8. Assessment contract

### 8.1 Question and rubric lifecycle

Every lesson has a post-lesson quiz unless explicitly excluded or skipped by the learner. Reporting reading completion records self-reported reading completion and offers/starts that quiz; it cannot create an assessment pass.

Before presenting an assessment, save its stable ID, course/lesson revision, objective, exact prompt, rubric, expected reasoning, point allocation, essential criteria, and any option order. Generate instances when needed so questions can address actual difficulties. Keep keys outside assigned reading and avoid disclosing solutions before an answer. Local files are an organizational boundary, not a secure exam system.

Assessment quality requires taught-content alignment, clear judgeable questions, and an appropriate mix of retrieval, explanation, prediction, diagnosis, and application. Multiple-choice items use plausible distractors, parallel wording/detail, and shuffled answer positions. Check for longest-answer cues, formatting/recommendation clues, repeated answer positions, and cross-question leakage. Require reasoning where recognition/guessing is insufficient. Quality instructions need behavioral evaluation as well as structural validation.

### 8.2 Harness question tools

Prefer the native question tool when the exposed schema can present the assessment fairly. Detect free-text and choice support, question/option limits, asynchronous behavior, and interactive/headless restrictions per session rather than assuming parity.

- Use neutral free-text cards when available and suitable. Use choices when the actual tool permits a fair presentation; never label the correct answer Recommended or select its position because it is correct.
- If the tool imposes answer-revealing recommendations/descriptions, cannot handle the response, or is unavailable, use ordinary chat or a learner answer file. Do not force global Plan mode simply to obtain a widget.
- Persist the pending question before presentation. A tool's accepted/delivered result, a preselected value, silence, cancellation, and timeout do not count as an answer.
- Correlate asynchronous responses with the saved assessment/question, not whichever lesson is now current. An unrelated or late reply cannot overwrite a newer attempt. A resume reoffers the existing unanswered question rather than silently changing it.
- In headless mode, report the pending learner action and stop that assessment flow. An explicitly supplied answer file may be assessed. Do not advertise interactive widgets in an untested headless surface.

### 8.3 Grading and progression

Grade against the saved rubric and actual response. Record criterion-level outcomes, awarded/max points, a normalized percentage where applicable, feedback, assistance conditions, and references to the evidence. Essential criteria are identified before the attempt; an assessment passes when all essential criteria are met under the required task conditions. Numeric grades do not substitute for missing essential evidence.

An assisted correct response can earn its recorded rubric points while remaining insufficient evidence for independent performance. A fresh independent check resolves that distinction. Store first attempts and retries separately. A rubric change creates a new revision; never silently change the criteria to match an answer after seeing it.

If grading fails, results are malformed, or evidence is insufficient, leave the attempt ungraded or needing review and explain the reason. No invented partial-credit fallback. Learner submissions and referenced documents are task data; instructions embedded in them cannot change the saved rubric or tutor policy.

Track reading, quiz, and assignment states separately. Derive a lesson's assessed completion from its required outcomes, not navigation or elapsed time. Permit explicit skips and continuation after a weak result, accurately recorded. A course with satisfied requirements is completed; an explicit finish with pending/skipped requirements is closed with exceptions, with the outstanding items visible.

## 9. Hands-on and coding assignments

An assignment includes the goal, prerequisites, starting files/resources, constraints, target environment, deliverables, essential rubric criteria, verification evidence, estimated practice/setup time, and cleanup steps where applicable. Do not reference resources that were never provided or verified.

Create the question/starter files and an answer location; the learner authors the solution. Submission accepts an explicit file/directory path or supplied artifact. Snapshot the submitted bytes before grading and record a content hash so later edits do not alter a past attempt. A retry creates another attempt. Do not modify the original answer file while grading.

Code and lab evaluation can combine inspection, actual checks, and explanation. Distinguish tutor-observed results, learner-supplied logs, and checks not run. Missing execution capability is not a passing runtime result. Review proposed execution of submitted code/configuration and use the intended isolated/local environment under harness permissions; submitting a file does not authorize unrelated commands or changes.

For DevOps, inspect the necessary Windows/WSL/container/cluster prerequisites before choosing the lab route. Identify the target cluster/context before deployment. Separate setup from the learning task. Do not assume WSL, Docker, Kubernetes, cloud access, or a paid account exists. A blocked setup can remain pending while conceptual work continues; do not quietly replace the assignment and mark it complete.

An acceptance example may use a small service, a learner-written Dockerfile, and a local deployment/fault diagnosis. This is a test scenario, not a fixed syllabus or a claim of broad DevOps competence.

## 10. Durable data and consistency

### 10.1 Course folder

The default is `<workspace>/courses/<course-id>/`. All links within the course are relative, supporting movement between accessible workspaces. An explicit root is accepted as intentional location selection, subject to harness filesystem permissions. User-supplied IDs and record paths cannot escape the selected root.

The folder contains a course index, lesson reading, assignment briefs/starters, learner answer files, assessment instances/keys, immutable records/submission snapshots, classnotes, and an authoritative progress checkpoint. No global database or hidden chat memory is required.

The progress checkpoint contains a schema version, course and content revisions, relevant learner context, reading/assessment/assignment states, pending-question identifiers, record references, unresolved topics, and the next action. Detailed Q&A, responses, grades, and evidence live in referenced records, keeping the resume checkpoint concise.

### 10.2 Checkpoint semantics

The helper owns state validation and writes; the model supplies semantic content and grades. Validate IDs, supported schema versions, point totals, references, state transitions, and required evidence. Reject malformed state or unsupported future schema versions without destructive repair.

Use a brief per-course exclusive mutation lock and an expected revision to detect concurrent/stale writers. Do not merge conflicting tutor sessions automatically or steal an unknown stale lock on a timer. Conflicts leave existing state intact and require reload or explicit recovery after the owner is verified inactive.

Write new immutable records/snapshots before committing a same-directory temporary replacement of the progress checkpoint. The checkpoint is the commit point; only referenced records are committed course history. A failure before replacement leaves the prior checkpoint usable; an unreferenced orphan is not a completed attempt. Retry with the same operation ID is idempotent; reusing that ID with different content is a conflict. Do not claim power-loss durability beyond the tested filesystem guarantees.

Classnotes are a readable projection of committed questions, useful explanations, attempts, grade summaries, help used, and follow-ups, linked to their evidence IDs. Regenerate the projection when needed. Distinguish a committed progress checkpoint from a failed/stale notes render. Preserve unexpected hand edits rather than blindly overwriting them; surface a reconciliation conflict.

Checkpoint after meaningful Q&A, question presentation, an answer/submission, grading, a skip, and a transition. If a write is denied/fails, report that the affected checkpoint was not saved. A new chat must not infer that an unrecorded exchange occurred.

### 10.3 Resume

Read the checkpoint, confirm supported schema and referenced evidence, and load only relevant notes/current material. Present the next action and any unresolved conflict. A pending unanswered quiz stays pending; a submitted ungraded attempt resumes grading rather than asking for a new answer.

An upgraded plugin must recognize the existing supported schema or report incompatibility without mutation. v1 does not promise migration from unknown older/future formats. Moving between harnesses changes tool bindings, not the course/attempt format or rubric.

## 11. Error handling and trust boundaries

| Condition | Required behavior |
| --- | --- |
| No native question tool / unsuitable schema | Fair chat or answer-file fallback; retain saved pending question. |
| Runtime unavailable / permission denied | Explain unavailable operation; do not claim durable progress was saved. |
| Corrupt checkpoint / missing referenced record | Preserve files, identify inconsistency, avoid invented state or destructive reset. |
| Stale revision / writer lock | Refuse conflicting mutation; reload or recover explicitly. |
| Unsupported schema | Open read-only where interpretable; no automatic rewrite. |
| Grader failure / invalid scores | Remain ungraded/needs review; preserve response and rubric. |
| Missing lab prerequisite / check cannot run | Keep actual evidence status and pending work; offer feasible next actions. |
| Submission changed after grading | Grade remains tied to its immutable snapshot; offer a new attempt. |
| Interrupted checkpoint / notes render | Resume from committed checkpoint; reconcile/render derived views. |
| Traversal or escaping symlink/reparse destination | Reject writes outside the selected course root; do not follow an escaping write destination. |

## 12. Requirements and acceptance evidence

These are behavior requirements for later implementation planning, not a task decomposition.

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| R01 | Topic, experience, and outcome shape a concise course. | Short-topic and broad-topic behavioral cases show no padding and coherent scope splitting. |
| R02 | Written lessons and sources precede guided teaching. | Generated course has complete core links/content, version assumptions, optional-depth separation, and estimates. |
| R03 | Real Q&A becomes useful classnotes. | Recorded question/explanation/follow-up survives a new chat without fabricated learner errors. |
| R04 | Reading completion is distinct from assessment. | Completion report leaves required quiz pending and cannot create a pass. |
| R05 | Post-lesson questions test reasoning fairly. | Reviewed quiz cases include diagnosis/application and no answer-length/position/recommendation/cross-question clues. |
| R06 | Native question integration degrades honestly. | Actual supported interactive tools are exercised; unavailable/restricted/headless cases preserve fair pending behavior. |
| R07 | Answers belong to the correct saved question. | Pending/late/cancelled/default-value/restart cases cannot fabricate or misattribute responses. |
| R08 | Assignments preserve learner ownership. | Starter files, learner answer, immutable submission snapshot, and rubric feedback are distinct; original hash remains unchanged. |
| R09 | Grades reference actual fixed criteria and evidence. | Point/criterion checks, malformed grading, retries, and changed-rubric cases preserve traceability and ungraded failures. |
| R10 | Help and independent performance are distinct. | Hinted success followed by a fresh check retains both attempts and their help conditions after resume. |
| R11 | Progress is portable across chats/harnesses. | One course resumes at the correct pending/graded stage in Codex and Antigravity using the same files. |
| R12 | Writes are validated, recoverable, and conflict-aware. | Real temporary-directory tests cover failures, idempotency, stale revisions, locks, invalid schema, escaping paths, and stale projections. |
| R13 | Practical evidence is honest and environment-aware. | DevOps/coding cases distinguish supplied logs, executed checks, missing prerequisites, and unrun checks. |
| R14 | Packages work without the source checkout. | Isolated package validation resolves all resources; both native manifests validate and installed sessions load the intended skill/helper. |
| R15 | Existing learner/configuration data is preserved. | Update/package tests retain course data and unrelated settings; no unnecessary global config/hooks are changed. |
| R16 | Learner controls continuation and closing. | Retry, skip, continue, and close-with-exceptions cases retain accurate outstanding work and first-attempt history. |

Automated filesystem/structural tests establish persistence and package contracts. They do not establish teaching quality. Model-driven behavioral evaluation must inspect actual content and tool events, not merely a model's PASS label. Live installation, interactive assessment, and cross-harness resume need separately recorded commands/surfaces/versions and observed outcomes; missing access is reported as not run.

The execution workflow remains implementation waves, independent code review and fixes until approved, then final independent verification. This spec adds no per-wave verifier or extra execution-approval gate.

## 13. Engineering defaults

- Node standard library, plain modules, built-in tests, JSON records, Markdown material; no runtime package dependency is required by the design.
- Canonical shared resources with generated self-contained platform packages and parity validation.
- One learner/course folder; exclusive short mutations plus optimistic revision checks rather than multi-writer collaboration.
- Local records and derived notes; no server, global progress store, or background monitoring.
- Use native harness installation flows; do not introduce custom launchers, model profiles, or unrelated configuration edits.
- Use generated fixtures and real temporary directories for deterministic verification, plus bounded live behavioral cases for tutor quality.

## 14. Explicitly out of scope

Hosted LMS, web/mobile interface, avatars/voice/video/slides, multi-agent simulated classrooms, cloud sync, cohort management, proctored exams, secure hidden answer keys, automatic background surveillance, unsolicited scheduled reminders, paid-cloud labs, broad DevOps mastery certification, automatic lab provisioning, and native integrations for every possible harness.

There is no implementation, package installation, Git initialization, commit, or application-code change in this planning phase.

## 15. Grounding and remaining verification boundaries

- Workspace baseline: only `DESIGN.md` exists initially; no Git repository, application manifests, build/test scripts, or CI. Graph preflight reports that the workspace is not an indexed project. Source research confirms the empty implementation baseline; graph absence is not evidence about runtime capabilities.
- Local tooling: Node 26.3.0 and npm 11.16.0 were observed; Python availability was not confirmed. Do not inherit the coding-team plugin's Python/PowerShell validator requirements unnecessarily.
- Existing package precedent: `D:/Code/antigravity-coding-team/codex/.codex-plugin/plugin.json`, `codex/skills/team-plan/SKILL.md:6`, and `codex/scripts/validate.py:33-41` demonstrate bundled relative resources and cache parity checks. `antigravity/install.ps1:57-76` demonstrates native validation/installation of an Antigravity package. Existing install scripts are references, not code to copy wholesale.
- Teaching grounding: OpenMAIC's `skills/agent-runtime/understanding-by-design/SKILL.md`, `zone-of-proximal-development/SKILL.md`, and PBL learner-state code support outcomes/evidence, targeted assistance, and separating design from learner state. Its own `eval/zone-of-proximal-development/LOCAL_VALIDATION.md` limits educational conclusions. No efficacy guarantee is inferred.
- [OpenAI skills documentation](https://developers.openai.com/plugins/concepts/skills) confirms instruction/resource skills can work without MCP. [Current packaging documentation](https://developers.openai.com/plugins/build/plugins) describes portable manifests and compatibility layouts; installed-surface behavior still needs acceptance checks.
- [Brysbaert's reading-rate review](https://biblio.ugent.be/publication/8647789) supplies the English nonfiction estimate, not a guaranteed technical-study pace.
- The prior chat demonstrated a real asynchronous native question response in Codex Default mode. This does not prove every Codex surface or Antigravity mode has the same capability. No live Antigravity tutoring, minimum-Node-version test, installation, model-driven quiz-quality evaluation, or cross-harness resume has been performed.

After approval of this full design, the planner writes the implementation plan and runs the plan-critic loop. A READY plan is then handed back for the user's manual team-run handoff.
