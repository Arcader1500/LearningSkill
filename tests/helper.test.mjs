import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const helper = path.resolve('scripts/learning-state.mjs');
const manifest = { goal: 'Understand layers', prerequisites: [], scope: { included: ['layers'], excluded: [] }, lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], sources: [{ title: 'OCI image spec', version: '1.1' }], estimates: { readingMinutes: 2, practiceMinutes: 2, setupMinutes: 0 }, materials: [{ path: 'course.md', role: 'course' }, { path: 'lessons/lesson-1.md', role: 'reading' }] };

async function fixture(t) {
  const workspace = await mkdtemp(path.join(process.cwd(), '.test-tmp-helper space-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const root = path.join(workspace, 'courses', 'course ;$(echo inert)');
  await mkdir(path.join(root, 'lessons'), { recursive: true });
  await writeFile(path.join(root, 'course.md'), '# Layers\n\nSee [lesson](lessons/lesson-1.md).\n');
  await writeFile(path.join(root, 'lessons', 'lesson-1.md'), '# Layers\n\nLayers store changes.\n');
  return { workspace, root };
}

async function call(t, root, op, payload = {}, { revision, bom = false, workspaceRoot = path.dirname(root) } = {}) {
  const request = { protocolVersion: 1, op, workspaceRoot, courseRoot: root, ...(revision === undefined ? {} : { operationId: `${op.replaceAll('.', '-')}-${revision}-${Math.random().toString(36).slice(2, 7)}`, expectedRevision: revision }), ...(Object.keys(payload).length ? { payload } : {}) };
  const requestFile = path.join(path.dirname(root), `request ;$(echo inert) ${Date.now()}-${Math.random()}.json`);
  const bytes = Buffer.from(`${bom ? '\uFEFF' : ''}${JSON.stringify(request)}`, 'utf8');
  await writeFile(requestFile, bytes);
  try {
    const child = spawnSync(process.execPath, [helper, requestFile], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(child.stderr, '', 'helper should keep stdout structured and avoid incidental diagnostics');
    return { child, result: JSON.parse(child.stdout) };
  } finally { await rm(requestFile, { force: true }); }
}

test('real helper child dispatches every operation and keeps state/question learner-safe', async (t) => {
  const { workspace, root } = await fixture(t);
  let r = await call(t, root, 'course.init', { courseId: 'course-1', learnerContext: {}, goal: 'Understand layers', prerequisites: [], readingRateWpm: 238, lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], assessments: {}, assignments: { 'assignment-1': 'pending' } }, { revision: 0, bom: true });
  assert.equal(r.child.status, 0); assert.equal(r.result.committed, true);
  r = await call(t, root, 'course.publish', { manifest }, { revision: 1 }); assert.equal(r.child.status, 0);
  r = await call(t, root, 'qa.record', { question: 'Why layers?', answerSummary: 'They retain incremental changes.' }, { revision: 2 }); assert.equal(r.child.status, 0);
  r = await call(t, root, 'progress.record', { lessonId: 'lesson-1', reading: 'reported_complete' }, { revision: 3 }); assert.equal(r.child.status, 0);
  r = await call(t, root, 'assessment.prepare', { assessmentId: 'quiz-1', objective: 'Explain layers', outcomeIds: ['outcome-1'], rubricRevision: 1, questions: [{ questionId: 'q1', prompt: 'Why are layers useful?', type: 'choice', options: [{ optionId: 'a', text: 'Save changes' }, { optionId: 'b', text: 'Delete all data' }] }], criteria: [{ criterionId: 'reasoning', maxPoints: 2, essential: true, independenceRequired: true }], keyPath: 'assessments/quiz-1-key.md', key: 'secret answer' }, { revision: 4 });
  assert.equal(r.child.status, 0, r.child.stdout); assert.doesNotMatch(r.child.stdout, /secret answer|rationale|keyPath/);
  r = await call(t, root, 'question.present', { assessmentId: 'quiz-1', questionId: 'q1', attemptId: 'attempt-1', presentationToken: 'token-1' }, { revision: 5 });
  assert.equal(r.child.status, 0); assert.equal(r.result.question.prompt, 'Why are layers useful?'); assert.equal(r.result.pendingQuestion.prompt, 'Why are layers useful?');
  assert.doesNotMatch(r.child.stdout, /secret answer|rationale|keyPath/);
  const readBefore = createHash('sha256').update(await readFile(path.join(root, 'state.json'))).digest('hex');
  const pending = await call(t, root, 'course.resume');
  assert.equal(pending.child.status, 0); assert.equal(pending.result.pendingQuestion.prompt, 'Why are layers useful?');
  assert.equal(createHash('sha256').update(await readFile(path.join(root, 'state.json'))).digest('hex'), readBefore, 'resume is read-only');
  r = await call(t, root, 'answer.record', { assessmentId: 'quiz-1', questionId: 'q1', attemptId: 'attempt-1', presentationToken: 'token-1', response: 'They avoid repeating unchanged data.' }, { revision: 6 }); assert.equal(r.child.status, 0);
  r = await call(t, root, 'assistance.record', { attemptId: 'attempt-1', assistance: 'none', summary: 'No help used.' }, { revision: 7 }); assert.equal(r.child.status, 0);
  r = await call(t, root, 'attempt.grade', { assessmentId: 'quiz-1', attemptId: 'attempt-1', rubricRevision: 1, assistance: 'none', evidence: [{ evidenceId: 'answer-attempt-1', provenance: 'learner_supplied' }], criteria: [{ criterionId: 'reasoning', points: 2, feedback: 'Sound.', evidenceRefs: ['answer-attempt-1'], independent: true }], feedback: 'Passed.' }, { revision: 8 });
  assert.equal(r.child.status, 0); assert.equal(r.result.notesStatus.ok, true);
  const source = path.join(workspace, 'learner answer ;$(echo inert).md'); await writeFile(source, 'Learner supplied work.\n');
  r = await call(t, root, 'assessment.prepare', { assessmentId: 'submission-check', assignmentId: 'assignment-1', objective: 'Submit work', outcomeIds: ['outcome-1'], rubricRevision: 1, questions: [{ questionId: 'submission', prompt: 'Submit your work.', type: 'free_text' }], criteria: [{ criterionId: 'complete', maxPoints: 1, essential: true, independenceRequired: false }], keyPath: 'assessments/submission-check-key.md', key: 'private submission key' }, { revision: 9 }); assert.equal(r.child.status, 0);
  r = await call(t, root, 'question.present', { assessmentId: 'submission-check', questionId: 'submission', attemptId: 'submission-attempt', presentationToken: 'submission-token' }, { revision: 10 }); assert.equal(r.child.status, 0);
  const sourceHash = createHash('sha256').update(await readFile(source)).digest('hex');
  r = await call(t, root, 'submission.record', { assessmentId: 'submission-check', assignmentId: 'assignment-1', attemptId: 'submission-attempt', sourcePath: source, provenance: 'learner_supplied' }, { revision: 11 });
  assert.equal(r.child.status, 0); assert.equal(r.result.committed, true);
  assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'), sourceHash, 'submission helper leaves source bytes unchanged');
  r = await call(t, root, 'notes.render'); assert.equal(r.child.status, 0);
  r = await call(t, root, 'course.discover', {}, { workspaceRoot: workspace }); assert.equal(r.child.status, 0);
  assert.equal(r.result.courses.length, 1);
  r = await call(t, root, 'lock.recover', {}); assert.equal(r.child.status, 1); assert.equal(r.result.ok, false);
  assert.ok((await readdir(root)).includes('classnotes.md'));
});

test('helper returns typed nonzero errors for bad invocation, JSON, protocol, operation, revision and missing request', async (t) => {
  const { workspace, root } = await fixture(t);
  const noArgs = spawnSync(process.execPath, [helper], { encoding: 'utf8' });
  assert.equal(noArgs.status, 1); assert.equal(JSON.parse(noArgs.stdout).error.code, 'INVALID_INPUT');
  const twoArgs = spawnSync(process.execPath, [helper, 'a', 'b'], { encoding: 'utf8' });
  assert.equal(twoArgs.status, 1); assert.equal(JSON.parse(twoArgs.stdout).error.code, 'INVALID_INPUT');
  const missing = spawnSync(process.execPath, [helper, path.join(workspace, 'missing.json')], { encoding: 'utf8' });
  assert.equal(missing.status, 1); assert.equal(JSON.parse(missing.stdout).error.code, 'IO_ERROR');
  const badJson = path.join(workspace, 'bad.json'); await writeFile(badJson, '{');
  const invalid = spawnSync(process.execPath, [helper, badJson], { encoding: 'utf8' });
  assert.equal(invalid.status, 1); assert.equal(JSON.parse(invalid.stdout).error.code, 'INVALID_INPUT');
  for (const request of [
    { protocolVersion: 9, op: 'course.resume', workspaceRoot: workspace, courseRoot: root },
    { protocolVersion: 1, op: 'shell.exec', workspaceRoot: workspace, courseRoot: root },
    { protocolVersion: 1, op: 'course.resume', workspaceRoot: workspace, courseRoot: root, payload: { path: '../outside' } },
  ]) {
    const file = path.join(workspace, `bad-${Math.random()}.json`); await writeFile(file, JSON.stringify(request));
    const child = spawnSync(process.execPath, [helper, file], { encoding: 'utf8' });
    assert.equal(child.status, 1); assert.equal(JSON.parse(child.stdout).ok, false);
  }
  const stale = await call(t, root, 'course.init', { courseId: 'course-1', learnerContext: {}, goal: 'Learn', prerequisites: [], readingRateWpm: 238, lessons: [], assessments: {}, assignments: {} }, { revision: 5 });
  assert.equal(stale.child.status, 1); assert.equal(stale.result.error.code, 'CONFLICT');
});

test('post-commit notes conflict reports committed progress separately', async (t) => {
  const { root } = await fixture(t);
  await call(t, root, 'course.init', { courseId: 'course-1', learnerContext: {}, goal: 'Learn', prerequisites: [], readingRateWpm: 238, lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], assessments: {}, assignments: {} }, { revision: 0 });
  await call(t, root, 'course.publish', { manifest }, { revision: 1 });
  await writeFile(path.join(root, 'classnotes.md'), 'learner edit not in records');
  const result = await call(t, root, 'assessment.prepare', { assessmentId: 'quiz-1', objective: 'Explain layers', outcomeIds: ['outcome-1'], rubricRevision: 1, questions: [{ questionId: 'q1', prompt: 'Explain.', type: 'free_text' }], criteria: [{ criterionId: 'reasoning', maxPoints: 2, essential: true, independenceRequired: true }], keyPath: 'assessments/quiz-1-key.md', key: 'private' }, { revision: 2 });
  assert.equal(result.child.status, 0, result.child.stdout);
  assert.equal(result.result.committed, true);
  assert.equal(result.result.notesStatus.ok, false);
  assert.equal(result.result.notesStatus.error.code, 'CONFLICT');
});

test('string pending assessment survives helper prepare, present, answer, grade and fresh resume', async (t) => {
  const { root } = await fixture(t);
  let r = await call(t, root, 'course.init', { courseId: 'pending-course', learnerContext: {}, goal: 'Understand layers', prerequisites: [], readingRateWpm: 238, lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], assessments: { quiz: 'pending' }, assignments: {} }, { revision: 0 });
  assert.equal(r.child.status, 0, r.child.stdout);
  const assessment = { assessmentId: 'quiz', objective: 'Explain layers', outcomeIds: ['outcome-1'], rubricRevision: 1, questions: [{ questionId: 'q1', prompt: 'Why use layers?', type: 'free_text' }], criteria: [{ criterionId: 'reasoning', maxPoints: 2, essential: true, independenceRequired: true }], keyPath: 'assessments/quiz-key.md', key: 'private key' };
  r = await call(t, root, 'assessment.prepare', assessment, { revision: 1 }); assert.equal(r.child.status, 0, r.child.stdout);
  const replacement = await call(t, root, 'assessment.prepare', { ...assessment, rubricRevision: 2, criteria: [{ criterionId: 'reasoning', maxPoints: 3, essential: true, independenceRequired: true }] }, { revision: 2 });
  assert.equal(replacement.child.status, 1); assert.equal(replacement.result.error.code, 'CONFLICT');
  assert.equal(replacement.result.error.details, undefined);
  r = await call(t, root, 'question.present', { assessmentId: 'quiz', questionId: 'q1', attemptId: 'attempt-1', presentationToken: 'token-1' }, { revision: 2 }); assert.equal(r.child.status, 0, r.child.stdout);
  r = await call(t, root, 'answer.record', { assessmentId: 'quiz', questionId: 'q1', attemptId: 'attempt-1', presentationToken: 'token-1', response: 'Layers preserve incremental changes.' }, { revision: 3 }); assert.equal(r.child.status, 0, r.child.stdout);
  r = await call(t, root, 'attempt.grade', { assessmentId: 'quiz', attemptId: 'attempt-1', rubricRevision: 1, assistance: 'none', evidence: [{ evidenceId: 'answer-attempt-1', provenance: 'learner_supplied' }], criteria: [{ criterionId: 'reasoning', points: 2, feedback: 'Correct.', evidenceRefs: ['answer-attempt-1'], independent: true }], feedback: 'Passed.' }, { revision: 4 }); assert.equal(r.child.status, 0, r.child.stdout);
  const before = await readdir(root, { recursive: true });
  const hashes = new Map();
  for (const relative of before) { const file = path.join(root, relative); try { hashes.set(relative, createHash('sha256').update(await readFile(file)).digest('hex')); } catch { /* directories */ } }
  const resumed = await call(t, root, 'course.resume');
  assert.equal(resumed.child.status, 0, resumed.child.stdout);
  assert.equal(resumed.result.state.assessments.quiz.state, 'passed');
  assert.equal(resumed.result.state.attempts['attempt-1'].response, 'Layers preserve incremental changes.');
  assert.equal(resumed.result.state.assessments.quiz.latestGrade.criteria[0].criterionId, 'reasoning');
  for (const [relative, digest] of hashes) assert.equal(createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex'), digest, `${relative} remains unchanged by resume`);
});

test('resume reports bounded public metadata for the precise failing history record', async (t) => {
  const { root } = await fixture(t);
  let created = await call(t, root, 'course.init', { courseId: 'diagnostics', learnerContext: {}, goal: 'Learn', prerequisites: [], readingRateWpm: 238, lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], assessments: {}, assignments: {} }, { revision: 0 }); assert.equal(created.child.status, 0, created.child.stdout);
  created = await call(t, root, 'assessment.prepare', { assessmentId: 'quiz', objective: 'Explain', outcomeIds: ['outcome-1'], rubricRevision: 1, questions: [{ questionId: 'q1', prompt: 'Explain?', type: 'free_text', expected: 'PRIVATE_RESPONSE' }], criteria: [{ criterionId: 'c1', maxPoints: 1, essential: true, independenceRequired: true }], keyPath: 'assessments/private-key.md', key: 'PRIVATE_KEY' }, { revision: 1 }); assert.equal(created.child.status, 0, created.child.stdout);
  const statePath = path.join(root, 'state.json'); const state = JSON.parse(await readFile(statePath, 'utf8'));
  const ref = state.recordRefs[1]; const recordPath = path.join(root, ref.path); const record = JSON.parse(await readFile(recordPath, 'utf8'));
  record.payload.outcomeIds = ['undeclared'];
  const bytes = `${JSON.stringify(record, null, 2)}\n`; await writeFile(recordPath, bytes);
  ref.sha256 = createHash('sha256').update(bytes).digest('hex'); await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const savedState = await readFile(statePath); const savedRecord = await readFile(recordPath);
  const resumed = await call(t, root, 'course.resume');
  assert.equal(resumed.child.status, 1); assert.equal(resumed.result.error.code, 'CORRUPT_STATE');
  assert.equal(resumed.result.state, undefined); assert.equal(resumed.result.progress, undefined); assert.equal(resumed.result.records, undefined);
  assert.deepEqual(resumed.result.error.details, { stage: 'history_replay', recordId: ref.recordId, kind: 'assessment_prepared', revision: 2, causeCode: 'CORRUPT_STATE' });
  assert.doesNotMatch(resumed.child.stdout, /PRIVATE_RESPONSE|PRIVATE_KEY|\["undeclared"\]/);
  assert.deepEqual(await readFile(statePath), savedState); assert.deepEqual(await readFile(recordPath), savedRecord);
});

test('dispatch projects explicit learner-safe views without leaking arbitrary question fields', async (t) => {
  const { root } = await fixture(t);
  const init = await call(t, root, 'course.init', { courseId: 'course-1', learnerContext: {}, goal: 'Learn', prerequisites: [], readingRateWpm: 238, lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], assessments: {}, assignments: {} }, { revision: 0 });
  assert.equal(init.child.status, 0, init.child.stdout);
  const prepared = await call(t, root, 'assessment.prepare', { assessmentId: 'quiz-private', objective: 'Explain layers', outcomeIds: ['outcome-1'], rubricRevision: 1, questions: [{ questionId: 'q1', prompt: 'Why?', type: 'free_text', expectedReasoning: 'PRIVATE_REASONING', solution: 'PRIVATE_SOLUTION' }], criteria: [{ criterionId: 'reasoning', maxPoints: 2, essential: true, independenceRequired: true }], keyPath: 'assessments/private-key.md', key: 'PRIVATE_KEY' }, { revision: 1 });
  assert.equal(prepared.child.status, 0, prepared.child.stdout);
  for (const marker of ['PRIVATE_REASONING', 'PRIVATE_SOLUTION', 'PRIVATE_KEY', 'private-key.md']) assert.doesNotMatch(prepared.child.stdout, new RegExp(marker));
  assert.equal(prepared.result.state.assessments['quiz-private'].objective, 'Explain layers');
  assert.equal(prepared.result.state.assessments['quiz-private'].questions[0].prompt, 'Why?');
  assert.equal(Object.hasOwn(prepared.result.state.assessments['quiz-private'].questions[0], 'expectedReasoning'), false);
  assert.equal(Object.hasOwn(prepared.result.state.assessments['quiz-private'], 'keyPath'), false);
  assert.equal(Object.hasOwn(prepared.result.state.assessments['quiz-private'], 'criteria'), false);
  const presented = await call(t, root, 'question.present', { assessmentId: 'quiz-private', questionId: 'q1', attemptId: 'try-1', presentationToken: 'token-1' }, { revision: 2 });
  assert.equal(presented.child.status, 0, presented.child.stdout);
  assert.doesNotMatch(presented.child.stdout, /PRIVATE_REASONING|PRIVATE_SOLUTION|PRIVATE_KEY/);
  const resumed = await call(t, root, 'course.resume');
  assert.equal(resumed.child.status, 0, resumed.child.stdout);
  assert.doesNotMatch(resumed.child.stdout, /PRIVATE_REASONING|PRIVATE_SOLUTION|PRIVATE_KEY/);
  assert.equal(resumed.result.progress.assessments['quiz-private'].objective, 'Explain layers');
  await call(t, root, 'answer.record', { assessmentId: 'quiz-private', questionId: 'q1', attemptId: 'try-1', presentationToken: 'token-1', response: 'They preserve changes.' }, { revision: 3 });
  await call(t, root, 'assistance.record', { attemptId: 'try-1', assistance: 'none', summary: 'No help.' }, { revision: 4 });
  const graded = await call(t, root, 'attempt.grade', { assessmentId: 'quiz-private', attemptId: 'try-1', rubricRevision: 1, assistance: 'none', evidence: [{ evidenceId: 'answer-try-1', provenance: 'learner_supplied' }], criteria: [{ criterionId: 'reasoning', points: 2, feedback: 'Good reasoning.', evidenceRefs: ['answer-try-1'], independent: true }], feedback: 'Passed.' }, { revision: 5 });
  assert.equal(graded.child.status, 0, graded.child.stdout);
  assert.equal(graded.result.state.assessments['quiz-private'].latestGrade.criteria[0].feedback, 'Good reasoning.');
  assert.deepEqual(graded.result.state.attempts['try-1'].evidence.map((item) => item.evidenceId), ['answer-try-1']);
  assert.doesNotMatch(graded.child.stdout, /PRIVATE_REASONING|PRIVATE_SOLUTION|PRIVATE_KEY/);
});
