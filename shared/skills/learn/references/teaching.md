# Teaching and course design

## Shape a concise course

Use the learner's topic, level, outcome, and constraints to select the smallest useful scope. State what is included and excluded, prerequisites, lesson order, required evidence, and next action. If the topic is broad, define a focused first course and suggest coherent follow-ons. Do not pad to a duration or produce an encyclopedic survey.

Prepare all required core reading and linked lesson files before guided teaching starts. Optional depth must be clearly separate from required work. Keep version-sensitive instructions grounded in official current sources or inspected local versions; name versions and assumptions. If research tools are unavailable, state that current behavior was not verified.

## Write lessons that teach

Start each lesson with a short Keywords section naming the concepts and APIs/commands it actually teaches. Repeat these terms alongside lesson links in the course overview so the learner can find them later. Keep observable objectives for course design and assessment alignment; they do not require a visible Outcome section or a new saved-state field.

Introduce the problem and connect it to previous learning before presenting unfamiliar concepts. Define new terms where used, explain why steps or ideas connect, and demonstrate important distinctions with worked examples. A mention or documentation link is not enough preparation for an assessed implementation. For example, if a lesson compares awaiting and scheduling, show and explain both behaviors.

Experience changes which basics need teaching, not the clarity of the language. Use direct sentences and enough explanation for a new concept; do not substitute dense lists of requirements for teaching. Choose length for understanding, without padding or an arbitrary minimum. Retain recaps as proportionate synthesis: a short lesson needs little recap, while a longer lesson may need connections and decisions brought together.

A project-focused lesson must add practical preparation beyond restating architecture or linking a brief. When appropriate, provide function/interface signatures, inputs and outputs, relevant APIs, or operational entry points and expected observations. Explain ownership and how components connect, then suggest a starting order without giving the complete solution. Check that example names, protocols, prerequisites, and requirements agree with the assignment.

## Build a practice sequence

For a substantial capstone, identify the component skills it combines and provide manageable intermediate assignments for skills not already practised. Reuse learner-authored artifacts while adding a meaningful capability at each step. For example: implement a handler, connect a client to it, then integrate bounded workers and two-way job/status communication. Adapt the steps to the topic; do not require this particular architecture everywhere.

Assignments need not correspond one-to-one with lessons. A course can alternate lessons and practice, then finish with several linked assignments after the final lesson. Show that sequence in `course.md` and link each brief to the next. Do not invent a lesson solely to hand off an assignment. State what is optional or required and provide an alternative starting point when later work depends on skipped optional practice. Keep the progression focused on the learner's goal rather than adding exercises for volume.

## Optional pre-course intake

Before authoring a new course, consider the learner's goal, requested starting point, experience, and intended outcome. Identify the smallest set of prerequisites that actually affects the course. If uncertainty about those prerequisites could change explanations or pacing, briefly offer an optional questionnaire and an explicit way to skip. Do not make intake obligatory when no meaningful prerequisites exist. A skip proceeds with visible provisional assumptions; it does not create an extra course-plan approval gate.

Start with a small batch, ordinarily two to four focused questions, and ask follow-ups only when an answer could materially change the course. Mix neutral choices with open responses as useful; accept unknown, partial, and natural-language answers. Keep prerequisite knowledge separate from familiarity with concepts the course itself will teach. A self-report is weaker evidence than an explanation, and unfamiliarity with one upcoming term is not by itself a prerequisite gap. Preserve a request to start the target topic from its basics even when familiarity is reported.

Interpret answers conservatively and qualitatively: summarize response-supported strengths, possible gaps, uncertainties, and course adjustments without scores, grades, proficiency ranks, or claims that prerequisites are verified. Cite the saved question IDs or actual learner statements behind material conclusions. Do not turn a tutor-created hypothetical into a learner belief.

When responses support a focused prerequisite gap, offer a concrete Lesson 0 outline and explain why it helps. Wait for explicit acceptance or refusal; silence is neither. Add an accepted Lesson 0 before the main sequence as a real lesson with unique outcomes, linked reading, estimates, and ordinary evidence requirements. Declining adds no phantom lesson or skipped work. If the bridge would become sprawling, suggest a separate prerequisite course. Do not use the ungraded intake as a grade, exemption, or reason to omit requested fundamentals. See [assessment quality](assessment.md) for the separation from graded work and [protocol](../docs/protocol.md#pre-course-questionnaire-context) for saved context.

## Estimates

Estimate required prose reading as required word count divided by a configurable reading rate. Start at 238 words per minute for English nonfiction; adjust for technical density, language, accessibility needs, and learner feedback. Count assigned external reading and required chat explanations once. Keep optional reading, code study, practice, and setup as separate estimates. These are planning estimates, not timers or evidence of comprehension.

## Guided teaching

Orient the learner using the lesson's keywords, the problem it addresses, and its connection to their goal. Use examples to clarify the concept, then invite the learner to explain, compare, predict, diagnose, or apply it. Ask a focused follow-up when reasoning is unclear. Adapt pacing to observed work rather than elapsed time.

For Q&A, preserve the learner's actual question, a useful summary of the explanation, relevant lesson, and an actual follow-up when one occurs. Record misconceptions only when supported by the learner's words or work. Clearly label tutor-created examples so they cannot be mistaken for learner errors. A classnotes entry should help a future session continue usefully, not merely repeat a transcript.

After the learner reports reading complete, acknowledge it as self-report and keep required assessment pending. Do not infer mastery, quiz completion, or assignment completion from page navigation, elapsed time, or the reading report. Present the next action and allow retry, skip, or continuation where the course permits.

At the relevant lesson/quiz checkpoint, explicitly offer ready assignments rather than relying on links in the overview. Give the purpose, brief link, and optional/required status; honor a learner's choice to defer or continue. After assignment review, offer the next step in the practice sequence, including after the last lesson. Preserve pending questions and submitted-but-ungraded work when selecting the next action. Reading or quiz completion does not imply that the practice sequence is complete.

## Sources and revisions

Prefer official documentation for product behavior, commands, and supported versions. Record title/organization, URL or local source, access/version context, and which material it supports. Do not fabricate citations. When a claim or course material changes, revise the specific file and register an explicit content revision; prior assessment attempts stay attached to their saved revision.
