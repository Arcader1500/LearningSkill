import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { initializeCourse, publishCourse, discoverCourses, recordQA, recordProgress, resumeCourse } from '../src/course.mjs';
import { commit } from '../src/store.mjs';

const temp = async (t) => { const root = await mkdtemp(path.join(process.cwd(), '.test-tmp-course-')); t.after(() => rm(root, { recursive: true, force: true })); return root; };
const initRequest = { operationId: 'init', expectedRevision: 0, courseId: 'course-1', learnerContext: { level: 'beginner' }, goal: 'Understand layers', prerequisites: [], readingRateWpm: 238, lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'], requiredAssessmentIds: ['quiz-1'] }], assessments: { 'quiz-1': { state: 'pending', outcomeIds: ['outcome-1'] } }, assignments: {}, nextAction: 'Read lesson-1' };
const setup = async (t, courseRequest = initRequest) => {
  const root = await temp(t);
  await initializeCourse(root, courseRequest);
  await mkdir(path.join(root, 'lessons'), { recursive: true });
  await writeFile(path.join(root, 'course.md'), '# Layers\n\n## Goal\nUnderstand image layers.\n\n## Sources\n- [Lesson](lessons/lesson-1.md)\n');
  await writeFile(path.join(root, 'lessons', 'lesson-1.md'), '# Layers\n\nA layer stores changes.');
  return root;
};
const manifest = { goal: 'Understand layers', prerequisites: ['basic Linux'], scope: { included: ['layer storage'], excluded: ['registry internals'] }, lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }], sources: [{ title: 'OCI image spec', version: '1.1' }], estimates: { readingMinutes: 10, practiceMinutes: 5, setupMinutes: 0 }, materials: [{ path: 'course.md', role: 'course' }, { path: 'lessons/lesson-1.md', role: 'reading' }] };

test('initialization, validated publication, Q&A, reading progress and resume retain committed state', async (t) => {
  const root = await setup(t);
  const publishRequest = { operationId: 'pub', expectedRevision: 1, manifest };
  const published = await publishCourse(root, publishRequest);
  assert.equal(published.state.phase, 'active');
  assert.ok(published.records[0].payload.manifest.materials.every((x) => /^[a-f0-9]{64}$/.test(x.sha256)));
  const qaRequest = { operationId: 'qa', expectedRevision: 2, question: 'Why layers?', answerSummary: 'They store incremental changes.', followUp: 'Compare copying.', lessonId: 'lesson-1' };
  await recordQA(root, qaRequest);
  const progressRequest = { operationId: 'read', expectedRevision: 3, lessonId: 'lesson-1', reading: 'reported_complete' };
  await recordProgress(root, progressRequest);
  const resumed = await resumeCourse(root);
  assert.equal(resumed.state.reading['lesson-1'], 'reported_complete');
  assert.equal(resumed.state.assessments['quiz-1'].state, 'pending');
  assert.equal(resumed.records.length, 4);
  assert.equal((await initializeCourse(root, initRequest)).revision, 1);
  assert.equal((await publishCourse(root, publishRequest)).revision, 2);
  assert.equal((await recordQA(root, qaRequest)).revision, 3);
  assert.equal((await recordProgress(root, progressRequest)).revision, 4);

  const previousNotes = await readFile(path.join(root, 'classnotes.md'));
  await writeFile(path.join(root, 'classnotes.md'), 'unexpected manual edit');
  const notesRetry = { operationId: 'qa-notes-retry', expectedRevision: 4, question: 'How are changes layered?', answerSummary: 'New changes form another layer.' };
  const first = await recordQA(root, notesRetry);
  assert.equal(first.committed, true);
  assert.equal(first.notesStatus.ok, false);
  await writeFile(path.join(root, 'classnotes.md'), previousNotes);
  const retried = await recordQA(root, notesRetry);
  assert.equal(retried.revision, 5);
  assert.equal(retried.notesStatus.ok, true);
  assert.equal((await resumeCourse(root)).state.revision, 5);
});

test('initialization and fresh-process resume preserve optional questionnaire snapshots and legacy context', async (t) => {
  const question = { questionId: 'q-prereq', purpose: 'prerequisite', concept: 'containers', type: 'choice', prompt: 'How familiar are you with containers?', options: [{ optionId: 'new', text: 'New' }, { optionId: 'some', text: 'Some experience' }], selectedOptionId: 'some', response: 'I have used Docker once.', responseKind: 'explanation' };
  const partial = { status: 'partial', reason: 'Learner asked to proceed', questions: [{ questionId: 'q-open', purpose: 'prerequisite', concept: 'images', type: 'free_text', prompt: 'What do you know about images?', response: null, responseKind: 'unknown' }], interpretation: { strengths: [], possibleGaps: [], uncertainties: [], courseAdjustments: [] }, lesson0: { decision: 'not_needed', topics: [], reason: 'No foundation lesson selected from available evidence.' } };
  const snapshots = [
    { status: 'completed', reason: 'Answered', questions: [question], interpretation: { strengths: [{ summary: 'Has used Docker', questionIds: ['q-prereq'], learnerStatements: ['I have used Docker once.'] }], possibleGaps: [], uncertainties: [], courseAdjustments: [] }, lesson0: { decision: 'declined', topics: [], reason: 'Learner declined.' } },
    partial,
    ...['skipped', 'not_needed'].map(status => ({ status, reason: 'No diagnostic needed', questions: [], interpretation: { strengths: [], possibleGaps: [], uncertainties: [], courseAdjustments: [] }, lesson0: { decision: 'not_needed', topics: [], reason: 'No foundation lesson selected.' } })),
  ];
  for (const [index, snapshot] of snapshots.entries()) {
    const context = { level: 'beginner', preference: 'examples first', preCourseAssessment: snapshot };
    const root = await temp(t);
    await initializeCourse(root, { operationId: `questionnaire-${index}`, expectedRevision: 0, courseId: `course-${index}`, learnerContext: context, goal: 'Learn', prerequisites: [], readingRateWpm: 238, lessons: [], assessments: {}, assignments: {} });
    const entry = new URL('../src/course.mjs', import.meta.url).href;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `const { resumeCourse } = await import(${JSON.stringify(entry)}); const r = await resumeCourse(process.argv[1]); console.log(JSON.stringify({ schemaVersion: r.state.schemaVersion, learnerContext: r.state.learnerContext }));`, root], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { schemaVersion: 1, learnerContext: context });
  }
  const root = await temp(t);
  await initializeCourse(root, { operationId: 'legacy-context', expectedRevision: 0, courseId: 'legacy', learnerContext: { level: 'beginner' }, goal: 'Learn', prerequisites: [], readingRateWpm: 238, lessons: [], assessments: {}, assignments: {} });
  assert.equal(Object.hasOwn((await resumeCourse(root)).state.learnerContext, 'preCourseAssessment'), false);
});

test('completion projection keeps a placeholder required assessment pending', async (t) => {
  const confidentSnapshot = { status: 'completed', reason: 'Learner reported confidence', questions: [{ questionId: 'q', purpose: 'prerequisite', concept: 'layers', type: 'free_text', prompt: 'Explain a layer.', response: 'I know this well.', responseKind: 'self_report' }], interpretation: { strengths: [{ summary: 'Reports confidence', questionIds: ['q'], learnerStatements: ['I know this well.'] }], possibleGaps: [], uncertainties: [], courseAdjustments: [] }, lesson0: { decision: 'not_needed', topics: [], reason: 'No foundation lesson selected.' } };
  const root = await setup(t, { ...initRequest, learnerContext: { level: 'beginner', preCourseAssessment: confidentSnapshot } });
  await publishCourse(root, { operationId: 'pub', expectedRevision: 1, manifest });
  const closed = await recordProgress(root, { operationId: 'finish-pending', expectedRevision: 2, action: 'finish' });
  assert.equal(closed.state.phase, 'closed_with_exceptions');
  assert.ok(closed.state.unresolvedTopics.some((item) => item.includes('outcome-1')));
  assert.equal(closed.state.assessments['quiz-1'].state, 'pending');
  assert.deepEqual(closed.state.attempts, {});
});

test('a published lesson outcome without an assessment cannot complete the course', async (t) => {
  const request = { ...initRequest, assessments: {}, lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'] }] };
  const root = await setup(t, request);
  await publishCourse(root, { operationId: 'pub-no-assessment', expectedRevision: 1, manifest });
  await recordProgress(root, { operationId: 'read-no-assessment', expectedRevision: 2, lessonId: 'lesson-1', reading: 'reported_complete' });

  const result = await recordProgress(root, { operationId: 'finish-no-assessment', expectedRevision: 3, action: 'finish' });
  assert.equal(result.state.phase, 'closed_with_exceptions');
  assert.ok(result.state.unresolvedTopics.some((item) => item.includes('outcome-1')));
});

test('an explicitly not-required assessment exempts its outcome after reported reading completion', async (t) => {
  const request = {
    ...initRequest,
    lessons: [{ lessonId: 'lesson-1', outcomeIds: ['outcome-1'], requiredAssessmentIds: ['quiz-exempt'] }],
    assessments: { 'quiz-exempt': { state: 'not_required', outcomeIds: ['outcome-1'] } },
  };
  const root = await setup(t, request);
  await publishCourse(root, { operationId: 'pub-exempt', expectedRevision: 1, manifest });
  await recordProgress(root, { operationId: 'read-exempt', expectedRevision: 2, lessonId: 'lesson-1', reading: 'reported_complete' });

  const result = await recordProgress(root, { operationId: 'finish-exempt', expectedRevision: 3, action: 'finish' });
  assert.equal(result.state.phase, 'completed');
});

test('discovery is bounded, reports ambiguity/corruption and explicit roots resume directly', async (t) => {
  const workspace = await temp(t); const courses = path.join(workspace, 'courses'); await mkdir(courses);
  const one = path.join(courses, 'one');
  await initializeCourse(one, { operationId: 'init-one', expectedRevision: 0, courseId: 'one', learnerContext: {}, goal: 'Learn', prerequisites: [], readingRateWpm: 238, lessons: [], assessments: {}, assignments: {} });
  assert.equal((await discoverCourses(workspace)).courses.length, 1);
  assert.equal((await resumeCourse(one)).state.courseId, 'one');
  const broken = path.join(courses, 'broken'); await mkdir(broken); await writeFile(path.join(broken, 'state.json'), '{broken');
  const result = await discoverCourses(workspace);
  assert.equal(result.courses.length, 1);
  assert.equal(result.errors.length, 1);
  const two = path.join(courses, 'two');
  await initializeCourse(two, { operationId: 'init-two', expectedRevision: 0, courseId: 'two', learnerContext: {}, goal: 'Learn', prerequisites: [], readingRateWpm: 238, lessons: [], assessments: {}, assignments: {} });
  const ambiguous = await discoverCourses(workspace);
  assert.equal(ambiguous.ambiguous, true);
  assert.equal(ambiguous.selected, null);
});

test('publication rejects incomplete or escaping material and initialization never overwrites', async (t) => {
  const root = await setup(t);
  await assert.rejects(initializeCourse(root, { operationId: 'again', expectedRevision: 0, courseId: 'course-1' }), { code: 'CONFLICT' });
  await assert.rejects(publishCourse(root, { operationId: 'bad', expectedRevision: 1, manifest: { ...manifest, materials: [{ path: '../outside', role: 'reading' }] } }), { code: 'PATH_ESCAPE' });
  await mkdir(path.join(root, 'lessons'), { recursive: true });
  await writeFile(path.join(root, 'lessons', 'template.md'), '# Lesson\n\nTODO write this lesson');
  await assert.rejects(publishCourse(root, { operationId: 'empty', expectedRevision: 1, manifest: { ...manifest, materials: [{ path: 'lessons/template.md', role: 'reading' }] } }), { code: 'NOT_READY' });
});

test('material hashes are checked on resume; explicit material revision preserves old history', async (t) => {
  const root = await setup(t); await publishCourse(root, { operationId: 'pub', expectedRevision: 1, manifest });
  await writeFile(path.join(root, 'lessons', 'lesson-1.md'), 'Changed material');
  const resumed = await resumeCourse(root);
  assert.equal(resumed.materialStatus.ok, false);
  assert.ok(resumed.materialStatus.mismatches.length);
});

test('republishing active material creates a new content revision and preserves reading progress', async (t) => {
  const root = await setup(t);
  const publishRequest = { operationId: 'pub', expectedRevision: 1, manifest };
  await publishCourse(root, publishRequest);
  await recordProgress(root, { operationId: 'read', expectedRevision: 2, lessonId: 'lesson-1', reading: 'in_progress' });
  await writeFile(path.join(root, 'lessons', 'lesson-1.md'), '# Layers\n\nA layer stores filesystem changes and metadata.');
  const revised = await publishCourse(root, { operationId: 'revise', expectedRevision: 3, manifest, nextAction: 'Review the updated lesson' });
  assert.equal(revised.state.contentRevision, 2);
  assert.equal(revised.state.reading['lesson-1'], 'in_progress');
  assert.equal(revised.records[0].kind, 'course_revised');
  assert.equal((await publishCourse(root, publishRequest)).revision, 2);
});

test('retry, skips and finish preserve learner choice and enumerate course exceptions', async (t) => {
  const root = await setup(t);
  const retry = await recordProgress(root, { operationId: 'retry', expectedRevision: 1, action: 'retry', assessmentId: 'quiz-1', attemptId: 'attempt-1' });
  assert.equal(retry.state.assessments['quiz-1'].activeAttemptId, 'attempt-1');
  const skipRequest = { operationId: 'skip-work', expectedRevision: 2, action: 'skip', itemType: 'assessment', itemId: 'quiz-1', reason: 'Pause for now' };
  await recordProgress(root, skipRequest);
  await recordProgress(root, { operationId: 'skip-lesson', expectedRevision: 3, action: 'skip', itemType: 'lesson', itemId: 'lesson-1', reason: 'Already familiar' });
  const finishRequest = { operationId: 'finish', expectedRevision: 4, action: 'finish' };
  const closed = await recordProgress(root, finishRequest);
  assert.equal(closed.state.phase, 'closed_with_exceptions');
  assert.ok(closed.state.unresolvedTopics.some((item) => item.includes('quiz-1')));
  assert.ok(closed.state.unresolvedTopics.some((item) => item.includes('lesson-1')));
  assert.equal((await recordProgress(root, skipRequest)).revision, 3);
  assert.equal((await recordProgress(root, finishRequest)).revision, 5);
});

test('a fresh process resumes pending, submitted, graded and skipped work from committed records', async (t) => {
  const rubric = [{ criterionId: 'reasoning', maxPoints: 2, essential: true, independenceRequired: true }];
  const resumeEntry = new URL('../src/course.mjs', import.meta.url).href;
  const childScript = `const { resumeCourse } = await import(${JSON.stringify(resumeEntry)}); const result = await resumeCourse(process.argv[1]); console.log(JSON.stringify({ ok: result.ok, revision: result.state?.revision, pendingQuestion: result.pendingQuestion, assessment: result.state?.assessments['quiz-2'] ?? result.state?.assessments['quiz-1'], attempt: result.state?.attempts['attempt-1'] }));`;
  const freshResume = (root) => {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', childScript, root], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };
  const scenarios = ['pending', 'submitted', 'graded', 'skipped'];
  for (const scenario of scenarios) {
    const root = await setup(t);
    const operationId = `fixture-${scenario}`;
    const entries = scenario === 'skipped'
      ? [['item_skipped', { itemType: 'assessment', itemId: 'quiz-1', reason: 'Learner paused this item' }]]
      : [
          ['assessment_prepared', { assessmentId: 'quiz-2', objective: 'Explain layers', outcomeIds: ['outcome-1'], rubricRevision: 1, questions: [{ questionId: 'q1', prompt: 'Why are layers useful?', type: 'free_text' }], criteria: rubric, keyPath: 'assessments/quiz-2-key.md' }],
          ['question_presented', { assessmentId: 'quiz-2', questionId: 'q1', attemptId: 'attempt-1', presentationToken: 'token-1', prompt: 'Why are layers useful?' }],
          ...(scenario === 'pending' ? [] : [['answer_recorded', { assessmentId: 'quiz-2', questionId: 'q1', attemptId: 'attempt-1', presentationToken: 'token-1', response: 'They avoid repeating unchanged data.', evidenceId: 'answer-attempt-1' }]]),
          ...(scenario === 'graded' ? [['attempt_graded', { assessmentId: 'quiz-2', attemptId: 'attempt-1', rubricRevision: 1, assistance: 'none', evidence: [{ evidenceId: 'answer-attempt-1', provenance: 'learner_supplied' }], criteria: [{ criterionId: 'reasoning', points: 2, feedback: 'Sound reasoning.', evidenceRefs: ['answer-attempt-1'], independent: true }], feedback: 'Passed.' }]] : []),
        ];
    const records = entries.map(([kind, payload], index) => ({ schemaVersion: 1, recordId: `${scenario}-${index}`, operationId, kind, timestamp: new Date(Date.UTC(2026, 0, index + 2)).toISOString(), courseId: 'course-1', revision: index + 2, contentRevision: 1, fingerprint: `pending-${scenario}`, payload }));
    await commit(root, { operationId, expectedRevision: 1, records });
    const resumed = freshResume(root);
    assert.equal(resumed.ok, true, scenario);
    if (scenario === 'pending') {
      assert.equal(resumed.pendingQuestion.prompt, 'Why are layers useful?');
      assert.equal(resumed.assessment.state, 'in_progress');
    } else if (scenario === 'submitted') {
      assert.equal(resumed.pendingQuestion, null);
      assert.equal(resumed.attempt.response, 'They avoid repeating unchanged data.');
      assert.equal(resumed.assessment.state, 'submitted');
    } else if (scenario === 'graded') {
      assert.equal(resumed.attempt.response, 'They avoid repeating unchanged data.');
      assert.equal(resumed.assessment.state, 'passed');
    } else {
      assert.equal(resumed.revision, 2);
      assert.equal(resumed.assessment.state, 'skipped');
    }
  }
});



test('revision can insert lessons while preserving existing progress and attempts', async (t) => {
  const root = await setup(t);
  await publishCourse(root, { operationId: 'pub', expectedRevision: 1, manifest });
  await recordProgress(root, { operationId: 'read', expectedRevision: 2, lessonId: 'lesson-1', reading: 'in_progress' });
  const before = await resumeCourse(root);
  const revisedManifest = { ...manifest, lessons: [{ lessonId: 'lesson-0', title: 'Fundamentals', outcomeIds: ['outcome-0'] }, ...manifest.lessons], materials: [...manifest.materials, { path: 'lessons/lesson-0.md', role: 'reading' }] };
  await writeFile(path.join(root, 'lessons', 'lesson-0.md'), '# Linux fundamentals\n');
  const result = await publishCourse(root, { operationId: 'revise', expectedRevision: 3, manifest: revisedManifest });
  assert.deepEqual(result.state.lessons.map(x => x.lessonId), ['lesson-0', 'lesson-1']);
  assert.equal(result.state.reading['lesson-0'], 'not_started');
  assert.equal(result.state.reading['lesson-1'], 'in_progress');
  assert.deepEqual(result.state.attempts, before.state.attempts);
  assert.equal(result.state.contentRevision, 2);
});

test('revision rejects removed, duplicate, and outcome-changed lessons', async (t) => {
  const root = await setup(t); await publishCourse(root, { operationId: 'pub', expectedRevision: 1, manifest });
  for (const lessons of [[], [...manifest.lessons, ...manifest.lessons], [{ lessonId: 'lesson-1', outcomeIds: ['changed'] }]]) {
    await assert.rejects(publishCourse(root, { operationId: `bad-${JSON.stringify(lessons)}`, expectedRevision: 2, manifest: { ...manifest, lessons } }));
  }
  assert.equal((await resumeCourse(root)).state.revision, 2);
});

test('publication allows technical template prose and Docker expressions but rejects unresolved authoring markers', async (t) => {
  const root = await setup(t);
  await writeFile(path.join(root, 'lessons', 'lesson-1.md'), 'The template explains Docker. Use `docker inspect --format \'{{.State.Pid}}\' image`.');
  await publishCourse(root, { operationId: 'technical', expectedRevision: 1, manifest });
  const rejected = await setup(t);
  await writeFile(path.join(rejected, 'lessons', 'lesson-1.md'), '# Lesson\n\nTODO: write later');
  await assert.rejects(publishCourse(rejected, { operationId: 'todo', expectedRevision: 1, manifest }));
});
