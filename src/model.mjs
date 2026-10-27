import { fail } from './errors.mjs';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const PHASES = new Set(['draft', 'active', 'completed', 'closed_with_exceptions']);
const READING = new Set(['not_started', 'in_progress', 'reported_complete', 'skipped']);
const WORK = new Set(['not_required', 'pending', 'in_progress', 'submitted', 'ungraded', 'needs_review', 'passed', 'skipped']);
const KINDS = new Set(['course_initialized','course_published','course_revised','qa_recorded','progress_recorded','assessment_prepared','question_presented','assistance_recorded','answer_recorded','submission_recorded','attempt_graded','attempt_retried','item_skipped','course_closed','unresolved_topic_updated']);
const invalid = (message, code = 'INVALID_INPUT', details) => fail(code, message, details);
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const safeId = (v) => typeof v === 'string' && ID.test(v);

function assert(ok, message, code = 'CORRUPT_STATE', details) { if (!ok) invalid(message, code, details); }
function uniqueIds(values, label) {
  assert(Array.isArray(values), `${label} must be an array`);
  const ids = values.map((x) => typeof x === 'string' ? x : x?.recordId ?? x?.lessonId ?? x?.assessmentId ?? x?.assignmentId ?? x?.criterionId);
  assert(ids.every(safeId), `${label} contains an invalid identifier`);
  assert(new Set(ids).size === ids.length, `${label} contains duplicates`);
}

export function validateMutation(request) {
  assert(object(request) && safeId(request.operationId) && Number.isSafeInteger(request.expectedRevision) && request.expectedRevision >= 0, 'Mutation requires a safe operationId and non-negative expectedRevision', 'INVALID_INPUT');
  return { operationId: request.operationId, expectedRevision: request.expectedRevision };
}

export function validateState(state) {
  assert(object(state), 'State must be an object');
  if (state.schemaVersion !== 1) invalid(`Unsupported state schema version: ${state.schemaVersion}`, 'UNSUPPORTED_SCHEMA');
  assert(safeId(state.courseId) && Number.isSafeInteger(state.revision) && state.revision >= 0 && Number.isSafeInteger(state.contentRevision) && state.contentRevision >= 1, 'Invalid course identity or revision');
  assert(PHASES.has(state.phase), 'Invalid course phase');
  assert(object(state.learnerContext) && Array.isArray(state.prerequisites) && typeof state.goal === 'string' && Number.isFinite(state.readingRateWpm) && state.readingRateWpm > 0, 'Invalid course context');
  assert(Array.isArray(state.lessons) && object(state.reading) && object(state.assessments) && object(state.assignments) && object(state.attempts), 'Invalid course indexes');
  uniqueIds(state.lessons.map((x) => x?.lessonId), 'lessons');
  for (const lesson of state.lessons) assert(object(lesson) && Array.isArray(lesson.outcomeIds), 'Invalid lesson definition');
  for (const [id, value] of Object.entries(state.reading)) assert(safeId(id) && READING.has(value), 'Invalid reading state');
  for (const index of [state.assessments, state.assignments]) for (const [id, item] of Object.entries(index)) {
    assert(safeId(id), 'Invalid assessment/assignment ID');
    const status = typeof item === 'string' ? item : item?.state;
    assert(WORK.has(status), 'Invalid assessment/assignment state');
    if (typeof item === 'object' && item !== null && item.criteria !== undefined) validateCriteria(item.criteria);
  }
  assert(state.pendingQuestion === null || object(state.pendingQuestion), 'Invalid pending question');
  for (const [id, attempt] of Object.entries(state.attempts)) assert(safeId(id) && object(attempt) && safeId(attempt.assessmentId) && safeId(attempt.attemptId) && typeof attempt.assistance === 'string' && ['none','hint','worked_example','solution_shown','tutor_performed','unknown'].includes(attempt.assistance) && (attempt.response === null || typeof attempt.response === 'string') && Array.isArray(attempt.evidence), 'Invalid attempt state');
  if (state.pendingQuestion) for (const key of ['questionId', 'assessmentId', 'attemptId', 'presentationToken']) assert(safeId(state.pendingQuestion[key]), `Pending question requires ${key}`);
  assert(Array.isArray(state.recordRefs) && object(state.operationFingerprints) && Array.isArray(state.unresolvedTopics), 'Invalid history/projection fields');
  uniqueIds(state.recordRefs.map((x) => x?.recordId), 'recordRefs');
  for (const ref of state.recordRefs) assert(object(ref) && safeId(ref.recordId) && typeof ref.path === 'string' && !ref.path.startsWith('/') && !ref.path.split(/[\\/]/).includes('..') && /^[a-f0-9]{64}$/i.test(ref.sha256), 'Invalid record reference');
  for (const topic of state.unresolvedTopics) assert(typeof topic === 'string' && topic.length > 0, 'Invalid unresolved topic');
  assert(typeof state.nextAction === 'string' && (state.notesProjection === null || (object(state.notesProjection) && Number.isSafeInteger(state.notesProjection.revision) && /^[a-f0-9]{64}$/i.test(state.notesProjection.sha256))), 'Invalid next action or notes projection');
  if (state.phase === 'completed') {
    assert(state.unresolvedTopics.length === 0, 'Completed course has unresolved requirements');
    assert(Object.values(state.assessments).every((x) => ['passed', 'not_required'].includes(typeof x === 'string' ? x : x.state)) && Object.values(state.assignments).every((x) => ['passed', 'not_required'].includes(typeof x === 'string' ? x : x.state)), 'Completed course has unfinished work');
  }
  if (state.phase === 'closed_with_exceptions') assert(state.unresolvedTopics.length > 0, 'Closing with exceptions requires unresolved requirements');
  return state;
}

function validateCriteria(criteria) {
  assert(Array.isArray(criteria), 'Criteria must be an array');
  assert(criteria.length > 0, 'Rubric must contain at least one criterion', 'INVALID_GRADE');
  uniqueIds(criteria.map((c) => c?.criterionId), 'criteria');
  for (const c of criteria) assert(Number.isFinite(c.maxPoints) && c.maxPoints > 0 && typeof c.essential === 'boolean' && typeof c.independenceRequired === 'boolean', 'Invalid criterion rubric');
}

export function validateRecord(record) {
  assert(object(record), 'Record must be an object');
  if (record.schemaVersion !== 1) invalid(`Unsupported record schema version: ${record.schemaVersion}`, 'UNSUPPORTED_SCHEMA');
  assert(safeId(record.recordId) && safeId(record.operationId) && safeId(record.courseId) && KINDS.has(record.kind), 'Invalid record envelope');
  assert(typeof record.timestamp === 'string' && !Number.isNaN(Date.parse(record.timestamp)) && Number.isSafeInteger(record.revision) && record.revision > 0 && Number.isSafeInteger(record.contentRevision) && record.contentRevision > 0 && typeof record.fingerprint === 'string' && record.fingerprint.length > 0 && object(record.payload), 'Invalid record metadata or payload');
  const p = record.payload;
  const hasIds = (...names) => names.every((name) => safeId(p[name]));
  switch (record.kind) {
    case 'course_initialized': assert(object(p.initialState), 'Initialization requires initialState'); break;
    case 'course_published': assert(object(p.manifest) && Array.isArray(p.manifest.materials) && p.manifest.materials.length > 0, 'Publication requires a material manifest'); break;
    case 'course_revised': assert(Number.isSafeInteger(p.contentRevision) && Array.isArray(p.materialChanges), 'Revision requires new contentRevision and materialChanges'); break;
    case 'qa_recorded': assert(typeof p.question === 'string' && p.question.length > 0 && typeof p.answerSummary === 'string' && p.answerSummary.length > 0, 'Q&A record requires the actual question and answer summary'); break;
    case 'progress_recorded': assert(hasIds('lessonId') && READING.has(p.reading), 'Progress record requires a lesson and reading state'); break;
    case 'assessment_prepared': assert(hasIds('assessmentId') && Number.isSafeInteger(p.rubricRevision) && p.rubricRevision > 0 && typeof p.objective === 'string' && p.objective.length > 0 && Array.isArray(p.questions) && p.questions.length > 0 && typeof p.keyPath === 'string' && Array.isArray(p.criteria), 'Prepared assessment requires objective, fixed questions/key, rubric revision, and criteria'); validateCriteria(p.criteria); for (const q of p.questions) assert(object(q) && safeId(q.questionId) && typeof q.prompt === 'string' && q.prompt.length > 0 && ['free_text','choice'].includes(q.type) && (q.type !== 'choice' || (Array.isArray(q.options) && q.options.length > 1 && q.options.every((o) => object(o) && safeId(o.optionId) && typeof o.text === 'string') && new Set(q.options.map((o) => o.optionId)).size === q.options.length)), 'Invalid saved assessment question'); break;
    case 'question_presented': assert(hasIds('assessmentId','questionId','attemptId','presentationToken') && typeof p.prompt === 'string' && p.prompt.length > 0, 'Question presentation requires saved IDs and exact prompt'); break;
    case 'answer_recorded': assert(hasIds('assessmentId','questionId','attemptId','presentationToken','evidenceId') && typeof p.response === 'string' && p.response.trim().length > 0, 'Answer record requires matching IDs and explicit response'); break;
    case 'assistance_recorded': assert(hasIds('attemptId') && ['none','hint','worked_example','solution_shown','tutor_performed','unknown'].includes(p.assistance), 'Assistance record requires attempt and valid assistance'); break;
    case 'submission_recorded': assert(hasIds('attemptId','evidenceId') && typeof p.snapshotPath === 'string' && /^[a-f0-9]{64}$/i.test(p.snapshotSha256), 'Submission record requires snapshot reference'); break;
    case 'attempt_graded':
      assert(hasIds('assessmentId','attemptId') && Number.isSafeInteger(p.rubricRevision) && Array.isArray(p.criteria) && Array.isArray(p.evidence) && typeof p.feedback === 'string' && p.feedback.trim().length > 0, 'Grade requires attempt, rubric, criterion results, evidence, and feedback', 'INVALID_GRADE');
      for (const result of p.criteria) assert(safeId(result.criterionId) && Number.isFinite(result.points) && Array.isArray(result.evidenceRefs) && typeof result.feedback === 'string' && result.feedback.trim().length > 0 && typeof result.independent === 'boolean', 'Invalid criterion result', 'INVALID_GRADE');
      break;
    case 'attempt_retried': assert(hasIds('assessmentId','attemptId'), 'Retry requires a new attempt'); break;
    case 'item_skipped': assert(hasIds('itemId') && ['assessment','assignment','lesson'].includes(p.itemType) && typeof p.reason === 'string', 'Skip requires item type, ID, and reason'); break;
    case 'course_closed': assert(['completed','closed_with_exceptions'].includes(p.phase), 'Close requires a valid terminal phase'); break;
    case 'unresolved_topic_updated': assert(Array.isArray(p.topics) && p.topics.every((topic) => typeof topic === 'string' && topic.length > 0), 'Unresolved topics must be strings'); break;
    default: invalid('Unsupported record kind', 'UNSUPPORTED_SCHEMA');
  }
  return record;
}

function grade(state, record) {
  const p = record.payload;
  const assessment = state.assessments[p.assessmentId];
  if (!assessment) invalid('Grade references a missing assessment', 'CORRUPT_STATE');
  const definition = typeof assessment === 'object' ? assessment : null;
  if (!definition?.criteria) invalid('Assessment rubric is missing', 'CORRUPT_STATE');
  if (p.rubricRevision !== definition.rubricRevision) invalid('Grade references the wrong rubric revision', 'INVALID_GRADE');
  const attempt = state.attempts[p.attemptId];
  if (!attempt || attempt.assessmentId !== p.assessmentId || attempt.rubricRevision !== p.rubricRevision || typeof attempt.response !== 'string' || !attempt.response.trim()) invalid('Cannot grade an unanswered or missing attempt', 'INVALID_INPUT');
  if (p.assistance !== attempt.assistance) invalid('Grade assistance differs from the recorded attempt', 'INVALID_GRADE');
  assert(Array.isArray(p.criteria), 'Grade criteria must be an array', 'INVALID_GRADE');
  const expected = new Map(definition.criteria.map((c) => [c.criterionId, c]));
  if (p.criteria.length !== expected.size || new Set(p.criteria.map((c) => c.criterionId)).size !== expected.size || p.criteria.some((c) => !expected.has(c.criterionId))) invalid('Grade criteria do not match the saved rubric', 'INVALID_GRADE');
  let total = 0; let maximum = 0; let essentialMet = true;
  for (const result of p.criteria) {
    const criterion = expected.get(result.criterionId);
    if (!Number.isFinite(result.points) || result.points < 0 || result.points > criterion.maxPoints) invalid('Criterion points are out of range', 'INVALID_GRADE');
    if (!Array.isArray(result.evidenceRefs) || !result.evidenceRefs.length || result.evidenceRefs.some((id) => {
      const saved = attempt.evidence?.find((e) => e.evidenceId === id);
      const supplied = p.evidence?.find((e) => e.evidenceId === id);
      return !saved || !supplied || !['tutor_observed', 'learner_supplied'].includes(saved.provenance) || saved.provenance !== supplied.provenance || (saved.snapshotPath ?? null) !== (supplied.snapshotPath ?? null) || (saved.snapshotSha256 ?? null) !== (supplied.snapshotSha256 ?? null);
    })) invalid('Grade evidence does not match the saved attempt evidence', 'INVALID_GRADE');
    const met = result.points === criterion.maxPoints;
    if (criterion.essential && criterion.independenceRequired && result.independent === true && p.assistance !== 'none') invalid('Assisted evidence cannot be marked independent', 'INVALID_GRADE');
    if (criterion.essential && criterion.independenceRequired && met && p.assistance === 'none' && result.independent !== true) invalid('Essential criterion lacks independent evidence', 'INVALID_GRADE');
    if (criterion.essential && !met) essentialMet = false;
    total += result.points; maximum += criterion.maxPoints;
  }
  if (attempt.snapshotSha256 && (p.snapshotPath !== attempt.snapshotPath || p.snapshotSha256 !== attempt.snapshotSha256)) invalid('Grade snapshot reference differs from the submitted bytes', 'INVALID_GRADE');
  if (!attempt.snapshotSha256 && (p.snapshotPath !== undefined || p.snapshotSha256 !== undefined)) invalid('Grade includes an unrelated submission snapshot', 'INVALID_GRADE');
  if (typeof p.feedback !== 'string' || !p.feedback.trim() || p.criteria.some((c) => typeof c.feedback !== 'string' || !c.feedback.trim())) invalid('Grade and each criterion require feedback', 'INVALID_GRADE');
  const passed = essentialMet && p.criteria.every((r) => !expected.get(r.criterionId).essential || !expected.get(r.criterionId).independenceRequired || r.independent === true);
  attempt.state = 'graded';
  const old = typeof assessment === 'string' ? {} : assessment;
  state.assessments[p.assessmentId] = { ...old, state: passed ? 'passed' : 'needs_review', latestAttemptId: p.attemptId, latestGrade: { points: total, maxPoints: maximum, percentage: maximum ? total / maximum * 100 : 0, feedback: p.feedback, criteria: p.criteria.map((r) => ({ criterionId: r.criterionId, points: r.points, maxPoints: expected.get(r.criterionId).maxPoints, status: r.points === 0 ? 'unmet' : r.points === expected.get(r.criterionId).maxPoints ? 'met' : 'partial', feedback: r.feedback, independent: r.independent, evidenceRefs: [...r.evidenceRefs] })) }, history: [...(old.history ?? []), { attemptId: p.attemptId, kind: 'attempt_graded', contentRevision: record.contentRevision }] };
}

export function reduceState(prior, records) {
  assert(Array.isArray(records) && records.length > 0, 'Reducer requires records');
  let state = prior === null ? null : structuredClone(validateState(prior));
  const seen = new Set(state?.recordRefs.map((r) => r.recordId) ?? []);
  for (const record of records) {
    validateRecord(record);
    if (seen.has(record.recordId)) invalid('Duplicate record reference', 'CORRUPT_STATE');
    seen.add(record.recordId);
    if (state === null) {
      if (record.kind !== 'course_initialized' || !object(record.payload.initialState) || record.revision !== 1 || record.payload.initialState.courseId !== record.courseId) invalid('Only a valid first course_initialized record may create course state', 'CORRUPT_STATE');
      state = structuredClone(validateState(record.payload.initialState));
      if (typeof record.payload.nextAction === 'string') state.nextAction = record.payload.nextAction;
    } else {
      if (record.revision !== state.revision + 1 || record.courseId !== state.courseId) invalid('Record revision or course does not continue this checkpoint', 'CONFLICT');
      const p = record.payload;
      switch (record.kind) {
        case 'course_initialized': invalid('Course is already initialized', 'CONFLICT'); break;
        case 'course_published':
          if (state.phase !== 'draft' || !object(p.manifest) || !Array.isArray(p.manifest.materials) || !p.manifest.materials.length) invalid('Publication requires a draft course and nonempty validated material manifest', 'NOT_READY');
          for (const item of p.manifest.materials) if (typeof item.path !== 'string' || item.path.startsWith('/') || item.path.split('/').includes('..') || !/^[a-f0-9]{64}$/i.test(item.sha256)) invalid('Publication manifest contains an unsafe or unhashed material reference', 'CORRUPT_STATE');
          state.phase = 'active'; break;
        case 'course_revised':
          if (!Number.isSafeInteger(p.contentRevision) || p.contentRevision <= state.contentRevision) invalid('Content revision must increase', 'CONFLICT');
          state.contentRevision = p.contentRevision; break;
        case 'qa_recorded': break;
        case 'progress_recorded':
          if (!state.lessons.some((l) => l.lessonId === p.lessonId) || !READING.has(p.reading)) invalid('Progress references unknown lesson or status');
          state.reading[p.lessonId] = p.reading;
          if (p.reading === 'reported_complete' && p.assessmentState === 'passed') invalid('Reading completion cannot pass an assessment');
          break;
        case 'assessment_prepared':
          if (state.assessments[p.assessmentId]) invalid('Assessment ID already exists', 'CONFLICT');
          validateCriteria(p.criteria);
          state.assessments[p.assessmentId] = { state: 'pending', assessmentId: p.assessmentId, rubricRevision: p.rubricRevision, contentRevision: record.contentRevision, objective: p.objective, questions: p.questions, keyPath: p.keyPath, criteria: p.criteria };
          break;
        case 'question_presented':
          const savedAssessment = state.assessments[p.assessmentId];
          const savedQuestion = savedAssessment?.questions?.find((q) => q.questionId === p.questionId);
          const existingAttempt = state.attempts[p.attemptId];
          if (state.pendingQuestion && (state.pendingQuestion.assessmentId !== p.assessmentId || state.pendingQuestion.questionId !== p.questionId || state.pendingQuestion.attemptId !== p.attemptId)) invalid('Cannot replace a different unanswered question', 'STALE_QUESTION');
          if (!savedAssessment || !savedQuestion || p.prompt !== savedQuestion.prompt || (JSON.stringify(p.options ?? null) !== JSON.stringify(savedQuestion.options ?? null)) || !safeId(p.attemptId) || !safeId(p.presentationToken) || (savedAssessment.activeAttemptId && savedAssessment.activeAttemptId !== p.attemptId)) invalid('Question presentation differs from saved assessment or token', 'CORRUPT_STATE');
          if (existingAttempt && (existingAttempt.response !== null || existingAttempt.assessmentId !== p.assessmentId || existingAttempt.questionId !== p.questionId || existingAttempt.prompt !== p.prompt || JSON.stringify(existingAttempt.options ?? null) !== JSON.stringify(p.options ?? null) || existingAttempt.presentationToken === p.presentationToken)) invalid('Only the same unanswered question may be reoffered with a fresh token', 'STALE_QUESTION');
          if (!existingAttempt && state.pendingQuestion) invalid('Cannot replace a different unanswered question', 'STALE_QUESTION');
          state.pendingQuestion = { assessmentId: p.assessmentId, questionId: p.questionId, attemptId: p.attemptId, presentationToken: p.presentationToken };
          state.attempts[p.attemptId] = { ...(existingAttempt ?? {}), assessmentId: p.assessmentId, attemptId: p.attemptId, rubricRevision: state.assessments[p.assessmentId].rubricRevision, questionId: p.questionId, prompt: p.prompt, options: p.options ?? null, presentationToken: p.presentationToken, response: null, assistance: existingAttempt?.assistance ?? 'none', evidence: existingAttempt?.evidence ?? [], state: 'presented' }; break;
        case 'answer_recorded':
          if (!state.pendingQuestion || p.assessmentId !== state.pendingQuestion.assessmentId || p.questionId !== state.pendingQuestion.questionId || p.attemptId !== state.pendingQuestion.attemptId || p.presentationToken !== state.pendingQuestion.presentationToken || typeof p.response !== 'string' || !p.response.trim() || !safeId(p.evidenceId)) invalid('Answer does not match an active question', 'STALE_QUESTION');
          state.attempts[p.attemptId] = { ...state.attempts[p.attemptId], response: p.response, evidence: [...state.attempts[p.attemptId].evidence, { evidenceId: p.evidenceId, provenance: 'learner_supplied' }], state: 'submitted' };
          state.pendingQuestion = null;
          if (state.assessments[p.assessmentId] && typeof state.assessments[p.assessmentId] === 'object') state.assessments[p.assessmentId].state = 'submitted';
          break;
        case 'attempt_graded': grade(state, record); break;
        case 'attempt_retried':
          if (!state.assessments[p.assessmentId] || !safeId(p.attemptId) || state.attempts[p.attemptId]) invalid('Retry references missing assessment or duplicate attempt', 'CORRUPT_STATE');
          state.assessments[p.assessmentId] = { ...(typeof state.assessments[p.assessmentId] === 'object' ? state.assessments[p.assessmentId] : { state: state.assessments[p.assessmentId] }), state: 'in_progress', activeAttemptId: p.attemptId };
          break;
        case 'item_skipped': {
          if (p.itemType === 'lesson') {
            if (!state.lessons.some((lesson) => lesson.lessonId === p.itemId)) invalid('Skip references missing lesson', 'CORRUPT_STATE');
            state.reading[p.itemId] = 'skipped';
            break;
          }
          const map = p.itemType === 'assessment' ? state.assessments : p.itemType === 'assignment' ? state.assignments : null;
          if (!map || !(p.itemId in map)) invalid('Skip references missing work item', 'CORRUPT_STATE');
          map[p.itemId] = typeof map[p.itemId] === 'object' ? { ...map[p.itemId], state: 'skipped' } : 'skipped'; break;
        }
        case 'unresolved_topic_updated': state.unresolvedTopics = p.topics; if (!Array.isArray(p.topics)) invalid('Topics must be an array'); break;
        case 'course_closed':
          if (p.phase === 'completed') {
            const allDone = [...Object.values(state.assessments), ...Object.values(state.assignments)].every((x) => ['passed', 'not_required'].includes(typeof x === 'string' ? x : x.state));
            if (!allDone || state.unresolvedTopics.length) invalid('Course requirements are not complete', 'NOT_READY');
          } else if (p.phase === 'closed_with_exceptions') {
            if (!Array.isArray(p.unresolved) || !p.unresolved.length) invalid('Close with exceptions must enumerate unresolved work', 'NOT_READY');
            state.unresolvedTopics = p.unresolved;
          } else invalid('Invalid close phase');
          state.phase = p.phase; break;
        case 'assistance_recorded': {
          const attempt = state.attempts[p.attemptId];
          if (!attempt || !['none','hint','worked_example','solution_shown','tutor_performed','unknown'].includes(p.assistance)) invalid('Assistance references a missing attempt or invalid label', 'CORRUPT_STATE');
          const levels = { none: 0, hint: 1, worked_example: 2, solution_shown: 3, tutor_performed: 4, unknown: 5 };
          if (levels[p.assistance] < levels[attempt.assistance]) invalid('Recorded assistance cannot be downgraded or erased', 'CONFLICT');
          attempt.assistance = p.assistance; break;
        }
        case 'submission_recorded': {
          const attempt = state.attempts[p.attemptId];
          if (!attempt || !safeId(p.evidenceId) || typeof p.snapshotPath !== 'string' || p.snapshotPath.startsWith('/') || p.snapshotPath.split(/[\\/]/).includes('..') || !/^[a-f0-9]{64}$/i.test(p.snapshotSha256) || !['tutor_observed','learner_supplied','not_run'].includes(p.provenance)) invalid('Submission lacks an attempt or immutable snapshot evidence', 'CORRUPT_STATE');
          attempt.evidence.push({ evidenceId: p.evidenceId, provenance: p.provenance, snapshotPath: p.snapshotPath, snapshotSha256: p.snapshotSha256 });
          attempt.snapshotPath = p.snapshotPath; attempt.snapshotSha256 = p.snapshotSha256;
          attempt.response = `submission:${p.snapshotSha256}`; attempt.state = 'submitted'; break;
        }
        default: invalid('Unsupported record kind', 'UNSUPPORTED_SCHEMA');
      }
    }
    if (typeof record.payload.nextAction === 'string') state.nextAction = record.payload.nextAction;
    state.revision = record.revision;
    state.courseId = record.courseId;
    state.contentRevision = Math.max(state.contentRevision, record.contentRevision);
    state.operationFingerprints[record.operationId] = record.fingerprint;
  }
  return validateState(state);
}

export function deriveProgress(state, records = []) {
  validateState(state);
  return { phase: state.phase, revision: state.revision, contentRevision: state.contentRevision, reading: { ...state.reading }, assessments: structuredClone(state.assessments), assignments: structuredClone(state.assignments), unresolvedTopics: [...state.unresolvedTopics], nextAction: state.nextAction, recordCount: records.length || state.recordRefs.length };
}
