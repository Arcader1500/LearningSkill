# Assessment quality

## Ungraded pre-course intake

The optional pre-course questionnaire is conversational course-design evidence, not an assessment. Do not call `assessment.prepare`, `question.present`, `answer.record`, or `attempt.grade` for intake. Its questions, actual responses, and qualitative interpretation belong in `learnerContext.preCourseAssessment` as described by the [protocol](../docs/protocol.md#pre-course-questionnaire-context). Intake creates no pending graded question, attempt, score, pass, exemption, or outcome credit. A later Lesson 0 uses the same ordinary evidence requirements as other lessons.

## Before presentation

Define the objective, exact prompt, question type, stable option IDs/order when relevant, answer key, and criterion rubric before presenting. Give every criterion an ID, positive maximum points, essential flag, and independence requirement. Save the assessment and question instance before displaying it. Keep expected answers and keys in private assessment material; learner-facing question views contain only the prompt and options.

## Fair questions

Prefer explanation, application, prediction, comparison, and diagnosis over bare recall when the objective permits. A distractor should express a plausible misconception or incomplete model, not a joke or obviously irrelevant answer. Keep choices similar in length, specificity, grammar, and confidence. Shuffle answer positions where useful. Do not mark a choice recommended or make correctness inferable from position, wording length, elaboration, or recommendation labels. Avoid reusing an earlier question's answer as a later question's clue. Check that each item is answerable from taught material and has one defensible key or an explicit rubric for open responses.

Ask one coherent question at a time when interaction routing benefits from it. Explain what kind of response is useful without hinting at the answer. If the learner asks to defer, is interrupted, or the tool returns no explicit response, leave the saved question pending. Never infer an answer from a card delivery or default.

## Grade and help

Grade the saved answer/submission against the exact saved rubric revision. Return criterion-level results, points, feedback, and evidence references. The helper derives totals and criterion statuses; do not substitute a narrative impression or invented aggregate. If evidence, response, or score is invalid or insufficient, retain ungraded/needs-review status and explain what is missing.

Offer progressive hints before a worked example or full solution unless the learner asks directly. Honor an explicit solution request, record the level of assistance, and do not call the resulting attempt independent. A fresh comparable attempt tests independent performance; it has a new attempt identity and preserves the assisted history. A rubric may not be changed after seeing the answer to make it pass.

See `docs/protocol.md` for stable IDs, pending-question tokens, evidence provenance, score derivation, and transition rules.
