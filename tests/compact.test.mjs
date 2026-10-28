import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dispatch } from '../src/dispatch.mjs';

test('compact mutation responses retain learner-safe metadata while omitting state and assessment banks', async (t) => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'compact-dispatch-'));
  const courseRoot = path.join(workspaceRoot, 'courses', 'demo');
  await mkdir(courseRoot, { recursive: true });
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const call = (op, payload = {}, revision, responseMode = 'compact') => dispatch({ protocolVersion: 1, op,
    workspaceRoot, courseRoot, responseMode,
    ...(revision === undefined ? {} : { operationId: `op-${revision}`, expectedRevision: revision }),
    ...(Object.keys(payload).length ? { payload } : {}) });

  const initialized = await call('course.init', { courseId: 'demo', learnerContext: { level: 'intro' }, goal: 'Learn safely',
    prerequisites: [], readingRateWpm: 200, lessons: [{ lessonId: 'lesson', outcomeIds: ['outcome'] }], assessments: {}, assignments: {} }, 0);
  assert.equal(initialized.committed, true);
  assert.equal(initialized.revision, 1);
  assert.equal(initialized.contentRevision, 1);
  assert.equal(initialized.records[0].kind, 'course_initialized');
  assert.equal(initialized.latestRecord.recordId, initialized.records[0].recordId);
  assert.equal('state' in initialized, false);
  assert.equal('progress' in initialized, false);
  assert.ok(JSON.stringify(initialized).length < 1800);

  const questions = Array.from({ length: 80 }, (_, i) => ({ questionId: `q-${i}`, prompt: `Question ${i}`, type: 'free_text' }));
  const prepared = await call('assessment.prepare', { assessmentId: 'quiz', objective: 'Explain safely', outcomeIds: ['outcome'],
    rubricRevision: 1, questions, criteria: [{ criterionId: 'reason', maxPoints: 2, essential: true, independenceRequired: true }],
    keyPath: 'assessments/private-key.md', key: 'PRIVATE ANSWER KEY' }, 1);
  assert.equal(prepared.ok, true);
  assert.equal('state' in prepared, false);
  assert.equal('progress' in prepared, false);
  assert.equal(JSON.stringify(prepared).includes('PRIVATE ANSWER KEY'), false);
  assert.ok(JSON.stringify(prepared).length < 1800, 'response size does not grow with the saved question bank');

  const presented = await call('question.present', { assessmentId: 'quiz', questionId: 'q-2', attemptId: 'attempt-1',
    presentationToken: 'token-1', routingId: 'route-1' }, 2);
  assert.equal(presented.question.questionId, 'q-2');
  assert.equal(presented.pendingQuestion.routingId, 'route-1');
  assert.equal(presented.pendingQuestion.attemptId, 'attempt-1');
  assert.equal(presented.grade, undefined);

  await call('answer.record', { assessmentId: 'quiz', questionId: 'q-2', attemptId: 'attempt-1', presentationToken: 'token-1',
    routingId: 'route-1', response: 'A safe learner response.' }, 3);
  const graded = await call('attempt.grade', { assessmentId: 'quiz', attemptId: 'attempt-1', rubricRevision: 1,
    assistance: 'none', evidence: [{ evidenceId: 'answer-attempt-1', provenance: 'learner_supplied' }],
    criteria: [{ criterionId: 'reason', points: 2, feedback: 'Good response.', evidenceRefs: ['answer-attempt-1'], independent: true,
      privateAnswerKey: 'SENTINEL_PRIVATE_GRADING_DATA' }],
    feedback: 'Good work.' }, 4);
  assert.deepEqual(graded.grade, { points: 2, maxPoints: 2, percentage: 100, feedback: 'Good work.', criteria: [
    { criterionId: 'reason', points: 2, maxPoints: 2, status: 'met', feedback: 'Good response.', evidenceRefs: ['answer-attempt-1'], independent: true },
  ] });
  assert.equal(graded.pendingQuestion, null);
  assert.equal('state' in graded, false);
  assert.doesNotMatch(JSON.stringify(graded), /PRIVATE ANSWER KEY|Question 79|SENTINEL_PRIVATE_GRADING_DATA/);
});

test('responseMode defaults to full, rejects unknown values, and never compacts reads', async (t) => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'compact-read-'));
  const courseRoot = path.join(workspaceRoot, 'courses', 'demo');
  await mkdir(courseRoot, { recursive: true });
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const base = { protocolVersion: 1, workspaceRoot, courseRoot };
  const init = await dispatch({ ...base, op: 'course.init', operationId: 'init', expectedRevision: 0, payload: {
    courseId: 'demo', learnerContext: {}, goal: 'Learn', prerequisites: [], readingRateWpm: 200,
    lessons: [{ lessonId: 'lesson', outcomeIds: [] }], assessments: {}, assignments: {},
  } });
  assert.equal(init.ok, true);
  assert.ok(init.state);
  assert.ok(init.records[0].payload);
  assert.equal((await dispatch({ ...base, op: 'course.resume', responseMode: 'compact' })).state.courseId, 'demo');
  const invalid = await dispatch({ ...base, op: 'course.init', responseMode: 'small', operationId: 'bad', expectedRevision: 0, payload: {} });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'INVALID_INPUT');
});
