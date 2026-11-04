import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { initializeCourse, resumeCourse } from '../src/course.mjs';

test('disposable multi-assignment authoring review detects path, duplication and specification/check defects', async t => {
  const root = await mkdtemp(path.join(process.cwd(), '.test-tmp-authoring-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const render = async (name, values) => (await readFile(`shared/skills/create-course/templates/${name}.md`, 'utf8')).replace(/{{([^}]+)}}/g, (_, key) => {
    assert.ok(key in values, `missing template value: ${key}`); return values[key];
  });
  const lessons = [{ lessonId: 'one', outcomeIds: ['numbers'] }, { lessonId: 'two', outcomeIds: ['sum'] }];
  const assignments = Object.fromEntries(['a', 'b', 'c'].map(id => [id, { state: 'pending', required: id !== 'b', outcomeIds: [id === 'c' ? 'sum' : 'numbers'] }]));
  const shared = 'Run commands from the course root. Save files under answers/<assignment-id>/ and explicitly submit that directory with any requested logs.';
  await mkdir(path.join(root, 'lessons')); await mkdir(path.join(root, 'assignments')); await mkdir(path.join(root, 'quizzes'));
  const course = await render('course', {
    'Course title':'Numbers', 'Observable goal, starting experience, included topics, exclusions/follow-ons, prerequisites or provisional assumptions, concise optional intake summary':'Read nonnegative integers and sum them. No prerequisites; intake not needed.',
    'Lesson title':'Numbers', 'lesson-file':'one', 'keywords and focused topic':'integer, domain',
    'lesson ID, including final lesson':'one; two (final)', 'exact quiz ID':'quiz-1; quiz-2', 'question path':'quizzes/questions.md', 'assignment ID':'a, b after one; c after final two', brief:'a', 'required/optional; when ready; include every assignment':'a required and b optional after one; c required after two',
    'Shared OS/runtime/tool versions and assumptions, required tools, working directory and exact setup commands. State which commands/examples were actually checked and any authoring verification limits.':'Use the course root. No external runtime required; file paths checked, no external commands run.',
    'One shared workflow: paths relative to the course root, standard answers/<assignment-id>/ layout, required files and logs, where to run commands, and how to explicitly submit the exact file/directory to the tutor.':shared,
    'Official/local references, versions and access context':'Local authored arithmetic; no version-sensitive dependencies.', 'word count':'100',rate:'238',minutes:'1','separate estimate':'none','First lesson':'Numbers'
  });
  await writeFile(path.join(root, 'course.md'), course);
  await writeFile(path.join(root, 'quizzes/questions.md'), '# quiz-1\nWhat is a nonnegative integer?\n# quiz-2\nWhat does sum mean?');
  for (const [i, lesson] of lessons.entries()) {
    const body = await render('lesson', {
      'Lesson title':lesson.lessonId,'lesson_id':lesson.lessonId,
      'Searchable concepts and API/command names taught here':i ? 'sum' : 'nonnegative integer',
      "Focused explanation at the learner's level. Define unfamiliar terms and connect concepts to practical use.":i ? 'A sum adds numbers. For 2 and 3 the sum is 5.' : 'A nonnegative integer is a whole number at least zero. Zero is included.',
      'Complete example illustrating the topic':i ? '2 + 3 = 5.' : '0 and 2 are allowed; -1 is outside the domain.',
      'Relevant interfaces, input/output shapes, commands and a suggested starting order without supplying the solution':'Write one number per line in the requested answer file.',
      'Useful errors and corrections':'Do not include negative numbers.', 'exact upcoming quiz ID':`quiz-${i+1}`, 'question path':'../quizzes/questions.md',
      'useful topic-specific exercise, if any':i ? 'Add 1 and 4.' : 'Name three allowed numbers.',
      'assignment title':i ? 'c' : 'a','brief':i ? 'c' : 'a', 'required/optional':'required',
      'Include all ready assignments, including after the final lesson, or explicitly say none.':i ? '' : '[b](../assignments/b.md) — optional.',
      'Topic-specific authoritative sources; link shared environment assumptions in course.md':'[Shared setup](../course.md#environment-and-setup)'
    }); await writeFile(path.join(root, `lessons/${lesson.lessonId}.md`), body);
  }
  for (const id of ['a','b','c']) {
    const body = await render('assignment', {
      'Assignment title':id,assignment_id:id,'Required/optional':id === 'b' ? 'Optional' : 'Required',
      'Question describing observable behavior using concepts already taught':id === 'c' ? 'Can you write the sum of 2 and 3?' : 'Can you write a nonnegative integer?',
      'Task-specific constraints, explicit input domain or failure policy, provided starter files and fixtures with exact paths':'Domain: nonnegative integers only; reject negative inputs. No starter files required.',
      'exact file or directory':'answer.txt', 'Task-specific files, logs and explanations':'One answer.txt file; no logs needed.',
      'Plain-language acceptance checks matching every requested behavior, boundary case and failure policy':id === 'c' ? 'Answer must equal 5. Negative inputs are rejected.' : 'Answer is a whole number at least zero; zero is valid. Negative inputs are rejected.'
    }); await writeFile(path.join(root, `assignments/${id}.md`), body);
  }
  // Follow the written review: introduce defects, collect findings, fix, then recheck.
  const a = path.join(root, 'assignments/a.md'), b = path.join(root, 'assignments/b.md'), c = path.join(root, 'assignments/c.md');
  await writeFile(a, (await readFile(a, 'utf8')).replace('answers/a/answer.txt', 'exercises/a/answer.txt'));
  await writeFile(b, (await readFile(b, 'utf8')) + '\n' + shared);
  await writeFile(c, (await readFile(c, 'utf8')).replace('Negative inputs are rejected.', 'Negative inputs must succeed.'));
  async function review() {
    const findings = [];
    for (const id of ['a','b','c']) {
      const text = await readFile(path.join(root, `assignments/${id}.md`), 'utf8');
      if (!text.includes(`answers/${id}/answer.txt`)) findings.push('submission path mismatch');
      if (text.includes(shared)) findings.push('duplicated workflow');
      if (text.includes('reject negative inputs') && text.includes('Negative inputs must succeed')) findings.push('specification/check mismatch');
      assert.match(text, /\.\.\/course\.md#assignment-submission/);
    }
    return findings;
  }
  assert.deepEqual(await review(), ['submission path mismatch','duplicated workflow','specification/check mismatch']);
  await writeFile(a, (await readFile(a,'utf8')).replace('exercises/a/answer.txt','answers/a/answer.txt'));
  await writeFile(b, (await readFile(b,'utf8')).replace('\n'+shared,''));
  await writeFile(c, (await readFile(c,'utf8')).replace('Negative inputs must succeed.','Negative inputs are rejected.'));
  assert.deepEqual(await review(), []);
  for (const file of ['course.md','lessons/one.md','lessons/two.md','assignments/a.md','assignments/b.md','assignments/c.md']) {
    const text = await readFile(path.join(root,file),'utf8');
    assert.doesNotMatch(text, /{{|pending tokens|snapshot mechanics|tutor_observed|grading transitions/);
    if (file.startsWith('lessons/')) assert.equal(text.match(/## Practice and next steps/g)?.length,1);
    for (const match of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) await readFile(path.resolve(path.dirname(path.join(root,file)), match[1]));
  }
  await initializeCourse(root, {operationId:'sample-init',expectedRevision:0,courseId:'sample',learnerContext:{},goal:'Numbers',prerequisites:[],readingRateWpm:238,lessons,assignments,assessments:{},nextAction:'Read one; quiz-1; assignments a and b'});
  const resumed = await resumeCourse(root);
  assert.equal(Object.keys(resumed.state.assignments).length,3);
  assert.equal(resumed.state.nextAction,'Read one; quiz-1; assignments a and b');
});
