// Exercises authored content and real inference without persisting test users,
// answers, mastery, or paths. Requires migrations 0031/0032 and the ML service.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { config } from '../apps/api/dist/config.js';
import { createDiagnosticService } from '../apps/api/dist/diagnostics/service.js';
import { createAssessmentProgramService } from '../apps/api/dist/assessment-programs/service.js';
import { createCandidateService } from '../apps/api/dist/candidates/service.js';
import { createPrerequisiteService } from '../apps/api/dist/prerequisites/service.js';
import { createGraphAnalyticsClient } from '../apps/api/dist/prerequisites/analytics-client.js';
import { createRetentionService } from '../apps/api/dist/retention/service.js';
import { createInferenceClient } from '../apps/api/dist/paths/ml-client.js';
import { createPathService } from '../apps/api/dist/paths/service.js';
import { createLearningService } from '../apps/api/dist/learning/service.js';
import { createPracticeService } from '../apps/api/dist/practice/service.js';

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
const learner = randomUUID(), enrollment = randomUUID();
const allCorrect = process.argv.includes('--all-correct');
const diagnostics = createDiagnosticService(scoped);
const programs = createAssessmentProgramService(scoped, diagnostics);
const retention = createRetentionService(scoped);
const prerequisites = createPrerequisiteService(scoped, createGraphAnalyticsClient(config.mlServiceUrl, config.mlServiceTimeoutMs));
const paths = createPathService(scoped, createCandidateService(scoped, prerequisites, retention), createInferenceClient(config.mlServiceUrl, config.mlServiceTimeoutMs));
const learning = createLearningService(scoped);
const practice = createPracticeService(scoped);
try {
  const course = (await client.query("SELECT id FROM courses WHERE slug = 'everyday-quantitative-reasoning' AND is_active")).rows[0];
  assert(course, 'Apply authored non-programming course migration first.');
  await client.query('INSERT INTO users (id,email,password_hash,display_name) VALUES ($1,$2,$3,$4)',
    [learner, `mixed-${learner}@example.invalid`, 'unusable-fixture-hash', 'Rollback mixed-format fixture']);
  await client.query('INSERT INTO course_enrollments (id,learner_id,course_id) VALUES ($1,$2,$3)', [enrollment,learner,course.id]);
  const beforeSetup = await programs.getOverview(learner,{enrollmentId:enrollment});
  assert.equal(beforeSetup.selfReport.submittedAt,null);
  assert(beforeSetup.backlog.every(item => item.status === 'PENDING' || item.status === 'BLOCKED'));
  const firstSkill = beforeSetup.skills[0];
  const secondSkill = beforeSetup.skills[1];
  const afterSetup = await programs.saveSelfReport(learner,{
    enrollmentId:enrollment,
    modules:beforeSetup.modules.map((module,index) => ({
      moduleId:module.id,familiarity:index === 0 ? 'VERY_COMFORTABLE' : 'UNSURE',confidence:index === 0 ? 'HIGH' : null,
    })),
    skills:[
      {skillId:firstSkill.skillId,familiarity:'VERY_COMFORTABLE',confidence:'HIGH',experienceSource:'LEARNED_IN_COURSE'},
      {skillId:secondSkill.skillId,familiarity:'NEVER_LEARNED',confidence:'LOW'},
    ],
  });
  assert(afterSetup.selfReport.submittedAt);
  assert.equal(afterSetup.selfReport.skillReports.find(item => item.skillId === firstSkill.skillId)?.familiarity,'VERY_COMFORTABLE');
  assert.equal(afterSetup.selfReport.skillReports.find(item => item.skillId === secondSkill.skillId)?.familiarity,'NEVER_LEARNED');
  assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM skill_evidence WHERE learner_id=$1',[learner])).rows[0].count,0);
  assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM learner_skill_mastery WHERE learner_id=$1 AND mastery IS NOT NULL',[learner])).rows[0].count,0);
  let overview = await programs.create(learner, { enrollmentId: enrollment, mode: 'COMPREHENSIVE' });
  const programId = overview.program.id;
  const types = new Set(), expected = new Map();
  let submissions = 0, savedResponses = 0, firstPath = null;
  for (let sessionIndex = 0; sessionIndex < 8 && overview.program.status === 'IN_PROGRESS'; sessionIndex++) {
    const started = await programs.startSession(learner, programId);
    let attempt = started.attempt;
    assert.equal(attempt.intent,'COURSE_COVERAGE');
    const selectedAudit = (await client.query('SELECT selection_components FROM diagnostic_attempt_questions WHERE attempt_id=$1 ORDER BY sequence LIMIT 1',[attempt.id])).rows[0];
    assert(Number(selectedAudit.selection_components.selfReportPriority) >= 0);
    assert.equal((await programs.startSession(learner,programId)).attempt.id, attempt.id);
    await assert.rejects(diagnostics.getAttempt(randomUUID(),attempt.id));
    for (let index = 0; !attempt.selection.canComplete && index < 29; index++) {
      const question = attempt.questions.find(item => !attempt.savedAnswers.some(answer => answer.questionId === item.id));
      assert(question, 'An unfinished session must provide an unanswered question.');
      assert(!('numericAnswer' in question) && !('numericTolerance' in question));
      assert(question.options.every(option => !('isCorrect' in option)));
      const key = (await client.query('SELECT question_type,numeric_answer,numeric_tolerance FROM questions WHERE id=$1', [question.id])).rows[0];
      const options = (await client.query('SELECT id,is_correct FROM question_options WHERE question_id=$1 ORDER BY option_key', [question.id])).rows;
      const correct = options.filter(option => option.is_correct).map(option => option.id);
      types.add(key.question_type);
      const response = { questionId: question.id, optionId: null, isUnsure: false, responseSeconds: 45 };
      // Deliberately imperfect evidence leaves real learning gaps for the path.
      const shouldBeCorrect = allCorrect || savedResponses % 3 !== 0;
      if (key.question_type === 'NUMERIC') response.numericAnswer = Number(key.numeric_answer) + (shouldBeCorrect ? 0 : Number(key.numeric_tolerance) + 10);
      else if (key.question_type === 'MULTI_SELECT') response.selectedOptionIds = shouldBeCorrect ? [...correct].reverse() : [...correct, options.find(option => !option.is_correct).id];
      else response.optionId = shouldBeCorrect ? correct[0] : options.find(option => !option.is_correct).id;
      expected.set(question.id, shouldBeCorrect);
      await diagnostics.saveDraft(learner, attempt.id, response);
      savedResponses++;
      attempt = await diagnostics.getAttempt(learner, attempt.id);
      const saved = attempt.savedAnswers.find(answer => answer.questionId === question.id);
      assert(saved);
      if (key.question_type === 'NUMERIC') assert.equal(saved.numericAnswer, response.numericAnswer);
      if (key.question_type === 'MULTI_SELECT') assert.deepEqual([...saved.selectedOptionIds].sort(), [...response.selectedOptionIds].sort());
    }
    assert(attempt.selection.canComplete);
    const result = await diagnostics.submit(learner, attempt.id, { answers: attempt.savedAnswers, durationSeconds: 600 });
    assert(result.skillResults.length > 0);
    for (const answer of result.answers) {
      assert.equal(answer.isCorrect, expected.get(answer.questionId));
      assert(answer.correctOptionContent.length > 0 && answer.selectedOptionContent.length > 0);
    }
    const loaded = await diagnostics.getResult(learner, attempt.id);
    assert.equal(loaded.attempt.correctCount, result.attempt.correctCount);
    submissions++;
    overview = await programs.getProgram(learner, programId);
    if (!firstPath) {
      firstPath = (await paths.generate(learner,enrollment)).path;
      assert.equal(firstPath.context.courseId,course.id);
      assert(firstPath.provenance.sourceClassification.includes('SYNTHETIC'));
      assert(firstPath.learnNext, 'Incomplete evidence must have a real eligible next lesson.');
    }
  }
  // Consistent evidence may finish earlier without sampling every format.
  if (!allCorrect) assert.deepEqual([...types].sort(), ['MULTI_SELECT','NUMERIC','SINGLE_CHOICE']);
  assert.equal(overview.coverage.totalSkills,6);
  assert.equal(overview.coverage.unassessed,0);
  if (allCorrect) assert.equal(overview.coverage.assessed,6, 'Diverse consistently correct evidence should establish course coverage.');
  const freshPath = (await paths.regenerate(learner,enrollment)).path;
  assert(freshPath.pathVersion > firstPath.pathVersion);
  if (allCorrect && !freshPath.learnNext) {
    assert(freshPath.items.every(item => item.lane === 'RECOGNIZED'));
    console.log(JSON.stringify({passed:true,allCorrect,submissions,savedResponses,coverage:overview.coverage,programStatus:overview.program.status,pathVersion:freshPath.pathVersion},null,2));
  } else {
  assert(freshPath.learnNext);
  const skillId = freshPath.learnNext.skillId;
  const resources = await learning.getOverview(learner, { courseId:course.id,skillId });
  assert(resources.resources.length > 0);
  const lesson = await learning.getResource(learner,resources.resources[0].id);
  assert(lesson.contentSections.length >= 3);
  await learning.recordResourceEvent(learner,lesson.id,{courseId:course.id,durationSeconds:60,eventType:'RESOURCE_STARTED'});
  await learning.recordResourceEvent(learner,lesson.id,{courseId:course.id,durationSeconds:180,eventType:'RESOURCE_COMPLETED'});
  const quiz = await practice.start(learner,{enrollmentId:enrollment,skillId,mode:'ASSESSMENT'});
  const correctOption = (await client.query('SELECT id FROM question_options WHERE question_id=$1 AND is_correct',[quiz.question.id])).rows[0];
  const evaluated = await practice.submit(learner,quiz.id,{optionId:correctOption.id,durationSeconds:45,hintsUsed:0});
  assert(evaluated.feedback.isCorrect);
  const adapted = (await paths.regenerate(learner,enrollment)).path;
  assert(adapted.pathVersion > freshPath.pathVersion);
  assert((await paths.history(learner,enrollment)).length >= 3);
  console.log(JSON.stringify({passed:true,submissions,savedResponses,formats:[...types],coverage:overview.coverage,
    model:adapted.provenance.modelVersion,pathVersion:adapted.pathVersion,
    verified:['hidden keys','typed saved-answer resume','server grading','submitted result reload','course-wide evidence','live ML ranking','authored lesson','real assessment','path version update']},null,2));
  }
  const focusedSkillId = freshPath.learnNext?.skillId ?? beforeSetup.skills[0].skillId;
  const focused = await programs.startFocusedCheck(learner,{enrollmentId:enrollment,skillId:focusedSkillId,intent:'KNOWLEDGE_CHECK'});
  assert.equal(focused.intent,'KNOWLEDGE_CHECK');
  assert.deepEqual(focused.focusSkillIds,[focusedSkillId]);
} finally {
  await pending;
  await client.query('ROLLBACK');
  await client.end();
  console.log('Rollback complete: no test learner, answers, mastery, or paths persisted.');
}
