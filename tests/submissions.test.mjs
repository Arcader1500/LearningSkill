import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile, symlink, utimes } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { commit } from '../src/store.mjs';
import { prepareAssessment, presentQuestion, submitWork, gradeAttempt } from '../src/assessment.mjs';
import { state } from './helpers.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('snapshots an explicitly selected external directory as an immutable, deterministic tree', async (t) => {
  const root = await mkdtemp(path.join(process.cwd(), '.test-tmp-submission-course-'));
  const source = await mkdtemp(path.join(process.cwd(), '.test-tmp-submission-source-'));
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(source, { recursive: true, force: true })]));
  await mkdir(path.join(source, 'nested'));
  const original = Buffer.from('learner work\n');
  await writeFile(path.join(source, 'answer.md'), original);
  await writeFile(path.join(source, 'nested', 'proof.txt'), 'evidence');
  const init = { schemaVersion: 1, recordId: 'init', operationId: 'init-op', kind: 'course_initialized', timestamp: new Date().toISOString(), courseId: 'course-1', revision: 1, contentRevision: 1, fingerprint: 'init', payload: { initialState: state({ phase: 'active' }) } };
  init.payload.initialState.lessons = [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }];
  init.payload.initialState.assignments = { 'assignment-1': 'pending' };
  await commit(root, { operationId: 'init-op', expectedRevision: 0, records: [init] });
  await prepareAssessment(root, { operationId: 'prepare', expectedRevision: 1, assessmentId: 'assignment-check', assignmentId: 'assignment-1', outcomeIds: ['outcome-1'], objective: 'Demonstrate outcome', rubricRevision: 1, questions: [{ questionId: 'submission', prompt: 'Submit the completed work.', type: 'free_text' }], criteria: [{ criterionId: 'complete', maxPoints: 1, essential: true, independenceRequired: true }], key: 'Private rubric notes', keyPath: 'assessments/assignment-check-key.md' });
  await presentQuestion(root, { operationId: 'present', expectedRevision: 2, assessmentId: 'assignment-check', questionId: 'submission', attemptId: 'attempt-1', presentationToken: 'token-1' });
  const result = await submitWork(root, { operationId: 'submit', expectedRevision: 3, assessmentId: 'assignment-check', assignmentId: 'assignment-1', attemptId: 'attempt-1', sourcePath: source, provenance: 'learner_supplied' });
  const evidence = result.state.attempts['attempt-1'].evidence.at(-1);
  assert.equal(evidence.provenance, 'learner_supplied');
  assert.match(evidence.snapshotSha256, /^[a-f0-9]{64}$/);
  assert.equal(sha(await readFile(path.join(source, 'answer.md'))), sha(original));
  const manifest = JSON.parse(await readFile(path.join(root, evidence.snapshotPath), 'utf8'));
  assert.deepEqual(manifest.files.map((f) => f.path), ['answer.md', 'nested/proof.txt']);
  assert.equal(manifest.files[0].sha256, sha(original));
  assert.equal(await readFile(path.join(root, 'submissions', 'assignment-check', 'attempt-1', 'answer.md'), 'utf8'), 'learner work\n');
  const graded = await gradeAttempt(root, { operationId: 'grade-submission', expectedRevision: 4, assessmentId: 'assignment-check', assignmentId: 'assignment-1', attemptId: 'attempt-1', rubricRevision: 1, assistance: 'none', evidence: [{ evidenceId: evidence.evidenceId, provenance: evidence.provenance, snapshotPath: evidence.snapshotPath, snapshotSha256: evidence.snapshotSha256 }], criteria: [{ criterionId: 'complete', points: 1, feedback: 'Submitted evidence reviewed.', evidenceRefs: [evidence.evidenceId], independent: true }], feedback: 'Submission meets the criterion.' });
  assert.equal(graded.state.assignments['assignment-1'].state, 'passed');
  assert.equal(graded.state.assessments['assignment-check'].state, 'passed');
  await writeFile(path.join(source, 'answer.md'), 'changed learner work\n');
  await assert.rejects(submitWork(root, { operationId: 'submit', expectedRevision: 3, assessmentId: 'assignment-check', assignmentId: 'assignment-1', attemptId: 'attempt-1', sourcePath: source, provenance: 'learner_supplied' }), { code: 'CONFLICT' });
  await presentQuestion(root, { operationId: 'present-file', expectedRevision: 5, assessmentId: 'assignment-check', questionId: 'submission', attemptId: 'attempt-2', presentationToken: 'token-2' });
  const single = await submitWork(root, { operationId: 'submit-file', expectedRevision: 6, assessmentId: 'assignment-check', assignmentId: 'assignment-1', attemptId: 'attempt-2', sourcePath: path.join(source, 'answer.md'), provenance: 'learner_supplied' });
  const singleEvidence = single.state.attempts['attempt-2'].evidence.at(-1);
  const singleManifest = JSON.parse(await readFile(path.join(root, singleEvidence.snapshotPath), 'utf8'));
  assert.deepEqual(singleManifest.files.map((f) => f.path), ['answer.md']);
  const selectedFile = path.join(source, 'answer.md');
  const beforeCapture = await readFile(selectedFile);
  let injected = false;
  await assert.rejects(submitWork(root, { operationId: 'changed-during-capture', expectedRevision: 7, assessmentId: 'assignment-check', assignmentId: 'assignment-1', attemptId: 'attempt-2', sourcePath: selectedFile, provenance: 'learner_supplied' }, {
    beforeRead: async (file) => {
      if (injected) return;
      injected = true;
      await writeFile(file, 'temporary changed bytes\n');
      await writeFile(file, beforeCapture);
      const future = new Date(Date.now() + 5000);
      await utimes(file, future, future);
    },
  }), { code: 'CONFLICT' });
  assert.equal(injected, true);
  assert.equal(sha(await readFile(selectedFile)), sha(beforeCapture));
});

test('rejects a selected tree containing an escaping symlink before committing', async (t) => {
  const root = await mkdtemp(path.join(process.cwd(), '.test-tmp-submission-link-course-'));
  const source = await mkdtemp(path.join(process.cwd(), '.test-tmp-submission-link-source-'));
  const outside = await mkdtemp(path.join(process.cwd(), '.test-tmp-submission-link-outside-'));
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(source, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
  await writeFile(path.join(outside, 'secret.txt'), 'secret');
  try { await symlink(path.join(outside, 'secret.txt'), path.join(source, 'escape.txt'), 'file'); }
  catch (e) {
    if (e.code !== 'EPERM' && e.code !== 'EACCES') throw e;
    try { await symlink(outside, path.join(source, 'escape-directory'), 'junction'); }
    catch (junctionError) { if (junctionError.code === 'EPERM' || junctionError.code === 'EACCES' || junctionError.code === 'ENOTSUP') { t.skip('OS allows neither symlink nor junction fixture'); return; } throw junctionError; }
  }
  const init = { schemaVersion: 1, recordId: 'init', operationId: 'init-op', kind: 'course_initialized', timestamp: new Date().toISOString(), courseId: 'course-1', revision: 1, contentRevision: 1, fingerprint: 'init', payload: { initialState: state({ phase: 'active' }) } };
  init.payload.initialState.lessons = [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }];
  await commit(root, { operationId: 'init-op', expectedRevision: 0, records: [init] });
  await prepareAssessment(root, { operationId: 'prepare', expectedRevision: 1, assessmentId: 'a1', outcomeIds: ['outcome-1'], objective: 'Show skill', rubricRevision: 1, questions: [{ questionId: 'q1', prompt: 'Submit.', type: 'free_text' }], criteria: [{ criterionId: 'c1', maxPoints: 1, essential: true, independenceRequired: false }], key: 'private', keyPath: 'assessments/a1-key.md' });
  await presentQuestion(root, { operationId: 'present', expectedRevision: 2, assessmentId: 'a1', questionId: 'q1', attemptId: 'try1', presentationToken: 'token1' });
  await assert.rejects(submitWork(root, { operationId: 'submit', expectedRevision: 3, assessmentId: 'a1', attemptId: 'try1', sourcePath: source, provenance: 'learner_supplied' }), { code: 'PATH_ESCAPE' });
});
