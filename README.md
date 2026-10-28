# LearningSkill

LearningSkill is a conversational tutor plugin for Codex and Antigravity. The harness supplies the model and tools; this package supplies shared teaching guidance, course templates, platform bindings, and a local Node helper for validated progress and evidence records.

## Requirements

- Node.js `>=22` is the intended minimum. The runtime exercised in the current workspace is Node `v26.3.0`; Node 22 compatibility has not been tested.
- No npm dependencies or `npm install` are required.

## Install

Install and sign in to your chosen host (Codex or Antigravity) first, and ensure `node` and `npm` are on your PATH. LearningSkill uses that host's model and tools; it does not require a separate model API key.

### Build the packages

From this repository root:

```text
npm run build
npm run validate
agy plugin validate dist/antigravity --strict --json
```

The build creates self-contained packages in `dist/codex` and `dist/antigravity`. Local validation checks package structure and contents. AGY strict validation checks its native manifest/package format. Successful installation/listing still does not prove fresh-chat skill loading or interactive assessment behavior.

### Codex

Run these commands from the LearningSkill repository root after building:

```powershell
codex plugin marketplace add .
codex plugin add learning-skill@learning-skill-local --json
codex plugin list
```

Confirm that `learning-skill` is installed and enabled. The `.` is the repository root containing `.agents/plugins/marketplace.json`, not `dist/codex`. See the [official plugin packaging documentation](https://developers.openai.com/plugins/build/plugins) for Codex marketplace installation.

To start learning, change to the workspace where you want your course saved and launch a fresh session:

```powershell
cd "C:\path\to\your-learning-workspace"
codex
```

In the Codex desktop app, open that workspace and start a new chat after installation; reload the app if its plugin list has not refreshed. Select the installed `learn` skill if your surface offers a skill picker, or ask explicitly to use LearningSkill with the first-course prompt below.

### Antigravity (agy)

Run these commands from the LearningSkill repository root after building:

```powershell
agy plugin validate dist/antigravity --strict --json
agy plugin install dist/antigravity
agy plugin list
```

Confirm that `learning-skill` is listed and enabled. If it is disabled, run `agy plugin enable learning-skill`.

Change to your learning workspace, then start a fresh interactive session:

```powershell
cd "C:\path\to\your-learning-workspace"
agy
```

Ask to use LearningSkill with the first-course prompt below. Use an interactive session for a back-and-forth lesson; print/headless mode may leave questions pending for a later response. Native question cards depend on the tools exposed by the host; ordinary chat or an answer file is the fallback.

### Create your first course

In either host, send:

> Use LearningSkill to create a concise course on container image layers. I know basic Linux and want to understand layer reuse. Include a diagnostic quiz and a small learner-authored Dockerfile assignment. Save it in this workspace's courses folder.

The tutor uses your experience, goal, and constraints to prepare the reading and course files, then offers the next lesson action. You can choose a different location by including an explicit course-folder path. Both hosts need Node and permission to read/write that folder for durable progress.

To resume in a new chat or the other host, open the same workspace and say:

> Use LearningSkill to resume the course in `courses/container-image-layers`. Show my next action and any unfinished work.

Use the actual folder name created for your course. The saved files carry progress between sessions; an unanswered question remains pending, and submitted work awaiting a grade resumes there.

## Available requests and commands

LearningSkill is conversational: the requests below are examples, not fixed slash commands. There is no separate `learning-skill` terminal command to memorize.

| Action | Example request |
| --- | --- |
| Create a course | “Teach me Git branching. I know basic commits and want to resolve merge conflicts.” |
| Find or resume a course | “Show my saved courses” or “Resume the course in `courses/git-branching`.” |
| Start or continue | “Start the first lesson” or “Continue with my next action.” |
| Ask a lesson question | “Why does this example behave that way? Save the explanation in my classnotes.” |
| Report reading complete | “I've finished reading lesson 1. Give me its quiz.” |
| Take or answer a quiz | “Quiz me on this lesson,” then answer the saved question in the card/chat or supply an answer file. |
| Request help | “Give me a hint” or “Show a worked example on a different problem.” |
| Request a solution | “Show me the solution.” Solution exposure is recorded as assistance. |
| Submit learner work | “Submit my file `answers/Dockerfile` for this assignment” or provide an explicit directory path. |
| Review feedback | “Explain my criterion scores and what evidence is still missing.” |
| Retry independently | “Give me a fresh comparable challenge without hints.” |
| Defer or skip | “Keep this question pending for later” or “Skip this assignment and record it.” |
| Review notes/progress | “Show my classnotes, progress, and unresolved topics.” |
| Finish | “Finish this course and list any outstanding requirements.” |

Repository maintenance commands, run from this repository root:

| Command | Purpose |
| --- | --- |
| `npm run build` | Generate both self-contained host packages. |
| `npm run validate` | Check package metadata, resources, imports, and syntax. |
| `npm test -- --test-concurrency=1` | Run the automated test suite. |
| `codex plugin list` | Inspect Codex plugin availability and installation state. |
| `agy plugin list` | Inspect Antigravity's installed plugins. |

For developers, the bundled helper accepts one JSON request-file path: `node scripts/learning-state.mjs <request-file.json>` from the source checkout. Its internal operations are `course.discover`, `course.init`, `course.publish`, `course.resume`, `qa.record`, `progress.record`, `assessment.prepare`, `question.present`, `answer.record`, `assistance.record`, `submission.record`, `attempt.grade`, `notes.render`, and `lock.recover`. These are protocol operation names, not shell subcommands or learner slash commands. See [the protocol](docs/protocol.md) for envelopes and requirements; normal learning uses the tutor rather than hand-editing state or records.

## What a course contains

1. **Course overview:** your goal, starting experience, prerequisites, focused scope, lesson sequence, source/version assumptions, and separate reading, practice, and setup estimates.
2. **Written lessons:** complete core reading prepared before guided teaching, with observable outcomes, explanations, examples, common mistakes, recap, sources, optional depth, and a next action.
3. **Discussion and notes:** your actual questions, useful explanation summaries, follow-ups, and progress recorded in readable classnotes.
4. **Assessment:** post-lesson quizzes unless explicitly excluded or skipped, with saved prompts and fixed rubrics. Reading completion alone does not award a pass.
5. **Assignments where appropriate:** a brief, starting resources, environment prerequisites, constraints, learner answer location, evidence requirements, rubric, and cleanup steps. You author the solution; submitted bytes are snapshotted for grading.
6. **Feedback and continuation:** criterion scores, evidence references, help conditions, fresh independent checks after assistance, and a saved next action. Finishing with pending or skipped requirements records exceptions.

Scope and lesson count depend on the topic. Short topics stay short; broad goals can become focused follow-on courses. Practice and setup time are separate from reading estimates.

### Coursework directory

The default root is `<learning-workspace>/courses/<course-id>/`. This is a representative populated course; filenames and assessment IDs vary, and folders gain content as lessons and submissions are created.

```text
courses/
└── container-image-layers/
    ├── course.md                    # Overview, lesson links, estimates, sources
    ├── lessons/
    │   └── layer-reuse.md           # Core reading, examples, recap, next action
    ├── assignments/
    │   ├── dockerfile-task.md       # Brief, deliverables, rubric/evidence requirements
    │   └── starter/                # Optional provided starting files
    ├── answers/
    │   └── Dockerfile              # Learner-authored work (or submit an external path)
    ├── assessments/
    │   ├── quiz-1.json             # Saved assessment definition and rubric
    │   └── quiz-1-key.md           # Separate answer key; name/path chosen by tutor
    ├── records/
    │   └── <record-id>.json         # Immutable Q&A, answers, help, grades, progress
    ├── submissions/
    │   └── <assessment-id>/
    │       └── <attempt-id>/
    │           ├── manifest.json   # Snapshot file inventory and hashes
    │           └── files/
    │               └── Dockerfile  # Immutable copy of submitted learner bytes
    ├── classnotes.md               # Readable projection of committed records
    ├── state.json                  # Authoritative checkpoint and evidence indexes
    └── .notes-projection.json      # Revision/hash receipt for generated classnotes
```

Assessment keys are kept separate from assigned reading, but local files are not a secure exam boundary. `.course.lock` exists briefly during writes and can remain after an interrupted session; do not delete an unknown owner's lock. Submission paths are stored relative to the course root, while original learner files remain unchanged. Keep the whole course folder together when moving it between accessible workspaces.

## Verification and compatibility

At the recorded verification, both hosts reported LearningSkill installed and enabled. The Codex listing emitted a remote catalog network warning while local install state remained visible. Installation/listing does not establish fresh-chat skill loading or interactive assessment behavior.

Final verification at HEAD `a645aa2417148eccf71081a0e03aea26895def09` used Node `v26.3.0`, Codex `0.164.0-alpha.11.1`, and AGY `1.4.7`. `npm test -- --test-concurrency=1` passed 52 of 56 tests, with 0 failures and 4 Windows symlink/junction fixture skips; `npm run build`, `npm run validate`, and AGY strict validation passed. Node 22 was unavailable. Fresh interactive sessions, actual teaching quality, live learner-file grading, and bidirectional genuine cross-harness resume remain untested. See [bounded acceptance](docs/acceptance.md) for exact results and source asset hashes.

## Saving and recovery

The helper does not edit or execute submitted learner files. Runtime checks that were not actually run remain pending/not run.

If a checkpoint write fails, the tutor should report that the affected change was not saved. If a commit succeeds but rendering notes fails, progress and notes status are reported separately. For recovery, reopen the same course root and inspect its checkpoint and committed records; do not treat unreferenced files or unsaved chat as course history.
