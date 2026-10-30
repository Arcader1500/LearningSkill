# Assessment quality

## Ungraded pre-course intake

The optional pre-course questionnaire is conversational course-design evidence, not an assessment. Do not call `assessment.prepare`, `question.present`, `answer.record`, or `attempt.grade` for intake. Its questions, actual responses, and qualitative interpretation belong in `learnerContext.preCourseAssessment` as described by the [protocol](../docs/protocol.md#pre-course-questionnaire-context). Intake creates no pending graded question, attempt, score, pass, exemption, or outcome credit. A later Lesson 0 uses the same ordinary evidence requirements as other lessons.

## Before presentation

Define the objective, exact prompt, question type, stable option IDs/order when relevant, answer key, and criterion rubric before presenting. Give every criterion an ID, positive maximum points, essential flag, and independence requirement. Save the assessment and question instance before displaying it. Keep expected answers and keys in private assessment material; learner-facing question views contain only the prompt and options.

For a multi-part answer, split independently observable requirements into separate criteria before presentation. Describe what earns each criterion's points in the private rubric, including any allowed partial credit, and map each criterion to the relevant answer evidence. Avoid one holistic score that hides which requested parts were correct; one criterion is appropriate when the task has only one observable requirement. Check that required outcome components are covered and that essential and independence flags reflect the objective. Do not double-count the same evidence merely to inflate the total.

For example, a one-point question asks the learner to predict whether a cached layer is reused and explain why. Prepare `prediction` (0.5 points, essential, independence required) and `reasoning` (0.5 points, essential, independence required), with the expected prediction and causal explanation in the private key. A correct unaided prediction with an incorrect explanation earns 0.5/1: report `prediction` met and `reasoning` unmet, with separate feedback and evidence references. It is partial credit, not a pass; the essential reasoning criterion remains unmet. Preserve this rubric and attempt if a fresh check is needed. Never split or reweight criteria after seeing the learner's response.

## Fair questions

Choose a question format that tests the objective; open-ended quizzes are valid and need no forced mix of formats. Quiz questions may assess general concepts. Written assignment questions should assess decisions or behavior in the learner's specific artifact, without repeating the general quiz. Assess only concepts and implementation skills prepared by the reading, practical references, or earlier practice; revise preparation before presentation when there is a gap.

Prefer explanation, application, prediction, comparison, and diagnosis over bare recall when the objective permits. A distractor should express a plausible misconception or incomplete model, not a joke or obviously irrelevant answer. Keep choices similar in length, specificity, grammar, and confidence. Shuffle answer positions where useful. Do not mark a choice recommended or make correctness inferable from position, wording length, elaboration, or recommendation labels. Avoid reusing an earlier question's answer as a later question's clue. Check that each item is answerable from taught material and has one defensible key or an explicit rubric for open responses.

Ask one coherent question at a time when interaction routing benefits from it. Explain what kind of response is useful without hinting at the answer. If the learner asks to defer, is interrupted, or the tool returns no explicit response, leave the saved question pending. Never infer an answer from a card delivery or default.

## Grade and help

Grade the saved answer/submission against the exact saved rubric revision. Return criterion-level results, points, feedback, and evidence references. The helper derives totals and criterion statuses; do not substitute a narrative impression or invented aggregate. If evidence, response, or score is invalid or insufficient, retain ungraded/needs-review status and explain what is missing.

Offer progressive hints before a worked example or full solution unless the learner asks directly. Honor an explicit solution request, record the level of assistance, and do not call the resulting attempt independent. A fresh comparable attempt tests independent performance; it has a new attempt identity and preserves the assisted history. A rubric may not be changed after seeing the answer to make it pass.

See `docs/protocol.md` for stable IDs, pending-question tokens, evidence provenance, score derivation, and transition rules.
