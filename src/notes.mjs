import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readCourse, renameWithRetry, withCourseLock } from './store.mjs';
import { fail } from './errors.mjs';
import { resolveContained } from './paths.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const date = (value) => Number.isNaN(Date.parse(value)) ? 'Unknown date' : new Date(value).toISOString().slice(0, 10);
const lines = (value) => String(value ?? '').trim().split(/\r?\n/).map((line) => `> ${line}`).join('\n');

function render(records, state, revision = state.revision) {
  const out = [`# Classnotes: ${state.goal}`, '', `Course: ${state.courseId}`, `Committed revision: ${revision}`, ''];
  for (const record of records) {
    const p = record.payload;
    switch (record.kind) {
      case 'qa_recorded':
        out.push(`## Learner question (${date(record.timestamp)})`, '', `Evidence: \`${record.recordId}\`${p.lessonId ? ` · Lesson: \`${p.lessonId}\`` : ''}`, '', `**Question:** ${lines(p.question)}`, '', `**Explanation:** ${lines(p.answerSummary)}`);
        if (p.misconception) out.push('', `**Observed misconception:** ${lines(p.misconception)}`);
        if (p.followUp) out.push('', `**Follow-up:** ${lines(p.followUp)}`);
        out.push(''); break;
      case 'question_presented':
        out.push(`## Assessment question (${date(record.timestamp)})`, '', `Evidence: \`${record.recordId}\` · Attempt: \`${p.attemptId}\``, '', `**Prompt:** ${lines(p.prompt)}`, ''); break;
      case 'answer_recorded':
        out.push(`## Learner response (${date(record.timestamp)})`, '', `Evidence: \`${record.recordId}\` · Response evidence: \`${p.evidenceId}\``, '', lines(p.response), ''); break;
      case 'submission_recorded':
        out.push(`## Submitted work (${date(record.timestamp)})`, '', `Evidence: \`${record.recordId}\` · Learner evidence: \`${p.evidenceId}\``, '', `Snapshot: \`${p.snapshotPath}\` · SHA-256: \`${p.snapshotSha256}\` · Provenance: \`${p.provenance}\``, ''); break;
      case 'assistance_recorded':
        out.push(`## Help used (${date(record.timestamp)})`, '', `Evidence: \`${record.recordId}\` · Attempt: \`${p.attemptId}\` · Condition: **${p.assistance}**`, ...(p.summary ? ['', lines(p.summary)] : []), ''); break;
      case 'attempt_graded':
        out.push(`## Grade (${date(record.timestamp)})`, '', `Evidence: \`${record.recordId}\` · Attempt: \`${p.attemptId}\` · Rubric revision: ${p.rubricRevision}`, '');
        for (const criterion of p.criteria) out.push(`- **${criterion.criterionId}:** ${criterion.points} points; independent: ${criterion.independent}; evidence: ${criterion.evidenceRefs.map((ref) => `\`${ref}\``).join(', ')}`, `  ${criterion.feedback}`);
        out.push('', `**Feedback:** ${p.feedback}`, ''); break;
      case 'item_skipped': out.push(`## Skipped ${p.itemType} (${date(record.timestamp)})`, '', `Evidence: \`${record.recordId}\` · Item: \`${p.itemId}\``, '', p.reason, ''); break;
      case 'course_revised': out.push(`## Course material revised (${date(record.timestamp)})`, '', `Evidence: \`${record.recordId}\` · Content revision: ${p.contentRevision}`, '', `Changed: ${p.materialChanges.join(', ')}`, ''); break;
      case 'course_closed': out.push(`## Course closed (${date(record.timestamp)})`, '', `Evidence: \`${record.recordId}\` · Phase: **${p.phase}**`, ...(p.unresolved ? ['', `Outstanding: ${p.unresolved.join('; ')}`] : []), ''); break;
      case 'progress_recorded': out.push(`## Reading progress (${date(record.timestamp)})`, '', `Evidence: \`${record.recordId}\` · Lesson: \`${p.lessonId}\` · State: **${p.reading}**`, ''); break;
    }
  }
  out.push('## Current next action', '', state.nextAction, '');
  if (state.unresolvedTopics.length) out.push('## Unresolved topics', '', ...state.unresolvedTopics.map((topic) => `- ${topic}`), '');
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

async function readOptional(file) {
  try { return await readFile(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function atomicWrite(root, relative, bytes, options) {
  const target = await resolveContained(root, relative, { allowMissing: true });
  await mkdir(path.dirname(target), { recursive: true });
  const temp = await resolveContained(root, `.notes-${randomUUID()}.tmp`, { allowMissing: true });
  try { await writeFile(temp, bytes, { flag: 'wx' }); await renameWithRetry(temp, target, { rename: options.rename }); }
  catch (error) { try { await unlink(temp); } catch {} throw error; }
}

export async function renderClassnotes(root, options = {}) {
  return withCourseLock(root, async () => {
    const { state, records } = await readCourse(root);
    const markdown = Buffer.from(render(records, state), 'utf8');
    const projectionHash = hash(markdown);
    const outputPath = await resolveContained(root, 'classnotes.md', { allowMissing: true });
    const receiptPath = await resolveContained(root, '.notes-projection.json', { allowMissing: true });
    const existing = await readOptional(outputPath);
    const oldReceiptBytes = await readOptional(receiptPath);
    let oldReceipt;
    if (oldReceiptBytes) {
      try { oldReceipt = JSON.parse(oldReceiptBytes.toString('utf8')); }
      catch { fail('CONFLICT', 'Classnotes projection receipt is corrupt; reconcile it before rendering'); }
      if (!Number.isSafeInteger(oldReceipt.revision) || oldReceipt.revision < 1 || !/^[a-f0-9]{64}$/.test(oldReceipt.sha256)) fail('CONFLICT', 'Classnotes projection receipt is invalid');
    }

    let repaired = false;
    if (existing) {
      const existingHash = hash(existing);
      if (existingHash === projectionHash) repaired = !oldReceipt || oldReceipt.revision !== state.revision || oldReceipt.sha256 !== projectionHash;
      else {
        const matchesReceipt = oldReceipt && existingHash === oldReceipt.sha256;
        const matchesHistory = !matchesReceipt && records.some((_, index) => {
          const prefix = records.slice(0, index + 1);
          return hash(Buffer.from(render(prefix, state, index + 1), 'utf8')) === existingHash;
        });
        if (!matchesReceipt && !matchesHistory) fail('CONFLICT', 'Classnotes contain edits that do not match a committed generated projection');
      }
    }

    if (!existing || hash(existing) !== projectionHash) {
      await atomicWrite(root, 'classnotes.md', markdown, options);
      await options.afterNotesWrite?.();
    }
    const receipt = Buffer.from(`${JSON.stringify({ revision: state.revision, sha256: projectionHash }, null, 2)}\n`, 'utf8');
    await atomicWrite(root, '.notes-projection.json', receipt, options);
    return { ok: true, revision: state.revision, sha256: projectionHash, repaired, rendered: true };
  });
}

