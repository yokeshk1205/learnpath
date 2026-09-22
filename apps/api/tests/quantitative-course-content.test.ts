import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../../../database/migrations/0032_non_programming_assessment_course.sql", import.meta.url), "utf8");

interface Lesson {
  type: "CONCEPT_GUIDE" | "WORKED_EXAMPLE";
  title: string;
  summary: string;
  objectives: string[];
  sections: Array<{ heading: string; body: string }>;
}
interface Skill {
  slug: string;
  name: string;
  module: string;
  sequence: number;
  difficulty: number;
  description: string;
  lessons: Lesson[];
}
interface Question {
  slug: string;
  skill: string;
  purpose: "DIAGNOSTIC" | "PRACTICE" | "ASSESSMENT";
  type: "SINGLE_CHOICE" | "MULTI_SELECT" | "NUMERIC";
  level: "REMEMBER" | "UNDERSTAND" | "APPLY" | "ANALYZE";
  difficulty: number;
  prompt: string;
  explanation: string;
  options: Array<{ content: string; correct: boolean; code?: string }>;
  answer?: number;
  tolerance?: number;
  unit?: string;
}

function manifest<T>(marker: string): T[] {
  const pieces = sql.split(`$${marker}$`);
  expect(pieces).toHaveLength(3);
  return JSON.parse(pieces[1]!) as T[];
}
const skills = manifest<Skill>("quant_skills");
const questions = manifest<Question>("quant_questions");
const bySlug = new Map(questions.map((question) => [question.slug, question]));
const answerText = (slug: string) => bySlug.get(slug)!.options.filter((option) => option.correct).map((option) => option.content);

describe("original quantitative-reasoning course manifest", () => {
  it("covers six assessable global skills across three modules without a programming dependency", () => {
    expect(skills).toHaveLength(6);
    const modules = new Set(skills.map((skill) => skill.module));
    expect(modules.size).toBe(3);
    for (const module of modules) {
      expect(skills.filter((skill) => skill.module === module).map((skill) => skill.sequence).sort()).toEqual([1, 2]);
    }
    expect(new Set(skills.map((skill) => skill.slug)).size).toBe(6);
    for (const skill of skills) {
      expect(skill.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(skill.description.length).toBeGreaterThan(70);
      expect(skill.name).not.toMatch(/programming|python|algorithm/i);
    }
    const prerequisite = sql.match(/INSERT INTO skill_prerequisites[\s\S]*?;/)?.[0];
    expect(prerequisite).toContain("skill:percentage-change");
    expect(prerequisite).toContain("skill:percentage-amounts");
    expect(prerequisite?.match(/'REQUIRED'/g)).toHaveLength(1);
    expect(prerequisite).not.toMatch(/reading-data-tables|arithmetic-mean|median-and-range|unit-rates/);
  });

  it("has six distinct diagnostic questions and separate learning checks for every skill", () => {
    expect(questions).toHaveLength(48);
    expect(new Set(questions.map((question) => question.slug)).size).toBe(48);
    expect(new Set(questions.map((question) => question.prompt)).size).toBe(48);
    expect(questions.filter((question) => question.purpose === "DIAGNOSTIC")).toHaveLength(36);
    for (const skill of skills) {
      const content = questions.filter((question) => question.skill === skill.slug);
      const diagnostic = content.filter((question) => question.purpose === "DIAGNOSTIC");
      expect(diagnostic).toHaveLength(6);
      for (const type of ["SINGLE_CHOICE", "MULTI_SELECT", "NUMERIC"]) {
        expect(diagnostic.filter((question) => question.type === type)).toHaveLength(2);
      }
      expect(content.filter((question) => question.purpose === "PRACTICE")).toHaveLength(1);
      expect(content.filter((question) => question.purpose === "ASSESSMENT")).toHaveLength(1);
      expect(new Set(diagnostic.map((question) => question.level)).size).toBeGreaterThanOrEqual(3);
      expect(diagnostic.some((question) => question.level === "ANALYZE")).toBe(true);
      expect(diagnostic.filter((question) => ["APPLY", "ANALYZE"].includes(question.level)).length).toBeGreaterThanOrEqual(3);
      expect(new Set(diagnostic.map((question) => question.difficulty <= 2 ? "easy" : question.difficulty === 3 ? "medium" : "hard")).size).toBe(3);
    }
  });

  it("keeps keys and response shapes compatible with the three authoring formats", () => {
    for (const question of questions) {
      expect(skills.some((skill) => skill.slug === question.skill)).toBe(true);
      expect(question.prompt.trim()).not.toBe("");
      expect(question.explanation.length).toBeGreaterThan(35);
      expect(question.difficulty).toBeGreaterThanOrEqual(1);
      expect(question.difficulty).toBeLessThanOrEqual(5);
      if (question.type === "NUMERIC") {
        expect(question.purpose).toBe("DIAGNOSTIC");
        expect(question.options).toEqual([]);
        expect(Number.isFinite(question.answer)).toBe(true);
        expect(question.tolerance).toBe(0);
        expect(question.unit?.length).toBeGreaterThan(0);
      } else {
        expect(question.answer).toBeUndefined();
        expect(question.tolerance).toBeUndefined();
        expect(question.unit).toBeUndefined();
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options.map((option) => option.content)).size).toBe(4);
        expect(question.options.filter((option) => option.correct)).toHaveLength(question.type === "SINGLE_CHOICE" ? 1 : 2);
        for (const option of question.options) {
          if (!option.correct) expect(option.code).toMatch(/^[A-Z][A-Z_]+$/);
          expect(option.content).not.toMatch(/random output|opening a lesson|ignore input constraints/i);
        }
      }
      if (question.purpose !== "DIAGNOSTIC") expect(question.type).toBe("SINGLE_CHOICE");
    }
  });

  it("checks every numeric answer against an independent calculation from its prompt", () => {
    const expected: Record<string, number> = {
      "rates-d5": 90 / 6,
      "rates-d6": 180 / 4 * 10,
      "percent-d5": 0.15 * 240,
      "percent-d6": 18 / 0.30,
      "tables-d5": 9 + 16,
      "tables-d6": 24 - 9,
      "change-d5": (100 - 80) / 80 * 100,
      "change-d6": (250 - 200) / 250 * 100,
      "mean-d5": (6 + 8 + 10 + 12) / 4,
      "mean-d6": 4 * 15 - (11 + 14 + 18),
      "median-d5": [14, 3, 9, 7, 12].sort((a, b) => a - b)[2]!,
      "median-d6": (8 + 11) / 2,
    };
    expect(Object.keys(expected).sort()).toEqual(questions.filter((question) => question.type === "NUMERIC").map((question) => question.slug).sort());
    for (const [slug, value] of Object.entries(expected)) {
      expect(bySlug.get(slug)?.answer, slug).toBeCloseTo(value, 10);
      expect(bySlug.get(slug)?.explanation, slug).toContain(String(value));
    }
  });

  it("checks every single-choice key, including arithmetic, subgroup, and definition items", () => {
    const expected: Record<string, string> = {
      "rates-d1": "The cost for one unit of quantity", "rates-d2": String(40 + 12 * 10),
      "percent-d1": String(7 / 100), "percent-d2": String(640 / 0.8),
      "tables-d1": "Child visits on Tuesday", "tables-d2": `The cafe sold ${24 + 16} teas in total.`,
      "change-d1": "The original value", "change-d2": `${Math.round((1 - 1.2 * 0.8) * 100)}% lower`,
      "mean-d1": "Add all values, then divide by how many values there are.", "mean-d2": `${(2 * 10 + 6 * 14) / 8} minutes`,
      "median-d1": "The largest value minus the smallest value", "median-d2": `The median stays 5 and the range becomes ${30 - 2}.`,
      "rates-practice": String(84 / 3 * 5), "rates-assessment": `The 2 kg bag, at ${150 / 2} per kg`,
      "percent-practice": String(350 * 0.9), "percent-assessment": String(24 / 0.4),
      "tables-practice": String(12 + 7), "tables-assessment": "Both days had the same total appointment count.",
      "change-practice": `${(150 - 120) / 120 * 100}%`, "change-assessment": "A fall of 10 percentage points and a relative fall of 25%",
      "mean-practice": String((0 + 6 + 12) / 3), "mean-assessment": String((3 * 8 + 12) / 4),
      "median-practice": String(9 - 2), "median-assessment": `Median ${(4 + 7) / 2}; range ${10 - 1}`,
    };
    expect(Object.keys(expected).sort()).toEqual(questions.filter((question) => question.type === "SINGLE_CHOICE").map((question) => question.slug).sort());
    for (const [slug, value] of Object.entries(expected)) expect(answerText(slug), slug).toEqual([value]);
  });

  it("checks the complete answer set for all twelve multiple-selection items", () => {
    const expected: Record<string, string[]> = {
      "rates-d3": [`The unit price is ${120 / 4} per kg.`, `Two kilograms cost ${120 / 4 * 2}.`],
      "rates-d4": [`Pack A costs ${45 / 0.5} per kg.`, `Pack B costs ${60 / 0.75} per kg.`],
      "percent-d3": ["80 / 4", "0.25 times 80"],
      "percent-d4": ["The same number of people cycle in each group.", `Together, ${0.3 * 40 + 0.2 * 60}% of the 100 people cycle.`],
      "tables-d3": [`Group A has ${9 + 6} learners.`, `Across both groups, ${9 + 7} learners chose rice.`],
      "tables-d4": [`Both days recorded ${10 + 14} attendances.`, `Beginner attendances totaled ${10 + 16} across both days.`],
      "change-d3": [`The club gained ${60 - 50} members.`, `The club grew by ${(60 - 50) / 50 * 100}%.`],
      "change-d4": [`An increase of ${30 - 20} percentage points`, `A relative increase of ${(30 - 20) / 20 * 100}%`],
      "mean-d3": [`The total is ${2 + 4 + 9}.`, `The mean is ${(2 + 4 + 9) / 3}.`],
      "mean-d4": [`The readings total ${5 * 12}.`, "Adding a sixth reading of 12 leaves the mean at 12."],
      "median-d3": ["The sorted data are 3, 3, 5, 8, 11.", "The median is 5."],
      "median-d4": [`The median is ${(4 + 8) / 2}.`, `The range is ${10 - 2}.`],
    };
    expect(Object.keys(expected).sort()).toEqual(questions.filter((question) => question.type === "MULTI_SELECT").map((question) => question.slug).sort());
    for (const [slug, values] of Object.entries(expected)) expect(answerText(slug), slug).toEqual(values);
  });

  it("provides readable guide and worked-example lessons satisfying the existing content audit", () => {
    const lessonTitles = new Set<string>();
    for (const skill of skills) {
      expect(skill.lessons.map((lesson) => lesson.type).sort()).toEqual(["CONCEPT_GUIDE", "WORKED_EXAMPLE"]);
      for (const lesson of skill.lessons) {
        lessonTitles.add(lesson.title);
        expect(lesson.summary.length).toBeGreaterThan(30);
        expect(lesson.objectives.length).toBeGreaterThanOrEqual(3);
        expect(lesson.sections.length).toBeGreaterThanOrEqual(3);
        for (const section of lesson.sections) {
          expect(section.heading.trim().length).toBeGreaterThan(5);
          expect(section.body.trim().length).toBeGreaterThan(100);
        }
        const slug = `quant-${skill.slug}-${lesson.type.toLowerCase().replaceAll("_", "-")}`;
        expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      }
    }
    expect(lessonTitles.size).toBe(12);
    expect(sql).toContain("replace(lower(lesson.value->>'type'), '_', '-')");
  });

  it("is additive, preserves existing learner state, and discloses unvalidated author priors", () => {
    const statements = sql.replace(/--[^\n]*/g, "");
    expect(statements).not.toMatch(/\b(?:UPDATE|DELETE|TRUNCATE|ALTER)\s+(?:TABLE\s+)?(?:users|learner_\w+|course_enrollments|assessment_attempts|questions|courses|skills)\b/i);
    expect(statements).not.toMatch(/INSERT INTO\s+(?:users|learner_\w+|course_enrollments|assessment_attempts)\b/i);
    expect(statements).toContain("INSERT INTO question_skill_mappings (question_id, skill_id, mapping_type, evidence_weight)");
    expect(sql).toContain("expert review and empirical calibration pending");
    expect(sql).toContain("does not certify expert validation");
    expect(statements).not.toContain("gen_random_uuid()");
  });
});
