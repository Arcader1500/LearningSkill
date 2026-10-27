import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const repo = path.resolve('.');
const packages = ['codex', 'antigravity'];
const manifest = {
  goal: 'Understand container image layers', prerequisites: ['basic Linux'],
  scope: { included: ['layer reuse'], excluded: ['registry internals'] },
  lessons: [{ lessonId: 'layers', outcomeIds: ['explain-reuse'] }],
  sources: [{ title: 'OCI Image Specification', version: '1.1' }],
  estimates: { readingMinutes: 3, practiceMinutes: 5, setupMinutes: 0 },
  materials: [{ path: 'course.md', role: 'course' }, { path: 'lessons/layers.md', role: 'reading' }],
};
const criteria = [{ criterionId: 'reasoning', maxPoints: 2, essential: true, independenceRequired: true }];

test('both isolated packages replay assistance, fresh challenge, snapshot grading and honest close in fresh processes', async (t) => {
  for (const platform of packages) {
    const sandbox = await mkdtemp(path.join(repo, '.test-tmp-integration-'));
    t.after(() => rm(sandbox, { recursive: true, force: true }));
    const pkg = path.join(sandbox, platform);
    await cp(path.join(repo, 'dist', platform), pkg, { recursive: true });
    const helper = path.join(pkg, 'skills', 'learn', 'scripts', 'learning-state.mjs');
    const workspace = path.join(sandbox, 'workspace');
    const root = path.join(workspace, 'courses', 'layers');
    await mkdir(path.join(root, 'lessons'), { recursive: true });
    await writeFile(path.join(root, 'course.md'), '# Fixture course\n\nTest fixture: understand image layer reuse.\n');
    await writeFile(path.join(root, 'lessons', 'layers.md'), '# Fixture lesson\n\nTest fixture: unchanged layers can be reused.\n');
    const source = path.join(workspace, 'answer.md');
    const sourceBytes = Buffer.from('# Fixture submission\nFROM scratch\n');
    await writeFile(source, sourceBytes);
    const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
    const call = async (op, payload = {}, revision) => {
      const request = { protocolVersion: 1, op, workspaceRoot: workspace, courseRoot: root,
        ...(revision === undefined ? {} : { operationId: `${platform}-${op.replaceAll('.', '-')}-${revision}`, expectedRevision: revision }),
        ...(Object.keys(payload).length ? { payload } : {}) };
      const file = path.join(sandbox, `request-${Math.random()}.json`);
      await writeFile(file, JSON.stringify(request));
      try {
        const child = spawnSync(process.execPath, [helper, file], { cwd: sandbox, encoding: 'utf8' });
        assert.equal(child.stderr, '', child.stderr);
        const result = JSON.parse(child.stdout);
        assert.equal(result.ok, true, child.stdout);
        assert.equal(child.status, result.ok ? 0 : 1, child.stdout);
        return result;
      } finally { await rm(file, { force: true }); }
    };

    let r = await call('course.init', { courseId: 'layers-course', learnerContext: { fixture: 'test-only persona', level: 'basic Linux' }, goal: manifest.goal,
      prerequisites: manifest.prerequisites, readingRateWpm: 238,
      lessons: [{ lessonId: 'layers', outcomeIds: ['explain-reuse'], requiredAssessmentIds: [] }], assessments: {},
      assignments: { 'dockerfile-task': 'pending', 'optional-lab': 'pending' } }, 0);
    assert.equal(r.committed, true);
    assert.equal((await call('course.publish', { manifest }, 1)).committed, true);
    assert.equal((await call('qa.record', { lessonId: 'layers', question: 'Why can layers be reused?', answerSummary: 'Unchanged filesystem changes can be shared.', followUp: 'Consider a changed base image.' }, 2)).committed, true);
    assert.equal((await call('progress.record', { lessonId: 'layers', reading: 'reported_complete' }, 3)).committed, true);

    const prepare = (assessmentId, questionId, prompt) => ({ assessmentId, objective: 'Explain layer reuse', outcomeIds: ['explain-reuse'],
      rubricRevision: 1, questions: [{ questionId, prompt, type: 'free_text' }], criteria,
      keyPath: `assessments/${assessmentId}-key.md`, key: 'Fixture-only private key' });
    await call('assessment.prepare', prepare('assisted-quiz', 'initial', 'A changed image has one modified middle layer. Predict which layers can be shared and explain why.'), 4);
    r = await call('question.present', { assessmentId: 'assisted-quiz', questionId: 'initial', attemptId: 'assisted-attempt', presentationToken: 'assisted-token' }, 5);
    assert.equal(r.pendingQuestion.prompt.startsWith('A changed image'), true);
    r = await call('course.resume');
    assert.equal(r.pendingQuestion.prompt.startsWith('A changed image'), true, 'fresh helper process reoffers exact unanswered question');
    assert.deepEqual(r.pendingQuestion, (await call('course.resume')).pendingQuestion);
    await call('answer.record', { assessmentId: 'assisted-quiz', questionId: 'initial', attemptId: 'assisted-attempt', presentationToken: 'assisted-token', response: 'Test fixture response: unchanged layers can be shared.' }, 6);
    await call('assistance.record', { attemptId: 'assisted-attempt', assistance: 'hint', summary: 'Fixture tutor gave a targeted hint.' }, 7);
    r = await call('attempt.grade', { assessmentId: 'assisted-quiz', attemptId: 'assisted-attempt', rubricRevision: 1, assistance: 'hint',
      evidence: [{ evidenceId: 'answer-assisted-attempt', provenance: 'learner_supplied' }],
      criteria: [{ criterionId: 'reasoning', points: 2, feedback: 'Fixture response is sound with a hint.', evidenceRefs: ['answer-assisted-attempt'], independent: false }],
      feedback: 'Fixture assisted attempt earns points; independent evidence remains pending.' }, 8);
    assert.equal(r.state.assessments['assisted-quiz'].state, 'needs_review');

    await call('assessment.prepare', prepare('fresh-quiz', 'fresh-question', 'For a new base image, describe one condition under which an earlier layer is not reusable.'), 9);
    await call('question.present', { assessmentId: 'fresh-quiz', questionId: 'fresh-question', attemptId: 'fresh-attempt', presentationToken: 'fresh-token' }, 10);
    await call('answer.record', { assessmentId: 'fresh-quiz', questionId: 'fresh-question', attemptId: 'fresh-attempt', presentationToken: 'fresh-token', response: 'Test fixture response: a changed instruction changes that layer and later dependent layers.' }, 11);
    r = await call('attempt.grade', { assessmentId: 'fresh-quiz', attemptId: 'fresh-attempt', rubricRevision: 1, assistance: 'none',
      evidence: [{ evidenceId: 'answer-fresh-attempt', provenance: 'learner_supplied' }],
      criteria: [{ criterionId: 'reasoning', points: 2, feedback: 'Fixture independent explanation.', evidenceRefs: ['answer-fresh-attempt'], independent: true }], feedback: 'Fixture fresh check passed.' }, 12);
    assert.equal(r.state.assessments['fresh-quiz'].state, 'passed');

    await call('assessment.prepare', { ...prepare('dockerfile-task', 'submission-question', 'Submit your learner-authored Dockerfile.'), assignmentId: 'dockerfile-task',
      objective: 'Provide learner-authored Dockerfile evidence.' }, 13);
    await call('question.present', { assessmentId: 'dockerfile-task', questionId: 'submission-question', attemptId: 'submission-attempt', presentationToken: 'submission-token' }, 14);
    const before = sha(await readFile(source));
    r = await call('submission.record', { assessmentId: 'dockerfile-task', assignmentId: 'dockerfile-task', attemptId: 'submission-attempt', sourcePath: source, provenance: 'learner_supplied' }, 15);
    assert.equal(sha(await readFile(source)), before, 'grading flow does not alter learner source');
    const evidence = r.state.attempts['submission-attempt'].evidence.at(-1);
    assert.match(evidence.snapshotSha256, /^[a-f0-9]{64}$/);
    assert.equal(await readFile(source, 'utf8'), sourceBytes.toString());
    r = await call('attempt.grade', { assessmentId: 'dockerfile-task', assignmentId: 'dockerfile-task', attemptId: 'submission-attempt', rubricRevision: 1,
      assistance: 'none', evidence: [{ evidenceId: evidence.evidenceId, provenance: 'learner_supplied', snapshotPath: evidence.snapshotPath, snapshotSha256: evidence.snapshotSha256 }],
      criteria: [{ criterionId: 'reasoning', points: 2, feedback: 'Fixture file inspected only; runtime was not run.', evidenceRefs: [evidence.evidenceId], independent: true }], feedback: 'Fixture file evidence graded; no build/runtime claim.' }, 16);
    assert.equal(r.state.assignments['dockerfile-task'].state, 'passed');
    assert.equal((await call('course.resume')).state.attempts['submission-attempt'].evidence.at(-1).snapshotSha256, evidence.snapshotSha256);
    await call('progress.record', { action: 'skip', itemType: 'assignment', itemId: 'optional-lab', reason: 'Fixture learner skips optional lab.' }, 17);
    r = await call('progress.record', { action: 'finish' }, 18);
    assert.equal(r.state.phase, 'closed_with_exceptions');
    assert.ok(r.state.unresolvedTopics.some((topic) => topic.includes('optional-lab')));
    assert.doesNotMatch(JSON.stringify(r), /Fixture-only private key/);
  }
});
