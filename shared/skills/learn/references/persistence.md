# Persistence, helper use, and resume

`docs/protocol.md` is normative for the internal helper. The helper is bundled with the installed skill; use adapter-supplied skill metadata/path discovery to locate it. Do not resolve it through the process working directory, source checkout, an assumed cache, or an invented absolute path. Invoke it only through a shell/runtime tool actually exposed in the current harness, using a UTF-8 JSON request file in a writable workspace location. It is internal infrastructure, not a learner-facing CLI.

Follow the documented allowlisted operations and request envelopes. Reads need no operation ID/revision; mutations require a stable operation ID and expected revision. Do not synthesize records or write state, records, snapshots, or notes directly around the helper. Never execute submitted files. No model API, arbitrary shell construction, lab execution, or automatic provisioning is part of the helper.

The course checkpoint and referenced immutable records are authoritative. Unreferenced files are not history. Classnotes are a deterministic projection and cannot award progress. If a mutation commits but notes rendering fails, report the committed revision and notes issue separately. If a write is denied or fails, say which progress was not saved. Do not claim persistence based on a response or chat memory.

For conflicts, locks, missing/corrupt evidence, unsupported schema, or escaping paths, preserve existing files and follow the protocol's error path. Do not reset or overwrite unknown data. Explicit stale-lock recovery requires confirmation that the recorded owner is inactive and the documented ownership token.

On resume, read the selected course checkpoint and its referenced records, verify the current material/revision, and load only context needed for the next action. Keep the existing pending question, prompt, and option order; reoffer it with a new presentation token. A pending submitted/ungraded attempt resumes grading rather than requesting a new answer. Preserve Q&A summaries, grades, evidence IDs, and help conditions across sessions/harnesses.
