import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { commit, findCommittedOperation, mutationFingerprint, readCourse } from './store.mjs';
import { fail } from './errors.mjs';
import { resolveContained } from './paths.mjs';
import { renderClassnotes } from './notes.mjs';
import { prepareAssessmentPayload } from './assessment.mjs';
import { prepareCourseInitialization, prepareCourseManifest } from './course.mjs';
import { validateRecord, reduceState } from './model.mjs';

const safe = (x) => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);
const opTag = (operationId) => createHash('sha256').update(operationId).digest('hex').slice(0, 24);
const plain = (x) => x && typeof x === 'object' && !Array.isArray(x);
function semanticInput(request) {
  const clean = structuredClone(request);
  for (const k of ['operationId','expectedRevision','protocolVersion','op','workspaceRoot','courseRoot']) delete clean[k];
  return { operation: 'course.bootstrap', request: clean };
}
function envelope(request, courseId, kind, revision, contentRevision, payload) {
  const tag = opTag(request.operationId);
  return { schemaVersion: 1, recordId: `r-${tag}-${revision}`, operationId: request.operationId, kind, timestamp: new Date().toISOString(), courseId, revision, contentRevision, fingerprint: `pending-${tag}`, payload };
}
async function notes(root, result) {
  try { result.notesStatus = await renderClassnotes(root); }
  catch (error) { result.notesStatus = { ok: false, error: { code: error.code ?? 'IO_ERROR', message: error.message } }; }
  return result;
}

export async function bootstrapCourse(root, request) {
  if (!plain(request) || !safe(request.operationId) || request.expectedRevision !== 0 || !plain(request.init) || !Array.isArray(request.assessments) || !plain(request.publish) || (request.initialProgress !== undefined && !Array.isArray(request.initialProgress))) fail('INVALID_INPUT', 'Bootstrap requires operationId, expectedRevision 0, init, assessments, and publish payloads');
  const snapshots = [];
  const assessmentIds = new Set();
  const preparedAssessments = request.assessments.map((a) => {
    const prepared = prepareAssessmentPayload(a);
    if (assessmentIds.has(prepared.definition.assessmentId)) fail('INVALID_INPUT', 'Bootstrap assessment IDs must be unique');
    assessmentIds.add(prepared.definition.assessmentId);
    return prepared;
  });
  for (const prepared of preparedAssessments) snapshots.push(...prepared.snapshots);
  const snapshotPaths = new Set();
  for (const snapshot of snapshots) {
    const normalized = snapshot.path.replaceAll('\\', '/');
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    if (snapshotPaths.has(key)) fail('INVALID_INPUT', `Duplicate snapshot destination: ${normalized}`);
    snapshotPaths.add(key);
    await resolveContained(root, normalized, { allowMissing: true });
  }
  const semantic = semanticInput(request);
  const fingerprint = await mutationFingerprint(request.operationId, semantic, snapshots);
  const replay = await findCommittedOperation(root, { operationId: request.operationId, fingerprint });
  if (replay) return notes(root, replay);
  let exists = false;
  try { await lstat(await resolveContained(root, 'state.json', { allowMissing: true })); exists = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (exists) { await readCourse(root); fail('CONFLICT', 'Course is already initialized'); }

  const init = request.init;
  const state = prepareCourseInitialization(init);
  const records = [envelope(request, init.courseId, 'course_initialized', 1, 1, { initialState: state, nextAction: state.nextAction })];
  let revision = 1;
  for (let i = 0; i < preparedAssessments.length; i++) {
    const { definition } = preparedAssessments[i];
    if (definition.assignmentId !== undefined && !(definition.assignmentId in state.assignments)) fail('INVALID_INPUT', 'Assessment assignmentId must reference a declared assignment');
    records.push(envelope(request, init.courseId, 'assessment_prepared', ++revision, 1, definition));
  }
  const manifest = await prepareCourseManifest(root, request.publish.manifest, state, snapshots);
  records.push(envelope(request, init.courseId, 'course_published', ++revision, 1, { manifest, nextAction: request.publish.nextAction ?? 'Begin the first lesson' }));
  for (const item of request.initialProgress ?? []) {
    if (!plain(item) || !state.lessons.some((x) => x.lessonId === item.lessonId) || !['not_started','in_progress','reported_complete','skipped'].includes(item.reading)) fail('INVALID_INPUT', 'Initial progress requires a known lesson and valid reading state');
    records.push(envelope(request, init.courseId, 'progress_recorded', ++revision, 1, { lessonId: item.lessonId, reading: item.reading, ...(item.nextAction ? { nextAction: item.nextAction } : {}) }));
  }
  // Validate the complete reducer result before any snapshot or record is written.
  for (const record of records) validateRecord(record);
  const reduced = reduceState(null, records);
  if (reduced.revision !== records.length) fail('INVALID_INPUT', 'Bootstrap record sequence is invalid');
  return notes(root, await commit(root, { operationId: request.operationId, expectedRevision: 0, semanticInput: semantic, records, snapshots }));
}
