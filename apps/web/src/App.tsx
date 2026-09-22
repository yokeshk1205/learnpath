import {
  ArrowRight,
  BrainCircuit,
  Check,
  CircleDot,
  Database,
  GitBranch,
  RefreshCw,
  Server,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { fetchHealth, type ServiceState } from "./lib/health";
import { AuthLayout } from "./pages/AuthLayout";
import { CandidateIntelligencePage } from "./pages/CandidateIntelligencePage";
import { DashboardPage } from "./pages/DashboardPage";
import { LearnerDashboardPage } from "./pages/LearnerDashboardPage";
import { LearnerAnalyticsPage } from "./pages/LearnerAnalyticsPage";
import { GovernancePage } from "./pages/GovernancePage";
import { DiagnosticPage } from "./pages/DiagnosticPage";
import { LoginPage } from "./pages/LoginPage";
import { LearningLibraryPage } from "./pages/LearningLibraryPage";
import { PrerequisiteGraphPage } from "./pages/PrerequisiteGraphPage";
import { PracticePage } from "./pages/PracticePage";
import { ProtectedRoute } from "./pages/ProtectedRoute";
import { RegisterPage } from "./pages/RegisterPage";
import { SkillPassportPage } from "./pages/SkillPassportPage";
import { StudyResourcePage } from "./pages/StudyResourcePage";
import { RetentionPage } from "./pages/RetentionPage";
import { SyntheticDataLabPage } from "./pages/SyntheticDataLabPage";
import { FeatureEngineeringLabPage } from "./pages/FeatureEngineeringLabPage";
import { ModelEvaluationLabPage } from "./pages/ModelEvaluationLabPage";
import { InferenceLabPage } from "./pages/InferenceLabPage";
import { PersonalizedPathPage } from "./pages/PersonalizedPathPage";
import { RecommendationEvaluationPage } from "./pages/RecommendationEvaluationPage";
import { CoursesPage } from "./pages/CoursesPage";
import { CourseAssessmentPage } from "./pages/CourseAssessmentPage";

interface ServiceStatus {
  label: string;
  state: ServiceState;
  version?: string;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
const mlBaseUrl = import.meta.env.VITE_ML_BASE_URL ?? "/ml";

const principles = [
  {
    icon: Database,
    title: "Skip what you know",
    detail: "A short knowledge check finds the right starting point for each course.",
  },
  {
    icon: GitBranch,
    title: "Understand every step",
    detail: "See why a lesson is next and what foundation will unlock later skills.",
  },
  {
    icon: BrainCircuit,
    title: "Grow across courses",
    detail: "Skills you demonstrate in one course are recognized wherever else they matter.",
  },
];

const roadmap = [
  { label: "Choose a course", status: "complete" },
  { label: "Show what you already know", status: "complete" },
  { label: "See your personalized starting point", status: "complete" },
  { label: "Learn the next skill", status: "complete" },
  { label: "Practice and get feedback", status: "complete" },
  { label: "Keep growing", status: "active" },
];

function StateBadge({ state }: { state: ServiceState }) {
  if (state === "online") {
    return <Badge variant="success"><span className="mr-1.5 size-1.5 rounded-full bg-[#3c8c55]" />Online</Badge>;
  }
  if (state === "offline") {
    return <Badge variant="destructive"><span className="mr-1.5 size-1.5 rounded-full bg-[#c7553f]" />Offline</Badge>;
  }
  return <Badge variant="outline"><RefreshCw className="mr-1.5 size-3 animate-spin" />Checking</Badge>;
}

function CourseEntryRedirect() {
  const { enrollmentId } = useParams();
  return <Navigate replace to={enrollmentId ? `/my-courses/${enrollmentId}/path` : "/dashboard#my-courses"} />;
}

export function LandingPage() {
  const [services, setServices] = useState<ServiceStatus[]>([
    { label: "Application API", state: "checking" },
    { label: "ML service", state: "checking" },
  ]);

  const checkServices = useCallback(async () => {
    setServices((current) => current.map((service) => ({ ...service, state: "checking" })));
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4_000);

    const results = await Promise.allSettled([
      fetchHealth(apiBaseUrl, controller.signal),
      fetchHealth(mlBaseUrl, controller.signal),
    ]);
    window.clearTimeout(timeout);

    setServices([
      {
        label: "Application API",
        state: results[0].status === "fulfilled" ? "online" : "offline",
        version: results[0].status === "fulfilled" ? results[0].value.version : undefined,
      },
      {
        label: "ML service",
        state: results[1].status === "fulfilled" ? "online" : "offline",
        version: results[1].status === "fulfilled" ? results[1].value.version : undefined,
      },
    ]);
  }, []);

  useEffect(() => {
    void checkServices();
  }, [checkServices]);

  return (
    <div className="min-h-screen bg-[#f5f5ef] text-[#18372f]">
      <header className="border-b border-[#dfe3da] bg-[#f5f5ef]/95">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8">
          <a className="flex items-center gap-3" href="#top" aria-label="LearnPath home">
            <span className="grid size-10 place-items-center rounded-[0.9rem] bg-[#163b32] text-white shadow-sm">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <span className="text-xl font-bold tracking-[-0.04em]">LearnPath</span>
          </a>
          <div className="flex items-center gap-2">
            <Button asChild className="hidden sm:inline-flex" variant="ghost"><a href="/login">Sign in</a></Button>
            <Button asChild><a href="/register">Create account</a></Button>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="relative overflow-hidden border-b border-[#dfe3da]">
          <div className="absolute -right-24 -top-24 size-[32rem] rounded-full bg-[#d9e7d6] opacity-65 blur-3xl" />
          <div className="relative mx-auto grid max-w-[1180px] gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="max-w-2xl">
              <Badge className="mb-6 bg-[#f4e3d2] text-[#854a28]" variant="outline">
                Your learning, personalized
              </Badge>
              <h1 className="text-balance text-[clamp(3rem,7vw,5.6rem)] font-semibold leading-[0.96] tracking-[-0.065em]">
                Start where you are. Grow from there.
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-[#5f6e68]">
                LearnPath discovers what you already know, guides you to the right next lesson,
                and carries your skills with you across every course.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button asChild>
                  <a href="/register">Start learning <ArrowRight className="size-4" /></a>
                </Button>
                <Button asChild variant="outline">
                  <a href="#how">See how it works</a>
                </Button>
              </div>
            </div>

            <Card className="relative overflow-hidden border-[#cfd7ce] bg-[#fffdf7]">
              <div className="h-1.5 bg-[linear-gradient(90deg,#e9854e_0_28%,#2d6b58_28%_100%)]" />
              <CardHeader className="border-b border-[#e2e4dd] p-7">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7b8681]">Your learner journey</span>
                  <span className="text-xs text-[#7b8681]">One step at a time</span>
                </div>
                <CardTitle className="text-2xl">Always know what to do next</CardTitle>
                <CardDescription>From your first knowledge check to focused lessons, practice, and quick reviews.</CardDescription>
              </CardHeader>
              <CardContent className="p-7">
                <ol className="space-y-1" aria-label="Project phases">
                  {roadmap.map((step, index) => (
                    <li className="relative flex min-h-14 items-center gap-4" key={step.label}>
                      {index < roadmap.length - 1 && (
                        <span className="absolute left-[13px] top-9 h-8 w-px bg-[#d8ddd5]" aria-hidden="true" />
                      )}
                      <span className={`grid size-7 shrink-0 place-items-center rounded-full ${step.status === "active" ? "bg-[#163b32] text-white" : step.status === "complete" ? "bg-[#dfeadf] text-[#2e6951]" : "border border-[#ccd3cb] bg-white text-[#85908b]"}`}>
                        {step.status === "complete" ? <Check className="size-3.5" /> : <span className="text-[10px] font-bold">{index + 1}</span>}
                      </span>
                      <span className={step.status === "active" ? "font-semibold" : "text-[#7c8782]"}>{step.label}</span>
                      {step.status === "active" && <Badge className="ml-auto" variant="success">Current</Badge>}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="hidden" id="foundation">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#cb6f3e]">Live foundation</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Service health, without guesswork</h2>
            </div>
            <Button onClick={() => void checkServices()} variant="ghost">
              <RefreshCw className="size-4" /> Check again
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {services.map((service, index) => (
              <Card key={service.label}>
                <CardContent className="flex items-center gap-4 p-6">
                  <span className="grid size-12 place-items-center rounded-2xl bg-[#edf1e9] text-[#2b5f50]">
                    {index === 0 ? <Server className="size-5" /> : <BrainCircuit className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{service.label}</p>
                    <p className="mt-1 text-sm text-[#75807b]">{service.version ? `Version ${service.version}` : "Local service endpoint"}</p>
                  </div>
                  <StateBadge state={service.state} />
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-[#6f7c76]">
            <CircleDot className="mt-1 size-3.5 shrink-0 text-[#d47846]" />
            PostgreSQL readiness is checked separately by the API and returns 503 when the database cannot be reached.
          </p>
        </section>

        <section className="border-y border-[#dfe3da] bg-[#163b32] text-white" id="how">
          <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f0a475]">Built around you</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">A clear path from “where do I start?” to “what’s next?”</h2>
            </div>
            <div className="mt-10 grid gap-px overflow-hidden rounded-[1.5rem] border border-white/15 bg-white/15 md:grid-cols-3">
              {principles.map(({ detail, icon: Icon, title }) => (
                <article className="bg-[#163b32] p-7 sm:p-8" key={title}>
                  <Icon className="size-6 text-[#ef9a69]" aria-hidden="true" />
                  <h3 className="mt-8 text-lg font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#bfcfc9]">{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#f5f5ef]">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-5 py-8 text-sm text-[#6e7a75] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>LearnPath · Adaptive learning for real students</p>
          <a className="font-semibold text-[#355f4e]" href="/login">Learner sign in</a>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<LandingPage />} path="/" />
      <Route element={<AuthLayout />}>
        <Route element={<LoginPage />} path="/login" />
        <Route element={<RegisterPage />} path="/register" />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<LearnerDashboardPage />} path="/dashboard" />
        <Route element={<CoursesPage />} path="/courses" />
        <Route element={<LearnerAnalyticsPage />} path="/analytics" />
        <Route element={<GovernancePage />} path="/governance" />
        <Route element={<DashboardPage />} path="/reviewer" />
        <Route element={<DiagnosticPage />} path="/diagnostic/:attemptId" />
        <Route element={<LearningLibraryPage />} path="/learning-library" />
        <Route element={<StudyResourcePage />} path="/learn/:resourceId" />
        <Route element={<PrerequisiteGraphPage />} path="/prerequisites" />
        <Route element={<PracticePage />} path="/practice/:skillId" />
        <Route element={<CourseEntryRedirect />} path="/my-courses/:enrollmentId" />
        <Route element={<CandidateIntelligencePage />} path="/my-courses/:enrollmentId/candidates" />
        <Route element={<PersonalizedPathPage />} path="/my-courses/:enrollmentId/path" />
        <Route element={<CourseAssessmentPage />} path="/my-courses/:enrollmentId/assessment" />
        <Route element={<SkillPassportPage />} path="/skill-passport" />
        <Route element={<RetentionPage />} path="/retention" />
        <Route element={<SyntheticDataLabPage />} path="/synthetic-data" />
        <Route element={<FeatureEngineeringLabPage />} path="/feature-lab" />
        <Route element={<ModelEvaluationLabPage />} path="/model-evaluation" />
        <Route element={<RecommendationEvaluationPage />} path="/recommendation-evaluation" />
        <Route element={<InferenceLabPage />} path="/inference-lab" />
      </Route>
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}
