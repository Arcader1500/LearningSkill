import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { commit, readCourse } from './store.mjs';
import { fail } from './errors.mjs';
import { resolveContained } from './paths.mjs';
import { renderClassnotes } from './notes.mjs';
import { deriveProgress } from './model.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const id = () => randomUUID().replaceAll('-', '');
const isId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const blocked = (state) => ['completed', 'closed_with_exceptions'].includes(state.phase);

function envelope(state, request, kind, payload) {
  const revision = (state?.revision ?? 0) + 1;
  return {
    schemaVersion: 1, recordId: `r-${id()}`, operationId: request.operationId,
    kind, timestamp: new Date().toISOString(), courseId: state?.courseId ?? request.courseId,
    revision, contentRevision: state?.contentRevision ?? 1, fingerprint: `pending-${id()}`, payload,
  };
}

async function renderAfter(root, result) {
  try {
    result.notesStatus = await renderClassnotes(root);
  } catch (error) {
    result.notesStatus = { ok: false, error: { code: error.code ?? 'IO_ERROR', message: error.message } };
  }
  return result;
}

async function hasCheckpoint(root) {
  try { await lstat(await resolveContained(root, 'state.json', { allowMissing: true })); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export async function initializeCourse(root, request) {
  if (await hasCheckpoint(root)) {
    try { await readCourse(root); fail('CONFLICT', 'Course is already initialized'); }
    catch (error) { if (error.code === 'CONFLICT') throw error; throw error; }
  }
  if (!isPlain(request) || !isId(request.courseId) || !isPlain(request.learnerContext) || typeof request.goal !== 'string' || !request.goal.trim() || !Array.isArray(request.prerequisites) || !Number.isFinite(request.readingRateWpm) || request.readingRateWpm <= 0 || !Array.isArray(request.lessons) || !isPlain(request.assessments ?? {}) || !isPlain(request.assignments ?? {})) fail('INVALID_INPUT', 'Course initialization requires a valid identity, goal, context, lessons, and work indexes');
  const initialState = {
    schemaVersion: 1, courseId: request.courseId, revision: 0, contentRevision: 1,
    phase: 'draft', learnerContext: request.learnerContext, goal: request.goal.trim(),
    prerequisites: request.prerequisites, readingRateWpm: request.readingRateWpm,
    lessons: request.lessons, reading: Object.fromEntries(request.lessons.map((lesson) => [lesson.lessonId, 'not_started'])),
    assessments: request.assessments ?? {}, assignments: request.assignments ?? {}, pendingQuestion: null,
    attempts: {}, courseManifest: null, materialRefs: [], recordRefs: [], operationFingerprints: {}, unresolvedTopics: [],
    nextAction: request.nextAction ?? 'Prepare and publish course materials', notesProjection: null,
  };
  const record = envelope(null, request, 'course_initialized', { initialState, nextAction: initialState.nextAction });
  const result = await commit(root, { ...request, records: [record] });
  return renderAfter(root, result);
}

async function prepareManifest(root, manifest, state) {
  if (!isPlain(manifest) || typeof manifest.goal !== 'string' || !manifest.goal.trim() || !Array.isArray(manifest.prerequisites) || !isPlain(manifest.scope) || !Array.isArray(manifest.scope.included) || !Array.isArray(manifest.scope.excluded) || !Array.isArray(manifest.lessons) || !Array.isArray(manifest.sources) || !isPlain(manifest.estimates) || !Array.isArray(manifest.materials) || manifest.materials.length === 0) fail('INVALID_INPUT', 'Publication requires goal, scope, lessons, sources, estimates, and materials');
  manifest = structuredClone(manifest);
  const lessons = new Map(state.lessons.map((lesson) => [lesson.lessonId, lesson]));
  for (let index = 0; index < manifest.lessons.length; index++) {
    const lesson = manifest.lessons[index];
    if (!isPlain(lesson) || !isId(lesson.lessonId) || !Array.isArray(lesson.outcomeIds) || !lessons.has(lesson.lessonId) || JSON.stringify(lesson.outcomeIds) !== JSON.stringify(lessons.get(lesson.lessonId).outcomeIds)) fail('INVALID_INPUT', 'Published lessons must match initialized lesson outcomes');
    manifest.lessons[index] = { ...structuredClone(lessons.get(lesson.lessonId)), ...lesson };
  }
  if (manifest.lessons.length !== state.lessons.length) fail('INVALID_INPUT', 'Published manifest must include every initialized lesson');
  const materials = [];
  for (const material of manifest.materials) {
    if (!isPlain(material) || typeof material.path !== 'string' || !['course', 'reading', 'assignment', 'key'].includes(material.role)) fail('INVALID_INPUT', 'Each material needs a relative path and supported role');
    let file;
    try { file = await resolveContained(root, material.path); }
    catch (error) { if (error.code === 'INVALID_INPUT') fail('NOT_READY', `Required material is missing: ${material.path}`); throw error; }
    const stat = await lstat(file);
    if (!stat.isFile()) fail('NOT_READY', `Material is not a regular file: ${material.path}`);
    const bytes = await readFile(file);
    const content = bytes.toString('utf8');
    if (!content.trim() || /\{\{[^}]+\}\}|\bTODO\b|\bTEMPLATE\b|\[\s*(?:write|add|insert)\b/i.test(content)) fail('NOT_READY', `Material is blank or still a template: ${material.path}`);
    if (material.role === 'course' || material.role === 'reading') await checkLinks(root, material.path, content);
    materials.push({ path: material.path.replaceAll('\\', '/'), role: material.role, sha256: hash(bytes) });
  }
  if (!materials.some((material) => material.path === 'course.md' && material.role === 'course')) fail('NOT_READY', 'Publication requires course.md as a course material');
  if (materials.filter((material) => material.role === 'reading').length < state.lessons.length) fail('NOT_READY', 'Publication is missing required lesson reading material');
  return { ...structuredClone(manifest), materials };
}

async function checkLinks(root, sourcePath, content) {
  const base = path.posix.dirname(sourcePath.replaceAll('\\', '/'));
  const links = [...content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)/g)].map((match) => match[1].replace(/^<|>$/g, ''));
  for (const link of links) {
    if (/^(?:https?:|mailto:|tel:|\/\/)/i.test(link) || link.startsWith('#')) continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(link)) fail('INVALID_INPUT', `Unsupported link scheme in ${sourcePath}: ${link}`);
    let decoded;
    try { decoded = decodeURIComponent(link.split('#')[0].split('?')[0]); } catch { fail('INVALID_INPUT', `Invalid local reading link in ${sourcePath}`); }
    if (!decoded) continue;
    const relative = path.posix.normalize(path.posix.join(base, decoded));
    let file;
    try { file = await resolveContained(root, relative); }
    catch (error) { if (error.code === 'INVALID_INPUT') fail('NOT_READY', `Local reading link is missing: ${link}`); throw error; }
    if (!(await lstat(file)).isFile()) fail('NOT_READY', `Local reading link is not a file: ${link}`);
  }
}

export async function publishCourse(root, request) {
  const { state } = await readCourse(root);
  if (blocked(state)) fail('CONFLICT', 'A closed course cannot be published or revised');
  const manifest = await prepareManifest(root, request.manifest, state);
  const revising = state.phase === 'active';
  const nextContentRevision = revising ? state.contentRevision + 1 : state.contentRevision;
  const record = envelope(state, request, revising ? 'course_revised' : 'course_published', revising
    ? { contentRevision: nextContentRevision, materialChanges: manifest.materials.map((item) => item.path), manifest, nextAction: request.nextAction ?? 'Continue with the revised course' }
    : { manifest, nextAction: request.nextAction ?? 'Begin the first lesson' });
  record.contentRevision = nextContentRevision;
  return renderAfter(root, await commit(root, { ...request, records: [record] }));
}

export async function recordQA(root, request) {
  const { state } = await readCourse(root);
  if (blocked(state)) fail('CONFLICT', 'Course is closed');
  if (typeof request.question !== 'string' || !request.question.trim() || typeof request.answerSummary !== 'string' || !request.answerSummary.trim()) fail('INVALID_INPUT', 'Q&A requires the learner question and a useful explanation summary');
  if (request.lessonId && !state.lessons.some((lesson) => lesson.lessonId === request.lessonId)) fail('INVALID_INPUT', 'Q&A references an unknown lesson');
  const payload = { question: request.question, answerSummary: request.answerSummary, ...(request.followUp ? { followUp: request.followUp } : {}), ...(request.misconception ? { misconception: request.misconception } : {}), ...(request.lessonId ? { lessonId: request.lessonId } : {}), ...(request.nextAction ? { nextAction: request.nextAction } : {}) };
  const record = envelope(state, request, 'qa_recorded', payload);
  return renderAfter(root, await commit(root, { ...request, records: [record] }));
}

const READING = new Set(['not_started', 'in_progress', 'reported_complete', 'skipped']);
export async function recordProgress(root, request) {
  const { state } = await readCourse(root);
  if (blocked(state)) fail('CONFLICT', 'Course is closed');
  let kind; let payload;
  if (request.action === 'skip') {
    if (typeof request.reason !== 'string' || !request.reason.trim()) fail('INVALID_INPUT', 'Skipping requires a learner-facing reason');
    kind = 'item_skipped';
    payload = { itemType: request.itemType, itemId: request.itemId, reason: request.reason };
    if (request.itemType === 'lesson' && !state.lessons.some((lesson) => lesson.lessonId === request.itemId)) fail('INVALID_INPUT', 'Skip references an unknown lesson');
    if (request.itemType === 'assessment' && !(request.itemId in state.assessments) || request.itemType === 'assignment' && !(request.itemId in state.assignments)) fail('INVALID_INPUT', 'Skip references unknown course work');
  } else if (request.action === 'unresolved') {
    kind = 'unresolved_topic_updated'; payload = { topics: request.topics };
  } else if (request.action === 'finish') {
    if (request.unresolved !== undefined && (!Array.isArray(request.unresolved) || request.unresolved.some((item) => typeof item !== 'string' || !item.trim()))) fail('INVALID_INPUT', 'Finish exceptions must be a list of nonempty learner-facing items');
    const unfinished = [...Object.entries(state.assessments), ...Object.entries(state.assignments)]
      .filter(([, item]) => !['passed', 'not_required'].includes(typeof item === 'string' ? item : item.state))
      .map(([itemId, item]) => `${(typeof item === 'string' ? item : item.state) === 'skipped' ? 'Skipped required work' : 'Required work remains'}: ${itemId}`);
    const skippedLessons = Object.entries(state.reading).filter(([, reading]) => reading === 'skipped').map(([lessonId]) => `Skipped lesson: ${lessonId}`);
    const unresolved = [...new Set([...(request.unresolved ?? state.unresolvedTopics), ...unfinished, ...skippedLessons])];
    kind = 'course_closed'; payload = unresolved.length ? { phase: 'closed_with_exceptions', unresolved } : { phase: 'completed' };
  } else if (request.action === 'retry') {
    kind = 'attempt_retried'; payload = { assessmentId: request.assessmentId, attemptId: request.attemptId, ...(request.priorAttemptId ? { priorAttemptId: request.priorAttemptId } : {}) };
  } else {
    kind = 'progress_recorded';
    const reading = request.reading ?? (request.action === 'begin' ? 'in_progress' : request.action === 'defer' ? state.reading[request.lessonId] : undefined);
    if (!state.lessons.some((lesson) => lesson.lessonId === request.lessonId) || !READING.has(reading)) fail('INVALID_INPUT', 'Reading progress requires a known lesson and valid reading state');
    payload = { lessonId: request.lessonId, reading, ...(request.nextAction ? { nextAction: request.nextAction } : {}) };
  }
  if (request.nextAction && kind !== 'progress_recorded') payload.nextAction = request.nextAction;
  const record = envelope(state, request, kind, payload);
  return renderAfter(root, await commit(root, { ...request, records: [record] }));
}

export async function resumeCourse(root) {
  let loaded;
  try { loaded = await readCourse(root); }
  catch (error) {
    return { ok: false, courseRoot: path.resolve(root), error: { code: error.code ?? 'CORRUPT_STATE', message: error.message } };
  }
  const { state, records } = loaded;
  const manifest = state.courseManifest ?? [...records].reverse().find((record) => ['course_published', 'course_revised'].includes(record.kind))?.payload.manifest;
  const mismatches = [];
  for (const material of manifest?.materials ?? []) {
    try {
      const file = await resolveContained(root, material.path);
      const stat = await lstat(file);
      if (!stat.isFile() || hash(await readFile(file)) !== material.sha256) mismatches.push({ path: material.path, status: 'changed' });
    } catch (error) { mismatches.push({ path: material.path, status: error.code === 'PATH_ESCAPE' ? 'unsafe' : 'missing' }); }
  }
  return { ok: true, courseRoot: path.resolve(root), state, progress: deriveProgress(state, records), records, pendingQuestion: state.pendingQuestion ? learnerQuestion(state.pendingQuestion, state, records) : null, materialStatus: { ok: mismatches.length === 0, mismatches } };
}

export async function discoverCourses(workspaceRoot) {
  const coursesRoot = path.resolve(workspaceRoot, 'courses');
  let entries;
  try { entries = await readdir(coursesRoot, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return { courses: [], errors: [], ambiguous: false }; throw error; }
  const courses = []; const errors = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const courseRoot = path.join(coursesRoot, entry.name);
    try {
      const { state } = await readCourse(courseRoot);
      courses.push({ courseId: state.courseId, phase: state.phase, revision: state.revision, courseRoot });
    } catch (error) {
      errors.push({ courseRoot, code: error.code ?? 'CORRUPT_STATE', message: error.message });
    }
  }
  return { courses, errors, ambiguous: courses.length > 1, selected: courses.length === 1 ? courses[0] : null };
}

function learnerQuestion(pending, state, records) {
  const record = [...records].reverse().find((item) => item.kind === 'question_presented' && item.payload.presentationToken === pending.presentationToken);
  if (!record) return null;
  const { assessmentId, questionId, attemptId, presentationToken, prompt, options } = record.payload;
  const question = state.assessments[assessmentId]?.questions?.find((item) => item.questionId === questionId);
  return { assessmentId, questionId, attemptId, presentationToken, prompt, ...(options ?? question?.options ? { options: options ?? question.options } : {}) };
}

