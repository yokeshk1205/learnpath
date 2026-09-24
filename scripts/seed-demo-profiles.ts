import { getDatabaseConfig } from "../config/database.mjs";

import pg from "pg";

const { Client } = pg;

const apiBaseUrl = process.env.DEMO_API_BASE_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? "4000"}`;
const password = "LearnPathDemo!2026";

const courses = {
  algorithms: "40000000-0000-4000-8000-000000000003",
  fundamentals: "40000000-0000-4000-8000-000000000001",
} as const;

const profiles = [
  {
    displayName: "Maya Explorer",
    email: "maya.explorer@demo.learnpath.local",
    scenario: "New learner with no course enrollment",
  },
  {
    displayName: "Noah Starter",
    email: "noah.starter@demo.learnpath.local",
    scenario: "Enrolled learner ready for a first knowledge check",
  },
  {
    displayName: "Aisha Builder",
    email: "aisha.builder@demo.learnpath.local",
    scenario: "Active learner with mixed mastery and a personalized path",
  },
  {
    displayName: "Elena Navigator",
    email: "elena.navigator@demo.learnpath.local",
    scenario: "Returning multi-course learner ready to demonstrate dynamic path adaptation",
  },
  {
    displayName: "Ravi Strategist",
    email: "ravi.strategist@demo.learnpath.local",
    scenario: "Advanced learner whose prior knowledge skips foundations and exposes a focused sorting gap",
  },
] as const;

interface AuthPayload {
  accessToken: string;
  user: { id: string };
}

interface EnrollmentDetail {
  enrollment: { courseId: string; id: string };
  modules: Array<{ id: string; sequence: number }>;
}

interface DiagnosticAttempt {
  id: string;
  questions: Array<{
    id: string;
    sequence: number;
    skillName: string;
  }>;
  selection: {
    questionBudget: number;
  };
}

interface DiagnosticDraftResponse {
  attempt?: DiagnosticAttempt;
}

interface PersonalizedPathResponse {
  path: {
    id: string;
    learnNext: { skillId: string } | null;
    pathVersion: number;
  };
}

interface RecommendationResponse {
  feedback: { id: string };
}

interface SkillCheckAttempt {
  id: string;
  question: { id: string };
}

interface LearningOverview {
  resources: Array<{
    contexts: Array<{ courseId: string; moduleId: string }>;
    id: string;
  }>;
}

if (process.env.NODE_ENV === "production") {
  throw new Error("Demo profiles cannot be seeded while NODE_ENV=production.");
}

async function api<T>(
  path: string,
  options: { body?: unknown; method?: string; token?: string } = {},
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    method: options.method ?? "GET",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${options.method ?? "GET"} ${path} failed (${response.status}): ${detail}`);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

async function resetDemoAccounts(client: pg.Client): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query("ALTER TABLE skill_evidence DISABLE TRIGGER skill_evidence_immutable_delete");
    await client.query(
      "DELETE FROM users WHERE email = ANY($1::text[])",
      [profiles.map((profile) => profile.email)],
    );
    await client.query("ALTER TABLE skill_evidence ENABLE TRIGGER skill_evidence_immutable_delete");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function register(profile: typeof profiles[number]): Promise<AuthPayload> {
  return api<AuthPayload>("/auth/register", {
    body: { displayName: profile.displayName, email: profile.email, password },
    method: "POST",
  });
}

async function enroll(token: string, courseId: string): Promise<EnrollmentDetail> {
  return api<EnrollmentDetail>("/enrollments", {
    body: { courseId },
    method: "POST",
    token,
  });
}

async function answerDiagnostic(
  client: pg.Client,
  token: string,
  enrollmentId: string,
  shouldAnswerCorrectly: (question: DiagnosticAttempt["questions"][number], index: number) => boolean,
): Promise<void> {
  let attempt = await api<DiagnosticAttempt>("/diagnostics/start", {
    body: { enrollmentId },
    method: "POST",
    token,
  });
  const answers: Array<{ optionId: string; questionId: string }> = [];
  while (answers.length < attempt.selection.questionBudget) {
    const index = answers.length;
    const question = attempt.questions[index];
    if (!question) {
      attempt = await api<DiagnosticAttempt>(`/diagnostics/attempts/${attempt.id}`, { token });
    }
    const selectedQuestion = attempt.questions[index];
    if (!selectedQuestion) {
      throw new Error(`Adaptive diagnostic ${attempt.id} did not select question ${index + 1}.`);
    }
    const desiredCorrectness = shouldAnswerCorrectly(selectedQuestion, index);
    const option = await client.query<{ id: string }>(
      `SELECT id FROM question_options
       WHERE question_id = $1 AND is_correct = $2
       ORDER BY option_key LIMIT 1`,
      [selectedQuestion.id, desiredCorrectness],
    );
    const optionId = option.rows[0]?.id;
    if (!optionId) {
      throw new Error(`No ${desiredCorrectness ? "correct" : "incorrect"} option for ${selectedQuestion.id}.`);
    }
    answers.push({ optionId, questionId: selectedQuestion.id });
    const saved = await api<DiagnosticDraftResponse>(
      `/diagnostics/attempts/${attempt.id}/answers/${selectedQuestion.id}`,
      {
        body: { isUnsure: false, optionId, responseSeconds: 38 },
        method: "PUT",
        token,
      },
    );
    if (saved.attempt) attempt = saved.attempt;
  }
  await api(`/diagnostics/attempts/${attempt.id}/submit`, {
    body: { answers, durationSeconds: Math.max(180, attempt.questions.length * 38) },
    method: "POST",
    token,
  });
}

async function updateModule(
  token: string,
  enrollment: EnrollmentDetail,
  status: "COMPLETED" | "IN_PROGRESS",
): Promise<void> {
  const first = [...enrollment.modules].sort((left, right) => left.sequence - right.sequence)[0];
  if (!first) throw new Error(`Enrollment ${enrollment.enrollment.id} has no modules.`);
  await api(`/enrollments/${enrollment.enrollment.id}/modules/${first.id}/progress`, {
    body: { status },
    method: "POST",
    token,
  });
}

async function generatePath(token: string, enrollmentId: string): Promise<PersonalizedPathResponse> {
  return api<PersonalizedPathResponse>(`/enrollments/${enrollmentId}/path/generate`, {
    method: "POST",
    token,
  });
}

async function recordRecommendedLesson(
  token: string,
  enrollment: EnrollmentDetail,
  path: PersonalizedPathResponse,
): Promise<void> {
  const skillId = path.path.learnNext?.skillId;
  if (!skillId) return;
  const overview = await api<LearningOverview>(
    `/learning/overview?courseId=${enrollment.enrollment.courseId}&skillId=${skillId}`,
    { token },
  );
  const resource = overview.resources[0];
  const context = resource?.contexts.find((item) => item.courseId === enrollment.enrollment.courseId);
  if (!resource) return;
  const response = await api<RecommendationResponse>(
    `/recommendations/paths/${path.path.id}/feedback`,
    {
      body: { decision: "ACCEPTED", resourceId: resource.id },
      method: "POST",
      token,
    },
  );
  for (const eventType of ["RESOURCE_STARTED", "RESOURCE_COMPLETED"] as const) {
    await api(`/learning/resources/${resource.id}/events`, {
      body: {
        courseId: context?.courseId ?? enrollment.enrollment.courseId,
        durationSeconds: eventType === "RESOURCE_COMPLETED" ? 720 : 0,
        eventType,
        metadata: {
          demoProfile: true,
          pathId: path.path.id,
          pathVersion: String(path.path.pathVersion),
          recommendationFeedbackId: response.feedback.id,
        },
        moduleId: context?.moduleId,
        result: eventType === "RESOURCE_COMPLETED" ? { completed: true } : {},
      },
      method: "POST",
      token,
    });
  }
}

async function completeSkillCheck(
  client: pg.Client,
  token: string,
  enrollmentId: string,
  skillId: string,
  mode: "ASSESSMENT" | "PRACTICE",
  correct: boolean,
): Promise<void> {
  const attempt = await api<SkillCheckAttempt>("/practice/start", {
    body: { enrollmentId, mode, skillId },
    method: "POST",
    token,
  });
  const selected = await client.query<{ id: string }>(
    `SELECT id FROM question_options
     WHERE question_id = $1 AND is_correct = $2
     ORDER BY option_key LIMIT 1`,
    [attempt.question.id, correct],
  );
  if (!selected.rows[0]) throw new Error(`No ${correct ? "correct" : "incorrect"} option for ${mode}.`);
  await api(`/practice/attempts/${attempt.id}/submit`, {
    body: { durationSeconds: mode === "ASSESSMENT" ? 55 : 40, hintsUsed: 0, optionId: selected.rows[0].id },
    method: "POST",
    token,
  });
}

async function ageEvidence(
  client: pg.Client,
  learnerId: string,
  skillSlugs: string[],
  daysAgo: number,
): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query("ALTER TABLE skill_evidence DISABLE TRIGGER skill_evidence_immutable_update");
    await client.query(
      `UPDATE skill_evidence evidence
       SET created_at = NOW() - ($3::text || ' days')::interval
       FROM skills skill
       WHERE evidence.skill_id = skill.id
         AND evidence.learner_id = $1
         AND skill.slug = ANY($2::text[])`,
      [learnerId, skillSlugs, daysAgo],
    );
    await client.query("ALTER TABLE skill_evidence ENABLE TRIGGER skill_evidence_immutable_update");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  await api("/health/ready");
  const client = new Client(getDatabaseConfig());
  await client.connect();
  try {
    await resetDemoAccounts(client);
    const [maya, noah, aisha, elena, ravi] = await Promise.all(profiles.map(register));
    void maya;

    await enroll(noah.accessToken, courses.fundamentals);

    const aishaCourse = await enroll(aisha.accessToken, courses.fundamentals);
    await answerDiagnostic(
      client,
      aisha.accessToken,
      aishaCourse.enrollment.id,
      (question) => question.skillName !== "Functions",
    );
    // Diagnostic v5 intentionally treats one correct response as a probe. Add
    // a distinct assessed observation for the required Variables foundation so
    // the controlled demo can honestly unlock and recommend Functions.
    await completeSkillCheck(
      client, aisha.accessToken, aishaCourse.enrollment.id,
      "30000000-0000-4000-8000-000000000001", "ASSESSMENT", true,
    );
    await updateModule(aisha.accessToken, aishaCourse, "IN_PROGRESS");
    const aishaPath = await generatePath(aisha.accessToken, aishaCourse.enrollment.id);
    if (aishaPath.path.learnNext?.skillId !== "30000000-0000-4000-8000-000000000003") {
      throw new Error("Aisha's controlled storyline must recommend Functions.");
    }
    await recordRecommendedLesson(aisha.accessToken, aishaCourse, aishaPath);
    await completeSkillCheck(
      client, aisha.accessToken, aishaCourse.enrollment.id,
      aishaPath.path.learnNext.skillId, "PRACTICE", false,
    );
    await completeSkillCheck(
      client, aisha.accessToken, aishaCourse.enrollment.id,
      aishaPath.path.learnNext.skillId, "ASSESSMENT", true,
    );
    await generatePath(aisha.accessToken, aishaCourse.enrollment.id);

    const elenaFundamentals = await enroll(elena.accessToken, courses.fundamentals);
    await answerDiagnostic(client, elena.accessToken, elenaFundamentals.enrollment.id, () => true);
    await updateModule(elena.accessToken, elenaFundamentals, "COMPLETED");
    const elenaAlgorithms = await enroll(elena.accessToken, courses.algorithms);
    await answerDiagnostic(
      client,
      elena.accessToken,
      elenaAlgorithms.enrollment.id,
      (question, index) => question.skillName === "Complexity Analysis" || index % 3 !== 1,
    );
    await ageEvidence(
      client,
      elena.user.id,
      ["programming-variables", "complexity-analysis", "arrays"],
      42,
    );
    await api("/retention", { token: elena.accessToken });
    await generatePath(elena.accessToken, elenaFundamentals.enrollment.id);
    const elenaAlgorithmsPath = await generatePath(elena.accessToken, elenaAlgorithms.enrollment.id);
    await api(`/recommendations/paths/${elenaAlgorithmsPath.path.id}/feedback`, {
      body: { decision: "REJECTED", reasonCode: "PREFER_DIFFERENT" },
      method: "POST",
      token: elena.accessToken,
    });
    // Record new server-scored evidence after both paths exist. This intentionally
    // leaves Elena's course paths stale through the real Phase 18 invalidation
    // flow, giving reviewers a one-click before/after regeneration demo.
    await answerDiagnostic(
      client,
      elena.accessToken,
      elenaAlgorithms.enrollment.id,
      (question, index) => question.skillName === "Complexity Analysis" || index % 2 === 0,
    );

    const raviFundamentals = await enroll(ravi.accessToken, courses.fundamentals);
    await answerDiagnostic(client, ravi.accessToken, raviFundamentals.enrollment.id, () => true);
    await updateModule(ravi.accessToken, raviFundamentals, "COMPLETED");
    const raviAlgorithms = await enroll(ravi.accessToken, courses.algorithms);
    await answerDiagnostic(
      client,
      ravi.accessToken,
      raviAlgorithms.enrollment.id,
      (question) => !question.skillName.includes("Sorting"),
    );
    await generatePath(ravi.accessToken, raviAlgorithms.enrollment.id);

    console.log("Seeded five LearnPath demo profiles:");
    for (const profile of profiles) {
      console.log(`- ${profile.displayName}: ${profile.email} — ${profile.scenario}`);
    }
    console.log(`Shared password: ${password}`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
