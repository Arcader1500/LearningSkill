import { resolveCourseRoot } from './paths.mjs';
import { fail } from './errors.mjs';
import { discoverCourses, initializeCourse, publishCourse, recordQA, recordProgress, resumeCourse } from './course.mjs';
import { prepareAssessment, presentQuestion, acceptAnswer, recordAssistance, submitWork, gradeAttempt } from './assessment.mjs';
import { renderClassnotes } from './notes.mjs';
import { recoverLock } from './store.mjs';

const OPERATIONS = new Set(['course.discover', 'course.init', 'course.publish', 'course.resume', 'qa.record', 'progress.record', 'assessment.prepare', 'question.present', 'answer.record', 'assistance.record', 'submission.record', 'attempt.grade', 'notes.render', 'lock.recover']);
const PRIVATE = /(?:key|rationale|expectedanswer|correctanswer|solution(?:text|answer)?)/i;

function learnerView(value) {
  if (Array.isArray(value)) return value.map(learnerView);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !PRIVATE.test(key)).map(([key, item]) => [key, learnerView(item)]));
  return value;
}

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) fail('INVALID_INPUT', 'Request must be a JSON object');
  if (request.protocolVersion !== 1) fail('UNSUPPORTED_SCHEMA', 'Unsupported request protocol version');
  if (!OPERATIONS.has(request.op)) fail('INVALID_INPUT', 'Unknown operation');
  if (typeof request.workspaceRoot !== 'string' || !request.workspaceRoot.trim()) fail('INVALID_INPUT', 'workspaceRoot is required');
  if (request.courseRoot !== undefined && (typeof request.courseRoot !== 'string' || !request.courseRoot.trim())) fail('INVALID_INPUT', 'courseRoot must be a nonempty path');
  if (request.payload !== undefined && (!request.payload || typeof request.payload !== 'object' || Array.isArray(request.payload))) fail('INVALID_INPUT', 'payload must be a JSON object');
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
    if (!['course.init', 'course.publish', 'qa.record', 'progress.record', 'notes.render', 'course.resume'].includes(request.op)) {
      try { result.notesStatus = await renderClassnotes(root); }
      catch (error) { result.notesStatus = { ok: false, error: { code: error.code ?? 'IO_ERROR', message: error.message } }; }
    }
    if (result?.state?.pendingQuestion) {
      const pending = result.state.pendingQuestion;
      const saved = result.question ?? result.state.assessments?.[pending.assessmentId]?.questions?.find((question) => question.questionId === pending.questionId);
      result.pendingQuestion = saved ? { assessmentId: pending.assessmentId, questionId: pending.questionId, attemptId: pending.attemptId, presentationToken: pending.presentationToken, prompt: saved.prompt, ...(saved.options ? { options: saved.options } : {}) } : null;
    }
    return learnerView({ ok: true, ...result });
  } catch (error) {
    const code = ['ENOENT', 'EACCES', 'EPERM', 'EIO'].includes(error.code) ? 'IO_ERROR' : error.code ?? 'IO_ERROR';
    return { ok: false, error: { code, message: error.message, ...(error.details === undefined ? {} : { details: learnerView(error.details) }) } };
  }
}
