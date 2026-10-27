import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { initializeCourse, recordQA } from '../src/course.mjs';
import { renderClassnotes } from '../src/notes.mjs';
import { commit } from '../src/store.mjs';

const fixture = async (t) => {
  const root = await mkdtemp(path.join(process.cwd(), '.test-tmp-notes-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initializeCourse(root, { operationId: 'init', expectedRevision: 0, courseId: 'notes-course', learnerContext: {}, goal: 'Understand layers', prerequisites: [], readingRateWpm: 238, lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], assessments: {}, assignments: {}, nextAction: 'Start' });
  return root;
};

test('notes are deterministic committed-record projections with a separate revision/hash receipt', async (t) => {
  const root = await fixture(t);
  await recordQA(root, { operationId: 'qa', expectedRevision: 1, question: 'Why use layers?', answerSummary: 'They store filesystem changes.', followUp: 'How are they cached?' });
  const first = await renderClassnotes(root);
  const body = await readFile(path.join(root, 'classnotes.md'), 'utf8');
  assert.match(body, /Why use layers\?/);
  assert.match(body, /They store filesystem changes\./);
  assert.match(body, /How are they cached\?/);
  assert.equal(first.revision, 2);
  assert.equal((await renderClassnotes(root)).sha256, first.sha256);
});

test('manual edits conflict and remain intact; a missing receipt repairs a provable rendering', async (t) => {
  const root = await fixture(t);
  const generated = await renderClassnotes(root);
  const generatedBody = await readFile(path.join(root, 'classnotes.md'), 'utf8');
  await mkdir(path.join(root, 'records'), { recursive: true });
  await writeFile(path.join(root, 'classnotes.md'), 'Learner edit\n');
  await assert.rejects(renderClassnotes(root), { code: 'CONFLICT' });
  assert.equal(await readFile(path.join(root, 'classnotes.md'), 'utf8'), 'Learner edit\n');
  await writeFile(path.join(root, 'classnotes.md'), generatedBody);
  await rm(path.join(root, '.notes-projection.json'));
  assert.equal((await renderClassnotes(root)).sha256, generated.sha256);
});

test('interrupted receipt write can be repaired without duplicating or losing committed Q&A', async (t) => {
  const root = await fixture(t);
  const previous = await readFile(path.join(root, 'classnotes.md'), 'utf8');
  await recordQA(root, { operationId: 'qa', expectedRevision: 1, question: 'What changes?', answerSummary: 'A layer stores changes.' });
  await writeFile(path.join(root, 'classnotes.md'), previous);
  await rm(path.join(root, '.notes-projection.json'));
  await assert.rejects(renderClassnotes(root, { afterNotesWrite: async () => { throw new Error('simulated interruption'); } }));
  const repaired = await renderClassnotes(root);
  const body = await readFile(path.join(root, 'classnotes.md'), 'utf8');
  assert.match(body, /What changes\?/);
  assert.equal((body.match(/What changes\?/g) ?? []).length, 1);
  assert.equal(repaired.revision, 2);
});

test('notes retain saved help conditions, grade feedback and evidence references', async (t) => {
  const root = await fixture(t);
  const criteria = [{ criterionId: 'reasoning', maxPoints: 2, essential: true, independenceRequired: true }];
  const events = [
    ['assessment_prepared', { assessmentId: 'quiz-1', objective: 'Explain layers', outcomeIds: ['outcome-1'], rubricRevision: 1, questions: [{ questionId: 'q1', prompt: 'Why are layers useful?', type: 'free_text' }], criteria, keyPath: 'assessments/quiz-1-key.md' }],
    ['question_presented', { assessmentId: 'quiz-1', questionId: 'q1', attemptId: 'attempt-1', presentationToken: 'token-1', prompt: 'Why are layers useful?' }],
    ['answer_recorded', { assessmentId: 'quiz-1', questionId: 'q1', attemptId: 'attempt-1', presentationToken: 'token-1', response: 'They avoid repeating unchanged data.', evidenceId: 'answer-attempt-1' }],
    ['assistance_recorded', { attemptId: 'attempt-1', assistance: 'hint', summary: 'A hint pointed to caching.' }],
    ['attempt_graded', { assessmentId: 'quiz-1', attemptId: 'attempt-1', rubricRevision: 1, assistance: 'hint', evidence: [{ evidenceId: 'answer-attempt-1', provenance: 'learner_supplied' }], criteria: [{ criterionId: 'reasoning', points: 2, feedback: 'Good reasoning.', evidenceRefs: ['answer-attempt-1'], independent: false }], feedback: 'Correct with a hint.' }],
  ].map(([kind, payload], index) => ({ schemaVersion: 1, recordId: `notes-${index}`, operationId: 'notes-events', kind, timestamp: new Date(Date.UTC(2026, 0, index + 2)).toISOString(), courseId: 'notes-course', revision: index + 2, contentRevision: 1, fingerprint: 'pending', payload }));
  await commit(root, { operationId: 'notes-events', expectedRevision: 1, records: events });
  await renderClassnotes(root);
  const body = await readFile(path.join(root, 'classnotes.md'), 'utf8');
  assert.match(body, /Condition: \*\*hint\*\*/);
  assert.match(body, /Correct with a hint\./);
  assert.match(body, /answer-attempt-1/);
});

test('concurrent notes rendering and course mutation never leave a mixed-revision projection', async (t) => {
  const root = await fixture(t);
  const operation = { operationId: 'racing-qa', expectedRevision: 1, question: 'What does a layer store?', answerSummary: 'A filesystem change.' };
  const [renderResult, mutationResult] = await Promise.allSettled([renderClassnotes(root), recordQA(root, operation)]);
  if (renderResult.status === 'rejected') assert.equal(renderResult.reason.code, 'LOCKED');
  if (mutationResult.status === 'rejected') {
    assert.equal(mutationResult.reason.code, 'LOCKED');
    await recordQA(root, operation);
  } else if (mutationResult.value.notesStatus?.ok === false) {
    assert.equal(mutationResult.value.notesStatus.error.code, 'LOCKED');
  }
  await renderClassnotes(root);
  const { state } = await (await import('../src/store.mjs')).readCourse(root);
  const body = await readFile(path.join(root, 'classnotes.md'), 'utf8');
  const receipt = JSON.parse(await readFile(path.join(root, '.notes-projection.json'), 'utf8'));
  assert.equal(state.revision, 2);
  assert.equal(receipt.revision, state.revision);
  assert.match(body, /What does a layer store\?/);
  assert.match(body, /A filesystem change\./);
});

test('notes atomic writes reuse the bounded transient rename retry', async (t) => {
  const root = await fixture(t);
  await rm(path.join(root, 'classnotes.md'));
  let calls = 0;
  await renderClassnotes(root, { rename: async (from, to) => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('temporary sharing violation'), { code: 'EPERM' });
    return rename(from, to);
  } });
  assert.equal(calls, 3);
  assert.match(await readFile(path.join(root, 'classnotes.md'), 'utf8'), /Understand layers/);
});

test('persistent receipt rename failure preserves committed state and repairs on the next render', async (t) => {
  const root = await fixture(t);
  await rm(path.join(root, 'classnotes.md'));
  let calls = 0;
  await assert.rejects(renderClassnotes(root, { rename: async (from, to) => {
    calls++;
    if (calls === 1) return rename(from, to);
    throw Object.assign(new Error('persistent sharing violation'), { code: 'EPERM' });
  } }), { code: 'EPERM' });
  assert.equal(calls, 6);
  assert.ok(await readFile(path.join(root, 'classnotes.md'), 'utf8'));
  assert.equal((await (await import('../src/store.mjs')).readCourse(root)).state.revision, 1);
  await renderClassnotes(root);
  const receipt = JSON.parse(await readFile(path.join(root, '.notes-projection.json'), 'utf8'));
  assert.equal(receipt.revision, 1);
});
