---
name: create-course
description: Create personalized courses, optionally assess prerequisites without grades, author lessons and assignments, prepare private rubrics and keys, and revise saved materials.
---

# Create course

Own optional intake, design, authoring and initialization. Route teaching, saved questions, submissions, grading, retries and resume to the sibling `learn` skill. A creation request authorizes preparation without an added plan approval gate. Never claim writes, research or execution that did not occur.

1. Identify goal, experience, requested starting point, constraints and explicit course path. Use [authoring guidance](references/authoring.md) for optional skippable intake and estimates. Preserve requested basics. Offer Lesson 0 only for response-supported gaps and wait for an actual choice. Save intake in learnerContext.preCourseAssessment under the [existing protocol](docs/protocol.md#pre-course-questionnaire-context); before initialization it has no durable recovery guarantee. Do not create graded attempts for intake.
2. Author all required reading, linked lessons and assignment briefs with [course](templates/course.md), [lesson](templates/lesson.md) and [assignment](templates/assignment.md) templates. Prepare private assessments before presentation. Keep learner files free of tutor policy. Follow [assignment design](references/assignments.md) for manageable practice and scaffolding.
3. Perform the [pre-initialization authoring review](references/review.md). Fix discrepancies before committing. Report exactly which commands/examples were checked and which were not run.
4. Resolve the installed helper using platform metadata. Use the existing protocol and operation IDs/expected revisions, preferably course.bootstrap, to initialize, prepare and publish in one transaction. Keep stable IDs and original assessment revisions. Include material roles, assignment sequence/readiness and intake snapshot. Report only confirmed saved results; a failed notes projection does not undo committed state.
5. For “create and start”, hand off the explicit course root to `learn`, which calls course.resume and presents its saved next action. A fresh session must need no authoring-chat memory. Creation alone ends with the saved course location and Start here link.

## Supported material revisions

Read committed state and relevant records before changing existing material. Revise only requested material and register an explicit content revision with the existing protocol. Preserve prior attempts, keys and rubric revisions, and stable IDs. Do not migrate or regenerate existing courses merely because skills have split. Resume and progress reporting follow [persistence](references/persistence.md).
