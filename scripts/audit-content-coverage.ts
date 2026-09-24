import { getDatabaseConfig } from "../config/database.mjs";

import pg from "pg";

const { Client } = pg;
const strict = process.argv.includes("--strict");

interface CoverageRow {
  actionable: boolean;
  assessment_questions: number;
  courses: string[];
  diagnostic_questions: number;
  lesson_count: number;
  name: string;
  practice_questions: number;
  prerequisite_count: number;
  recommendable: boolean;
  slug: string;
  valid_lesson_count: number;
}

const client = new Client(getDatabaseConfig());
await client.connect();

try {
  await client.query("BEGIN READ ONLY");
  const result = await client.query<CoverageRow>(`
    WITH valid_questions AS (
      SELECT question.id, question.skill_id, question.question_purpose
      FROM questions question
      LEFT JOIN question_options option ON option.question_id = question.id
      WHERE question.status = 'ACTIVE'
        AND LENGTH(TRIM(question.prompt)) > 0
        AND LENGTH(TRIM(question.explanation)) > 0
      GROUP BY question.id
      HAVING (
        question.question_type = 'SINGLE_CHOICE'
        AND COUNT(option.id) >= 2
        AND COUNT(*) FILTER (WHERE option.is_correct) = 1
      ) OR (
        question.question_type = 'MULTI_SELECT'
        AND COUNT(option.id) >= 2
        AND COUNT(*) FILTER (WHERE option.is_correct) >= 1
        AND COUNT(*) FILTER (WHERE NOT option.is_correct) >= 1
      ) OR (
        question.question_type = 'NUMERIC'
        AND COUNT(option.id) = 0
        AND question.numeric_answer IS NOT NULL
        AND question.numeric_tolerance >= 0
        AND question.numeric_answer NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
        AND question.numeric_tolerance NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
      )
    ), coverage AS (
      SELECT
        skill.slug,
        skill.name,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT course.name ORDER BY course.name), NULL) AS courses,
        COUNT(DISTINCT prerequisite.prerequisite_skill_id)::int AS prerequisite_count,
        COUNT(DISTINCT resource.id) FILTER (
          WHERE resource.is_active AND resource_skill.is_primary
        )::int AS lesson_count,
        COUNT(DISTINCT resource.id) FILTER (
          WHERE resource.is_active AND resource_skill.is_primary
            AND CARDINALITY(resource.learning_objectives) >= 3
            AND jsonb_array_length(resource.content_sections) >= 3
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements(resource.content_sections) section
              WHERE LENGTH(TRIM(section->>'heading')) = 0
                 OR LENGTH(TRIM(section->>'body')) = 0
            )
        )::int AS valid_lesson_count,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_purpose = 'DIAGNOSTIC'
        )::int AS diagnostic_questions,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_purpose = 'PRACTICE'
        )::int AS practice_questions,
        COUNT(DISTINCT question.id) FILTER (
          WHERE question.question_purpose = 'ASSESSMENT'
        )::int AS assessment_questions,
        (COUNT(DISTINCT course_skill.course_id) > 0) AS recommendable
      FROM skills skill
      LEFT JOIN course_skills course_skill ON course_skill.skill_id = skill.id
      LEFT JOIN courses course ON course.id = course_skill.course_id AND course.is_active
      LEFT JOIN skill_prerequisites prerequisite
        ON prerequisite.skill_id = skill.id AND prerequisite.relationship_type = 'REQUIRED'
      LEFT JOIN learning_resource_skills resource_skill ON resource_skill.skill_id = skill.id
      LEFT JOIN learning_resources resource ON resource.id = resource_skill.resource_id
      LEFT JOIN valid_questions question ON question.skill_id = skill.id
      WHERE skill.is_active
      GROUP BY skill.id
    )
    SELECT *, (
      recommendable
      AND valid_lesson_count > 0
      AND diagnostic_questions > 0
      AND practice_questions > 0
      AND assessment_questions > 0
    ) AS actionable
    FROM coverage
    ORDER BY slug
  `);
  const counts = await client.query<{
    active_courses: number;
    demo_profiles: number;
    required_edges: number;
    total_skills: number;
  }>(`
    SELECT
      (SELECT COUNT(*)::int FROM courses WHERE is_active) AS active_courses,
      (SELECT COUNT(*)::int FROM users WHERE email LIKE '%@demo.learnpath.local') AS demo_profiles,
      (SELECT COUNT(*)::int FROM skill_prerequisites WHERE relationship_type = 'REQUIRED') AS required_edges,
      (SELECT COUNT(*)::int FROM skills WHERE is_active) AS total_skills
  `);
  const summary = counts.rows[0]!;
  const recommendable = result.rows.filter((row) => row.recommendable);
  const actionable = recommendable.filter((row) => row.actionable);
  const covered = (key: "assessment_questions" | "diagnostic_questions" | "practice_questions") => (
    recommendable.filter((row) => row[key] > 0).length
  );

  console.log("# LearnPath content coverage audit");
  console.log("");
  console.log(`- Active global skills: ${summary.total_skills}`);
  console.log(`- Active courses: ${summary.active_courses}`);
  console.log(`- Required prerequisite edges: ${summary.required_edges}`);
  console.log(`- Demo profiles: ${summary.demo_profiles}`);
  console.log(`- Valid lesson coverage: ${recommendable.filter((row) => row.valid_lesson_count > 0).length}/${recommendable.length}`);
  console.log(`- Diagnostic coverage: ${covered("diagnostic_questions")}/${recommendable.length}`);
  console.log(`- Practice coverage: ${covered("practice_questions")}/${recommendable.length}`);
  console.log(`- Assessment coverage: ${covered("assessment_questions")}/${recommendable.length}`);
  console.log(`- Actionable Learn Next coverage: ${actionable.length}/${recommendable.length}`);
  console.log("");
  console.log("| Skill | Courses | Prereqs | Lesson | Diagnostic | Practice | Assessment | Actionable |");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const row of result.rows) {
    console.log(`| ${row.name} | ${row.courses.join(", ")} | ${row.prerequisite_count} | ${row.valid_lesson_count}/${row.lesson_count} | ${row.diagnostic_questions} | ${row.practice_questions} | ${row.assessment_questions} | ${row.actionable ? "Yes" : "No"} |`);
  }

  if (strict) {
    const failures: string[] = [];
    if (actionable.length !== recommendable.length) {
      failures.push(`${recommendable.length - actionable.length} recommendable skill(s) are not actionable`);
    }
    if (summary.active_courses < 5) failures.push(`only ${summary.active_courses} active courses exist`);
    if (summary.demo_profiles < 5) failures.push(`only ${summary.demo_profiles} demo profiles exist`);
    if (failures.length) throw new Error(`Content readiness gate failed: ${failures.join("; ")}.`);
    console.log("");
    console.log("Content readiness gate: PASS");
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
