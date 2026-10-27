import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveProgress, reduceState, validateMutation, validateRecord, validateState } from '../src/model.mjs';
import { expectCode, record, state } from './helpers.mjs';

test('state and typed record envelopes reject unsupported versions and malformed references', () => {
  expectCode(() => validateState(state({ schemaVersion: 2 })), 'UNSUPPORTED_SCHEMA');
  expectCode(() => validateRecord(record('grade', { attemptId: 'missing' })), 'CORRUPT_STATE');
  expectCode(() => validateState(state({ recordRefs: [{ recordId: 'r', path: '../escape', sha256: 'x' }] })), 'CORRUPT_STATE');
  expectCode(() => validateState(state({ lessons: [{ lessonId: 'l' }, { lessonId: 'l' }] })), 'CORRUPT_STATE');
});

test('mutation contract requires safe ID and expected revision', () => {
  expectCode(() => validateMutation({ operationId: '../bad', expectedRevision: 0 }), 'INVALID_INPUT');
  expectCode(() => validateMutation({ operationId: 'ok', expectedRevision: -1 }), 'INVALID_INPUT');
  assert.deepEqual(validateMutation({ operationId: 'op-1', expectedRevision: 0 }), { operationId: 'op-1', expectedRevision: 0 });
});

test('reading completion cannot pass an assessment and fabricated unanswered grading is rejected', () => {
  expectCode(() => reduceState(state({ phase: 'active', reading: { l1: 'reported_complete' }, assessments: { a1: 'passed' } }), [record('progress_recorded', { lessonId: 'l1', reading: 'reported_complete' })]), 'INVALID_INPUT');
  expectCode(() => reduceState(state({ phase: 'active', lessons: [{ lessonId: 'l1', outcomeIds: ['outcome-1'] }], pendingQuestion: { questionId: 'q1', assessmentId: 'a1', attemptId: 'a1t1', presentationToken: 'token1' }, assessments: { a1: { state: 'ungraded', outcomeIds: ['outcome-1'], rubricRevision: 1, criteria: [{ criterionId: 'c1', maxPoints: 1, essential: true, independenceRequired: true }] } } }), [record('attempt_graded', { assessmentId: 'a1', rubricRevision: 1, questionId: 'q1', attemptId: 'a1t1', answered: true, criteria: [], evidence: [] })]), 'INVALID_INPUT');
});

test('grade validation fixes criterion set, bounds points, requires evidence and independence', () => {
  const assessment = { assessmentId: 'a1', rubricRevision: 1, criteria: [{ criterionId: 'c1', maxPoints: 2, essential: true, independenceRequired: true }], questions: [{ questionId: 'q1', prompt: 'Explain.', type: 'free_text' }] };
  const base = state({ phase: 'active', lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], assessments: { a1: { state: 'ungraded', outcomeIds: ['outcome-1'], rubricRevision: 1, criteria: assessment.criteria, questions: assessment.questions } } });
  const prep = (attemptId, assistance = 'none') => {
    const records = [
      record('question_presented', { assessmentId: 'a1', questionId: 'q1', prompt: 'Explain.', attemptId, presentationToken: `token-${attemptId}` }, { revision: 1, recordId: `present-${attemptId}` }),
      record('answer_recorded', { assessmentId: 'a1', questionId: 'q1', attemptId, presentationToken: `token-${attemptId}`, response: 'learner answer', evidenceId: `ev-${attemptId}` }, { revision: 2, recordId: `answer-${attemptId}` }),
    ];
    if (assistance !== 'none') records.push(record('assistance_recorded', { attemptId, assistance }, { revision: 3, recordId: `assist-${attemptId}` }));
    return reduceState(base, records);
  };
  const completeGrade = (attemptId, overrides = {}, revision = 3) => record('attempt_graded', { assessmentId: 'a1', attemptId, rubricRevision: 1, assistance: 'none', feedback: 'Good reasoning.', evidence: [{ evidenceId: `ev-${attemptId}`, provenance: 'learner_supplied' }], criteria: [{ criterionId: 'c1', points: 2, feedback: 'Criterion met.', evidenceRefs: [`ev-${attemptId}`], independent: true }], ...overrides }, { recordId: `grade-${attemptId}`, revision });
  const answered = prep('try-1');
  expectCode(() => reduceState(answered, [completeGrade('try-1', { rubricRevision: 2 })]), 'INVALID_GRADE');
  expectCode(() => reduceState(answered, [completeGrade('try-1', { criteria: [{ criterionId: 'c1', points: 3, feedback: 'Over max.', evidenceRefs: ['ev-try-1'], independent: true }] })]), 'INVALID_GRADE');
  expectCode(() => reduceState(answered, [completeGrade('try-1', { criteria: [{ criterionId: 'other', points: 2, feedback: 'Wrong ID.', evidenceRefs: ['ev-try-1'], independent: true }] })]), 'INVALID_GRADE');
  expectCode(() => reduceState(answered, [completeGrade('try-1', { criteria: [{ criterionId: 'c1', points: 2, feedback: 'No evidence.', evidenceRefs: [], independent: true }] })]), 'INVALID_GRADE');
  const next = reduceState(answered, [completeGrade('try-1')]);
  assert.equal(next.assessments.a1.state, 'passed');
  const assistedBase = prep('try-assisted', 'hint');
  expectCode(() => reduceState(assistedBase, [completeGrade('try-assisted', { assistance: 'hint', criteria: [{ criterionId: 'c1', points: 1, feedback: 'Partial.', evidenceRefs: ['ev-try-assisted'], independent: true }] }, 4)]), 'INVALID_GRADE');
  const assisted = reduceState(assistedBase, [completeGrade('try-assisted', { assistance: 'hint', criteria: [{ criterionId: 'c1', points: 2, feedback: 'Assisted.', evidenceRefs: ['ev-try-assisted'], independent: false }] }, 4)]);
  assert.equal(assisted.assessments.a1.state, 'needs_review');
  const freshAttempt = record('question_presented', { assessmentId: 'a1', questionId: 'q1', prompt: 'Explain.', attemptId: 'try-fresh', presentationToken: 'token-fresh' }, { revision: 5, recordId: 'present-fresh' });
  const freshAnswer = record('answer_recorded', { assessmentId: 'a1', questionId: 'q1', attemptId: 'try-fresh', presentationToken: 'token-fresh', response: 'fresh answer', evidenceId: 'ev-try-fresh' }, { revision: 6, recordId: 'answer-fresh' });
  const withFreshAnswer = reduceState(assisted, [freshAttempt, freshAnswer]);
  const fresh = reduceState(withFreshAnswer, [completeGrade('try-fresh', {}, 7)]);
  assert.equal(fresh.assessments.a1.state, 'passed');
});

test('rubric mutation, duplicate records, invalid close and completion are rejected', () => {
  const s = state({ phase: 'active', lessons: [{ lessonId: 'l', outcomeIds: ['o'] }], assessments: { a: { state: 'ungraded', outcomeIds: ['o'], rubricRevision: 1, criteria: [{ criterionId: 'c', maxPoints: 1, essential: true, independenceRequired: true }] } } });
  expectCode(() => reduceState(s, [record('assessment_prepared', { assessmentId: 'a', rubricRevision: 1, criteria: [{ criterionId: 'other', maxPoints: 1, essential: true, independenceRequired: false }] })]), 'CONFLICT');
  expectCode(() => reduceState(s, [record('qa_recorded', {}, { recordId: 'same' }), record('qa_recorded', {}, { recordId: 'same', operationId: 'other' })]), 'CORRUPT_STATE');
  expectCode(() => reduceState(s, [record('course_closed', { phase: 'completed', unresolved: [] })]), 'NOT_READY');
  expectCode(() => validateState(state({ phase: 'completed', assessments: { a: 'pending' } })), 'CORRUPT_STATE');
});

test('skip, retry, close with exceptions and derived progress preserve history', () => {
  const s = state({ phase: 'active', lessons: [{ lessonId: 'l1', required: true, outcomeIds: ['o1'] }], reading: { l1: 'not_started' }, assessments: { a1: { state: 'pending', outcomeIds: ['o1'], rubricRevision: 1, criteria: [{ criterionId: 'c1', maxPoints: 1, essential: true, independenceRequired: true }] } }, unresolvedTopics: [] });
  const skipped = reduceState(s, [record('item_skipped', { itemId: 'a1', itemType: 'assessment', reason: 'learner choice' })]);
  assert.equal(skipped.assessments.a1.state, 'skipped');
  const retried = reduceState(skipped, [record('attempt_retried', { assessmentId: 'a1', attemptId: 'attempt-2', fromAttemptId: 'attempt-1' }, { revision: 2 })]);
  assert.equal(retried.assessments.a1.state, 'in_progress');
  const closed = reduceState(retried, [record('course_closed', { phase: 'closed_with_exceptions', unresolved: ['a1'] }, { revision: 3 })]);
  assert.equal(closed.phase, 'closed_with_exceptions');
  assert.deepEqual(closed.unresolvedTopics, ['a1']);
  assert.equal(deriveProgress(closed, []).phase, 'closed_with_exceptions');
});

test('null state is accepted only for course_initialized; next action and material revisions persist', () => {
  expectCode(() => reduceState(null, [record('progress_recorded', {})]), 'CORRUPT_STATE');
  const initialized = reduceState(null, [record('course_initialized', { initialState: state(), nextAction: 'read lesson 1' })]);
  assert.equal(initialized.nextAction, 'read lesson 1');
  const revised = reduceState(initialized, [record('course_revised', { contentRevision: 2, nextAction: 'read revised lesson' }, { revision: 2, contentRevision: 2 })]);
  assert.equal(revised.contentRevision, 2);
  assert.equal(revised.nextAction, 'read revised lesson');
  assert.equal(revised.recordRefs.length, 0);
});

test('unanswered question can be reoffered with a new token, but another question cannot replace it', () => {
  const original = record('question_presented', { assessmentId: 'a1', questionId: 'q1', attemptId: 'try-1', presentationToken: 'token-1', prompt: 'Explain.' });
  const pending = reduceState(state({ phase: 'active', lessons: [{ lessonId: 'l1', outcomeIds: ['outcome-1'] }], assessments: { a1: { state: 'pending', outcomeIds: ['outcome-1'], rubricRevision: 1, criteria: [{ criterionId: 'c1', maxPoints: 1, essential: true, independenceRequired: true }], questions: [{ questionId: 'q1', prompt: 'Explain.', type: 'free_text' }, { questionId: 'q2', prompt: 'Compare.', type: 'free_text' }] } } }), [original]);
  const reoffer = reduceState(pending, [record('question_presented', { assessmentId: 'a1', questionId: 'q1', attemptId: 'try-1', presentationToken: 'token-2', prompt: 'Explain.' }, { revision: 2, recordId: 'reoffer' })]);
  assert.equal(reoffer.pendingQuestion.presentationToken, 'token-2');
  assert.equal(reoffer.assessments.a1.state, 'in_progress');
  assert.equal(reoffer.attempts['try-1'].questionId, 'q1');
  expectCode(() => reduceState(pending, [record('question_presented', { assessmentId: 'a1', questionId: 'q2', attemptId: 'try-2', presentationToken: 'token-2', prompt: 'Compare.' }, { revision: 2, recordId: 'replace' })]), 'STALE_QUESTION');
});

test('routing IDs are retained only when supplied and must match on answer', () => {
  const initial = state({ phase: 'active', lessons: [{ lessonId: 'l1', outcomeIds: ['outcome-1'] }], assessments: { a1: { state: 'pending', outcomeIds: ['outcome-1'], rubricRevision: 1, criteria: [{ criterionId: 'c1', maxPoints: 1, essential: true, independenceRequired: true }], questions: [{ questionId: 'q1', prompt: 'Explain.', type: 'free_text' }] } } });
  const presented = reduceState(initial, [record('question_presented', { assessmentId: 'a1', questionId: 'q1', attemptId: 'try-1', presentationToken: 'token-1', prompt: 'Explain.', routingId: 'host-route-7' })]);
  assert.equal(presented.pendingQuestion.routingId, 'host-route-7');
  assert.equal(presented.attempts['try-1'].routingId, 'host-route-7');
  expectCode(() => reduceState(presented, [record('answer_recorded', { assessmentId: 'a1', questionId: 'q1', attemptId: 'try-1', presentationToken: 'token-1', routingId: 'wrong-route', response: 'answer', evidenceId: 'ev-1' }, { revision: 2 })]), 'STALE_QUESTION');
  const answered = reduceState(presented, [record('answer_recorded', { assessmentId: 'a1', questionId: 'q1', attemptId: 'try-1', presentationToken: 'token-1', routingId: 'host-route-7', response: 'answer', evidenceId: 'ev-1' }, { revision: 2 })]);
  assert.equal(answered.attempts['try-1'].routingId, 'host-route-7');
});

test('recorded assistance cannot be reset after help was exposed', () => {
  const initial = state({
    phase: 'active',
    lessons: [{ lessonId: 'l1', outcomeIds: ['outcome-1'] }],
    assessments: { a1: {
      state: 'pending', outcomeIds: ['outcome-1'], rubricRevision: 1,
      criteria: [{ criterionId: 'c1', maxPoints: 1, essential: true, independenceRequired: true }],
      questions: [{ questionId: 'q1', prompt: 'Explain.', type: 'free_text' }],
    } },
  });
  const start = reduceState(initial, [record('question_presented', { assessmentId: 'a1', questionId: 'q1', attemptId: 'try-1', presentationToken: 'token-1', prompt: 'Explain.' })]);
  const answered = reduceState(start, [record('answer_recorded', { assessmentId: 'a1', questionId: 'q1', attemptId: 'try-1', presentationToken: 'token-1', response: 'answer', evidenceId: 'ev-1' }, { revision: 2 })]);
  const helped = reduceState(answered, [record('assistance_recorded', { attemptId: 'try-1', assistance: 'hint' }, { revision: 3 })]);
  expectCode(() => reduceState(helped, [record('assistance_recorded', { attemptId: 'try-1', assistance: 'none' }, { revision: 4 })]), 'CONFLICT');
});

test('empty rubric is rejected and a lesson can be explicitly skipped', () => {
  expectCode(() => validateRecord(record('assessment_prepared', { criteria: [] })), 'INVALID_GRADE');
  const skipped = reduceState(state({ phase: 'active', lessons: [{ lessonId: 'l1', outcomeIds: ['o1'] }], reading: { l1: 'not_started' } }), [record('item_skipped', { itemId: 'l1', itemType: 'lesson', reason: 'learner choice' })]);
  assert.equal(skipped.reading.l1, 'skipped');
});

test('grade evidence provenance and submission snapshot must match saved evidence', () => {
  const criteria = [{ criterionId: 'c1', maxPoints: 1, essential: true, independenceRequired: false }];
  const base = state({ phase: 'active', lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], assessments: { a1: { state: 'pending', outcomeIds: ['outcome-1'], rubricRevision: 1, criteria, questions: [{ questionId: 'q1', prompt: 'Explain.', type: 'free_text' }] } } });
  const presented = reduceState(base, [record('question_presented', { assessmentId: 'a1', questionId: 'q1', attemptId: 'try-1', presentationToken: 'token-1', prompt: 'Explain.' })]);
  const answered = reduceState(presented, [record('answer_recorded', { assessmentId: 'a1', questionId: 'q1', attemptId: 'try-1', presentationToken: 'token-1', response: 'answer', evidenceId: 'ev-1' }, { revision: 2 })]);
  const grade = (evidence, overrides = {}) => record('attempt_graded', { assessmentId: 'a1', attemptId: 'try-1', rubricRevision: 1, assistance: 'none', feedback: 'Good.', evidence, criteria: [{ criterionId: 'c1', points: 1, feedback: 'Clear.', independent: true, evidenceRefs: ['ev-1'] }], ...overrides }, { revision: 3 });
  expectCode(() => reduceState(answered, [grade([{ evidenceId: 'ev-1', provenance: 'tutor_observed' }])]), 'INVALID_GRADE');
  expectCode(() => reduceState(answered, [grade([{ evidenceId: 'ev-1', provenance: 'learner_supplied' }], { feedback: undefined })]), 'INVALID_GRADE');

  const submitted = reduceState(presented, [record('submission_recorded', { attemptId: 'try-1', evidenceId: 'ev-1', snapshotPath: 'submissions/a1.txt', snapshotSha256: 'a'.repeat(64), provenance: 'learner_supplied' }, { revision: 2 })]);
  expectCode(() => reduceState(submitted, [grade([{ evidenceId: 'ev-1', provenance: 'learner_supplied', snapshotPath: 'submissions/a1.txt', snapshotSha256: 'b'.repeat(64) }], { snapshotPath: 'submissions/a1.txt', snapshotSha256: 'b'.repeat(64) })]), 'INVALID_GRADE');
});

test('publication and revision persist the current manifest while retaining old evidence', () => {
  const lesson = { lessonId: 'lesson-1', outcomeIds: ['outcome-1'] };
  const oldAttempt = { attemptId: 'old-attempt', assessmentId: 'old-assessment', outcomeIds: ['outcome-1'], rubricRevision: 1, contentRevision: 1, response: 'saved response', assistance: 'none', evidence: [], state: 'graded' };
  const initial = state({ lessons: [lesson], assessments: { 'old-assessment': { state: 'passed', outcomeIds: ['outcome-1'], rubricRevision: 1, contentRevision: 1, criteria: [{ criterionId: 'c1', maxPoints: 1, essential: true, independenceRequired: true }] } }, attempts: { 'old-attempt': oldAttempt } });
  const published = reduceState(initial, [record('course_published', {})]);
  assert.equal(published.phase, 'active');
  assert.equal(published.goal, 'Learn topic');
  assert.deepEqual(published.materialRefs, published.courseManifest.materials);
  assert.deepEqual(published.lessons, [lesson]);
  const revisedManifest = { goal: 'Learn revised topic', prerequisites: ['basics'], scope: { included: ['new topic'], excluded: [] }, lessons: [{ lessonId: 'lesson-2', outcomeIds: ['outcome-2'] }], sources: [], estimates: { readingMinutes: 2, practiceMinutes: 3, setupMinutes: 0 }, materials: [{ path: 'course.md', role: 'course', sha256: 'a'.repeat(64) }] };
  const revised = reduceState(published, [record('course_revised', { contentRevision: 2, materialChanges: ['lessons/lesson-2.md'], manifest: revisedManifest }, { revision: 2, contentRevision: 2 })]);
  assert.equal(revised.goal, 'Learn revised topic');
  assert.deepEqual(revised.lessons, revisedManifest.lessons);
  assert.equal(revised.materialRefs[0].sha256, 'a'.repeat(64));
  assert.deepEqual(revised.attempts['old-attempt'], oldAttempt);
});

test('assessments link only declared lesson outcomes and assignments stay submitted until matching snapshot is graded', () => {
  const criterion = { criterionId: 'essential', maxPoints: 2, essential: true, independenceRequired: true };
  const base = state({ phase: 'active', lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], assignments: { 'assignment-1': 'pending' } });
  expectCode(() => reduceState(base, [record('assessment_prepared', { assessmentId: 'bad-outcome', outcomeIds: ['other-outcome'], assignmentId: 'assignment-1' })]), 'CORRUPT_STATE');
  expectCode(() => reduceState(base, [record('assessment_prepared', { assessmentId: 'bad-assignment', outcomeIds: ['outcome-1'], assignmentId: 'missing' })]), 'CORRUPT_STATE');

  const prepared = reduceState(base, [record('assessment_prepared', { assessmentId: 'assessment-1', outcomeIds: ['outcome-1'], assignmentId: 'assignment-1', criteria: [criterion] })]);
  const presented = reduceState(prepared, [record('question_presented', { assessmentId: 'assessment-1', questionId: 'q1', attemptId: 'attempt-1', presentationToken: 'token-1', prompt: 'Explain.' }, { revision: 2 })]);
  assert.deepEqual(presented.attempts['attempt-1'].outcomeIds, ['outcome-1']);
  assert.equal(presented.attempts['attempt-1'].assignmentId, 'assignment-1');
  const answered = reduceState(presented, [record('answer_recorded', { assessmentId: 'assessment-1', questionId: 'q1', attemptId: 'attempt-1', presentationToken: 'token-1', response: 'answer', evidenceId: 'answer-evidence' }, { revision: 3 })]);
  const gradeRecord = (rev = 4) => record('attempt_graded', { assessmentId: 'assessment-1', attemptId: 'attempt-1', rubricRevision: 1, assistance: 'none', feedback: 'Met the requirement.', evidence: [{ evidenceId: 'submission-evidence', provenance: 'learner_supplied', snapshotPath: 'submissions/assignment-1.txt', snapshotSha256: 'b'.repeat(64) }], criteria: [{ criterionId: 'essential', points: 2, feedback: 'Complete.', evidenceRefs: ['submission-evidence'], independent: true }], snapshotPath: 'submissions/assignment-1.txt', snapshotSha256: 'b'.repeat(64) }, { revision: rev, recordId: `grade-${rev}` });
  expectCode(() => reduceState(answered, [gradeRecord()]), 'INVALID_GRADE');
  expectCode(() => reduceState(answered, [record('submission_recorded', { assessmentId: 'other-assessment', assignmentId: 'assignment-1', attemptId: 'attempt-1' }, { revision: 4, recordId: 'wrong-assessment-submission' })]), 'CORRUPT_STATE');

  const submitted = reduceState(answered, [record('submission_recorded', { assessmentId: 'assessment-1', assignmentId: 'assignment-1', attemptId: 'attempt-1', evidenceId: 'submission-evidence', snapshotPath: 'submissions/assignment-1.txt', snapshotSha256: 'b'.repeat(64), provenance: 'learner_supplied' }, { revision: 4 })]);
  assert.equal(submitted.assignments['assignment-1'].state, 'submitted');
  assert.equal(submitted.assignments['assignment-1'].latestSubmissionAttemptId, 'attempt-1');
  const graded = reduceState(submitted, [gradeRecord(5)]);
  assert.equal(graded.assessments['assessment-1'].state, 'passed');
  assert.equal(graded.assignments['assignment-1'].state, 'passed');
  assert.equal(graded.assignments['assignment-1'].history.at(-1).attemptId, 'attempt-1');
});
