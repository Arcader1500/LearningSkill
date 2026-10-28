import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildPlugins } from '../scripts/build-plugins.mjs';

test('both packaged helpers preserve questionnaire context through compact bootstrap, retry and fresh-process resume', async (t) => {
  const root = await mkdtemp(path.join(process.cwd(), '.test-tmp-workflow-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['shared', 'platforms', 'src']) await cp(dir, path.join(root, dir), { recursive: true });
  await mkdir(path.join(root, 'scripts'));
  await cp('scripts/learning-state.mjs', path.join(root, 'scripts/learning-state.mjs'));
  await mkdir(path.join(root, 'docs'));
  await cp('docs/protocol.md', path.join(root, 'docs/protocol.md'));
  await buildPlugins({ root });
  const snapshot = { status: 'partial', reason: 'Learner asked to proceed before finishing', questions: [{ questionId: 'q', purpose: 'prerequisite', concept: 'layers', type: 'free_text', prompt: 'What do you know about layers?', response: null, responseKind: 'unknown' }], interpretation: { strengths: [], possibleGaps: [], uncertainties: [{ summary: 'Prerequisites remain uncertain', questionIds: ['q'], learnerStatements: [] }], courseAdjustments: [] }, lesson0: { decision: 'not_needed', topics: [], reason: 'No foundation lesson selected from available evidence.' } };
  for (const platform of ['codex', 'antigravity']) {
  const courseRoot = path.join(root, 'courses', platform, 'layers');
  await mkdir(courseRoot, { recursive: true });
  await writeFile(path.join(courseRoot, 'course.md'), '# Layers\n\n[Read the lesson](lesson.md)');
  await writeFile(path.join(courseRoot, 'lesson.md'), '# Layers\n\nA layer stores changes.');
  const requestPath = path.join(root, `${platform}-request.json`);
  const request = {
    protocolVersion: 1, op: 'course.bootstrap', workspaceRoot: root, courseRoot,
    operationId: 'bootstrap', expectedRevision: 0, responseMode: 'compact',
    payload: {
      init: { courseId: 'layers', learnerContext: { level: 'beginner', preCourseAssessment: snapshot }, goal: 'Learn layers', prerequisites: [], readingRateWpm: 238, lessons: [{ lessonId: 'one', outcomeIds: ['layers'] }] },
      assessments: [{ assessmentId: 'quiz', objective: 'Explain layers', outcomeIds: ['layers'], rubricRevision: 1, questions: [{ questionId: 'q', type: 'free_text', prompt: 'Explain a layer.' }], criteria: [{ criterionId: 'reason', maxPoints: 1, essential: true, independenceRequired: true }], keyPath: 'assessments/key.md', key: 'PRIVATE-ANSWER-SENTINEL' }],
      publish: { manifest: { goal: 'Learn layers', prerequisites: [], scope: { included: ['layers'], excluded: [] }, lessons: [{ lessonId: 'one', outcomeIds: ['layers'] }], sources: [], estimates: { readingMinutes: 1, practiceMinutes: 1, setupMinutes: 0 }, materials: [{ path: 'course.md', role: 'course' }, { path: 'lesson.md', role: 'reading' }, { path: 'assessments/key.md', role: 'key' }] } },
      initialProgress: [{ lessonId: 'one', reading: 'in_progress', nextAction: 'Discuss layer reuse' }],
    },
  };
  const helper = path.join(root, `dist/${platform}/skills/learn/scripts/learning-state.mjs`);
  const run = (...args) => {
    const child = spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8' });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr || child.stdout);
    assert.ok(!child.stdout.includes('PRIVATE-ANSWER-SENTINEL'));
    return JSON.parse(child.stdout);
  };
  await writeFile(requestPath, JSON.stringify(request));
  const first = run('--cleanup-request', requestPath);
  assert.equal(first.committed, true);
  assert.equal(first.revision, 4);
  assert.equal(first.state, undefined);
  assert.equal(first.nextAction, 'Discuss layer reuse');
  assert.deepEqual(first.cleanupStatus, { ok: true, removed: true });
  await assert.rejects(readFile(requestPath), { code: 'ENOENT' });
  const committed = JSON.parse(await readFile(path.join(courseRoot, 'state.json'), 'utf8'));
  assert.deepEqual(committed.learnerContext, request.payload.init.learnerContext);
  assert.equal(committed.schemaVersion, 1);
  assert.equal(committed.assessments.quiz.state, 'pending');
  assert.deepEqual(committed.attempts, {});
  assert.deepEqual(committed.reading, { one: 'in_progress' });
  await writeFile(requestPath, JSON.stringify(request));
  assert.equal(run('--cleanup-request', requestPath).idempotent, true);
  assert.deepEqual(JSON.parse(await readFile(path.join(courseRoot, 'state.json'), 'utf8')).learnerContext, request.payload.init.learnerContext);
  await writeFile(requestPath, JSON.stringify({ protocolVersion: 1, op: 'course.resume', workspaceRoot: root, courseRoot, responseMode: 'compact' }));
  const resumed = run(requestPath);
  assert.equal(resumed.state.phase, 'active');
  assert.equal(resumed.state.revision, 4);
  assert.equal(resumed.state.reading.one, 'in_progress');
  assert.equal(resumed.state.assessments.quiz.state, 'pending');
  assert.deepEqual(JSON.parse(await readFile(path.join(courseRoot, 'state.json'), 'utf8')).learnerContext, request.payload.init.learnerContext);
  }
});
