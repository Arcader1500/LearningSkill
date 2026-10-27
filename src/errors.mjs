export class LearningError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'LearningError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const fail = (code, message, details) => { throw new LearningError(code, message, details); };
