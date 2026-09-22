// Real PostgreSQL integration smoke. Every fixture and evidence write is rolled
// back in finally; existing learner records are never reset or truncated.
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
// Services run against one outer rollback-only transaction. This verifies SQL
// and evidence flow, not concurrent transaction isolation.
let pendingQuery = Promise.resolve();
const scoped = {
  async query(sql, values) {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [], rowCount: 0 };
    const request = pendingQuery.then(() => client.query(sql, values));
    pendingQuery = request.catch(() => undefined);
    return request;
  },
  release() {},
  async connect() { return scoped; },
};
const diagnostic = createDiagnosticService(scoped);
const programs = createAssessmentProgramService(scoped, diagnostic);
const ids = { learner: randomUUID(), domain: randomUUID(), course: randomUUID(), enrollment: randomUUID(), assessment: randomUUID() };
const suffix = randomUUID();
try {
  await client.query('INSERT INTO users (id,email,password_hash,display_name) VALUES ($1,$2,$3,$4)',
    [ids.learner, `coverage-${suffix}@example.invalid`, 'unusable-test-only-hash', 'Rollback coverage fixture']);
  await client.query('INSERT INTO domains (id,slug,name,description,icon) VALUES ($1,$2,$3,$4,$5)',
    [ids.domain, `coverage-${suffix}`, `General studies fixture ${suffix}`, 'Test scaffolding, not published instructional content.', 'book']);
  await client.query("INSERT INTO courses (id,domain_id,slug,name,description,level,estimated_hours) VALUES ($1,$2,$3,$4,$5,'BEGINNER',100)",
    [ids.course, ids.domain, `coverage-${suffix}`, `General studies fixture ${suffix}`, '120-skill non-programming structural test']);
  await client.query('INSERT INTO course_enrollments (id,learner_id,course_id) VALUES ($1,$2,$3)', [ids.enrollment, ids.learner, ids.course]);
  await client.query('INSERT INTO assessments (id,course_id,title,description,estimated_minutes) VALUES ($1,$2,$3,$4,15)',
    [ids.assessment, ids.course, 'General studies checkpoint', 'Rollback fixture only']);
  const skillIds = [];
  const subjects = ['Geography', 'Biology', 'Economics', 'Language'];
  for (let moduleIndex = 0; moduleIndex < 30; moduleIndex++) {
    const moduleId = randomUUID();
    await client.query('INSERT INTO modules (id,course_id,slug,name,description,sequence) VALUES ($1,$2,$3,$4,$5,$6)',
      [moduleId, ids.course, `module-${moduleIndex}`, `${subjects[moduleIndex % 4]} ${moduleIndex + 1}`, 'Fixture module', moduleIndex + 1]);
    for (let index = 0; index < 4; index++) {
      const skillId = randomUUID(), ordinal = skillIds.length;
      skillIds.push(skillId);
      await client.query('INSERT INTO skills (id,domain_id,slug,name,description,category,difficulty,estimated_minutes) VALUES ($1,$2,$3,$4,$5,$6,2,20)',
        [skillId, ids.domain, `skill-${suffix}-${ordinal}`, `${subjects[moduleIndex % 4]} concept ${ordinal}`, 'Fixture only', subjects[moduleIndex % 4]]);
      await client.query('INSERT INTO course_skills (course_id,module_id,skill_id,sequence) VALUES ($1,$2,$3,$4)', [ids.course,moduleId,skillId,index + 1]);
      // Deliberate authoring gap: coverage must never declare all 120 assessed.
      if (ordinal === 119) continue;
      for (let qIndex = 0; qIndex < 3; qIndex++) {
        const questionId = randomUUID();
        await client.query('INSERT INTO questions (id,skill_id,slug,prompt,difficulty,explanation,question_purpose,cognitive_level) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [questionId, skillId, `question-${suffix}-${ordinal}-${qIndex}`, 'Fixture only: select the supported conclusion.', [1,3,4][qIndex], 'Test evidence only.', 'DIAGNOSTIC', ['REMEMBER','UNDERSTAND','APPLY'][qIndex]]);
        for (const [key, correct] of [['A',true],['B',false]]) await client.query('INSERT INTO question_options (id,question_id,option_key,content,is_correct) VALUES ($1,$2,$3,$4,$5)',
          [randomUUID(), questionId, key, correct ? 'Supported conclusion' : 'Unsupported conclusion', correct]);
        await client.query('INSERT INTO assessment_questions (assessment_id,question_id,sequence) VALUES ($1,$2,$3)', [ids.assessment,questionId,ordinal * 3 + qIndex + 1]);
      }
    }
  }
  const initial = await programs.getOverview(ids.learner, {enrollmentId:ids.enrollment});
  // Assessment may probe an advanced skill even when its learning gate is locked.
  await client.query('INSERT INTO skill_prerequisites (skill_id,prerequisite_skill_id,required_mastery) VALUES ($1,$2,0.7)', [skillIds[4],skillIds[0]]);
  assert.equal(initial.coverage.totalSkills,120);
  assert.equal(initial.coverage.unassessed,120);
  assert.equal(initial.coverage.blocked,1);
  assert.equal(initial.modules.length,30);
  await assert.rejects(programs.getOverview(randomUUID(), {enrollmentId:ids.enrollment}), {code:'ENROLLMENT_NOT_FOUND'});
  const created = await programs.create(ids.learner,{enrollmentId:ids.enrollment,mode:'COMPREHENSIVE'});
  const programId = created.program.id;
  assert.equal((await programs.create(ids.learner,{enrollmentId:ids.enrollment,mode:'COMPREHENSIVE'})).program.id,programId);
  const first = await programs.startSession(ids.learner,programId);
  assert.equal((await programs.startSession(ids.learner,programId)).attempt.id,first.attempt.id);
  let attempt = first.attempt;
  assert.equal(attempt.focusSkillIds.length,4);
  const seen = new Set();
  for (let index = 0; !attempt.selection.canComplete && index < 30; index++) {
    const question = attempt.questions.find(item => !attempt.savedAnswers.some(answer => answer.questionId === item.id));
    assert(question);
    assert(first.session.focusSkillIds.includes(question.skillId));
    seen.add(question.id);
    await diagnostic.saveDraft(ids.learner,attempt.id,{questionId:question.id,optionId:null,isUnsure:true,responseSeconds:20});
    attempt = await diagnostic.getAttempt(ids.learner,attempt.id);
    assert.equal(attempt.assessmentProgramId,programId);
  }
  assert(attempt.selection.canComplete);
  const result = await diagnostic.submit(ids.learner,attempt.id,{answers:attempt.savedAnswers,durationSeconds:240});
  assert.equal(result.attempt.assessmentProgramId,programId);
  const coverage = await programs.getProgram(ids.learner,programId);
  assert.equal(coverage.coverage.observed,4);
  assert.equal(coverage.coverage.unassessed,116);
  assert.equal(coverage.coverage.mastered,0);
  assert.equal(coverage.coverage.assessed,4);
  assert.equal(coverage.coverage.needsRefresh,0);
  assert.notEqual(coverage.program.status,'COMPLETED');
  const second = await programs.startSession(ids.learner,programId);
  assert(second.session.focusSkillIds.every(id => !first.session.focusSkillIds.includes(id)));
  assert(second.session.focusSkillIds.includes(skillIds[4]));
  assert(second.attempt.questions.every(question => !seen.has(question.id)));
  const transferCourse = randomUUID(), transferEnrollment = randomUUID(), transferModule = randomUUID();
  await client.query("INSERT INTO courses (id,domain_id,slug,name,description,level,estimated_hours) VALUES ($1,$2,$3,$4,$5,'BEGINNER',10)",
    [transferCourse,ids.domain,`transfer-${suffix}`,'Transfer test','Rollback fixture']);
  await client.query('INSERT INTO course_enrollments (id,learner_id,course_id) VALUES ($1,$2,$3)',[transferEnrollment,ids.learner,transferCourse]);
  await client.query('INSERT INTO modules (id,course_id,slug,name,description,sequence) VALUES ($1,$2,$3,$4,$5,1)',[transferModule,transferCourse,'shared','Shared knowledge','Fixture']);
  for (let index=0; index<4; index++) await client.query('INSERT INTO course_skills (course_id,module_id,skill_id,sequence) VALUES ($1,$2,$3,$4)',[transferCourse,transferModule,skillIds[index],index+1]);
  const transferred = await programs.getOverview(ids.learner,{enrollmentId:transferEnrollment});
  assert.equal(transferred.coverage.assessed,4);
  assert.equal(transferred.coverage.mastered,0);
  console.log(JSON.stringify({passed:true,skills:120,modules:30,questionsAnswered:seen.size,coverage:coverage.coverage,
    verified:['owned access','program and session resume','scope preserved on reload','real submission/mastery update','untested backlog','no invented mastery','advanced skill probing independent of locks','cross-course direct evidence reuse','missing content visible']},null,2));
} finally {
  await pendingQuery;
  await client.query('ROLLBACK');
  await client.end();
  console.log('Rollback complete: no fixture or learner evidence persisted.');
}
