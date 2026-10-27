import { strict as assert } from 'node:assert';

export const id = (value) => value;

export function state(overrides = {}) {
  return {
    schemaVersion: 1, courseId: 'course-1', revision: 0, contentRevision: 1,
    phase: 'draft', learnerContext: {}, goal: 'Learn the subject', prerequisites: [],
    readingRateWpm: 238, lessons: [], reading: {}, assessments: {}, assignments: {},
    pendingQuestion: null, attempts: {}, recordRefs: [], operationFingerprints: {},
    unresolvedTopics: [], nextAction: 'prepare course', notesProjection: null,
    ...overrides,
  };
}

export function record(kind, payload = {}, overrides = {}) {
  const defaults = {
    course_initialized: { initialState: state() },
    course_published: { manifest: { materials: [{ path: 'course.md', sha256: '0'.repeat(64) }] } },
    course_revised: { contentRevision: 2, materialChanges: ['lesson-1'] },
    qa_recorded: { question: 'Why?', answerSummary: 'Because.' },
    progress_recorded: { lessonId: 'l1', reading: 'reported_complete' },
    assessment_prepared: { assessmentId: 'a1', rubricRevision: 1, objective: 'Explain the outcome', questions: [{ questionId: 'q1', prompt: 'Explain.', type: 'free_text' }], keyPath: 'assessments/a1-key.md', criteria: [] },
    question_presented: { assessmentId: 'a1', questionId: 'q1', attemptId: 'try-1', presentationToken: 'token-1', prompt: 'Explain.' },
    answer_recorded: { assessmentId: 'a1', questionId: 'q1', attemptId: 'try-1', presentationToken: 'token-1', response: 'Answer.', evidenceId: 'ev-1' },
    assistance_recorded: { attemptId: 'try-1', assistance: 'none' },
    submission_recorded: { attemptId: 'try-1', evidenceId: 'ev-1', snapshotPath: 'submissions/a1/file.txt', snapshotSha256: '0'.repeat(64), provenance: 'learner_supplied' },
    attempt_graded: { assessmentId: 'a1', attemptId: 'try-1', rubricRevision: 1, criteria: [], evidence: [], feedback: 'Reviewed.' },
    attempt_retried: { assessmentId: 'a1', attemptId: 'try-2' },
    item_skipped: { itemId: 'a1', itemType: 'assessment', reason: 'learner choice' },
    course_closed: { phase: 'completed' },
    unresolved_topic_updated: { topics: [] },
  }[kind] ?? {};
  return {
    schemaVersion: 1, recordId: `record-${kind}`, operationId: `operation-${kind}`,
    kind, timestamp: '2026-01-01T00:00:00.000Z', courseId: 'course-1',
    revision: 1, contentRevision: 1, fingerprint: `fingerprint-${kind}`,
    payload: { ...defaults, ...payload }, ...overrides,
  };
}

export function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}
