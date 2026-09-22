import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
const outputPath = path.resolve(
  process.cwd(),
  process.argv[2] ?? "services/ml/data/input/curriculum_v1.json",
);

if (!connectionString) {
  throw new Error("DATABASE_URL is required to export the ML curriculum snapshot.");
}

interface CourseRow {
  estimated_hours: string;
  id: string;
  level: string;
  name: string;
  slug: string;
}

interface CourseSkillRow {
  course_id: string;
  is_required: boolean;
  module_sequence: number;
  sequence: number;
  skill_id: string;
}

interface PrerequisiteRow {
  prerequisite_skill_id: string;
  relationship_type: "RECOMMENDED" | "REQUIRED";
  required_mastery: string;
  skill_id: string;
}

interface SkillRow {
  category: string;
  difficulty: number;
  estimated_minutes: number;
  id: string;
  name: string;
  slug: string;
}

async function main() {
  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : false,
  });
  await client.connect();
  try {
    const courseResult = await client.query<CourseRow>(
        `SELECT id, slug, name, level, estimated_hours
         FROM courses WHERE is_active ORDER BY slug`,
      );
    const courseSkillResult = await client.query<CourseSkillRow>(
        `SELECT course_skill.course_id, course_skill.skill_id, course_skill.is_required,
                course_skill.sequence, module.sequence AS module_sequence
         FROM course_skills course_skill
         JOIN courses course ON course.id = course_skill.course_id AND course.is_active
         JOIN modules module ON module.id = course_skill.module_id
         JOIN skills skill ON skill.id = course_skill.skill_id AND skill.is_active
         ORDER BY course_skill.course_id, module.sequence, course_skill.sequence, course_skill.skill_id`,
      );
    const prerequisiteResult = await client.query<PrerequisiteRow>(
        `SELECT prerequisite.skill_id, prerequisite.prerequisite_skill_id,
                prerequisite.required_mastery, prerequisite.relationship_type
         FROM skill_prerequisites prerequisite
         JOIN skills skill ON skill.id = prerequisite.skill_id AND skill.is_active
         JOIN skills required_skill
           ON required_skill.id = prerequisite.prerequisite_skill_id AND required_skill.is_active
         ORDER BY prerequisite.skill_id, prerequisite.prerequisite_skill_id`,
      );
    const skillResult = await client.query<SkillRow>(
        `SELECT id, slug, name, category, difficulty, estimated_minutes
         FROM skills WHERE is_active ORDER BY slug`,
      );

    if (skillResult.rowCount === 0 || courseResult.rowCount === 0) {
      throw new Error("The active curriculum is empty; refusing to create a synthetic-data input.");
    }

    const courseSkills = new Map<string, CourseSkillRow[]>();
    const skillCourses = new Map<string, string[]>();
    for (const mapping of courseSkillResult.rows) {
      courseSkills.set(mapping.course_id, [...(courseSkills.get(mapping.course_id) ?? []), mapping]);
      skillCourses.set(mapping.skill_id, [...(skillCourses.get(mapping.skill_id) ?? []), mapping.course_id]);
    }

    const snapshot = {
      classification: "APPLICATION CURRICULUM / NO LEARNER DATA",
      schemaVersion: "curriculum-v1",
      source: "LearnPath PostgreSQL active curriculum tables",
      summary: {
        courses: courseResult.rowCount,
        prerequisiteEdges: prerequisiteResult.rowCount,
        skills: skillResult.rowCount,
      },
      courses: courseResult.rows.map((course) => ({
        estimatedHours: Number(course.estimated_hours),
        id: course.id,
        level: course.level,
        name: course.name,
        skillIds: (courseSkills.get(course.id) ?? []).map((mapping) => mapping.skill_id),
        slug: course.slug,
      })),
      skills: skillResult.rows.map((skill) => ({
        category: skill.category,
        courseIds: (skillCourses.get(skill.id) ?? []).sort(),
        difficulty: skill.difficulty,
        estimatedMinutes: skill.estimated_minutes,
        id: skill.id,
        name: skill.name,
        slug: skill.slug,
      })),
      courseSkills: courseSkillResult.rows.map((mapping) => ({
        courseId: mapping.course_id,
        isRequired: mapping.is_required,
        moduleSequence: mapping.module_sequence,
        sequence: mapping.sequence,
        skillId: mapping.skill_id,
      })),
      prerequisites: prerequisiteResult.rows.map((prerequisite) => ({
        prerequisiteSkillId: prerequisite.prerequisite_skill_id,
        relationshipType: prerequisite.relationship_type,
        requiredMastery: Number(prerequisite.required_mastery),
        skillId: prerequisite.skill_id,
      })),
    };

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    console.log(
      `exported\t${outputPath}\t${snapshot.summary.skills} skills\t${snapshot.summary.prerequisiteEdges} edges`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
