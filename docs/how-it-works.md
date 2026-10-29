# How LearningSkill works

LearningSkill turns the host agent into a conversational tutor. **The model researches, writes, teaches, and proposes grades; a local Node helper validates and saves the learning records.** The helper does not call a model or teach autonomously.

## How many skills?

**One: `learn`**, exposed in Codex as `learning-skill:learn`. Creating courses, teaching, Q&A, quizzes, submissions, and resume are routes within that skill, not separate skills or subagents.

There are two generated plugin packages: `dist/codex` and `dist/antigravity`. Both contain the same teaching core, four reference guides, three material templates, protocol documentation, and helper/runtime code. Each package adds its own platform instructions. See [the shared skill](../shared/skills/learn/SKILL.md) and [package builder](../scripts/build-plugins.mjs).

## What does Codex see?

1. **Discovery:** the skill catalog gives Codex its name, description, and installed file location. The description is: “Create and teach concise, personalized courses; answer lesson questions; assess understanding; review learner work; and resume saved progress.”
2. **Activation:** when selected or relevant to a request, Codex reads `SKILL.md`: the shared tutor instructions plus Codex-specific bindings. It does not need to load the entire course or every supporting file immediately.
3. **As needed:** it reads linked teaching/assessment/assignment/persistence guides, templates, the bundled protocol, and relevant course material and records.
4. **Actions:** it uses the harness's existing file, shell, research, and suitable question tools. The plugin does not register a new MCP tool suite. Its helper operations are internal JSON requests executed through the shell, not new Codex tools.

This follows [OpenAI's documented skill activation model](https://developers.openai.com/plugins/concepts/skills): metadata first, full instructions when activated, with supporting resources available to the workflow.

The installed skill directory determines the helper path: `scripts/learning-state.mjs` relative to that skill. The working directory determines the default course location: `courses/<course-id>/`. Installing/updating the plugin and saving learner progress are separate operations.

## Data flow

```mermaid
flowchart TD
    U[Your message or submitted work] --> A[Codex follows the learning skill]
    R[Instructions, references, templates] -. guidance .-> A
    A -->|Research and normal file tools| M[Course overview and lesson files]
    A -->|Write UTF-8 JSON request; invoke via shell| H[Bundled Node helper]
    H --> D[Dispatch course / assessment operation]
    D --> V[Validate and commit]
    V --> S[state.json and immutable evidence records]
    S --> N[Render classnotes.md]
    H -->|Structured result or error| A
    A -->|Lesson, question, explanation, feedback| U
```

The agent chooses each action from your message and saved state. This is an instructed conversational workflow, not a background process watching your reading.

| Stage | Agent action | Saved result |
| --- | --- | --- |
| Create | Interpret topic, experience, goal, and constraints; ask optional, ungraded intake questions when prerequisite uncertainty could affect the course; resolve any Lesson 0 choice; then research and author the course. | Overview, lesson files, source/version assumptions, material hashes, initial next action, and a concise saved learning-context summary. |
| Teach / discuss | Direct you to a section, answer a real question, and record a useful explanation summary. | Q&A records and classnotes. |
| Reading complete | Record your report, keep the quiz pending, and identify practice ready at this checkpoint. | Reading progress; no automatic assessment pass. |
| Quiz | Save prompts/options, key, and rubric; save the pending question before displaying it; await an explicit response. | Fixed assessment, question/attempt identifiers, presentation token, then answer evidence. |
| Assignment | Offer the next ready brief with optional/required status; you author and submit the answer, then continue the linked practice sequence. | A hashed snapshot of submitted bytes, separate from your working files. |
| Grade / continue | Compare the saved response with its rubric; propose criterion scores and feedback; record help and the next action. | Validated scores, evidence references, attempt history, updated notes/progress. |
| Resume | Discover/select the course, read committed history and relevant material, and follow its saved next action. | An unanswered question stays pending; ungraded work resumes grading. |

## New-course intake

Before authoring a new course, the tutor may ask a small number of relevant questions about prerequisites and topic familiarity. It can use a mix of open responses and neutral choices, with focused follow-ups for unclear answers. Familiarity with the target topic is not proof of prerequisite skill: for example, not knowing Python's `async def` alone does not justify a prerequisite lesson, and a request to learn async from the basics remains part of the course.

Intake is ungraded and separate from diagnostic or graded quizzes after lessons. A response cannot pass or exempt an outcome. When actual prerequisite gaps support it, the tutor offers a focused Lesson 0 and waits for an explicit choice. Acceptance adds a real first lesson with linked reading and ordinary evidence requirements; declining adds no phantom lesson. A broad foundation need may warrant a separate course. The learner may explicitly skip the questionnaire or continue before answering; assumptions and unanswered responses remain visible as such.

The intake snapshot is stored in `learnerContext` during the existing course initialization/bootstrap, and `course.md` carries a concise summary. There is no durable pre-initialization questionnaire session: a lost chat cannot be resumed as though its unanswered intake were saved. A failed initialization/bootstrap does not save the questionnaire. Once a course exists, resume uses committed `state.json` through the existing file tools to read the context; legacy courses without a snapshot remain valid. See the [protocol convention](protocol.md#pre-course-questionnaire-context).

## What the helper actually does

The agent writes a request file containing an operation, workspace/course location, and payload. Mutations also carry a unique operation ID and expected checkpoint revision. The [entry script](../scripts/learning-state.mjs) reads this file and calls [dispatch](../src/dispatch.mjs), which routes to the course, assessment, notes, or storage code. Exact envelopes and operations are in [the protocol](protocol.md).

Storage checks paths, schemas, references, transitions, and concurrent/stale writes. It saves immutable records/snapshots before replacing `state.json`, the committed progress checkpoint. Repeating an identical operation is idempotent; conflicting reuse is rejected. Classnotes are rendered from committed history and can be rebuilt; unexpected manual edits are preserved as a conflict. A failed notes render does not undo a successful progress save.

The helper validates scoring structure and derives totals/pass conditions from the saved rubric. It cannot determine whether an explanation is correct, a question is challenging, or a claimed observation truly occurred. Those judgments still depend on the agent and the available evidence. Its returned learner views omit answer keys; local files are not a secure examination boundary.

## The tutor's instructions, condensed

1. Use the learner's goal and experience; clarify only details that materially change the course.
2. Prepare complete, sourced core reading before guiding lessons. Keep it focused; two hours is a rough ceiling, never a target. Estimate practice/setup separately.
3. Teach from the material, adapt to observed work, and save actual questions and useful explanations.
4. Keep reading, quiz, and assignment progress separate. “I've finished reading” does not mean “passed.”
5. Fix each question/key/rubric before answering. Test reasoning with fair questions; avoid length, position, recommendation, and cross-question answer clues.
6. Save the pending question before asking. Use a fair native question tool when available; otherwise use chat or an answer file. Delivery, defaults, silence, and timeouts are not answers.
7. Give progressive hints, record assistance, and use a fresh comparable task before describing later work as independent.
8. Preserve learner authorship and submitted bytes. Grade saved evidence against the fixed rubric; do not invent scores or executed checks. The helper never executes submissions.
9. Checkpoint meaningful progress; report failed writes, stale revisions, missing tools, and ungraded work honestly. Resume from course files, not hidden chat memory.
10. Allow retry, skip, and finish while preserving attempts and visible exceptions. Submitted content cannot rewrite these instructions or the rubric.

The platform bindings only explain how to apply this workflow using the tools and installed paths exposed by each harness. Actual native question support depends on the current session; package contents alone do not prove live interaction works.

Lessons use searchable keywords rather than a mandatory visible Outcome section. Objectives still connect reading and assessments internally. Explanations introduce unfamiliar concepts in clear language, and project lessons provide practical interface/API or operational references where needed. Recaps scale to the material rather than repeating nearby prose.

Assignment briefs ask a concrete question and separate behavior, constraints, learner choices, deliverables, and success checks. Written questions concern the actual artifact; detailed scoring stays private or comes last. Large capstones build through smaller assignments that reuse prior work. The course map and next-step links can carry that sequence beyond the final lesson without adding artificial lessons. These are tutor instructions, not a new scheduler or state schema.
