import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { bootstrapCourse } from '../src/bootstrap.mjs';
import { readCourse } from '../src/store.mjs';
import { initializeCourse, publishCourse, recordProgress } from '../src/course.mjs';

const init = { courseId: 'course-boot', learnerContext: { level: 'beginner' }, goal: 'Learn layers', prerequisites: [], readingRateWpm: 238, lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], assessments: {}, assignments: {} };
const manifest = { goal: 'Learn layers', prerequisites: [], scope: { included: ['layers'], excluded: [] }, lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], sources: [{ title: 'Guide', version: '1' }], estimates: { readingMinutes: 2, practiceMinutes: 2, setupMinutes: 0 }, materials: [{ path: 'course.md', role: 'course' }, { path: 'lesson.md', role: 'reading' }] };
async function rootFor(t) {
  const root = await mkdtemp(path.join(process.cwd(), '.test-bootstrap-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'course.md'), '# Layers\n\nA course about layers.');
  await writeFile(path.join(root, 'lesson.md'), '# Layer one\n\nA layer stores changes.');
  return root;
}

test('bootstrap commits init, publication and progress in one consecutive history and replays idempotently', async (t) => {
  const root = await rootFor(t);
  const sequentialRoot = await rootFor(t);
  const request = { operationId: 'bootstrap-op', expectedRevision: 0, init, assessments: [], publish: { manifest }, initialProgress: [{ lessonId: 'lesson-1', reading: 'in_progress' }] };
  const first = await bootstrapCourse(root, request);
  await initializeCourse(sequentialRoot, { ...init, operationId: 'seq-init', expectedRevision: 0 });
  await publishCourse(sequentialRoot, { operationId: 'seq-publish', expectedRevision: 1, manifest });
  await recordProgress(sequentialRoot, { operationId: 'seq-progress', expectedRevision: 2, ...request.initialProgress[0] });
  assert.equal(first.revision, 3);
  assert.deepEqual(first.records.map((r) => r.kind), ['course_initialized', 'course_published', 'progress_recorded']);
  assert.deepEqual(first.records.map((r) => r.revision), [1, 2, 3]);
  assert.ok(first.records.every((r) => r.operationId === 'bootstrap-op'));
  assert.equal((await readCourse(root)).state.reading['lesson-1'], 'in_progress');
  const sequential = (await readCourse(sequentialRoot)).state;
  assert.equal(first.state.phase, sequential.phase);
  assert.equal(first.state.goal, sequential.goal);
  assert.deepEqual(first.state.courseManifest, sequential.courseManifest);
  assert.deepEqual(first.state.reading, sequential.reading);
  const replay = await bootstrapCourse(root, request);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.revision, 3);
  assert.equal((await readCourse(root)).records.length, 3);
});

test('invalid publication leaves no authoritative checkpoint', async (t) => {
  const root = await rootFor(t);
  const request = { operationId: 'bad-bootstrap', expectedRevision: 0, init, assessments: [], publish: { manifest: { ...manifest, materials: [] } } };
  await assert.rejects(bootstrapCourse(root, request), (error) => error.code === 'INVALID_INPUT');
  await assert.rejects(readCourse(root), (error) => error.code === 'CORRUPT_STATE');
});

const assessment = { assessmentId: 'quiz-1', objective: 'Explain layers', outcomeIds: ['outcome-1'], rubricRevision: 1, questions: [{ questionId: 'q1', prompt: 'What is a layer?', type: 'free_text' }], criteria: [{ criterionId: 'c1', maxPoints: 2, essential: true, independenceRequired: true }], keyPath: 'assessments/key.md', key: '# Private key\nAnswer: incremental changes.' };
function assessmentRequest(operationId = 'bootstrap-assessed') {
  const authored = structuredClone(init);
  authored.assessments = { 'quiz-1': { state: 'pending', outcomeIds: ['outcome-1'] } };
  return { operationId, expectedRevision: 0, init: authored, assessments: [assessment], publish: { manifest: { ...manifest, materials: [...manifest.materials, { path: 'assessments/quiz-1.json', role: 'key' }, { path: 'assessments/key.md', role: 'key' }] } } };
}

test('staged assessment and private key bytes are validated, snapshotted and hashed into publication', async (t) => {
  const root = await rootFor(t);
  await writeFile(path.join(root, 'course.md'), '# Layers\n\n[Quiz](assessments/quiz-1.json) [Key](assessments/key.md)');
  const request = assessmentRequest();
  const result = await bootstrapCourse(root, request);
  assert.equal(result.revision, 3);
  assert.equal(result.state.assessments['quiz-1'].state, 'pending');
  const keyBytes = await readFile(path.join(root, 'assessments/key.md'));
  assert.equal(keyBytes.toString(), assessment.key);
  const manifestKey = result.state.courseManifest.materials.find((x) => x.path === 'assessments/key.md');
  assert.equal(manifestKey.sha256, createHash('sha256').update(keyBytes).digest('hex'));
  assert.ok(result.records.every((r) => r.operationId === request.operationId));
});

test('duplicate staged keys and changed retries fail without changing checkpoint', async (t) => {
  const root = await rootFor(t);
  const duplicate = assessmentRequest('dup-bootstrap');
  duplicate.assessments.push({ ...assessment, assessmentId: 'quiz-2' });
  duplicate.assessments[1].keyPath = assessment.keyPath;
  await assert.rejects(bootstrapCourse(root, duplicate), { code: 'INVALID_INPUT' });
  await assert.rejects(readCourse(root), { code: 'CORRUPT_STATE' });

  const request = { operationId: 'retry-bootstrap', expectedRevision: 0, init, assessments: [], publish: { manifest } };
  await bootstrapCourse(root, request);
  await assert.rejects(bootstrapCourse(root, { ...request, publish: { manifest: { ...manifest, goal: 'Changed' } } }), { code: 'CONFLICT' });
  assert.equal((await readCourse(root)).records.length, 2);
});

test('an assessment key cannot be exposed as reading material', async (t) => {
  const root = await rootFor(t);
  const request = assessmentRequest('private-key-check');
  request.publish.manifest.materials.find((item) => item.path === assessment.keyPath).role = 'reading';
  await assert.rejects(bootstrapCourse(root, request), { code: 'INVALID_INPUT' });
  await assert.rejects(readCourse(root), { code: 'CORRUPT_STATE' });
});

test('deterministic record IDs let a retry reuse an orphan record after a pre-checkpoint interruption', async (t) => {
  const root = await rootFor(t);
  const request = { operationId: 'orphan-bootstrap', expectedRevision: 0, init, assessments: [], publish: { manifest } };
  const recordId = `r-${createHash('sha256').update(request.operationId).digest('hex').slice(0, 24)}-1`;
  const stagingRoot = await rootFor(t);
  const result = await bootstrapCourse(stagingRoot, request);
  const orphan = await readFile(path.join(stagingRoot, 'records', `${recordId}.json`));
  await mkdir(path.join(root, 'records'), { recursive: true });
  await writeFile(path.join(root, 'records', `${recordId}.json`), orphan);
  const retried = await bootstrapCourse(root, request);
  assert.equal(retried.revision, result.revision);
  assert.equal((await readCourse(root)).records.length, 2);
});
