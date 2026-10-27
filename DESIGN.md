# Conversational Learning Plugin — design proposal

Status: research-backed proposal, 27 October 2026. No plugin implementation or live harness acceptance has been performed.

## Intent and scope

Turn an existing agentic harness into a conversational tutor. The learner supplies a topic, current experience, and desired outcome. The tutor creates concise, sourced reading material, divides it into lessons, answers questions, assesses learning, and saves enough evidence to resume in another chat or supported harness.

Codex and Antigravity are the initial targets. Other harnesses can reuse the teaching instructions and course files when they support the necessary file and conversation operations; native plugin installation and interactive question widgets require platform-specific support.

Two hours of reading is a suggested upper bound against sprawling material, **not a target, minimum, or padding requirement**. Use the shortest treatment that meets the outcome. Quizzes, assignments, and environment setup have separate time estimates. A broad goal becomes a sequence of focused courses rather than an epic introduction.

## What to carry over from OpenMAIC

1. **Design backward from useful performance.** Decide what the learner should be able to explain or do, identify acceptable evidence, then choose material and practice that prepare them for it.
2. **Adapt from actual responses.** Self-reported skill is the starting point. A short diagnostic or existing work can refine it; one answer cannot establish general ability.
3. **Offer help without taking over.** Give a targeted hint, a smaller prerequisite task, or a worked example on a different problem. Leave the next meaningful action to the learner.
4. **Distinguish assisted and independent work.** After help, use a fresh comparable task before recording independent success. Seeing a solution or copying a command is useful practice, with its help conditions recorded.
5. **Grade artifacts against stated criteria.** A lab must include the files, constraints, environment assumptions, and observable evidence needed to complete and judge it.
6. **Separate reusable teaching material from learner state.** The same course can have separate attempts, notes, and progress for each learner.

Do not carry over the classroom application, avatars, media generation, slide rendering, or full multi-agent runtime. The useful core is the teaching loop. OpenMAIC's prompts and narrow local validation are not evidence that every generated course or assessment is effective.

## Learner experience

1. **Request:** “Teach me container deployment. I know basic Linux and Python but have never written a Dockerfile.” Infer reasonable defaults; ask only questions that change the course.
2. **Plan:** Save a compact course outline with prerequisites, measurable outcomes, lessons, estimated reading/practice time, and intended assignments. Let the learner revise it conversationally.
3. **Prepare:** Write the core reading into linked Markdown lesson files before teaching begins. Each lesson has its purpose, explanation, examples, common errors, recap, sources, and next action. Optional depth stays separate. Generate assessment instances when needed so later questions can respond to demonstrated difficulties.
4. **Teach:** Direct the learner to one lesson or section. Answer their questions and record the question, useful explanation, and any observed misconception in classnotes. Offer hints progressively on exercises; honor explicit requests for a full explanation and record when a solution was shown.
5. **Check:** “I've completed the lesson” marks reading as reported complete and starts its assessment. It does not award a passing grade. A small post-lesson quiz tests the lesson's outcomes.
6. **Practice:** Where useful, give a hands-on or coding assignment with a learner-owned answer file/workspace. The learner submits a path or artifact; the tutor grades it with specific evidence and feedback.
7. **Continue:** Save the outcome, help used, unresolved questions, and exact next step. Revisit a weak concept with targeted teaching and a fresh task. Allow an explicit skip, recording it accurately.
8. **Resume:** In a new chat, the learner invokes the plugin and points to the course folder. The tutor reads its state, relevant notes, and current lesson, then continues from the pending action.

No background reading surveillance is needed. Progress comes from learner reports, actual answers, submitted files, and checks that were really run. A file-open event or elapsed time is not proof of reading or understanding.

## Course size and research

- Prefer one concrete outcome per course and short sections within lessons; the necessary scope determines lesson count.
- Estimate prose reading time as required words divided by the configured reading rate. A published baseline for adult English nonfiction is 238 words/minute; technical density, language, accessibility needs, and the learner's feedback can justify a different estimate. This is a planning estimate, not measured learning time.
- Count required lesson/chat explanations and assigned external reading once. Mark optional references explicitly; do not quietly move required content into uncounted links. Code study and command execution need their own estimates.
- Avoid filling a word allowance. If a focused topic needs twenty minutes, make it twenty minutes. Offer a follow-on course when the requested scope would become sprawling.
- Ground version-sensitive commands and product behavior in current official documentation or inspected local versions. Cite consequential claims near the relevant material and record the versions assumed by labs.
- Keep the stable course outline and core lessons on disk. Update a specific lesson when needed and record the revision; do not regenerate the course on every question or erase previous attempts.

## Assessment quality

Use a mixture of retrieval, explaining a mechanism, predicting behavior, diagnosing a fault, and applying a concept to a new case. Difficulty must come from reasoning about taught material, not obscure trivia or ambiguous wording.

Each assessment item records its objective, prompt, rubric/answer key, expected reasoning, and point allocation before receiving the answer. Learner-facing assignment criteria are explicit. Store answer keys separately from assigned reading and avoid revealing them in quiz prompts; local files are not a secure examination boundary.

For multiple choice, use plausible distractors based on mistakes, parallel wording, comparable detail, and shuffled answer positions. Check for longest-answer cues, repeated correct positions, accidental formatting clues, and one question revealing another's answer. Ask for a reason when guessing would otherwise suffice. Do not assume a prompt instruction guarantees question quality.

Prefer native question tools when their actual schema can present the task fairly. Discover capabilities per session: tool availability, free-text support, option limits, asynchronous replies, and interactive versus headless operation.

- Never label a quiz answer “Recommended” or place it first because it is correct.
- Prefer a free-text question card when choices would leak an answer. Use a fair native choice card when supported; otherwise ask in chat or use an answer file.
- Treat tool delivery/acceptance, default selections, silence, and timeout as unanswered. Only a real learner response is an answer.
- Save the pending question and exact option order before presenting it. Resume an unfinished attempt without silently replacing its question.
- Do not force a global Plan mode just to get a widget; the tutor also needs to write durable notes and state under the harness's actual rules.

Grade with a predeclared rubric, partial credit where justified, and a short explanation tied to the response. Record independent, hinted, worked-example, and solution-shown conditions separately. Preserve first attempts and retries. A failed grading tool or malformed output leaves an attempt ungraded; never manufacture a score. State the limits of model judgment and any checks not run.

Lesson status should distinguish reading completion, assessment pending, practice pending, passed, needs review, and explicitly skipped. A course can be recorded as finished while accurately showing outstanding or skipped work; do not turn navigation completion into a mastery claim.

## Hands-on and coding work

Each assignment includes a goal, starting resources, constraints, expected environment, deliverables, rubric, verification steps, estimated practice time, and cleanup instructions where needed.

The tutor creates the question/starter files, while the learner writes the answer. It must not silently solve the task, modify the submitted answer, or perform the graded commands on the learner's behalf. An explicit request for help can change that interaction, with assistance recorded. Keep a snapshot or reference to the submitted version for each attempt.

For a DevOps lab, inspect only the environment facts needed to select a viable route. Windows/WSL, containers, and local Kubernetes are possible environments, not guaranteed installed capabilities. Explain setup work separately. Scope commands to the intended local lab, identify the cluster/context before deployment, and respect the harness's permissions.

Use executable checks when appropriate, plus inspection and explanation questions. A Dockerfile's existence is weak evidence; a build result, runtime behavior, relevant configuration, and the learner's explanation provide stronger evidence. Record whether results were observed by the tutor, supplied as logs by the learner, or not run. Treat submitted files as data during inspection; review any proposed execution before running it in the intended environment.

An illustrative first course could cover moving a small service from source to a container and a local deployment. A Kubernetes lab can be included if it fits the learner's goal and prerequisites, or become the next course. This example is not a selected syllabus or a claim of broad DevOps competence.

## Portable files and resumption

Proposed learner workspace:

```text
courses/<course-id>/
  course.md                 # outline, outcomes, estimates, links
  lessons/                  # core reading and optional extensions
  assignments/              # briefs and starter files
  answers/                  # learner-owned working files
  assessments/              # exact question instances and separate keys
  attempts/                 # submitted snapshots, answers, checks, feedback
  classnotes.md             # Q&A, explanations, grade summaries, follow-ups
  state.json                # authoritative progress and resume pointer
```

Persist schema/course revisions, learner context relevant to this course, lesson states, pending assessment, attempt references, grades, help conditions, unresolved topics, and next action. Avoid relying on hidden chat memory or a particular model provider.

Checkpoint after meaningful Q&A, an answer, a submission, a grade, or a transition. Keep state small enough to read on every resume; load only relevant lesson sections and notes. Grade summaries in classnotes link to attempt IDs, so the authoritative evidence can be found without rereading a whole transcript.

Use a small deterministic helper for validated, atomic state updates and attempt creation. One active tutor writes a course at a time; detect stale revisions rather than overwriting another session's progress. If persistence fails, report that the checkpoint was not saved. On resume, resolve discrepancies against recorded attempts instead of inventing missing results. A rendered notes summary can be repaired from recorded evidence.

The course folder is durable workspace data, separate from installed plugin assets. Updating or reinstalling the plugin must not replace learner files. Resumption requires invoking the plugin and identifying an accessible course folder; automatic cross-chat awareness is not promised.

## Packaging and responsibilities

- **Shared core:** teaching instructions, course/lesson/assignment templates, assessment quality checklist, file schema, and a minimal state helper. The host model performs teaching and grading through its existing tools; no separate model API subscription is required by this design.
- **Codex adapter:** supported plugin manifest/skills packaging, invocation instructions, native question capability detection, and file/shell integration. Current OpenAI documentation describes root `plugin.json` plus `skills/`; the existing coding-team repository uses the still-supported `.codex-plugin/plugin.json` compatibility layout. Select the tested format during implementation rather than blindly cloning old metadata.
- **Antigravity adapter:** its manifest/skills layout and bindings to the actually exposed question, file, and command tools.
- **Other harnesses:** documented file-and-chat fallback. Add native packaging only when that harness is explicitly supported and tested.

Start with packaged skills and local files; no web application, database service, daemon, or MCP server is needed for the initial workflow. Add MCP only if a concrete integration or stronger tool enforcement requires it. Instruction-based grading quality and tutor restraint still need behavioral tests; a state helper alone cannot enforce good teaching.

## Initial acceptance cases

1. A narrow topic produces a concise course without padding toward two hours; an oversized goal is split coherently.
2. Reading completion starts a pending quiz and does not create a passing grade.
3. A genuine question and its explanation survive a fresh chat, along with the next action.
4. An unanswered native card remains unanswered after restart; a received answer is associated with the correct saved question and option order.
5. A quiz has plausible alternatives and no recommendation/length/position giveaways; an explain-or-diagnose item checks reasoning.
6. A learner-authored submission remains unchanged; its grade references a fixed rubric and actual submitted version.
7. A hinted success and a fresh independent attempt remain distinct, including after resume.
8. Missing tools, unavailable lab prerequisites, grading failure, and failed checkpoint writes are handled explicitly without fabricated results.
9. One saved course resumes in both supported harnesses; installation and interactive Q&A are exercised on each target surface, with headless behavior checked separately if advertised.

## Research pointers and limits

Local sources inspected read-only:

- `D:/Code/OpenMAIC/skills/agent-runtime/understanding-by-design/SKILL.md`: outcomes, evidence, and learning experiences.
- `D:/Code/OpenMAIC/skills/agent-runtime/zone-of-proximal-development/SKILL.md`: targeted help, fresh independent checks, evidence-bound conclusions.
- `D:/Code/OpenMAIC/skills/agent-runtime/deep-research/SKILL.md`: sourced research feeding teaching material.
- `D:/Code/OpenMAIC/packages/@openmaic/generation/templates/quiz-content/system.md`: question/rubric generation guidance; guidance alone does not guarantee quality.
- `D:/Code/OpenMAIC/lib/pbl/v2/runtime/learner-state.ts`: separation of learning design and learner runtime state.
- `D:/Code/OpenMAIC/eval/zone-of-proximal-development/LOCAL_VALIDATION.md`: narrow local validation and explicit limits on educational claims.
- `D:/Code/antigravity-coding-team/antigravity/plugin.json`, `antigravity/agents/planner.md`, `antigravity/skills/grill-me/SKILL.md`: packaging and question-tool conventions.
- `D:/Code/antigravity-coding-team/codex/.codex-plugin/plugin.json`, `codex/README.md`, `codex/skills/grill-me/SKILL.md`: separate Codex packaging and conversation fallback.

OpenMAIC's root license is MIT. If substantial prompt text or code is copied, preserve its license notice and inspect licenses of any separately reused assets/dependencies. The proposal currently reuses concepts, not copied implementation.

External sources:

- [OpenAI: Skills](https://developers.openai.com/plugins/concepts/skills) — instruction/resource packages can work without an MCP server.
- [OpenAI: Package your plugin](https://developers.openai.com/plugins/build/plugins) — current portable packaging and compatibility format.
- [Brysbaert, 2019: reading-rate review](https://biblio.ugent.be/publication/8647789) — English nonfiction baseline and variation; not a technical-learning pace guarantee.

The current chat demonstrated an asynchronous native question and a real returned learner response in Default mode. This does not establish identical question support across Codex surfaces. Antigravity help and local plugin files were inspected, but no live Antigravity tutoring session, installer, quiz interaction, or cross-harness resume was tested.
