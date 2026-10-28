# Pre-course knowledge questionnaire

Status: approved by the user on 28 October 2026.

Source: [GitHub issue #1, first suggestion](https://github.com/Arcader1500/LearningSkill/issues/1), clarified by the learner in this planning chat. The other issue items are outside this enhancement.

## Goal

Before authoring a new course, use a short, adaptive, ungraded conversation to understand the learner's relevant prerequisites and familiarity with the requested topic. Use their responses to shape explanations and pacing and, when useful, offer a focused Lesson 0 covering prerequisite gaps.

Self-reported experience is a starting point. The questionnaire supplies course-design evidence, not a certification of general skill, a pass/fail decision, or course assessment credit.

## Agreed requirements

- Analyze the requested topic, desired starting point, claimed experience, and intended outcome to identify prerequisites that actually matter.
- Offer a questionnaire when prerequisite uncertainty would change the course. A course requiring no prior knowledge should not trigger an obligatory diagnostic.
- Use multiple-choice, yes/no with optional explanation, and open-ended questions as appropriate. Let the learner answer naturally rather than forcing every response into a fixed choice.
- Check both relevant background knowledge and familiarity with upcoming concepts. Keep these purposes distinct: unfamiliarity with content the course will teach is expected and does not itself establish a prerequisite gap.
- Interpret responses qualitatively and conservatively. A self-report of familiarity is weaker evidence than an explanation; a single unfamiliar term does not disprove an intermediate background.
- Offer Lesson 0 when responses suggest missing prerequisites. Explain what it would cover and why, and include it only when the learner accepts.
- The learner explicitly confirmed that the questionnaire may be skipped. Continue using visible, provisional assumptions after a skip.
- Preserve an explicit request to start the target topic from its basics even when the learner already knows some of it. Familiarity can change emphasis, examples, or optional depth; it does not authorize silently skipping requested fundamentals.

## Learner interaction

After understanding the learning goal and before generating the complete course, identify the smallest set of background concepts needed. If a questionnaire would be useful, briefly explain its purpose and allow the learner to answer or skip. Do not introduce an extra course-plan approval gate.

Start with a small batch, ordinarily two to four focused questions. Ask a further question only when the answer could materially change the prerequisite recommendation or course design. This is a conversational default, not a hard question quota. Accept “I don't know,” partial answers, and learner-provided examples. Avoid surveying an entire language or discipline to assess a narrow topic.

Use neutral options and ordinary chat or an actually suitable native question surface. A native tool that forces recommendations, cannot accept the needed explanation, or is unavailable should give way to ordinary chat. A delivered card, preselected option, timeout, cancellation, or silence supplies no knowledge evidence and does not mean the learner skipped. Wait for an explicit response or explicit request to proceed. Correlate asynchronous replies with the actual question; clarify ambiguous or late replies rather than guessing.

After enough useful responses, give a brief explanation of the course-design implications: apparent strengths, possible prerequisite gaps, and areas still uncertain. Avoid numerical scores, grades, proficiency ranks, or categorical claims that prerequisites have been verified.

If gaps warrant a short foundation lesson, offer a concrete Lesson 0 outline and ask whether to include it. A learner may accept it, decline it, or request a different starting point. If accepted, include it before the main sequence. If declined, proceed with the stated starting assumptions and make relevant prerequisite explanations available conversationally. If gaps would require a substantial separate course, suggest that focused prerequisite course instead of creating an oversized Lesson 0.

## Example: intermediate Python to async from the basics

The learner says: “I'm intermediate in Python, but I want to learn Python async from the very basics.”

Possible questions, selected for the intended course rather than used as a mandatory script:

- Prerequisite explanation: “When you call a normal Python function, how does its result get back to the caller? A short explanation or example is fine.”
- Prerequisite reasoning: “What happens to other work in a simple single-threaded program while a function waits for a network response?”
- Topic familiarity: “Have you encountered `async def`? You can say no, say yes, or explain what you think it does.”

Not recognizing `async def` is a normal starting point for this course. Difficulty explaining ordinary function calls or waiting behavior may justify offering a short foundation lesson on the particular missing concepts. Do not demand knowledge of decorators, generators, threading, or other advanced topics unless the actual course needs them. Do not treat saying “yes” to `async def` as proof of understanding or as permission to omit its introduction.

## Architecture and durable context

Use the existing conversational skill and course creation contract. Conduct the questionnaire before authoring the final lesson sequence, then save a structured snapshot under `learnerContext.preCourseAssessment` in the existing `course.init` or `course.bootstrap` initialization payload. Save a concise learner-facing summary in `course.md` alongside the starting assumptions.

The current implementation already accepts and retains an object-valued `learnerContext` (`src/course.mjs`, `src/model.mjs`). Bootstrap uses that same initialization path (`src/bootstrap.mjs`), and the raw course resume function returns the committed learner context. The dispatched helper response filters that context out; after a successful helper resume, read it from committed `state.json` through the existing file tools. Do not interpret absence from the filtered response as missing questionnaire data. No new helper operation, record kind, top-level state field, protocol version, rubric, answer key, graded attempt, or separate intake service is needed for this scope.

The snapshot is an instruction-level convention inside learner context, not a new reducer-enforced questionnaire state machine. Preserve other learner context fields. Suggested structure:

```json
{
  "status": "completed",
  "reason": "The intended async course assumes ordinary Python functions and basic waiting behavior.",
  "questions": [
    {
      "questionId": "functions-1",
      "purpose": "prerequisite",
      "concept": "ordinary function calls",
      "type": "free_text",
      "prompt": "When you call a normal Python function, how does its result get back to the caller?",
      "response": "Learner's actual answer",
      "responseKind": "explanation"
    }
  ],
  "interpretation": {
    "strengths": [],
    "possibleGaps": [],
    "uncertainties": [],
    "courseAdjustments": []
  },
  "lesson0": {
    "decision": "not_needed",
    "topics": [],
    "reason": "No prerequisite gap was identified in the supplied responses."
  }
}
```

Conventions:

- Questionnaire status is `completed`, `skipped`, `partial`, or `not_needed`. Older courses without this property mean no questionnaire was recorded, not that the learner skipped or completed one.
- Question purpose is `prerequisite` or `topic_familiarity`; type is `free_text` or `choice`. Choice questions retain the exact options and order shown. Save a selected option ID when applicable and preserve any actual explanation. `responseKind` distinguishes `self_report`, `explanation`, and `unknown`.
- Only explicit learner answers populate responses. If the learner chooses to proceed before answering everything, use `partial` and preserve unanswered questions with null responses; do not invent answers. A total explicit skip is `skipped`.
- Interpretations identify the question IDs or learner statements supporting each material claim. Do not copy a tutor-created hypothetical error into the learner's knowledge profile.
- Lesson 0 decision is `not_needed`, `accepted`, or `declined`; accepted/declined decisions require the learner's explicit choice. A recommendation awaiting a reply stays in the conversation until resolved or the learner explicitly chooses to proceed. No course generation depends on treating silence as acceptance.
- Keep the snapshot focused on learning context. Do not persist unrelated personal details.

The final course is still authored before guided teaching begins and can still be created through atomic bootstrap. Include an accepted Lesson 0 in initialization and the publication manifest, with a unique lesson ID and outcomes, linked reading, and estimates. Use the existing lesson evidence rules; distinguish any later graded Lesson 0 checks from the intake questionnaire. Declining Lesson 0 must not create a phantom required lesson or mark course work as skipped.

## Resume, compatibility, and failure behavior

After course creation, resume uses the saved questionnaire summary and learner choice rather than asking the same intake questions again. Legacy courses continue normally without a retrospective questionnaire requirement. Existing graded assessment presentation, rubric immutability, evidence, progress, and completion behavior remain authoritative for course work; questionnaire answers do not award or exempt any outcomes.

Before course initialization, this version relies on the current conversation for questionnaire progress. It does not promise durable resumption of a partially completed intake across a lost chat. In a new chat, reuse answers the learner supplies, otherwise offer a short fresh questionnaire without claiming to remember previous answers. Adding durable pre-initialization intake would be a separate lifecycle feature.

On failed initialization/bootstrap, do not claim the questionnaire or course was saved. Follow the existing conflict, retry, idempotency, and notes-error rules. If the learner skips, retain the distinction between untested assumptions and response-supported observations. No response is never inferred to be a deficit.

Questionnaire selection, response interpretation, and teaching behavior are model responsibilities. Deterministic tests can verify context persistence and absence of grade/progress side effects; they cannot establish teaching quality.

## Affected interfaces and documentation

The shared `learn` skill's new-course routing and teaching reference describe the intake sequence. Its assessment reference distinguishes intake from graded work. The course template captures the concise summary and provisional prerequisites rather than demanding “verified” prerequisites. Both platform adapters explain questionnaire interaction separately from their durable graded-question protocol. The protocol documents the optional learner-context convention and its pre-initialization persistence limit.

README, workflow/acceptance documentation, and behavioral evaluation scenarios describe the optional questionnaire and Lesson 0 decisions. Existing packaging carries the shared instructions and references into both supported plugins; prefer extending the existing references so no new packaged asset is necessary. No installed plugin update is part of planning.

## Acceptance criteria

1. The Python async example triggers relevant, concise questions with open-ended and choice-capable delivery. Both prerequisite checks and topic-familiarity checks appear, without a broad Python exam.
2. Unfamiliarity with `async def` alone does not trigger a prerequisite lesson; the async introduction remains in the requested course.
3. A relevant prerequisite gap produces a concrete Lesson 0 offer. Acceptance adds a real first lesson with linked material; refusal proceeds without inserting it.
4. Conflicting, vague, or partial answers lead to limited conclusions or a focused follow-up, never a fabricated grade or global proficiency judgment.
5. Explicit skipping proceeds with stated assumptions; a course with no meaningful prerequisites proceeds without an unnecessary questionnaire.
6. Native-tool restrictions fall back to chat. Silence, defaults, cancellation, late replies, and delivery acknowledgements do not become answers or skip decisions.
7. Committed initialization/bootstrap retains exact answered questions, relevant options, responses, qualitative interpretation, and Lesson 0 choice across a fresh-process resume, without altering assessment credit or completion requirements.
8. Legacy courses remain usable without questionnaire data. Replaying creation preserves its existing idempotency guarantees and does not duplicate the snapshot or history.
9. Generated Codex and Antigravity packages include the updated shared guidance and bindings. Behavioral scenarios remain `not_run` until actual observed runs are recorded.

## Autonomous engineering defaults and exclusions

Choose the existing learner-context extension point and existing course persistence rather than a new questionnaire engine. Prefer a small initial batch, targeted follow-ups, neutral delivery, and concise saved context. All supplied wording above illustrates behavior; it is not a mandatory script or a new disclaimer.

Excluded: scored placement exams, automatic mastery credit, hard prerequisite gates, automatic omission of requested basics, new UI/MCP services, durable pre-initialization questionnaires, mid-course re-assessment lifecycle changes, and further fixes to the other issue #1 suggestions.

No source changes, tests, native teaching sessions, or plugin installation have been performed for this proposal. Detailed task decomposition follows explicit design approval.
