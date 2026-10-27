import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { commit, readCourse } from '../src/store.mjs';
import { prepareAssessment, presentQuestion, acceptAnswer, recordAssistance, gradeAttempt } from '../src/assessment.mjs';
import { state } from './helpers.mjs';

async function course(t) {
  const root = await mkdtemp(path.join(process.cwd(), '.test-tmp-assessment-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const initial = { schemaVersion: 1, recordId: 'init', operationId: 'init-op', kind: 'course_initialized', timestamp: new Date().toISOString(), courseId: 'course-1', revision: 1, contentRevision: 1, fingerprint: 'initial', payload: { initialState: state({ phase: 'active', lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], assessments: {}, assignments: {} }) } };
  await commit(root, { operationId: 'init-op', expectedRevision: 0, records: [initial] });
  return root;
}

const criteria = [{ criterionId: 'reasoning', maxPoints: 2, essential: true, independenceRequired: true }];
const questions = [{ questionId: 'diagnostic', prompt: 'Explain the key idea.', type: 'choice', options: [{ optionId: 'a', text: 'First' }, { optionId: 'b', text: 'Second' }] }];
const common = { assessmentId: 'assessment-1', objective: 'Explain outcome-1', outcomeId: 'outcome-1', rubricRevision: 1, questions, criteria, key: 'Private key: b', keyPath: 'assessments/assessment-1-key.md' };

test('prepares before presentation, preserves exact options, reoffers with a fresh token, and requires a matching explicit answer', async (t) => {
  const root = await course(t);
  const prepared = await prepareAssessment(root, { ...common, operationId: 'prepare', expectedRevision: 1 });
  assert.equal(prepared.state.revision, 2);
  assert.deepEqual(prepared.state.assessments['assessment-1'].questions[0].options, questions[0].options);
  assert.equal((await prepareAssessment(root, { ...common, operationId: 'prepare', expectedRevision: 1 })).revision, 2);
  await assert.rejects(acceptAnswer(root, { operationId: 'absent', expectedRevision: 2, assessmentId: 'assessment-1', questionId: 'diagnostic', attemptId: 'attempt-1', presentationToken: 'missing', response: '' }));
  const shown = await presentQuestion(root, { operationId: 'present', expectedRevision: 2, assessmentId: 'assessment-1', questionId: 'diagnostic', attemptId: 'attempt-1', presentationToken: 'token-1' });
  assert.equal(shown.state.pendingQuestion.presentationToken, 'token-1');
  await assert.rejects(acceptAnswer(root, { operationId: 'late', expectedRevision: 3, assessmentId: 'assessment-1', questionId: 'diagnostic', attemptId: 'attempt-1', presentationToken: 'stale', response: 'b' }));
  const reoffered = await presentQuestion(root, { operationId: 'reoffer', expectedRevision: 3, assessmentId: 'assessment-1', questionId: 'diagnostic', attemptId: 'attempt-1', presentationToken: 'token-2' });
  assert.deepEqual(reoffered.state.attempts['attempt-1'].options, questions[0].options);
  assert.equal(reoffered.state.pendingQuestion.presentationToken, 'token-2');
  const answered = await acceptAnswer(root, { operationId: 'answer', expectedRevision: 4, assessmentId: 'assessment-1', questionId: 'diagnostic', attemptId: 'attempt-1', presentationToken: 'token-2', response: 'b' });
  assert.equal(answered.state.attempts['attempt-1'].response, 'b');
  await assert.rejects(acceptAnswer(root, { operationId: 'duplicate', expectedRevision: 5, assessmentId: 'assessment-1', questionId: 'diagnostic', attemptId: 'attempt-1', presentationToken: 'token-2', response: 'b' }));
  assert.equal((await readCourse(root)).state.revision, 5);
});

test('records help and rubric evidence; assisted points require a fresh independent check', async (t) => {
  const root = await course(t);
  await prepareAssessment(root, { ...common, operationId: 'prepare', expectedRevision: 1 });
  await presentQuestion(root, { operationId: 'present', expectedRevision: 2, assessmentId: common.assessmentId, questionId: 'diagnostic', attemptId: 'attempt-1', presentationToken: 'token-1' });
  await acceptAnswer(root, { operationId: 'answer', expectedRevision: 3, assessmentId: common.assessmentId, questionId: 'diagnostic', attemptId: 'attempt-1', presentationToken: 'token-1', response: 'b' });
  await recordAssistance(root, { operationId: 'help', expectedRevision: 4, attemptId: 'attempt-1', assistance: 'hint', summary: 'Hint given.' });
  const invalidGrades = [
    { criteria: [] },
    { criteria: [{ criterionId: 'reasoning', points: -1, feedback: 'Invalid.', evidenceRefs: ['answer-attempt-1'], independent: false }] },
    { criteria: [{ criterionId: 'reasoning', points: 3, feedback: 'Invalid.', evidenceRefs: ['answer-attempt-1'], independent: false }] },
    { criteria: [{ criterionId: 'reasoning', points: Number.NaN, feedback: 'Invalid.', evidenceRefs: ['answer-attempt-1'], independent: false }] },
    { evidence: [] },
  ];
  for (let i = 0; i < invalidGrades.length; i++) await assert.rejects(gradeAttempt(root, { operationId: `invalid-grade-${i}`, expectedRevision: 5, assessmentId: common.assessmentId, attemptId: 'attempt-1', rubricRevision: 1, assistance: 'hint', evidence: [{ evidenceId: 'answer-attempt-1', provenance: 'learner_supplied' }], criteria: [{ criterionId: 'reasoning', points: 2, feedback: 'Correct.', evidenceRefs: ['answer-attempt-1'], independent: false }], feedback: 'Reviewed.', ...invalidGrades[i] }), { code: 'INVALID_GRADE' });
  const assisted = await gradeAttempt(root, { operationId: 'grade-assisted', expectedRevision: 5, assessmentId: common.assessmentId, attemptId: 'attempt-1', rubricRevision: 1, assistance: 'hint', evidence: [{ evidenceId: 'answer-attempt-1', provenance: 'learner_supplied' }], criteria: [{ criterionId: 'reasoning', points: 2, feedback: 'Correct with help.', evidenceRefs: ['answer-attempt-1'], independent: false }], feedback: 'Good, with a hint.' });
  assert.equal(assisted.state.assessments['assessment-1'].state, 'needs_review');
  await prepareAssessment(root, { ...common, assessmentId: 'assessment-2', questions: [{ ...questions[0], questionId: 'diagnostic-fresh', prompt: 'Apply the same idea to a new example.' }], operationId: 'prepare-fresh', expectedRevision: 6 });
  const fresh = await presentQuestion(root, { operationId: 'present-fresh', expectedRevision: 7, assessmentId: 'assessment-2', questionId: 'diagnostic-fresh', attemptId: 'attempt-2', presentationToken: 'token-2' });
  assert.equal(fresh.state.attempts['attempt-2'].assistance, 'none');
  assert.deepEqual(fresh.state.assessments['assessment-2'].outcomeIds, ['outcome-1']);
  await acceptAnswer(root, { operationId: 'answer-fresh', expectedRevision: 8, assessmentId: 'assessment-2', questionId: 'diagnostic-fresh', attemptId: 'attempt-2', presentationToken: 'token-2', response: 'b independently' });
  const passed = await gradeAttempt(root, { operationId: 'grade-fresh', expectedRevision: 9, assessmentId: 'assessment-2', attemptId: 'attempt-2', rubricRevision: 1, assistance: 'none', evidence: [{ evidenceId: 'answer-attempt-2', provenance: 'learner_supplied' }], criteria: [{ criterionId: 'reasoning', points: 2, feedback: 'Independent.', evidenceRefs: ['answer-attempt-2'], independent: true }], feedback: 'Passed.' });
  assert.equal(passed.state.assessments['assessment-2'].state, 'passed');
  assert.equal(passed.state.assessments['assessment-2'].latestGrade.percentage, 100);
  assert.equal(passed.state.assessments['assessment-2'].history.length, 1);
  const regraded = await gradeAttempt(root, { operationId: 'regrade-fresh', expectedRevision: 10, assessmentId: 'assessment-2', attemptId: 'attempt-2', rubricRevision: 1, assistance: 'none', evidence: [{ evidenceId: 'answer-attempt-2', provenance: 'learner_supplied' }], criteria: [{ criterionId: 'reasoning', points: 2, feedback: 'Confirmed.', evidenceRefs: ['answer-attempt-2'], independent: true }], feedback: 'Regraded.' });
  assert.equal(regraded.state.assessments['assessment-2'].history.length, 2);
  await assert.rejects(gradeAttempt(root, { operationId: 'bad-grade', expectedRevision: 11, assessmentId: 'assessment-2', attemptId: 'attempt-2', rubricRevision: 2, criteria: [], evidence: [], feedback: 'bad' }), { code: 'INVALID_GRADE' });
});
