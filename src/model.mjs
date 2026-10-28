import { fail, LearningError } from './errors.mjs';

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

function validateMaterials(materials) {
  assert(Array.isArray(materials) && materials.length > 0, 'Manifest requires materials', 'CORRUPT_STATE');
  const paths = new Set();
  for (const material of materials) {
    assert(object(material) && typeof material.path === 'string' && material.path.length > 0 && !material.path.startsWith('/') && !material.path.includes('\\') && !material.path.split('/').some((part) => part === '..' || part === '.' || part === '') && ['course','reading','assignment','key'].includes(material.role) && /^[a-f0-9]{64}$/i.test(material.sha256), 'Manifest material has an invalid path, role, or hash', 'CORRUPT_STATE');
    assert(!paths.has(material.path), 'Manifest contains duplicate material paths', 'CORRUPT_STATE');
    paths.add(material.path);
  }
  return materials;
}

function validateManifest(manifest) {
  assert(object(manifest) && typeof manifest.goal === 'string' && manifest.goal.trim().length > 0 && Array.isArray(manifest.prerequisites) && object(manifest.scope) && Array.isArray(manifest.scope.included) && Array.isArray(manifest.scope.excluded) && Array.isArray(manifest.lessons) && Array.isArray(manifest.sources) && object(manifest.estimates), 'Invalid course manifest', 'CORRUPT_STATE');
  assert(manifest.prerequisites.every((x) => typeof x === 'string') && manifest.scope.included.every((x) => typeof x === 'string') && manifest.scope.excluded.every((x) => typeof x === 'string'), 'Manifest context lists must contain strings', 'CORRUPT_STATE');
  uniqueIds(manifest.lessons.map((lesson) => lesson?.lessonId), 'manifest lessons');
  for (const lesson of manifest.lessons) {
    assert(Array.isArray(lesson.outcomeIds) && lesson.outcomeIds.length > 0, 'Each published lesson requires outcomes', 'CORRUPT_STATE');
    uniqueIds(lesson.outcomeIds, 'lesson outcomes');
  }
  for (const source of manifest.sources) assert(object(source) && typeof source.title === 'string' && source.title.length > 0 && typeof source.version === 'string', 'Invalid course source reference', 'CORRUPT_STATE');
  for (const name of ['readingMinutes','practiceMinutes','setupMinutes']) assert(Number.isFinite(manifest.estimates[name]) && manifest.estimates[name] >= 0, `Invalid ${name} estimate`, 'CORRUPT_STATE');
  return { ...manifest, materials: validateMaterials(manifest.materials) };
}

function applyManifest(state, manifest) {
  state.courseManifest = structuredClone(manifest);
  state.materialRefs = structuredClone(manifest.materials);
  state.goal = manifest.goal;
  state.prerequisites = [...manifest.prerequisites];
  state.lessons = structuredClone(manifest.lessons);
  for (const lesson of manifest.lessons) state.reading[lesson.lessonId] ??= 'not_started';
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
  const declaredOutcomes = new Set();
  for (const lesson of state.lessons) {
    assert(object(lesson) && Array.isArray(lesson.outcomeIds), 'Invalid lesson definition');
    uniqueIds(lesson.outcomeIds, 'lesson outcomes');
    for (const key of ['requiredAssessmentIds','requiredAssignmentIds','excludedOutcomeIds']) if (lesson[key] !== undefined) {
      assert(Array.isArray(lesson[key]), `${key} must be an array`);
      uniqueIds(lesson[key], key);
    }
    if (lesson.excludedOutcomeIds) assert(lesson.excludedOutcomeIds.every((id) => lesson.outcomeIds.includes(id)), 'Excluded outcomes must belong to their lesson');
    for (const id of lesson.requiredAssessmentIds ?? []) if (state.assessments[id] && typeof state.assessments[id] === 'object') assert(state.assessments[id].outcomeIds.some((outcomeId) => lesson.outcomeIds.includes(outcomeId)), `Required assessment ${id} is not linked to this lesson`);
    for (const outcomeId of lesson.outcomeIds) {
      assert(!declaredOutcomes.has(outcomeId), `Duplicate course outcome: ${outcomeId}`);
      declaredOutcomes.add(outcomeId);
    }
  }
  for (const [id, value] of Object.entries(state.reading)) assert(safeId(id) && READING.has(value), 'Invalid reading state');
  for (const index of [state.assessments, state.assignments]) for (const [id, item] of Object.entries(index)) {
    assert(safeId(id), 'Invalid assessment/assignment ID');
    const status = typeof item === 'string' ? item : item?.state;
    assert(WORK.has(status), 'Invalid assessment/assignment state');
    if (typeof item === 'object' && item !== null && item.criteria !== undefined) validateCriteria(item.criteria);
    if (typeof item === 'object' && item !== null && item.required !== undefined) assert(typeof item.required === 'boolean', `${id} required flag must be boolean`);
    if (index === state.assessments && typeof item === 'object' && item !== null) {
      assert(Array.isArray(item.outcomeIds) && item.outcomeIds.length > 0 && item.outcomeIds.every(safeId), `Assessment ${id} has invalid outcome references`);
      if (item.assignmentId !== undefined) assert(safeId(item.assignmentId) && Object.hasOwn(state.assignments, item.assignmentId), `Assessment ${id} references missing assignment`);
    }
  }
  assert(state.pendingQuestion === null || object(state.pendingQuestion), 'Invalid pending question');
  for (const [id, attempt] of Object.entries(state.attempts)) {
    assert(safeId(id) && object(attempt) && safeId(attempt.assessmentId) && safeId(attempt.attemptId) && typeof attempt.assistance === 'string' && ['none','hint','worked_example','solution_shown','tutor_performed','unknown'].includes(attempt.assistance) && (attempt.response === null || typeof attempt.response === 'string') && Array.isArray(attempt.evidence), 'Invalid attempt state');
    const assessment = state.assessments[attempt.assessmentId];
    assert(object(assessment) && attempt.attemptId === id && attempt.rubricRevision === assessment.rubricRevision && (assessment.contentRevision === undefined || attempt.contentRevision === assessment.contentRevision) && JSON.stringify(attempt.outcomeIds) === JSON.stringify(assessment.outcomeIds) && attempt.assignmentId === assessment.assignmentId, `Attempt ${id} has inconsistent assessment links`);
    for (const evidence of attempt.evidence) assert(object(evidence) && safeId(evidence.evidenceId) && ['tutor_observed','learner_supplied','not_run'].includes(evidence.provenance), `Attempt ${id} has invalid evidence`);
  }
  if (state.pendingQuestion) for (const key of ['questionId', 'assessmentId', 'attemptId', 'presentationToken']) assert(safeId(state.pendingQuestion[key]), `Pending question requires ${key}`);
  assert((state.courseManifest === null || object(state.courseManifest)) && Array.isArray(state.materialRefs), 'Invalid published course context');
  if (state.courseManifest) validateManifest(state.courseManifest);
  if (state.materialRefs.length) validateMaterials(state.materialRefs);
  if (state.courseManifest) assert(JSON.stringify(state.materialRefs) === JSON.stringify(state.courseManifest.materials), 'Material references differ from the current course manifest');
  assert(Array.isArray(state.artifactRefs), 'Invalid artifact references');
  const artifactPaths = new Set();
  for (const ref of state.artifactRefs) {
    assert(object(ref) && typeof ref.path === 'string' && ref.path.length > 0 && !ref.path.startsWith('/') && !ref.path.includes('\\') && !ref.path.split('/').some((part) => part === '..' || part === '.' || part === '') && /^[a-f0-9]{64}$/i.test(ref.sha256), 'Invalid artifact reference');
    assert(!artifactPaths.has(ref.path), 'Duplicate artifact reference path');
    artifactPaths.add(ref.path);
  }
  assert(Array.isArray(state.recordRefs) && object(state.operationFingerprints) && Array.isArray(state.unresolvedTopics), 'Invalid history/projection fields');
  uniqueIds(state.recordRefs.map((x) => x?.recordId), 'recordRefs');
  for (const ref of state.recordRefs) assert(object(ref) && safeId(ref.recordId) && typeof ref.path === 'string' && !ref.path.startsWith('/') && !ref.path.split(/[\\/]/).includes('..') && /^[a-f0-9]{64}$/i.test(ref.sha256), 'Invalid record reference');
  for (const topic of state.unresolvedTopics) assert(typeof topic === 'string' && topic.length > 0, 'Invalid unresolved topic');
  assert(typeof state.nextAction === 'string' && (state.notesProjection === null || (object(state.notesProjection) && Number.isSafeInteger(state.notesProjection.revision) && /^[a-f0-9]{64}$/i.test(state.notesProjection.sha256))), 'Invalid next action or notes projection');
  if (state.phase === 'completed') assert(completionProjection(state).ready, 'Completed course has unfinished required outcomes or unresolved requirements');
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
    case 'course_published': validateManifest(p.manifest); break;
    case 'course_revised': assert(Number.isSafeInteger(p.contentRevision) && Array.isArray(p.materialChanges) && p.materialChanges.length > 0, 'Revision requires new contentRevision and changed material references'); validateManifest(p.manifest); break;
    case 'qa_recorded': assert(typeof p.question === 'string' && p.question.length > 0 && typeof p.answerSummary === 'string' && p.answerSummary.length > 0, 'Q&A record requires the actual question and answer summary'); break;
    case 'progress_recorded': assert(hasIds('lessonId') && READING.has(p.reading), 'Progress record requires a lesson and reading state'); break;
    case 'assessment_prepared': assert(hasIds('assessmentId') && Number.isSafeInteger(p.rubricRevision) && p.rubricRevision > 0 && typeof p.objective === 'string' && p.objective.length > 0 && Array.isArray(p.questions) && p.questions.length > 0 && typeof p.keyPath === 'string' && !p.keyPath.startsWith('/') && !p.keyPath.split(/[\\/]/).includes('..') && Array.isArray(p.outcomeIds) && p.outcomeIds.length > 0 && (p.assignmentId === undefined || safeId(p.assignmentId)) && Array.isArray(p.criteria), 'Prepared assessment requires objective, outcomes, optional assignment link, fixed questions/key, rubric revision, and criteria'); uniqueIds(p.outcomeIds, 'assessment outcomes'); validateCriteria(p.criteria); for (const q of p.questions) assert(object(q) && safeId(q.questionId) && typeof q.prompt === 'string' && q.prompt.length > 0 && ['free_text','choice'].includes(q.type) && (q.type !== 'choice' || (Array.isArray(q.options) && q.options.length > 1 && q.options.every((o) => object(o) && safeId(o.optionId) && typeof o.text === 'string') && new Set(q.options.map((o) => o.optionId)).size === q.options.length)), 'Invalid saved assessment question'); break;
    case 'question_presented': assert(hasIds('assessmentId','questionId','attemptId','presentationToken') && typeof p.prompt === 'string' && p.prompt.length > 0 && (p.routingId === undefined || (typeof p.routingId === 'string' && p.routingId.length > 0 && p.routingId.length <= 512)), 'Question presentation requires saved IDs and exact prompt'); break;
    case 'answer_recorded': assert(hasIds('assessmentId','questionId','attemptId','presentationToken','evidenceId') && typeof p.response === 'string' && p.response.trim().length > 0 && (p.routingId === undefined || (typeof p.routingId === 'string' && p.routingId.length > 0 && p.routingId.length <= 512)), 'Answer record requires matching IDs and explicit response'); break;
    case 'assistance_recorded': assert(hasIds('attemptId') && ['none','hint','worked_example','solution_shown','tutor_performed','unknown'].includes(p.assistance), 'Assistance record requires attempt and valid assistance'); break;
    case 'submission_recorded': assert(hasIds('assessmentId','attemptId','evidenceId') && (p.assignmentId === undefined || safeId(p.assignmentId)) && typeof p.snapshotPath === 'string' && /^[a-f0-9]{64}$/i.test(p.snapshotSha256), 'Submission record requires assessment, attempt, and snapshot reference'); break;
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
  if (attempt.assignmentId !== definition.assignmentId || JSON.stringify(attempt.outcomeIds) !== JSON.stringify(definition.outcomeIds)) invalid('Attempt links differ from the fixed assessment', 'INVALID_GRADE');
  let linkedAssignment;
  if (definition.assignmentId) {
    linkedAssignment = state.assignments[definition.assignmentId];
    if (!linkedAssignment || typeof linkedAssignment !== 'object' || !['submitted','passed','needs_review'].includes(linkedAssignment.state) || linkedAssignment.latestSubmissionAttemptId !== p.attemptId || linkedAssignment.snapshotPath !== attempt.snapshotPath || linkedAssignment.snapshotSha256 !== attempt.snapshotSha256 || !attempt.submissionEvidenceId) invalid('Linked assignment has no matching latest submitted snapshot for this attempt', 'INVALID_GRADE');
    if (!p.criteria.every((criterion) => criterion.evidenceRefs.includes(attempt.submissionEvidenceId))) invalid('Every linked assignment criterion must cite its submitted snapshot evidence', 'INVALID_GRADE');
  }
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
  if (linkedAssignment) state.assignments[definition.assignmentId] = { ...linkedAssignment, state: passed ? 'passed' : 'needs_review', latestGradeAttemptId: p.attemptId, history: [...(linkedAssignment.history ?? []), { attemptId: p.attemptId, kind: 'attempt_graded', rubricRevision: p.rubricRevision, snapshotSha256: attempt.snapshotSha256 }] };
}

function abandonPending(state) {
  if (!state.pendingQuestion) return;
  const attempt = state.attempts[state.pendingQuestion.attemptId];
  if (attempt?.response === null) attempt.state = 'abandoned';
  state.pendingQuestion = null;
}

function workStatus(item) { return typeof item === 'string' ? item : item?.state; }

function independentPass(item) {
  if (workStatus(item) !== 'passed') return false;
  const criteria = item?.latestGrade?.criteria;
  if (!Array.isArray(criteria)) return true;
  const rubric = new Map((item.criteria ?? []).map((criterion) => [criterion.criterionId, criterion]));
  return criteria.every((result) => {
    const criterion = rubric.get(result.criterionId);
    return !criterion?.essential || !criterion.independenceRequired || result.independent === true;
  });
}

function completionProjection(state) {
  const outcomes = [];
  const unresolved = [...state.unresolvedTopics];
  const requiredAssignments = new Set();
  for (const lesson of state.lessons) {
    for (const id of lesson.requiredAssignmentIds ?? []) requiredAssignments.add(id);
    const excluded = new Set(lesson.excludedOutcomeIds ?? []);
    const declaredIds = lesson.requiredAssessmentIds;
    const explicitlyNoQuiz = Array.isArray(declaredIds) && declaredIds.length === 0;
    for (const outcomeId of lesson.outcomeIds) {
      let status = 'not_required';
      if (lesson.readingState === 'skipped' || state.reading[lesson.lessonId] === 'skipped') status = 'skipped';
      else if (excluded.has(outcomeId) || explicitlyNoQuiz) status = 'not_required';
      else {
        const candidateEntries = Object.entries(state.assessments).filter(([id, assessment]) => typeof assessment === 'object' ? assessment.outcomeIds?.includes(outcomeId) : declaredIds?.includes(id));
        const candidates = candidateEntries.map(([, assessment]) => assessment);
        for (const assessment of candidates) if (assessment.required !== false && assessment.assignmentId) requiredAssignments.add(assessment.assignmentId);
        const assessmentIds = Array.isArray(declaredIds) ? declaredIds : candidateEntries.map(([id]) => id);
        const missingIds = assessmentIds.filter((id) => !Object.hasOwn(state.assessments, id));
        status = missingIds.length ? 'pending'
          : candidates.some(independentPass) ? 'passed'
            : candidates.length > 0 && candidates.every((item) => workStatus(item) === 'not_required') ? 'not_required'
              : candidates.length > 0 && candidates.every((item) => ['skipped','not_required'].includes(workStatus(item))) ? 'skipped'
                : 'pending';
        if (missingIds.length) unresolved.push(...missingIds.map((id) => `Missing required assessment: ${id}`));
        for (const id of assessmentIds) {
          const item = state.assessments[id];
          if (item?.assignmentId) requiredAssignments.add(item.assignmentId);
        }
      }
      outcomes.push({ lessonId: lesson.lessonId, outcomeId, status });
      if (status === 'pending') unresolved.push(`Outcome not independently demonstrated: ${lesson.lessonId}/${outcomeId}`);
      if (status === 'skipped') unresolved.push(`Skipped required outcome: ${lesson.lessonId}/${outcomeId}`);
    }
    if (state.reading[lesson.lessonId] === 'skipped') unresolved.push(`Skipped lesson: ${lesson.lessonId}`);
  }
  for (const id of requiredAssignments) {
    const item = state.assignments[id];
    const status = item === undefined ? 'missing' : workStatus(item);
    if (!['passed','not_required'].includes(status)) unresolved.push(`${status === 'skipped' ? 'Skipped required assignment' : status === 'missing' ? 'Missing required assignment' : 'Required assignment remains'}: ${id}`);
  }
  const outcomeStates = new Map(outcomes.map((outcome) => [`${outcome.lessonId}/${outcome.outcomeId}`, outcome.status]));
  for (const [id, item] of Object.entries(state.assessments)) {
    const status = workStatus(item);
    if (['passed','not_required'].includes(status)) continue;
    const linkedOutcomes = typeof item === 'object' ? item.outcomeIds ?? [] : [];
    const resolvedByComparable = linkedOutcomes.length > 0 && linkedOutcomes.every((outcomeId) => {
      const lesson = state.lessons.find((candidate) => candidate.outcomeIds.includes(outcomeId));
      return lesson && outcomeStates.get(`${lesson.lessonId}/${outcomeId}`) === 'passed';
    });
    const explicitlyExcluded = linkedOutcomes.length > 0 && linkedOutcomes.every((outcomeId) => {
      const lesson = state.lessons.find((candidate) => candidate.outcomeIds.includes(outcomeId));
      return lesson && ((lesson.excludedOutcomeIds ?? []).includes(outcomeId) || (Array.isArray(lesson.requiredAssessmentIds) && lesson.requiredAssessmentIds.length === 0));
    });
    if (item?.required !== false && !resolvedByComparable && !explicitlyExcluded) unresolved.push(`${status === 'skipped' ? 'Skipped required assessment' : 'Required assessment remains'}: ${id}`);
  }
  for (const [id, item] of Object.entries(state.assignments)) if (item?.required !== false && !['passed','not_required'].includes(workStatus(item)) && !requiredAssignments.has(id)) unresolved.push(`${workStatus(item) === 'skipped' ? 'Skipped required assignment' : 'Required assignment remains'}: ${id}`);
  const uniqueUnresolved = [...new Set(unresolved)];
  return { complete: ['active','completed'].includes(state.phase) && uniqueUnresolved.length === 0, ready: uniqueUnresolved.length === 0, outcomes, requiredAssignmentIds: [...requiredAssignments], unresolved: uniqueUnresolved };
}

export function reduceState(prior, records, { historyReplay = false } = {}) {
  assert(Array.isArray(records) && records.length > 0, 'Reducer requires records');
  let state = prior === null ? null : structuredClone(validateState(prior));
  const seen = new Set(state?.recordRefs.map((r) => r.recordId) ?? []);
  for (const record of records) {
    try {
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
          if (state.phase !== 'draft') invalid('Only a draft course can be published', 'NOT_READY');
          applyManifest(state, p.manifest);
          state.phase = 'active'; break;
        case 'course_revised':
          if (!Number.isSafeInteger(p.contentRevision) || p.contentRevision !== state.contentRevision + 1 || p.contentRevision !== record.contentRevision) invalid('Content revision must increase by one and match the record', 'CONFLICT');
          applyManifest(state, p.manifest);
          state.contentRevision = p.contentRevision; break;
        case 'qa_recorded': break;
        case 'progress_recorded':
          if (!state.lessons.some((l) => l.lessonId === p.lessonId) || !READING.has(p.reading)) invalid('Progress references unknown lesson or status');
          state.reading[p.lessonId] = p.reading;
          if (p.reading === 'reported_complete' && p.assessmentState === 'passed') invalid('Reading completion cannot pass an assessment');
          if (typeof p.nextAction === 'string') state.nextAction = p.nextAction;
          break;
        case 'assessment_prepared':
          const placeholder = state.assessments[p.assessmentId];
          if (placeholder !== undefined && placeholder !== 'pending' && (typeof placeholder !== 'object' || placeholder.state !== 'pending' || placeholder.criteria || placeholder.questions || placeholder.activeAttemptId)) invalid('Assessment rubric and questions are already fixed', 'CONFLICT');
          if (!p.outcomeIds.every((outcomeId) => state.lessons.some((lesson) => lesson.outcomeIds.includes(outcomeId)))) invalid('Assessment references an undeclared lesson outcome', 'CORRUPT_STATE');
          if (p.assignmentId !== undefined && !Object.hasOwn(state.assignments, p.assignmentId)) invalid('Assessment references an undeclared assignment', 'CORRUPT_STATE');
          if (placeholder && typeof placeholder === 'object' && (JSON.stringify(placeholder.outcomeIds) !== JSON.stringify(p.outcomeIds) || (placeholder.assignmentId !== undefined && p.assignmentId !== placeholder.assignmentId))) invalid('Prepared assessment differs from its declared placeholder links', 'CONFLICT');
          validateCriteria(p.criteria);
          const objectPlaceholder = placeholder && typeof placeholder === 'object' ? placeholder : {};
          state.assessments[p.assessmentId] = { ...objectPlaceholder, state: 'pending', assessmentId: p.assessmentId, outcomeIds: p.outcomeIds, ...((p.assignmentId ?? objectPlaceholder.assignmentId) === undefined ? {} : { assignmentId: p.assignmentId ?? objectPlaceholder.assignmentId }), rubricRevision: p.rubricRevision, contentRevision: record.contentRevision, objective: p.objective, questions: p.questions, keyPath: p.keyPath, criteria: p.criteria };
          break;
        case 'question_presented':
          const savedAssessment = state.assessments[p.assessmentId];
          const savedQuestion = savedAssessment?.questions?.find((q) => q.questionId === p.questionId);
          const existingAttempt = state.attempts[p.attemptId];
          if (state.pendingQuestion && (state.pendingQuestion.assessmentId !== p.assessmentId || state.pendingQuestion.questionId !== p.questionId || state.pendingQuestion.attemptId !== p.attemptId)) invalid('Cannot replace a different unanswered question', 'STALE_QUESTION');
          if (!savedAssessment || !savedQuestion || p.prompt !== savedQuestion.prompt || (JSON.stringify(p.options ?? null) !== JSON.stringify(savedQuestion.options ?? null)) || !safeId(p.attemptId) || !safeId(p.presentationToken) || (savedAssessment.activeAttemptId && savedAssessment.activeAttemptId !== p.attemptId)) invalid('Question presentation differs from saved assessment or token', 'CORRUPT_STATE');
          if (existingAttempt && (existingAttempt.response !== null || existingAttempt.assessmentId !== p.assessmentId || existingAttempt.questionId !== p.questionId || existingAttempt.prompt !== p.prompt || JSON.stringify(existingAttempt.options ?? null) !== JSON.stringify(p.options ?? null) || existingAttempt.presentationToken === p.presentationToken)) invalid('Only the same unanswered question may be reoffered with a fresh token', 'STALE_QUESTION');
          if (!existingAttempt && state.pendingQuestion) invalid('Cannot replace a different unanswered question', 'STALE_QUESTION');
          savedAssessment.state = 'in_progress';
          state.pendingQuestion = { assessmentId: p.assessmentId, questionId: p.questionId, attemptId: p.attemptId, presentationToken: p.presentationToken, ...(p.routingId === undefined ? {} : { routingId: p.routingId }) };
          const priorAttempt = { ...(existingAttempt ?? {}) };
          delete priorAttempt.routingId;
          state.attempts[p.attemptId] = { ...priorAttempt, assessmentId: p.assessmentId, attemptId: p.attemptId, outcomeIds: [...savedAssessment.outcomeIds], ...(savedAssessment.assignmentId === undefined ? {} : { assignmentId: savedAssessment.assignmentId }), rubricRevision: savedAssessment.rubricRevision, contentRevision: savedAssessment.contentRevision ?? record.contentRevision, questionId: p.questionId, prompt: p.prompt, options: p.options ?? null, presentationToken: p.presentationToken, ...(p.routingId === undefined ? {} : { routingId: p.routingId }), response: null, assistance: existingAttempt?.assistance ?? 'none', evidence: existingAttempt?.evidence ?? [], state: 'presented' }; break;
        case 'answer_recorded':
          if (!state.pendingQuestion || p.assessmentId !== state.pendingQuestion.assessmentId || p.questionId !== state.pendingQuestion.questionId || p.attemptId !== state.pendingQuestion.attemptId || p.presentationToken !== state.pendingQuestion.presentationToken || p.routingId !== state.pendingQuestion.routingId || typeof p.response !== 'string' || !p.response.trim() || !safeId(p.evidenceId)) invalid('Answer does not match an active question', 'STALE_QUESTION');
          state.attempts[p.attemptId] = { ...state.attempts[p.attemptId], response: p.response, evidence: [...state.attempts[p.attemptId].evidence, { evidenceId: p.evidenceId, provenance: 'learner_supplied' }], state: 'submitted' };
          state.pendingQuestion = null;
          if (state.assessments[p.assessmentId] && typeof state.assessments[p.assessmentId] === 'object') state.assessments[p.assessmentId].state = 'submitted';
          break;
        case 'attempt_graded': grade(state, record); break;
        case 'attempt_retried':
          if (!state.assessments[p.assessmentId] || !safeId(p.attemptId) || state.attempts[p.attemptId]) invalid('Retry references missing assessment or duplicate attempt', 'CORRUPT_STATE');
          state.assessments[p.assessmentId] = { ...(typeof state.assessments[p.assessmentId] === 'object' ? state.assessments[p.assessmentId] : { state: state.assessments[p.assessmentId] }), state: 'in_progress', activeAttemptId: p.attemptId };
          if (state.assessments[p.assessmentId].assignmentId) {
            const assignmentId = state.assessments[p.assessmentId].assignmentId;
            const previous = state.assignments[assignmentId];
            state.assignments[assignmentId] = { ...(typeof previous === 'object' ? previous : { state: previous }), state: 'in_progress', activeAttemptId: p.attemptId };
          }
          break;
        case 'item_skipped': {
          if (p.itemType === 'lesson') {
            const lesson = state.lessons.find((item) => item.lessonId === p.itemId);
            if (!lesson) invalid('Skip references missing lesson', 'CORRUPT_STATE');
            state.reading[p.itemId] = 'skipped';
            if (state.pendingQuestion && lesson.outcomeIds.some((id) => state.attempts[state.pendingQuestion.attemptId]?.outcomeIds.includes(id))) abandonPending(state);
            break;
          }
          const map = p.itemType === 'assessment' ? state.assessments : p.itemType === 'assignment' ? state.assignments : null;
          if (!map || !(p.itemId in map)) invalid('Skip references missing work item', 'CORRUPT_STATE');
          map[p.itemId] = typeof map[p.itemId] === 'object' ? { ...map[p.itemId], state: 'skipped' } : 'skipped';
          if (state.pendingQuestion) {
            const attempt = state.attempts[state.pendingQuestion.attemptId];
            if (p.itemType === 'assessment' && attempt?.assessmentId === p.itemId || p.itemType === 'assignment' && attempt?.assignmentId === p.itemId) abandonPending(state);
          }
          break;
        }
        case 'unresolved_topic_updated': state.unresolvedTopics = p.topics; if (!Array.isArray(p.topics)) invalid('Topics must be an array'); break;
        case 'course_closed':
          if (p.phase === 'completed') {
            if (state.phase !== 'active' || !completionProjection(state).ready) invalid('Course requirements are not complete', 'NOT_READY');
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
          const assessment = state.assessments[p.assessmentId];
          if (!attempt || attempt.assessmentId !== p.assessmentId || !assessment || attempt.assignmentId !== assessment.assignmentId || p.assignmentId !== assessment.assignmentId || attempt.snapshotSha256 || !safeId(p.evidenceId) || typeof p.snapshotPath !== 'string' || p.snapshotPath.startsWith('/') || p.snapshotPath.split(/[\\/]/).includes('..') || !/^[a-f0-9]{64}$/i.test(p.snapshotSha256) || !['tutor_observed','learner_supplied','not_run'].includes(p.provenance)) invalid('Submission must match the saved assessment, assignment, and attempt and include an immutable snapshot', 'CORRUPT_STATE');
          attempt.evidence.push({ evidenceId: p.evidenceId, provenance: p.provenance, snapshotPath: p.snapshotPath, snapshotSha256: p.snapshotSha256 });
          attempt.snapshotPath = p.snapshotPath; attempt.snapshotSha256 = p.snapshotSha256;
          attempt.submissionEvidenceId = p.evidenceId;
          attempt.response = `submission:${p.snapshotSha256}`; attempt.state = 'submitted';
          if (assessment.assignmentId) {
            const previous = state.assignments[assessment.assignmentId];
            state.assignments[assessment.assignmentId] = { ...(typeof previous === 'object' ? previous : { state: previous }), state: 'submitted', latestSubmissionAttemptId: p.attemptId, snapshotPath: p.snapshotPath, snapshotSha256: p.snapshotSha256, submissionEvidenceId: p.evidenceId };
          }
          if (state.pendingQuestion?.attemptId === p.attemptId) state.pendingQuestion = null;
          break;
        }
        default: invalid('Unsupported record kind', 'UNSUPPORTED_SCHEMA');
      }
    }
    if (typeof record.payload.nextAction === 'string') state.nextAction = record.payload.nextAction;
    state.revision = record.revision;
    state.courseId = record.courseId;
    state.contentRevision = Math.max(state.contentRevision, record.contentRevision);
    state.operationFingerprints[record.operationId] = record.fingerprint;
    } catch (error) {
      if (!historyReplay) throw error;
      const safeCodes = new Set(['INVALID_INPUT', 'UNSUPPORTED_SCHEMA', 'CONFLICT', 'CORRUPT_STATE', 'PATH_ESCAPE', 'IO_ERROR', 'STALE_QUESTION', 'INVALID_GRADE', 'NOT_READY']);
      const causeCode = safeCodes.has(error?.code) ? error.code : 'CORRUPT_STATE';
      const details = {
        stage: 'history_replay',
        ...(safeId(record?.recordId) ? { recordId: record.recordId } : {}),
        ...(KINDS.has(record?.kind) ? { kind: record.kind } : {}),
        ...(Number.isSafeInteger(record?.revision) && record.revision > 0 ? { revision: record.revision } : {}),
        causeCode,
      };
      throw new LearningError(error?.code ?? 'CORRUPT_STATE', error?.message ?? 'History replay failed', details);
    }
  }
  return validateState(state);
}

export function deriveProgress(state, records = []) {
  validateState(state);
  return { phase: state.phase, revision: state.revision, contentRevision: state.contentRevision, reading: { ...state.reading }, assessments: structuredClone(state.assessments), assignments: structuredClone(state.assignments), unresolvedTopics: [...state.unresolvedTopics], completion: completionProjection(state), nextAction: state.nextAction, recordCount: records.length || state.recordRefs.length };
}

