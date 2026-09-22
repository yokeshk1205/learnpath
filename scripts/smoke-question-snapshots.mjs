// Proves that an authored question edit cannot change an attempt already shown
// to a learner. All fixture, author edits, answers, and results are rolled back.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createDiagnosticService } from '../apps/api/dist/diagnostics/service.js';
import { createAssessmentProgramService } from '../apps/api/dist/assessment-programs/service.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query('BEGIN');
let pending = Promise.resolve();
const scoped = {
  async query(sql, values) {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [], rowCount: 0 };
    const result = pending.then(() => client.query(sql, values));
    pending = result.catch(() => undefined);
    return result;
  },
  release() {},
  async connect() { return scoped; },
};
const diagnostic = createDiagnosticService(scoped);
const programs = createAssessmentProgramService(scoped, diagnostic);
const learnerId = randomUUID(), enrollmentId = randomUUID();
try {
  const course = (await client.query("SELECT id FROM courses WHERE slug='everyday-quantitative-reasoning'")).rows[0];
  assert(course, 'The quantitative-reasoning migration must be applied.');
  await client.query('INSERT INTO users (id,email,password_hash,display_name) VALUES ($1,$2,$3,$4)',
    [learnerId, `snapshot-${learnerId}@example.invalid`, 'unusable-fixture-hash', 'Rollback snapshot fixture']);
  await client.query('INSERT INTO course_enrollments (id,learner_id,course_id) VALUES ($1,$2,$3)',
    [enrollmentId,learnerId,course.id]);
  const created = await programs.create(learnerId,{enrollmentId,mode:'COMPREHENSIVE'});
  let attempt = (await programs.startSession(learnerId,created.program.id)).attempt;
  const first = attempt.questions[0];
  assert(first);
  const snapshotRow = (await client.query(
    'SELECT question_snapshot FROM diagnostic_attempt_questions WHERE attempt_id=$1 AND question_id=$2',
    [attempt.id,first.id],
  )).rows[0];
  assert(snapshotRow?.question_snapshot);
  const original = snapshotRow.question_snapshot;
  assert.equal(original.prompt,first.prompt);

  // Simulate an author changing the live source after the learner saw it.
  await client.query("UPDATE questions SET prompt=prompt || ' [LIVE EDIT]' WHERE id=$1",[first.id]);
  if (original.questionType === 'NUMERIC') {
    await client.query('UPDATE questions SET numeric_answer=numeric_answer+1000 WHERE id=$1',[first.id]);
  } else {
    const options = original.options;
    const originalCorrect = options.filter(option => option.isCorrect);
    const originalWrong = options.filter(option => !option.isCorrect);
    if (original.questionType === 'SINGLE_CHOICE') {
      await client.query('UPDATE question_options SET is_correct=false WHERE id=$1',[originalCorrect[0].id]);
      await client.query("UPDATE question_options SET is_correct=true,content=content || ' [LIVE EDIT]' WHERE id=$1",[originalWrong[0].id]);
    } else {
      await client.query('UPDATE question_options SET is_correct=NOT is_correct,content=content || $2 WHERE question_id=$1',[first.id,' [LIVE EDIT]']);
    }
  }
  const unchanged = await diagnostic.getAttempt(learnerId,attempt.id);
  const unchangedFirst = unchanged.questions.find(question => question.id === first.id);
  assert.equal(unchangedFirst.prompt,first.prompt);
  assert.deepEqual(unchangedFirst.options,first.options);

  // The snapshot itself cannot be altered after insertion.
  await client.query('SAVEPOINT immutable_snapshot_check');
  await assert.rejects(
    client.query("UPDATE diagnostic_attempt_questions SET question_snapshot=jsonb_set(question_snapshot,'{prompt}','\"tampered\"') WHERE attempt_id=$1 AND question_id=$2",[attempt.id,first.id]),
    /snapshots are immutable/i,
  );
  await client.query('ROLLBACK TO SAVEPOINT immutable_snapshot_check');

  const answerFrom = (question, snapshot) => {
    if (snapshot.questionType === 'NUMERIC') return {questionId:question.id,optionId:null,numericAnswer:snapshot.numericAnswer,isUnsure:false,responseSeconds:30};
    const correct = snapshot.options.filter(option => option.isCorrect).map(option => option.id);
    if (snapshot.questionType === 'MULTI_SELECT') return {questionId:question.id,optionId:null,selectedOptionIds:correct,isUnsure:false,responseSeconds:30};
    return {questionId:question.id,optionId:correct[0],isUnsure:false,responseSeconds:30};
  };
  for (let index=0; !attempt.selection.canComplete && index<28; index++) {
    const question = attempt.questions.find(item => !attempt.savedAnswers.some(answer => answer.questionId === item.id));
    assert(question);
    const row = (await client.query('SELECT question_snapshot FROM diagnostic_attempt_questions WHERE attempt_id=$1 AND question_id=$2',[attempt.id,question.id])).rows[0];
    await diagnostic.saveDraft(learnerId,attempt.id,answerFrom(question,row.question_snapshot));
    attempt = await diagnostic.getAttempt(learnerId,attempt.id);
  }
  assert(attempt.selection.canComplete);
  const result = await diagnostic.submit(learnerId,attempt.id,{answers:attempt.savedAnswers,durationSeconds:300});
  const reviewed = result.answers.find(answer => answer.questionId === first.id);
  assert(reviewed?.isCorrect, 'The attempt must be graded against its original answer key.');
  assert.equal(reviewed.prompt,original.prompt);
  assert(!reviewed.correctOptionContent.includes('[LIVE EDIT]'));
  assert.equal((await diagnostic.getResult(learnerId,attempt.id)).answers.find(answer => answer.questionId===first.id).prompt,original.prompt);
  await client.query('SAVEPOINT immutable_answer_check');
  await assert.rejects(
    client.query('UPDATE assessment_answers SET response_seconds=response_seconds+1 WHERE attempt_id=$1 AND question_id=$2',[attempt.id,first.id]),
    /submitted assessment answers are immutable/i,
  );
  await client.query('ROLLBACK TO SAVEPOINT immutable_answer_check');
  console.log(JSON.stringify({passed:true,attemptId:attempt.id,format:original.questionType,
    verified:['attempt display frozen','grading key frozen','result text frozen','snapshot mutation rejected','submitted answer mutation rejected']},null,2));
} finally {
  await pending;
  await client.query('ROLLBACK');
  await client.end();
  console.log('Rollback complete: no fixture, author edit, answer, or result persisted.');
}
