import "dotenv/config";

import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
const strict = process.argv.includes("--strict");

if (!connectionString) throw new Error("DATABASE_URL is required for the diagnostic quality audit.");

interface QualityRow {
  anchor_count: number;
  challenge_count: number;
  cognitive_levels: number;
  difficulty_bands: number;
  generic_application_count: number;
  misconception_mapped: number;
  name: string;
  question_count: number;
  response_formats: number;
  slug: string;
  verification_count: number;
}

const client = new Client({ connectionString, ssl: false });
await client.connect();

try {
  await client.query("BEGIN READ ONLY");
  const result = await client.query<QualityRow>(`
    SELECT skill.slug, skill.name,
           COUNT(question.id)::int AS question_count,
           COUNT(DISTINCT question.question_type)::int AS response_formats,
           COUNT(DISTINCT question.cognitive_level)::int AS cognitive_levels,
           COUNT(DISTINCT CASE
             WHEN question.difficulty <= 2 THEN 'EASY'
             WHEN question.difficulty = 3 THEN 'MEDIUM'
             ELSE 'HARD'
           END)::int AS difficulty_bands,
           COUNT(*) FILTER (WHERE question.diagnostic_role = 'ANCHOR')::int AS anchor_count,
           COUNT(*) FILTER (WHERE question.diagnostic_role = 'VERIFICATION')::int AS verification_count,
           COUNT(*) FILTER (WHERE question.diagnostic_role = 'CHALLENGE')::int AS challenge_count,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM question_options option
             WHERE option.question_id = question.id
               AND NOT option.is_correct
               AND option.misconception_code IS NOT NULL
               AND option.misconception_code <> 'UNCLASSIFIED_DISTRACTOR'
           ))::int AS misconception_mapped,
           COUNT(*) FILTER (
             WHERE question.prompt ILIKE 'Which approach best demonstrates reliable use of%'
           )::int AS generic_application_count
    FROM skills skill
    LEFT JOIN questions question ON question.skill_id = skill.id
      AND question.status = 'ACTIVE'
      AND question.question_purpose = 'DIAGNOSTIC'
    WHERE skill.is_active
    GROUP BY skill.id
    ORDER BY skill.name
  `);

  const failures: string[] = [];
  console.log("# LearnPath diagnostic question quality audit\n");
  console.log("| Skill | Items | Formats | Cognitive levels | Difficulty bands | A/V/C | Misconception items | Result |");
  console.log("| --- | ---: | ---: | ---: | ---: | --- | ---: | --- |");
  for (const row of result.rows) {
    const issues: string[] = [];
    if (row.question_count < 3) issues.push("fewer than 3 items");
    if (row.response_formats < 2) issues.push("only one response format");
    if (row.cognitive_levels < 2) issues.push("insufficient cognitive spread");
    if (row.difficulty_bands < 2) issues.push("insufficient difficulty spread");
    if (row.anchor_count < 1) issues.push("missing anchor");
    if (row.verification_count < 1) issues.push("missing verification");
    if (row.challenge_count < 1) issues.push("missing challenge");
    if (row.misconception_mapped < 2) issues.push("weak misconception coverage");
    if (row.generic_application_count > 0) issues.push("generic application template active");
    if (issues.length) failures.push(`${row.name}: ${issues.join(", ")}`);
    console.log(`| ${row.name} | ${row.question_count} | ${row.response_formats} | ${row.cognitive_levels} | ${row.difficulty_bands} | ${row.anchor_count}/${row.verification_count}/${row.challenge_count} | ${row.misconception_mapped} | ${issues.length ? issues.join("; ") : "PASS"} |`);
  }

  const summary = await client.query<{
    active_items: number;
    blueprint_count: number;
    retired_generic_items: number;
    skill_count: number;
  }>(`
    SELECT
      (SELECT COUNT(*)::int FROM skills WHERE is_active) AS skill_count,
      (SELECT COUNT(*)::int FROM skill_diagnostic_blueprints) AS blueprint_count,
      (SELECT COUNT(*)::int FROM questions WHERE status = 'ACTIVE' AND question_purpose = 'DIAGNOSTIC') AS active_items,
      (SELECT COUNT(*)::int FROM questions WHERE status = 'RETIRED' AND slug LIKE 'adaptive-%-application-v2') AS retired_generic_items
  `);
  const totals = summary.rows[0]!;
  if (totals.blueprint_count !== totals.skill_count) {
    failures.push(`blueprints cover ${totals.blueprint_count}/${totals.skill_count} active skills`);
  }
  console.log(`\n- Active diagnostic items: ${totals.active_items}`);
  console.log(`- Diagnostic blueprints: ${totals.blueprint_count}/${totals.skill_count}`);
  console.log(`- Retired generic application templates: ${totals.retired_generic_items}`);

  if (strict && failures.length) {
    throw new Error(`Diagnostic quality gate failed:\n- ${failures.join("\n- ")}`);
  }
  console.log(`\nDiagnostic question quality gate: ${failures.length ? "REVIEW REQUIRED" : "PASS"}`);
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
