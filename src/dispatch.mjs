import { bootstrapCourse } from './bootstrap.mjs';
import { resolveCourseRoot } from './paths.mjs';
import { fail } from './errors.mjs';
import { discoverCourses, initializeCourse, publishCourse, recordQA, recordProgress, resumeCourse } from './course.mjs';
import { prepareAssessment, presentQuestion, acceptAnswer, recordAssistance, submitWork, gradeAttempt } from './assessment.mjs';
import { renderClassnotes } from './notes.mjs';
import { recoverLock } from './store.mjs';

const OPERATIONS = new Set(['course.discover', 'course.init', 'course.bootstrap', 'course.publish', 'course.resume', 'qa.record', 'progress.record', 'assessment.prepare', 'question.present', 'answer.record', 'assistance.record', 'submission.record', 'attempt.grade', 'notes.render', 'lock.recover']);
const pick = (value, keys) => value && typeof value === 'object'
  ? Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]))
  : {};
const publicOption = (option) => pick(option, ['optionId', 'text']);
function publicQuestion(question) {
  if (!question || typeof question !== 'object') return undefined;
  return { ...pick(question, ['questionId', 'prompt', 'type']), ...(Array.isArray(question.options) ? { options: question.options.map(publicOption) } : {}) };
}
const publicEvidence = (evidence) => pick(evidence, ['evidenceId', 'provenance', 'snapshotPath', 'snapshotSha256']);
function publicCriterionResult(item) {
  return { ...pick(item, ['criterionId', 'points', 'maxPoints', 'status', 'feedback', 'independent']), ...(Array.isArray(item?.evidenceRefs) ? { evidenceRefs: item.evidenceRefs.filter((id) => typeof id === 'string') } : {}) };
}
function publicGrade(grade) {
  return { ...pick(grade, ['points', 'maxPoints', 'percentage', 'feedback']), ...(Array.isArray(grade?.criteria) ? { criteria: grade.criteria.map(publicCriterionResult) } : {}) };
}
function publicAssessment(id, item) {
  if (typeof item === 'string') return item;
  return {
    assessmentId: id,
    ...pick(item, ['state', 'objective', 'outcomeIds', 'assignmentId', 'rubricRevision', 'contentRevision', 'latestAttemptId']),
    ...(Array.isArray(item.questions) ? { questions: item.questions.map(publicQuestion) } : {}),
    ...(item.latestGrade ? { latestGrade: publicGrade(item.latestGrade) } : {}),
    ...(Array.isArray(item.history) ? { history: item.history.map((entry) => pick(entry, ['attemptId', 'kind', 'contentRevision', 'rubricRevision'])) } : {}),
  };
}
function publicWork(id, item) {
  if (typeof item === 'string') return item;
  return { ...pick(item, ['state', 'assignmentId', 'latestSubmissionAttemptId', 'latestGradeAttemptId', 'snapshotPath', 'snapshotSha256']), ...(Array.isArray(item.history) ? { history: item.history.map((entry) => pick(entry, ['attemptId', 'kind', 'rubricRevision', 'snapshotSha256'])) } : {}) };
}
function publicAttempt(id, item) {
  return {
    attemptId: id,
    ...pick(item, ['assessmentId', 'assignmentId', 'contentRevision', 'rubricRevision', 'questionId', 'prompt', 'presentationToken', 'response', 'assistance', 'state', 'snapshotPath', 'snapshotSha256']),
    ...(Array.isArray(item.options) ? { options: item.options.map(publicOption) } : {}),
    ...(Array.isArray(item.evidence) ? { evidence: item.evidence.map(publicEvidence) } : {}),
  };
}
function publicState(state) {
  if (!state || typeof state !== 'object') return undefined;
  return {
    ...pick(state, ['schemaVersion', 'courseId', 'revision', 'contentRevision', 'phase', 'goal', 'prerequisites', 'readingRateWpm', 'nextAction', 'unresolvedTopics']),
    lessons: Array.isArray(state.lessons) ? state.lessons.map((lesson) => pick(lesson, ['lessonId', 'title', 'summary', 'outcomeIds'])) : [],
    reading: pick(state.reading, Object.keys(state.reading ?? {})),
    assessments: Object.fromEntries(Object.entries(state.assessments ?? {}).map(([id, item]) => [id, publicAssessment(id, item)])),
    assignments: Object.fromEntries(Object.entries(state.assignments ?? {}).map(([id, item]) => [id, publicWork(id, item)])),
    pendingQuestion: state.pendingQuestion ? pick(state.pendingQuestion, ['assessmentId', 'questionId', 'attemptId', 'presentationToken', 'routingId']) : null,
    attempts: Object.fromEntries(Object.entries(state.attempts ?? {}).map(([id, item]) => [id, publicAttempt(id, item)])),
  };
}
function publicProgress(progress) {
  return {
    ...pick(progress, ['phase', 'revision', 'contentRevision', 'unresolvedTopics', 'nextAction', 'recordCount']),
    reading: pick(progress.reading, Object.keys(progress.reading ?? {})),
    assessments: Object.fromEntries(Object.entries(progress.assessments ?? {}).map(([id, item]) => [id, publicAssessment(id, item)])),
    assignments: Object.fromEntries(Object.entries(progress.assignments ?? {}).map(([id, item]) => [id, publicWork(id, item)])),
  };
}
function publicManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return undefined;
  return {
    ...pick(manifest, ['goal', 'prerequisites']),
    scope: { included: manifest.scope?.included ?? [], excluded: manifest.scope?.excluded ?? [] },
    lessons: (manifest.lessons ?? []).map((lesson) => pick(lesson, ['lessonId', 'title', 'summary', 'outcomeIds'])),
    sources: (manifest.sources ?? []).map((source) => pick(source, ['title', 'version', 'url'])),
    estimates: pick(manifest.estimates, ['readingMinutes', 'practiceMinutes', 'setupMinutes']),
    materials: (manifest.materials ?? []).filter((material) => material.role !== 'key').map((material) => pick(material, ['path', 'role', 'sha256'])),
  };
}
function publicRecord(record) {
  const view = pick(record, ['recordId', 'kind', 'timestamp', 'courseId', 'revision', 'contentRevision']);
  const p = record.payload ?? {};
  const common = ['nextAction'];
  switch (record.kind) {
    case 'course_initialized': view.payload = pick(p, common); break;
    case 'course_published': view.payload = { ...pick(p, common), manifest: publicManifest(p.manifest) }; break;
    case 'course_revised': view.payload = { ...pick(p, ['nextAction', 'contentRevision']), ...(Array.isArray(p.materialChanges) ? { materialChanges: p.materialChanges.filter((changed) => !p.manifest?.materials?.some((material) => material.role === 'key' && material.path === changed)) } : {}), manifest: publicManifest(p.manifest) }; break;
    case 'qa_recorded': view.payload = pick(p, ['question', 'answerSummary', 'followUp', 'misconception', 'lessonId', 'nextAction']); break;
    case 'progress_recorded': view.payload = pick(p, ['lessonId', 'reading', 'nextAction']); break;
    case 'assessment_prepared': view.payload = { ...pick(p, ['assessmentId', 'assignmentId', 'outcomeIds', 'objective', 'rubricRevision', 'contentRevision']), ...(Array.isArray(p.questions) ? { questions: p.questions.map(publicQuestion) } : {}) }; break;
    case 'question_presented': view.payload = { ...pick(p, ['assessmentId', 'questionId', 'attemptId', 'presentationToken', 'routingId', 'prompt']), ...(Array.isArray(p.options) ? { options: p.options.map(publicOption) } : {}) }; break;
    case 'answer_recorded': view.payload = pick(p, ['assessmentId', 'questionId', 'attemptId', 'presentationToken', 'routingId', 'evidenceId', 'response']); break;
    case 'assistance_recorded': view.payload = pick(p, ['attemptId', 'assistance', 'summary']); break;
    case 'submission_recorded': view.payload = pick(p, ['assessmentId', 'assignmentId', 'attemptId', 'evidenceId', 'snapshotPath', 'snapshotSha256', 'provenance']); break;
    case 'attempt_graded': view.payload = { ...pick(p, ['assessmentId', 'assignmentId', 'attemptId', 'rubricRevision', 'assistance', 'feedback', 'snapshotPath', 'snapshotSha256']), criteria: (p.criteria ?? []).map(publicCriterionResult), evidence: (p.evidence ?? []).map(publicEvidence) }; break;
    case 'attempt_retried': view.payload = pick(p, ['assessmentId', 'attemptId', 'priorAttemptId']); break;
    case 'item_skipped': view.payload = pick(p, ['itemType', 'itemId', 'reason', 'nextAction']); break;
    case 'unresolved_topic_updated': view.payload = pick(p, ['topics', 'nextAction']); break;
    case 'course_closed': view.payload = pick(p, ['phase', 'unresolved', 'nextAction']); break;
    default: view.payload = {};
  }
  return view;
}
function publicNotesStatus(status) {
  if (!status || typeof status !== 'object') return undefined;
  return { ...pick(status, ['ok', 'revision', 'sha256', 'repaired', 'rendered']), ...(status.error ? { error: pick(status.error, ['code', 'message']) } : {}) };
}
function learnerView(result) {
  if (!result || typeof result !== 'object') return {};
  const view = pick(result, ['ok', 'committed', 'revision', 'idempotent', 'repaired', 'rendered', 'sha256', 'nextAction']);
  if (result.state) view.state = publicState(result.state);
  if (result.progress && typeof result.progress === 'object') view.progress = publicProgress(result.progress);
  if (Array.isArray(result.records)) view.records = result.records.map(publicRecord);
  if (result.question) view.question = publicQuestion(result.question);
  if (result.pendingQuestion) view.pendingQuestion = { ...pick(result.pendingQuestion, ['assessmentId', 'questionId', 'attemptId', 'presentationToken', 'prompt']), ...(Array.isArray(result.pendingQuestion.options) ? { options: result.pendingQuestion.options.map(publicOption) } : {}) };
  if (result.notesStatus) view.notesStatus = publicNotesStatus(result.notesStatus);
  if (result.materialStatus) view.materialStatus = { ...pick(result.materialStatus, ['ok']), mismatches: (result.materialStatus.mismatches ?? []).map((item) => pick(item, ['path', 'status'])) };
  if (Array.isArray(result.courses)) view.courses = result.courses.map((course) => pick(course, ['courseId', 'phase', 'revision', 'courseRoot']));
  if (Array.isArray(result.errors)) view.errors = result.errors.map((item) => pick(item, ['courseRoot', 'code', 'message']));
  if (typeof result.ambiguous === 'boolean') view.ambiguous = result.ambiguous;
  if (result.selected) view.selected = pick(result.selected, ['courseId', 'phase', 'revision', 'courseRoot']);
  if (result.courseRoot) view.courseRoot = result.courseRoot;
  if (result.error) {
    view.error = pick(result.error, ['code', 'message']);
    const d = result.error.details;
    const safeCodes = new Set(['INVALID_INPUT', 'UNSUPPORTED_SCHEMA', 'CONFLICT', 'CORRUPT_STATE', 'PATH_ESCAPE', 'IO_ERROR', 'STALE_QUESTION', 'INVALID_GRADE', 'NOT_READY']);
    if (d?.stage === 'history_replay' && safeCodes.has(d.causeCode)) {
      view.error.details = { stage: 'history_replay', ...(typeof d.recordId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(d.recordId) ? { recordId: d.recordId } : {}), ...(typeof d.kind === 'string' && /^[a-z_]{1,64}$/.test(d.kind) ? { kind: d.kind } : {}), ...(Number.isSafeInteger(d.revision) && d.revision > 0 ? { revision: d.revision } : {}), causeCode: d.causeCode };
    }
  }
  return view;
}

const RECORD_META_KEYS = ['recordId', 'kind', 'timestamp', 'courseId', 'revision', 'contentRevision'];
function compactView(result) {
  // Project through learnerView first so compact responses inherit its redaction rules.
  const full = learnerView(result);
  const view = pick(full, ['ok', 'committed', 'revision', 'idempotent', 'recovered', 'nextAction', 'notesStatus']);
  const state = full.state;
  if (state?.contentRevision !== undefined) view.contentRevision = state.contentRevision;
  if (state?.nextAction !== undefined) view.nextAction = state.nextAction;
  const metadata = (full.records ?? []).map((record) => pick(record, RECORD_META_KEYS));
  if (metadata.length) {
    view.records = metadata;
    view.latestRecord = metadata.at(-1);
  }
  view.question = full.question ?? null;
  const pending = result?.pendingQuestion;
  const rawPending = result?.state?.pendingQuestion;
  view.pendingQuestion = pending
    ? { ...pick(pending, ['assessmentId', 'questionId', 'attemptId', 'presentationToken', 'prompt']), ...(rawPending?.routingId === undefined ? {} : { routingId: rawPending.routingId }), ...(Array.isArray(pending.options) ? { options: pending.options.map(publicOption) } : {}) }
    : state?.pendingQuestion ?? null;
  const attemptId = result?.state?.pendingQuestion?.attemptId ?? result?.question?.attemptId ?? result?.pendingQuestion?.attemptId
    ?? [...(result?.records ?? [])].reverse().map((record) => record.payload?.attemptId).find(Boolean);
  const grade = attemptId && (state?.attempts?.[attemptId]?.grade
    ?? Object.values(result?.state?.assessments ?? {}).find((assessment) => assessment.latestAttemptId === attemptId)?.latestGrade);
  if (grade) view.grade = publicGrade(grade);
  return view;
}

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) fail('INVALID_INPUT', 'Request must be a JSON object');
  if (request.protocolVersion !== 1) fail('UNSUPPORTED_SCHEMA', 'Unsupported request protocol version');
  if (!OPERATIONS.has(request.op)) fail('INVALID_INPUT', 'Unknown operation');
  if (typeof request.workspaceRoot !== 'string' || !request.workspaceRoot.trim()) fail('INVALID_INPUT', 'workspaceRoot is required');
  if (request.courseRoot !== undefined && (typeof request.courseRoot !== 'string' || !request.courseRoot.trim())) fail('INVALID_INPUT', 'courseRoot must be a nonempty path');
  if (request.payload !== undefined && (!request.payload || typeof request.payload !== 'object' || Array.isArray(request.payload))) fail('INVALID_INPUT', 'payload must be a JSON object');
  if (request.responseMode !== undefined && !['full', 'compact'].includes(request.responseMode)) fail('INVALID_INPUT', 'responseMode must be full or compact');
  const mutation = !['course.discover', 'course.resume', 'notes.render'].includes(request.op);
  if (mutation && (typeof request.operationId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(request.operationId) || !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0)) fail('INVALID_INPUT', 'Mutation requires a safe operationId and nonnegative expectedRevision');
  return request;
}

export async function dispatch(input) {
  try {
    const request = validateRequest(input);
    const payload = request.payload ?? {};
    if (request.op === 'course.discover') return learnerView({ ok: true, ...await discoverCourses(request.workspaceRoot) });
    const root = await resolveCourseRoot(request);
    let result;
    switch (request.op) {
      case 'course.bootstrap': result = await bootstrapCourse(root, { ...payload, operationId: request.operationId, expectedRevision: request.expectedRevision }); break;
      case 'course.init': result = await initializeCourse(root, { ...payload, operationId: request.operationId, expectedRevision: request.expectedRevision }); break;
      case 'course.publish': result = await publishCourse(root, { ...payload, operationId: request.operationId, expectedRevision: request.expectedRevision }); break;
      case 'course.resume': result = await resumeCourse(root); break;
      case 'qa.record': result = await recordQA(root, { ...payload, operationId: request.operationId, expectedRevision: request.expectedRevision }); break;
      case 'progress.record': result = await recordProgress(root, { ...payload, operationId: request.operationId, expectedRevision: request.expectedRevision }); break;
      case 'assessment.prepare': result = await prepareAssessment(root, { ...payload, operationId: request.operationId, expectedRevision: request.expectedRevision }); break;
      case 'question.present': result = await presentQuestion(root, { ...payload, operationId: request.operationId, expectedRevision: request.expectedRevision }); break;
      case 'answer.record': result = await acceptAnswer(root, { ...payload, operationId: request.operationId, expectedRevision: request.expectedRevision }); break;
      case 'assistance.record': result = await recordAssistance(root, { ...payload, operationId: request.operationId, expectedRevision: request.expectedRevision }); break;
      case 'submission.record': result = await submitWork(root, { ...payload, operationId: request.operationId, expectedRevision: request.expectedRevision }); break;
      case 'attempt.grade': result = await gradeAttempt(root, { ...payload, operationId: request.operationId, expectedRevision: request.expectedRevision }); break;
      case 'notes.render': result = await renderClassnotes(root); break;
      case 'lock.recover': result = await recoverLock(root, payload); break;
    }
    if (result?.ok === false) return learnerView(result);
    if (!['course.init', 'course.bootstrap', 'course.publish', 'qa.record', 'progress.record', 'notes.render', 'course.resume'].includes(request.op)) {
      try { result.notesStatus = await renderClassnotes(root); }
      catch (error) { result.notesStatus = { ok: false, error: { code: error.code ?? 'IO_ERROR', message: error.message } }; }
    }
    if (result?.state?.pendingQuestion) {
      const pending = result.state.pendingQuestion;
      const saved = result.question ?? result.state.assessments?.[pending.assessmentId]?.questions?.find((question) => question.questionId === pending.questionId);
      result.pendingQuestion = saved ? { assessmentId: pending.assessmentId, questionId: pending.questionId, attemptId: pending.attemptId, presentationToken: pending.presentationToken, prompt: saved.prompt, ...(saved.options ? { options: saved.options } : {}) } : null;
    }
    const response = { ok: true, ...result };
    return request.responseMode === 'compact' && !['course.discover', 'course.resume', 'notes.render'].includes(request.op)
      ? compactView(response)
      : learnerView(response);
  } catch (error) {
    const code = ['ENOENT', 'EACCES', 'EPERM', 'EIO'].includes(error.code) ? 'IO_ERROR' : error.code ?? 'IO_ERROR';
    return { ok: false, error: { code, message: error.message } };
  }
}

