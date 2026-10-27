# LearningSkill local protocol v1

This document is the normative contract for the internal helper and its consumers. It describes persisted data and deterministic model behavior; it does not define a public learner CLI. JSON objects are UTF-8, schema version `1`, and reject unknown future schema versions without rewriting them.

## Course files and authority

A course root contains `course.md`, `lessons/`, `assignments/`, `answers/`, `assessments/`, `records/`, `submissions/`, `classnotes.md`, and `state.json`. Course material and answer keys are separate. `state.json` is authoritative: a file not referenced by its record/snapshot indexes is an orphan, not history. All stored paths are relative to the selected course root and use `/` separators. IDs match `[A-Za-z0-9_-]{1,128}`; reject separators, dot segments, drive syntax, and control characters.

`state.json` has these required top-level fields:

```json
{
  "schemaVersion": 1, "courseId": "course-id", "revision": 0,
  "contentRevision": 1, "phase": "draft", "learnerContext": {},
  "goal": "...", "prerequisites": [], "readingRateWpm": 238,
  "lessons": [], "reading": {}, "assessments": {}, "assignments": {},
  "pendingQuestion": null, "attempts": {}, "recordRefs": [], "operationFingerprints": {},
  "unresolvedTopics": [], "nextAction": "...", "notesProjection": null
}
```

Each lesson definition has a unique `lessonId`, `outcomeIds`, and its required-work declarations. `reading[lessonId]` is `not_started|in_progress|reported_complete|skipped`. Assessment and assignment index values are either a status or an object with `state` plus the fixed assessment fields. Work states are `not_required|pending|in_progress|submitted|ungraded|needs_review|passed|skipped`. An assessment fixes `assessmentId`, `contentRevision`, `rubricRevision`, objective/prompt/question definitions, a private key path, and a nonempty criterion set before presentation. Each criterion has unique `criterionId`, positive finite `maxPoints`, boolean `essential`, and boolean `independenceRequired`. A zero-criterion assessment is invalid. Choice options, when used, have stable IDs and stored order; answer keys/expected answers are private material and never part of learner-safe views.

`pendingQuestion` includes `assessmentId`, `questionId`, `attemptId`, and `presentationToken`. `attempts` is keyed by attempt ID and retains its assessment/rubric revision, presented question/token, actual answer or immutable submission reference, assistance label, evidence provenance, and attempt state. A grade must resolve to an attempt in this index with an actual saved response or submission and matching evidence; a boolean in the grade payload cannot assert that an answer happened. `recordRefs` entries are `{recordId,path,sha256}`. They are detached metadata: the SHA-256 is over the canonical serialized immutable record bytes, while `path` locates those bytes. The digest is not embedded in those bytes. The persistence layer computes/appends the reference after serializing the record and after `reduceState`; the pure reducer MUST NOT invent paths or hashes. `operationFingerprints` maps operation IDs to normalized semantic-input fingerprints. `notesProjection` is null or `{revision,sha256}` for the last successfully rendered committed revision; it is a nonauthoritative receipt and cannot award progress.

## Record envelope and variants

Every immutable record has `{schemaVersion:1,recordId,operationId,kind,timestamp,courseId,revision,contentRevision,fingerprint,payload}`. `recordId` and `operationId` are safe IDs, timestamp is an ISO-compatible timestamp, revisions are positive integers, and payload is a typed object. Record IDs and operation IDs cannot be reused for different content. A committed state references records; retries of an operation with the same fingerprint resolve to its original result, while changed content conflicts.

Supported kinds and required payload fields:

| Kind | Payload contract |
| --- | --- |
| `course_initialized` | `initialState`; may be the first record only. Optional `nextAction`. |
| `course_published` | Published-material `manifest` and validated course material references. |
| `course_revised` | strictly increasing `contentRevision`; changed material identifiers and optional `nextAction`. Existing attempts retain their old content/rubric revision. |
| `qa_recorded` | actual learner `question`, useful `answerSummary`, optional `followUp` and lesson ID. |
| `progress_recorded` | known `lessonId`, reading state, optional next action. Reading completion alone never passes assessed work. |
| `assessment_prepared` | stable `assessmentId`, objective, fixed content/rubric revision, exact question definitions and criteria. |
| `question_presented` | saved `assessmentId`, `questionId`, `attemptId`, `presentationToken`, exact prompt/options, and private key reference. |
| `answer_recorded` | matching assessment/question/presentation token and explicit nonempty learner response. |
| `assistance_recorded` | attempt/question IDs, assistance `none|hint|worked_example|solution_shown|tutor_performed|unknown`, and summary. |
| `submission_recorded` | assignment/attempt IDs, immutable submission snapshot path/hash, and evidence provenance. |
| `attempt_graded` | assessment/attempt IDs, saved rubric revision, assistance matching the saved attempt, one criterion result each with points, independence claim, nonempty feedback, and evidence references; overall nonempty feedback is required. Submission attempts also require the exact saved `snapshotPath` and `snapshotSha256`. Evidence IDs, provenance, and snapshot identity must exactly match the attempt's saved evidence. The saved attempt is proof of the answer/submission; payload booleans are not. |
| `attempt_retried` | assessment ID, new attempt ID, and optional prior attempt ID. Prior attempts remain immutable. |
| `item_skipped` | `itemType` (`assessment|assignment|lesson`), item ID, and learner-facing reason. |
| `unresolved_topic_updated` | complete `topics` array of outstanding requirements. |
| `course_closed` | `phase:completed` only when every required work item passed/not-required and nothing unresolved; otherwise `phase:closed_with_exceptions` plus nonempty enumerated unresolved items. |

Every record is checked for its envelope, known kind, typed payload, and references. Narrative text cannot substitute for an answer, typed criterion result, evidence pointer, or submission snapshot. Unknown kinds and unsupported versions fail closed.

## Mutation and read envelopes

Mutations carry `operationId` and nonnegative integer `expectedRevision`; reads do not. Internal helper requests use `{protocolVersion:1,op,workspaceRoot,courseRoot?,courseId?,operationId?,expectedRevision?,payload?}`. `op` is one of `course.discover`, `course.init`, `course.publish`, `course.resume`, `qa.record`, `progress.record`, `assessment.prepare`, `question.present`, `answer.record`, `assistance.record`, `submission.record`, `attempt.grade`, `notes.render`, or `lock.recover`. Each operation validates its required payload rather than interpreting arbitrary keys as an event. Unknown operations are rejected.

Reads return `{ok:true,state,nextAction,pendingQuestion}` where `pendingQuestion` is a learner-safe view with no answer key. Mutations return `{ok:true,committed,revision,records,notesStatus?}`. A post-commit notes-render failure still reports `committed:true` and the notes problem separately. Failures return `{ok:false,error:{code,message,details?}}` and a nonzero process result. Stable error codes include `INVALID_INPUT`, `UNSUPPORTED_SCHEMA`, `CONFLICT`, `LOCKED`, `CORRUPT_STATE`, `PATH_ESCAPE`, `STALE_QUESTION`, `INVALID_GRADE`, `NOT_READY`, and `IO_ERROR`.

## State transitions

`reduceState(state, records)` is synchronous and pure. It accepts `null` only when the first and only state-creating record is `course_initialized` with a valid `initialState`; all subsequent records apply in order. It validates the starting state and every record, rejects duplicate record IDs, preserves history/fingerprints, and does not mutate its inputs. Persistence validates and commits record bytes and their detached refs around this reduction.

- `draft` becomes `active` only through publication after material manifest validation. `active` remains active through questions, reading, grading, retry, skips, and course revisions.
- Reading progresses among the four reading states. `reported_complete` is self-report only; it cannot set an assessment to `passed` or fabricate an answer.
- Assessment preparation fixes a nonempty rubric/revision. Presentation saves the pending question/token before tool display. The same unanswered question may be reoffered with the exact saved prompt/options and a fresh token; it cannot replace another pending question. A matching explicit answer consumes that pending question. Missing, defaulted, cancelled, stale, or duplicate replies do not count.
- Assessment work progresses `pending → in_progress → submitted/ungraded/needs_review → passed`; explicit skip records `skipped`. Presentation creates a saved attempt before the question is shown. A matching answer record saves the learner's actual nonempty response and a `learner_supplied` evidence reference before clearing the pending question. A retry creates a new attempt and retains old attempt/grade history. A rubric change creates a new rubric revision; an existing attempt's rubric is immutable.
- Assistance records cannot reset or downgrade already exposed help. Assistance may earn points, but assisted essential work cannot be called independent. Independent success after help requires a distinct fresh comparable attempt. `tutor_observed`, `learner_supplied`, and `not_run` provenance remain distinct.
- An explicit lesson skip sets that lesson's reading state to `skipped` and remains visible as an exception for course completion.
- Course completion is derived from required work and evidence. An explicit finish with outstanding/skipped requirements is `closed_with_exceptions` and must enumerate them. `completed` cannot contain unresolved or unfinished required work.
- Content revisions increment monotonically. Existing records keep their content revision; a material edit cannot rewrite prior evidence.

## Grade derivation

A grade names the saved `assessmentId`, `attemptId`, and exact `rubricRevision`; it requires an explicit recorded answer or immutable submission and an evidence reference for every criterion. Results contain exactly one unique entry for each fixed criterion. `points` is finite and in `[0,maxPoints]`; `evidenceRefs` resolve to evidence with provenance `tutor_observed` or `learner_supplied`. Criterion status is derived as `unmet` for zero, `partial` between zero and max, or `met` at max. Total points, maximum, and percentage are derived from the rubric; caller-supplied aggregate values are ignored/rejected. Passing requires every essential criterion met and, where required, independent evidence. A malformed grade is not assigned a default score: the attempt remains ungraded or needing review. Regrades append history rather than overwrite earlier results.

The helper checks structure and traceability, not pedagogical truth, authorship, or whether an observation is scientifically sufficient. Submission bytes are snapshotted and hashed before grading; the original learner file is never changed or executed by the helper.
