import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readCourse, commit } from './store.mjs';
import { fail } from './errors.mjs';

const safeId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

async function current(root) { return readCourse(root); }
function mutationRecord(state, request, kind, payload) {
  if (!safeId(request.operationId) || !Number.isSafeInteger(request.expectedRevision)) fail('INVALID_INPUT', 'Mutation requires operationId and expectedRevision');
  return {
    schemaVersion: 1, recordId: request.recordId ?? `record-${request.operationId}`, operationId: request.operationId,
    kind, timestamp: new Date().toISOString(), courseId: state.courseId, revision: state.revision + 1,
    contentRevision: state.contentRevision, fingerprint: `pending-${request.operationId}`, payload,
  };
}
async function append(root, request, kind, payload, snapshots = []) {
  const { state } = await current(root);
  const record = mutationRecord(state, request, kind, payload);
  return commit(root, { operationId: request.operationId, expectedRevision: request.expectedRevision, records: [record], snapshots });
}
function attemptFor(state, assessmentId, attemptId) {
  const assessment = state.assessments[assessmentId];
  const attempt = state.attempts[attemptId];
  if (!assessment || !attempt || attempt.assessmentId !== assessmentId) fail('NOT_READY', 'Assessment attempt is not saved');
  return { assessment, attempt };
}

export async function prepareAssessment(root, request) {
  const { state } = await current(root);
  const { assessmentId, objective, rubricRevision, questions, criteria, keyPath, key } = request;
  const outcomeIds = request.outcomeIds ?? (request.outcomeId ? [request.outcomeId] : undefined);
  if (!safeId(assessmentId) || typeof objective !== 'string' || !objective.trim() || !Number.isSafeInteger(rubricRevision) || rubricRevision < 1 || !Array.isArray(questions) || !questions.length || !Array.isArray(criteria) || !criteria.length || typeof keyPath !== 'string' || typeof key !== 'string' || !Array.isArray(outcomeIds) || !outcomeIds.length) fail('INVALID_INPUT', 'Assessment requires an ID, objective, rubric, questions, private key, and target outcome IDs');
  if (request.assignmentId !== undefined && (!safeId(request.assignmentId) || !(request.assignmentId in state.assignments))) fail('INVALID_INPUT', 'Assessment assignmentId must reference a declared assignment');
  const definition = { assessmentId, assignmentId: request.assignmentId, outcomeIds, objective, rubricRevision, contentRevision: state.contentRevision, questions, criteria, keyPath };
  const instancePath = `assessments/${assessmentId}.json`;
  return append(root, request, 'assessment_prepared', definition, [
    { path: instancePath, bytes: jsonBytes(definition) }, { path: keyPath, bytes: Buffer.from(key, 'utf8') },
  ]);
}

export async function presentQuestion(root, request) {
  const { state } = await current(root);
  const { assessmentId, questionId, attemptId, presentationToken } = request;
  if (!safeId(assessmentId) || !safeId(questionId) || !safeId(attemptId) || !safeId(presentationToken)) fail('INVALID_INPUT', 'Question presentation requires safe assessment, question, attempt, and token IDs');
  const assessment = state.assessments[assessmentId];
  if (!assessment || typeof assessment !== 'object') fail('NOT_READY', 'Prepare the assessment before presenting a question');
  const question = assessment.questions.find((item) => item.questionId === questionId);
  if (!question) fail('INVALID_INPUT', 'Question does not belong to the saved assessment');
  const saved = { assessmentId, questionId, attemptId, presentationToken, prompt: question.prompt, options: question.options ?? null };
  if (request.routingId !== undefined) saved.routingId = request.routingId;
  const result = await append(root, request, 'question_presented', saved);
  return { ...result, question: structuredClone(question) };
}

export async function acceptAnswer(root, request) {
  const { state } = await current(root);
  const pending = state.pendingQuestion;
  if (!pending || ['assessmentId', 'questionId', 'attemptId', 'presentationToken'].some((key) => request[key] !== pending[key])) fail('STALE_QUESTION', 'Answer does not match the active saved question presentation');
  if (request.routingId !== undefined && request.routingId !== pending.routingId) fail('STALE_QUESTION', 'Answer routing ID does not match the saved presentation');
  if (typeof request.response !== 'string' || !request.response.trim()) fail('INVALID_INPUT', 'An explicit nonempty learner response is required');
  return append(root, request, 'answer_recorded', {
    assessmentId: pending.assessmentId, questionId: pending.questionId, attemptId: pending.attemptId,
    presentationToken: pending.presentationToken, response: request.response, evidenceId: request.evidenceId ?? `answer-${pending.attemptId}`,
    ...(request.routingId === undefined ? {} : { routingId: request.routingId }),
  });
}

export async function recordAssistance(root, request) {
  const { state } = await current(root);
  if (!state.attempts[request.attemptId]) fail('NOT_READY', 'Assistance must refer to a saved attempt');
  return append(root, request, 'assistance_recorded', { attemptId: request.attemptId, assistance: request.assistance, summary: request.summary ?? '' });
}

export async function gradeAttempt(root, request) {
  const { state } = await current(root);
  const { assessment, attempt } = attemptFor(state, request.assessmentId, request.attemptId);
  return append(root, request, 'attempt_graded', {
    assessmentId: request.assessmentId, assignmentId: assessment.assignmentId, attemptId: request.attemptId,
    rubricRevision: request.rubricRevision, assistance: request.assistance,
    criteria: request.criteria, evidence: request.evidence,
    ...(attempt.snapshotPath ? { snapshotPath: attempt.snapshotPath, snapshotSha256: attempt.snapshotSha256 } : {}),
    feedback: request.feedback,
  });
}

async function metadata(file) { return lstat(file, { bigint: true }); }
function sameFile(before, after) { return before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeNs === after.mtimeNs; }
async function captureTree(selected, options = {}) {
  const selectedStat = await metadata(selected);
  if (selectedStat.isSymbolicLink()) fail('PATH_ESCAPE', 'Selected submission cannot be a symbolic link');
  const root = await realpath(selected);
  const rootStat = await stat(root, { bigint: true });
  const files = [];
  async function walk(directory, prefix = '') {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const full = path.join(directory, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const before = await metadata(full);
      if (before.isSymbolicLink()) fail('PATH_ESCAPE', `Submission tree contains a symbolic link: ${rel}`);
      if (before.isDirectory()) await walk(full, rel);
      else if (before.isFile()) {
        await options.beforeRead?.(full, rel);
        const bytes = await readFile(full);
        const after = await metadata(full);
        if (!sameFile(before, after) || BigInt(bytes.length) !== after.size) fail('CONFLICT', `Submission changed while being captured: ${rel}`);
        files.push({ path: rel, bytes, sha256: hash(bytes) });
      } else fail('INVALID_INPUT', `Submission contains a non-regular file: ${rel}`);
    }
  }
  if (rootStat.isDirectory()) await walk(root);
  else if (rootStat.isFile()) {
    await options.beforeRead?.(root, path.basename(root));
    const bytes = await readFile(root);
    const after = await metadata(selected);
    if (!sameFile(selectedStat, after) || BigInt(bytes.length) !== after.size) fail('CONFLICT', 'Submission changed while being captured');
    files.push({ path: path.basename(root), bytes, sha256: hash(bytes) });
  } else fail('INVALID_INPUT', 'Submission must select a regular file or directory');
  const afterRoot = await metadata(selected);
  if (!sameFile(selectedStat, afterRoot)) fail('CONFLICT', 'Submission selection changed while being captured');
  if (!files.length) fail('INVALID_INPUT', 'Selected submission contains no regular files');
  return files;
}

export async function submitWork(root, request, options = {}) {
  const { state } = await current(root);
  const { assessment } = attemptFor(state, request.assessmentId, request.attemptId);
  if (assessment.assignmentId && request.assignmentId !== assessment.assignmentId) fail('INVALID_INPUT', 'Submission assignmentId does not match the saved assessment');
  if (!['tutor_observed', 'learner_supplied', 'not_run'].includes(request.provenance)) fail('INVALID_INPUT', 'Submission provenance is invalid');
  if (typeof request.sourcePath !== 'string' || !request.sourcePath) fail('INVALID_INPUT', 'Select a submission file or directory explicitly');
  const files = await captureTree(path.resolve(request.sourcePath), options);
  const base = `submissions/${request.assessmentId}/${request.attemptId}`;
  const manifest = { assessmentId: request.assessmentId, assignmentId: assessment.assignmentId, attemptId: request.attemptId, files: files.map(({ path: filePath, sha256, bytes }) => ({ path: filePath, sha256, size: bytes.length })) };
  const manifestBytes = jsonBytes(manifest);
  const snapshotPath = `${base}/manifest.json`;
  const evidenceId = request.evidenceId ?? `submission-${request.attemptId}`;
  const snapshots = [...files.map((file) => ({ path: `${base}/${file.path}`, bytes: file.bytes })), { path: snapshotPath, bytes: manifestBytes }];
  return append(root, request, 'submission_recorded', {
    assessmentId: request.assessmentId, assignmentId: assessment.assignmentId, attemptId: request.attemptId,
    evidenceId, snapshotPath, snapshotSha256: hash(manifestBytes), provenance: request.provenance,
  }, snapshots);
}
