import {
  AlarmClock, ArrowRight, BarChart3, BookOpen, BrainCircuit, Check, ChevronRight, CircleDot, ClipboardCheck, Clock3,
  Compass, Fingerprint, FlaskConical, GitBranch, GraduationCap, Layers3, LayoutDashboard, LoaderCircle, LockKeyhole,
  LogOut, Network, PlayCircle, Plus, RefreshCw, Route, ShieldCheck, Sparkles, Target, TimerReset, TrendingUp, Unlock,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { getCandidateOverview, type CandidateOverview } from "../candidates/api";
import {
  getCatalogOverview, getGoalDetail, removeLearnerGoal, selectLearnerGoal, type CatalogGoal,
  type CatalogOverview, type GoalDetail, type GoalSkill,
} from "../catalog/api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { CoordinatedLearnNext } from "../components/CoordinatedLearnNext";
import {
  enrollInCourse,
  listEnrollments,
  type EnrollmentSummary,
} from "../enrollments/api";
import {
  getDiagnosticOverview,
  startDiagnostic,
  type DiagnosticOverview,
} from "../diagnostics/api";
import { getSkillPassport, type SkillPassport } from "../learner-skills/api";
import { getLearningOverview, type LearningOverview } from "../learning/api";
import {
  getPrerequisiteAnalysis,
  type GoalPrerequisiteAnalysis,
} from "../prerequisites/api";
import {
  generateCoordinatedLearningPlan,
  getCoordinatedLearningPlan,
  getPersonalizedPath,
  type CoordinatedLearningPlan,
  type PersonalizedPath,
} from "../paths/api";

type PathStageState = "complete" | "current" | "upcoming" | "locked";

function PathStage({ detail, index, label, state }: {
  detail: string; index: number; label: string; state: PathStageState;
}) {
  const styles = {
    complete: "border-[#b8d4c0] bg-[#e8f3e8] text-[#2f684f]",
    current: "border-[#e88955] bg-[#fff5ec] text-[#9a512b] shadow-[0_12px_32px_rgba(220,118,63,0.12)]",
    locked: "border-[#dde1dc] bg-[#f3f4f0] text-[#8b938f]",
    upcoming: "border-[#d7ddd5] bg-white text-[#576a62]",
  }[state];
  return (
    <div className="relative min-w-0 flex-1">
      <div className={`h-full rounded-2xl border p-4 ${styles}`}>
        <div className="mb-4 flex items-center justify-between">
          <span className="grid size-7 place-items-center rounded-full border border-current/20 bg-white/60 text-xs font-bold">
            {state === "complete" ? <Check className="size-3.5" /> : index}
          </span>
          <Badge className="border-current/15 bg-white/55 text-current" variant="outline">
            {state === "complete" ? "Ready" : state === "current" ? "Next step" : state}
          </Badge>
        </div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-2 text-xs leading-5 opacity-75">{detail}</p>
      </div>
      {index < 7 && <ChevronRight className="absolute -right-4 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-[#aeb8b2] xl:block" />}
    </div>
  );
}

function GoalCard({ goal, onRemove, onSelect, removing, selecting }: {
  goal: CatalogGoal; onRemove(goalId: string): void; onSelect(goalId: string): void; removing: boolean; selecting: boolean;
}) {
  return (
    <Card className={goal.isSelected ? "border-[#7da78e] bg-[#f7fbf6]" : "bg-white"}>
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <Badge variant={goal.isSelected ? "success" : "outline"}>{goal.isSelected ? "Active goal" : goal.level.toLowerCase()}</Badge>
          <span className="text-xs font-medium text-[#7a8580]">{goal.estimatedWeeks} weeks</span>
        </div>
        <h3 className="mt-4 text-lg font-semibold tracking-[-0.025em] text-[#193a31]">{goal.name}</h3>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#6d7a74]">{goal.description}</p>
        <div className="mt-5 flex items-center gap-4 border-t border-[#e4e8e2] pt-4 text-xs text-[#66746e]">
          <span>{goal.skillCount} skills</span><span>{goal.coreSkillCount} core</span>
        </div>
        {goal.isSelected ? <div className="mt-4 grid grid-cols-2 gap-2"><Button disabled variant="outline"><Target className="size-4" /> Selected</Button><Button disabled={removing} onClick={() => onRemove(goal.id)} variant="ghost">{removing ? <LoaderCircle className="size-4 animate-spin" /> : null} Remove</Button></div> : <Button className="mt-4 w-full" disabled={selecting} onClick={() => onSelect(goal.id)}><Target className="size-4" /> Choose this goal</Button>}
      </CardContent>
    </Card>
  );
}

function SkillMap({ detail }: { detail: GoalDetail }) {
  const grouped = useMemo(() => {
    const categories = new Map<string, GoalSkill[]>();
    for (const skill of detail.skills) categories.set(skill.category, [...(categories.get(skill.category) ?? []), skill]);
    return [...categories.entries()];
  }, [detail.skills]);
  const prerequisiteCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of detail.prerequisites) counts.set(edge.skillId, (counts.get(edge.skillId) ?? 0) + 1);
    return counts;
  }, [detail.prerequisites]);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-stretch gap-3">
        {grouped.map(([category, skills], categoryIndex) => (
          <div className="relative w-[238px] shrink-0 rounded-2xl border border-[#dfe4dc] bg-[#fafbf7] p-3" key={category}>
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#5f7068]">{category}</p>
              <span className="text-[11px] text-[#87908b]">{skills.length}</span>
            </div>
            <div className="space-y-2">
              {skills.map((skill) => (
                <article className="rounded-xl border border-[#e0e5de] bg-white p-3 shadow-[0_2px_8px_rgba(35,58,48,0.03)]" key={skill.id}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-5 text-[#263f36]">{skill.name}</p>
                    {skill.isCore && <span className="mt-1 size-2 shrink-0 rounded-full bg-[#e68049]" title="Core goal skill" />}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-[#728079]">
                    <span className="rounded-md bg-[#eef1ec] px-1.5 py-1">{prerequisiteCounts.get(skill.id) ?? 0} prereqs</span>
                    <span className="rounded-md bg-[#eef1ec] px-1.5 py-1">{skill.courses.length} course{skill.courses.length === 1 ? "" : "s"}</span>
                  </div>
                </article>
              ))}
            </div>
            {categoryIndex < grouped.length - 1 && <ArrowRight className="absolute -right-3 top-9 z-10 size-4 rounded-full bg-white text-[#92a099]" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return <div className="space-y-5" aria-label="Loading learner dashboard"><div className="h-52 animate-pulse rounded-3xl bg-[#e7ebe4]" /><div className="grid gap-4 lg:grid-cols-3">{[1, 2, 3].map((item) => <div className="h-40 animate-pulse rounded-3xl bg-[#e7ebe4]" key={item} />)}</div></div>;
}

export function DashboardPage() {
  const { accessToken, logout, refreshSession, user } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<CatalogOverview | null>(null);
  const [goalDetail, setGoalDetail] = useState<GoalDetail | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentSummary[]>([]);
  const [passport, setPassport] = useState<SkillPassport | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticOverview | null>(null);
  const [prerequisiteAnalysis, setPrerequisiteAnalysis] = useState<GoalPrerequisiteAnalysis | null>(null);
  const [learningOverview, setLearningOverview] = useState<LearningOverview | null>(null);
  const [candidateOverview, setCandidateOverview] = useState<CandidateOverview | null>(null);
  const [personalizedPath, setPersonalizedPath] = useState<PersonalizedPath | null>(null);
  const [coordinatedPlan, setCoordinatedPlan] = useState<CoordinatedLearningPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectingGoal, setSelectingGoal] = useState(false);
  const [removingGoal, setRemovingGoal] = useState(false);
  const [enrollingCourseId, setEnrollingCourseId] = useState<string | null>(null);
  const [startingDiagnostic, setStartingDiagnostic] = useState(false);
  const [coordinatingCourses, setCoordinatingCourses] = useState(false);

  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    if (!accessToken) throw new Error("The learner session is not available.");
    try { return await operation(accessToken); }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return operation(await refreshSession());
      throw requestError;
    }
  }, [accessToken, refreshSession]);

  const loadDashboard = useCallback(async () => {
    setError(null); setIsLoading(true);
    try {
      const [nextOverview, enrollmentResult, nextPassport, nextDiagnostics, nextLearning, nextCoordination] = await Promise.all([
        withSession(getCatalogOverview),
        withSession(listEnrollments),
        withSession(getSkillPassport),
        withSession(getDiagnosticOverview),
        withSession((token) => getLearningOverview(token)),
        withSession(getCoordinatedLearningPlan),
      ]);
      setOverview(nextOverview);
      setEnrollments(enrollmentResult.enrollments);
      setPassport(nextPassport);
      setDiagnostics(nextDiagnostics);
      setLearningOverview(nextLearning);
      setCoordinatedPlan(nextCoordination);
      const selected = nextOverview.goals.find((goal) => goal.isSelected);
      const primaryEnrollment = enrollmentResult.enrollments.find((enrollment) => enrollment.status !== "DROPPED");
      const [detail, analysis, candidates, coursePath] = await Promise.all([
        selected ? withSession((token) => getGoalDetail(token, selected.id)) : Promise.resolve(null),
        primaryEnrollment
          ? withSession((token) => getPrerequisiteAnalysis(token, { enrollmentId: primaryEnrollment.id }))
          : selected
            ? withSession((token) => getPrerequisiteAnalysis(token, { goalId: selected.id }))
            : Promise.resolve(null),
        primaryEnrollment
          ? withSession((token) => getCandidateOverview(token, primaryEnrollment.id))
          : Promise.resolve(null),
        primaryEnrollment
          ? withSession((token) => getPersonalizedPath(token, primaryEnrollment.id)).catch((pathError: unknown) => {
              if (pathError instanceof ApiError && pathError.status === 404) return null;
              throw pathError;
            })
          : Promise.resolve(null),
      ]);
      setGoalDetail(detail);
      setPrerequisiteAnalysis(analysis);
      setCandidateOverview(candidates);
      setPersonalizedPath(coursePath);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The learner dashboard could not be loaded.");
    } finally { setIsLoading(false); }
  }, [withSession]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const chooseGoal = async (goalId: string) => {
    setSelectingGoal(true); setError(null);
    try { await withSession((token) => selectLearnerGoal(token, goalId)); await loadDashboard(); }
    catch (selectionError) { setError(selectionError instanceof Error ? selectionError.message : "The goal could not be selected."); }
    finally { setSelectingGoal(false); }
  };

  const removeGoal = async (goalId: string) => {
    setRemovingGoal(true); setError(null);
    try { await withSession((token) => removeLearnerGoal(token, goalId)); await loadDashboard(); }
    catch (removalError) { setError(removalError instanceof Error ? removalError.message : "The goal could not be removed."); }
    finally { setRemovingGoal(false); }
  };

  const enroll = async (courseId: string) => {
    setEnrollingCourseId(courseId); setError(null);
    try {
      const activeGoal = overview?.goals.find((goal) => goal.isSelected);
      await withSession((token) => enrollInCourse(token, courseId, activeGoal?.id));
      await loadDashboard();
    } catch (enrollmentError) {
      setError(enrollmentError instanceof Error ? enrollmentError.message : "The course enrollment could not be created.");
    } finally { setEnrollingCourseId(null); }
  };

  const beginDiagnostic = async () => {
    if (!primaryEnrollment && !selectedGoal) return;
    setStartingDiagnostic(true); setError(null);
    try {
      if (diagnostics?.inProgressAttempt) {
        navigate(`/diagnostic/${diagnostics.inProgressAttempt.id}`);
        return;
      }
      const attempt = await withSession((token) => startDiagnostic(token, primaryEnrollment ? { enrollmentId: primaryEnrollment.id } : { goalId: selectedGoal!.id }));
      navigate(`/diagnostic/${attempt.id}`);
    } catch (diagnosticError) {
      setError(diagnosticError instanceof Error ? diagnosticError.message : "The diagnostic could not be started.");
    } finally { setStartingDiagnostic(false); }
  };

  const coordinateCourses = async () => {
    setCoordinatingCourses(true); setError(null);
    try {
      const result = await withSession(generateCoordinatedLearningPlan);
      setCoordinatedPlan(result.plan);
    } catch (coordinationError) {
      setError(coordinationError instanceof Error ? coordinationError.message : "The course recommendations could not be coordinated.");
    } finally { setCoordinatingCourses(false); }
  };

  const signOut = async () => { await logout(); navigate("/login", { replace: true }); };
  if (!user) return null;
  const selectedGoal = overview?.goals.find((goal) => goal.isSelected);
  const sharedSkills = goalDetail?.skills.filter((skill) => skill.courses.length > 1) ?? [];
  const activeEnrollments = enrollments.filter((enrollment) => enrollment.status !== "DROPPED");
  const primaryEnrollment = activeEnrollments[0];
  const hasLearningContext = Boolean(primaryEnrollment || selectedGoal);
  const diagnosticCompleted = Boolean(diagnostics?.latestAttempt);
  const averageMastery = passport?.summary.averageMastery;
  const lockedContextSkills = prerequisiteAnalysis?.skills.filter((skill) => skill.isContextSkill && skill.status === "LOCKED") ?? [];
  const graphIntelligenceReady = Boolean(prerequisiteAnalysis);
  const revisionSkills = passport?.skills.filter((skill) => skill.revisionDue) ?? [];
  const hasPerformanceEvidence = (passport?.summary.assessedSkills ?? 0) > 0;

  return (
    <div className="min-h-screen bg-[#f3f4ef] text-[#18372f]">
      <header className="sticky top-0 z-30 border-b border-[#dfe3da] bg-[#fbfcf8]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 sm:px-7">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[0.9rem] bg-[#163b32] text-white"><Sparkles className="size-5" /></span><div><p className="text-lg font-bold tracking-[-0.04em]">LearnPath</p><p className="hidden text-[11px] text-[#7c8782] sm:block">Adaptive learning workspace</p></div></div>
          <div className="flex items-center gap-2"><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{user.displayName}</p><p className="text-xs text-[#7a8580]">Learner</p></div><span className="grid size-9 place-items-center rounded-full bg-[#e5ede3] text-sm font-bold text-[#35614b]">{user.displayName.charAt(0).toUpperCase()}</span><Button aria-label="Sign out" className="size-9 px-0" onClick={() => void signOut()} variant="ghost"><LogOut className="size-4" /></Button></div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[210px_1fr]">
        <aside className="hidden min-h-[calc(100vh-65px)] border-r border-[#dfe3da] px-4 py-7 lg:block">
          <nav className="space-y-1 text-sm">
            <a className="flex items-center gap-3 rounded-xl bg-[#dfe9df] px-3 py-2.5 font-semibold text-[#214a3d]" href="#overview"><LayoutDashboard className="size-4" /> Overview</a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" href={activeEnrollments.length > 1 ? "#coordinated-path" : "#personalized-path"}><Sparkles className="size-4" /> Learn Next</a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" href="#path"><Route className="size-4" /> Evidence loop</a>
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" to="/prerequisites"><Network className="size-4" /> Prerequisite analysis</Link>
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" to="/learning-library"><BookOpen className="size-4" /> Learning resources</Link>
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" to="/retention"><TimerReset className="size-4" /> Retention</Link>
            {primaryEnrollment && <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" to={`/my-courses/${primaryEnrollment.id}/candidates`}><Route className="size-4" /> Candidate pool</Link>}
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" to="/synthetic-data"><FlaskConical className="size-4" /> Synthetic data lab</Link>
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" to="/feature-lab"><Fingerprint className="size-4" /> Feature intelligence</Link>
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" to="/model-evaluation"><FlaskConical className="size-4" /> Model evaluation</Link>
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" to="/recommendation-evaluation"><BarChart3 className="size-4" /> Recommendation outcomes</Link>
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" to="/governance"><ShieldCheck className="size-4" /> Model governance</Link>
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" to="/inference-lab"><BrainCircuit className="size-4" /> ML inference</Link>
            <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" href="#skill-passport"><Fingerprint className="size-4" /> Skill Passport</a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" href="#my-courses"><PlayCircle className="size-4" /> My courses</a>
            <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[#68766f] hover:bg-white" href="#courses"><BookOpen className="size-4" /> Course catalog</a>
          </nav>
          <div className="mt-8 rounded-2xl border border-[#e1ded3] bg-[#fffaf0] p-4"><BrainCircuit className="size-5 text-[#d67440]" /><p className="mt-3 text-sm font-semibold">Evidence first</p><p className="mt-2 text-xs leading-5 text-[#7a766c]">No mastery, confidence, or recommendation score appears until assessment evidence exists.</p></div>
        </aside>

        <main className="min-w-0 px-4 py-7 sm:px-7 sm:py-10 lg:px-10" id="overview">
          {isLoading && !overview ? <DashboardSkeleton /> : error && !overview ? (
            <Card className="mx-auto mt-20 max-w-lg text-center"><CardHeader><CardTitle>We could not load your learning workspace</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent><Button onClick={() => void loadDashboard()}><RefreshCw className="size-4" /> Try again</Button></CardContent></Card>
          ) : overview ? <div className="space-y-7">
            {error && <div className="rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]">{error}</div>}

            <section className="relative overflow-hidden rounded-[1.75rem] bg-[#173d33] p-6 text-white sm:p-8">
              <div className="absolute -right-24 -top-24 size-72 rounded-full bg-[#3f715d] opacity-45 blur-3xl" />
              <div className="relative grid gap-8 xl:grid-cols-[1fr_auto] xl:items-end">
                <div><Badge className="border-white/10 bg-white/10 text-[#d8e6df]" variant="outline">{primaryEnrollment ? "Current course context" : selectedGoal ? "Optional learning goal" : "Your adaptive journey starts here"}</Badge><h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{primaryEnrollment?.courseName ?? selectedGoal?.name ?? `Choose a course, ${user.displayName.split(" ")[0]}.`}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#c4d4ce] sm:text-base">{primaryEnrollment ? `LearnPath evaluates this enrollment against your one global knowledge profile${selectedGoal ? `, with ${selectedGoal.name} as an optional outcome lens` : "—no learning goal required"}.` : selectedGoal ? selectedGoal.outcome : "Enroll in any course to diagnose its skills, practice with real questions, and see prerequisite readiness update."}</p></div>
                <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center">
                  <div className="px-3 py-2"><p className="text-xl font-semibold">{overview.stats.skills}</p><p className="text-[10px] uppercase tracking-wider text-[#b9cbc4]">Skills</p></div><div className="border-x border-white/10 px-3 py-2"><p className="text-xl font-semibold">{overview.stats.prerequisiteEdges}</p><p className="text-[10px] uppercase tracking-wider text-[#b9cbc4]">Relations</p></div><div className="px-3 py-2"><p className="text-xl font-semibold">{overview.stats.courses}</p><p className="text-[10px] uppercase tracking-wider text-[#b9cbc4]">Courses</p></div>
                </div>
              </div>
            </section>

            <section className="scroll-mt-24 rounded-[1.75rem] border border-[#dce2da] bg-[#fbfcf8] p-5 sm:p-7" id="path">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Evidence-to-readiness loop</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">See knowledge become prerequisite readiness</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6d7a74]">{!hasLearningContext ? "Enroll in a course to start. Goals are optional and never own your knowledge state." : graphIntelligenceReady ? `For ${prerequisiteAnalysis!.context.name}, LearnPath found ${prerequisiteAnalysis!.summary.unlockedSkills} unlocked, ${prerequisiteAnalysis!.summary.lockedSkills} locked, and ${prerequisiteAnalysis!.summary.masteredSkills} mastered skills. Practice evidence refreshes these decisions immediately.` : "The course context is ready. Complete its diagnostic to establish the first evidence-backed skill estimates."}</p></div><Badge className="w-fit" variant={graphIntelligenceReady ? "success" : hasLearningContext ? "warning" : "outline"}>{graphIntelligenceReady ? "Readiness live" : hasLearningContext ? "Diagnostic next" : "Course needed"}</Badge></div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
                <PathStage detail={primaryEnrollment?.courseName ?? selectedGoal?.name ?? "Choose a course below."} index={1} label="Learning context" state={hasLearningContext ? "complete" : "current"} />
                <PathStage detail={diagnosticCompleted ? `${diagnostics?.latestAttempt?.correctCount ?? 0} of ${diagnostics?.latestAttempt?.questionCount ?? 0} answers correct; scored separately by skill.` : "Establish mastery and confidence from real answers."} index={2} label="Diagnostic" state={diagnosticCompleted ? "complete" : hasLearningContext ? "current" : "locked"} />
                <PathStage detail={`${passport?.summary.estimatedSkills ?? 0} estimated · ${passport?.summary.assessedStateSkills ?? 0} assessed · ${passport?.summary.verifiedSkills ?? 0} verified.`} index={3} label="Evidence state" state={diagnosticCompleted ? "complete" : hasLearningContext ? "upcoming" : "locked"} />
                <PathStage detail={graphIntelligenceReady ? `${Math.round(prerequisiteAnalysis!.summary.contextReadiness * 100)}% weighted context readiness.` : "Compare global mastery with course requirements."} index={4} label="Skill gaps" state={graphIntelligenceReady ? "complete" : "locked"} />
                <PathStage detail={graphIntelligenceReady ? `${prerequisiteAnalysis!.summary.satisfiedRequiredEdges}/${prerequisiteAnalysis!.summary.requiredEdges} required edges satisfied.` : "Evaluate required mastery thresholds."} index={5} label="Prerequisites" state={graphIntelligenceReady ? "current" : "locked"} />
                <PathStage detail={hasPerformanceEvidence ? `${passport?.summary.revisionDueSkills ?? 0} revision checks are due from real decay signals.` : "Retention begins after performance evidence exists."} index={6} label="Retention & revision" state={hasPerformanceEvidence ? (revisionSkills.length ? "current" : "upcoming") : "locked"} />
                <PathStage detail={candidateOverview ? `${candidateOverview.summary.eligibleSkills} eligible · ${candidateOverview.summary.lockedSkills} locked · ${candidateOverview.summary.excludedStrongSkills} covered.` : "Generate a course-owned, prerequisite-valid pool."} index={7} label="Candidate pool" state={candidateOverview ? (candidateOverview.summary.eligibleSkills ? "current" : "upcoming") : "locked"} />
              </div>
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#e0e4dc] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3"><span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${candidateOverview ? "bg-[#e6f2e7] text-[#347050]" : graphIntelligenceReady ? "bg-[#e6f2e7] text-[#347050]" : "bg-[#fff0e5] text-[#b45f32]"}`}>{candidateOverview ? <Route className="size-4" /> : graphIntelligenceReady ? <Network className="size-4" /> : <ClipboardCheck className="size-4" />}</span><div><p className="text-sm font-semibold">{candidateOverview ? "Candidate boundary is ready for checked ranking" : graphIntelligenceReady ? "Explore exactly why skills are locked or unlocked" : diagnostics?.inProgressAttempt ? "Your diagnostic is in progress" : "Build your first evidence profile"}</p><p className="mt-1 text-xs leading-5 text-[#6d7a74]">{candidateOverview ? "Candidate baselines remain evaluation-only. The course path sends eligible skills to ML, preserves every lock, and records the chosen Learn Next separately." : graphIntelligenceReady ? "Required dependencies enforce progression; recommended relationships remain advisory." : `Answer ${diagnostics?.assessment?.questionCount ?? 16} questions across ${diagnostics?.assessment?.skillCount ?? 8} skills. Each skill is scored independently.`}</p></div></div>
                {hasLearningContext && <div className="flex shrink-0 flex-wrap gap-2">{candidateOverview && primaryEnrollment && <Button asChild><Link to={`/my-courses/${primaryEnrollment.id}/candidates`}><Route className="size-4" /> Candidate pool</Link></Button>}{graphIntelligenceReady && <Button asChild variant={candidateOverview ? "outline" : "default"}><Link to="/prerequisites"><Network className="size-4" /> Explore graph</Link></Button>}{diagnosticCompleted && diagnostics?.latestAttempt && <Button asChild variant="outline"><Link to={`/diagnostic/${diagnostics.latestAttempt.id}`}>Review diagnostic</Link></Button>}{!diagnosticCompleted && <Button disabled={startingDiagnostic} onClick={() => void beginDiagnostic()}>{startingDiagnostic ? <LoaderCircle className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}{diagnostics?.inProgressAttempt ? "Resume diagnostic" : "Start course diagnostic"}</Button>}</div>}
              </div>
              {!diagnosticCompleted && <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#f0f2ed] px-4 py-3 text-xs leading-5 text-[#69766f]"><LockKeyhole className="size-4 shrink-0 text-[#78857e]" />Later stages stay locked until the required learner evidence exists.</div>}
            </section>

            {activeEnrollments.length > 1 && coordinatedPlan && <CoordinatedLearnNext generating={coordinatingCourses} onGenerate={() => void coordinateCourses()} plan={coordinatedPlan} />}

            {primaryEnrollment && activeEnrollments.length <= 1 && <section className="scroll-mt-24 overflow-hidden rounded-[1.9rem] border border-[#d7ddd5] bg-white" id="personalized-path"><div className="grid xl:grid-cols-[1.16fr_.84fr]">{personalizedPath ? <><div className="relative overflow-hidden bg-[#173d33] p-6 text-white sm:p-9"><div className="absolute -right-20 -top-20 size-72 rounded-full bg-[#4e7c69]/35 blur-3xl" /><div className="relative"><div className="flex flex-wrap gap-2"><Badge className="border-white/10 bg-white/10 text-[#ffd0b2]" variant="outline"><Sparkles className="mr-1 size-3.5" /> Learn Next</Badge><Badge className="border-[#91bd9d]/30 bg-[#6ca67c]/15 text-[#d7efdc]" variant="outline"><ShieldCheck className="mr-1 size-3.5" /> Graph valid</Badge></div><h2 className="mt-6 text-4xl font-semibold tracking-[-.05em] sm:text-5xl">{personalizedPath.learnNext?.name ?? "Course knowledge covered"}</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-[#c2d3cc]">{personalizedPath.learnNext?.explanation ?? "The saved path contains recognized knowledge and locked future work, with no fabricated recommendation."}</p><div className="mt-7 flex flex-wrap gap-3"><Button asChild className="bg-[#ef915c] text-[#173d33] hover:bg-[#f3a579]"><Link to={`/my-courses/${primaryEnrollment.id}/path`}><PlayCircle className="size-4" /> Open personalized path</Link></Button><Button asChild className="border-white/15 bg-white/5 text-white hover:bg-white/10" variant="outline"><Link to={`/my-courses/${primaryEnrollment.id}/candidates`}>Inspect candidates</Link></Button></div></div></div><div className="p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#d06f3d]">Live path snapshot</p><h3 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Why this is personal</h3><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#f2f6ef] p-4"><BrainCircuit className="size-5 text-[#44745b]" /><p className="mt-4 text-2xl font-semibold">{personalizedPath.learnNext?.benefitProbability === null || personalizedPath.learnNext?.benefitProbability === undefined ? "—" : `${Math.round(personalizedPath.learnNext.benefitProbability * 100)}%`}</p><p className="text-[11px] text-[#738078]">Predicted benefit</p></div><div className="rounded-2xl bg-[#f2f6ef] p-4"><Fingerprint className="size-5 text-[#44745b]" /><p className="mt-4 text-2xl font-semibold">{personalizedPath.summary.recognizedFromGlobalMastery}</p><p className="text-[11px] text-[#738078]">Recognized</p></div><div className="rounded-2xl bg-[#fff4eb] p-4"><TimerReset className="size-5 text-[#c36b3d]" /><p className="mt-4 text-2xl font-semibold">{personalizedPath.summary.revisions}</p><p className="text-[11px] text-[#7b7069]">Revisions</p></div><div className="rounded-2xl bg-[#f0f1ed] p-4"><LockKeyhole className="size-5 text-[#7b8780]" /><p className="mt-4 text-2xl font-semibold">{personalizedPath.summary.locked}</p><p className="text-[11px] text-[#748078]">Not scored</p></div></div><p className="mt-4 text-[11px] leading-5 text-[#78837d]">Saved with {personalizedPath.provenance.modelVersion} · path v{personalizedPath.pathVersion}</p></div></> : <><div className="p-6 sm:p-9"><Badge variant="warning"><BrainCircuit className="mr-1 size-3.5" /> Ranking ready</Badge><h2 className="mt-5 text-4xl font-semibold tracking-[-.05em]">Make the next skill unmistakable.</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-[#69766f]">Generate one course-owned path from live global mastery, retention, prerequisite locks, and checked benefit probabilities. No hardcoded score and no ML fallback.</p><Button asChild className="mt-6"><Link to={`/my-courses/${primaryEnrollment.id}/path`}><Sparkles className="size-4" /> Build personalized path</Link></Button></div><div className="bg-[#173d33] p-6 text-white sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f0a06e]">Visible intelligence</p><div className="mt-5 space-y-3">{[[Check, "Completed knowledge"], [CircleDot, "Current"], [Sparkles, "Recommended next"], [Unlock, "Upcoming"], [LockKeyhole, "Locked—not ranked"]].map(([Icon, label]) => { const Visual = Icon as typeof Check; return <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.055] p-3" key={String(label)}><span className="grid size-8 place-items-center rounded-lg bg-white/10"><Visual className="size-3.5" /></span><p className="text-sm font-semibold">{String(label)}</p></div>; })}</div></div></>}</div></section>}

            {candidateOverview && primaryEnrollment && <section className="overflow-hidden rounded-[1.75rem] border border-[#dce2da] bg-white" id="candidates"><div className="grid lg:grid-cols-[0.82fr_1.18fr]"><div className="bg-[#173d33] p-5 text-white sm:p-7"><div className="flex items-center gap-2 text-[#f2a06d]"><Route className="size-5" /><p className="text-xs font-bold uppercase tracking-[0.15em]">Candidate intelligence</p></div><p className="mt-5 text-4xl font-semibold">{candidateOverview.summary.eligibleSkills}</p><p className="mt-2 text-xs text-[#bcd0c7]">Skills may enter a later ranking stage</p><div className="mt-5 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-white/10 bg-white/[0.06] p-3"><p className="font-semibold">{candidateOverview.summary.revisionCandidates}</p><p className="mt-1 text-[10px] text-[#aebfb8]">Revision</p></div><div className="rounded-xl border border-white/10 bg-white/[0.06] p-3"><p className="font-semibold">{candidateOverview.summary.supportingCandidates}</p><p className="mt-1 text-[10px] text-[#aebfb8]">Supporting</p></div><div className="rounded-xl border border-white/10 bg-white/[0.06] p-3"><p className="font-semibold">{candidateOverview.summary.lockedSkills}</p><p className="mt-1 text-[10px] text-[#aebfb8]">Locked</p></div></div><div className="mt-5 rounded-xl border border-white/10 bg-white/[0.06] p-4 text-xs leading-5 text-[#bfd0c9]">Course ownership: {candidateOverview.context.courseName}. Global knowledge is reused; course progress remains independent.</div></div><div className="p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Eligible pool preview · not ranked</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">What the system may consider next</h2><p className="mt-2 text-sm leading-6 text-[#6d7a74]">Curriculum order is shown here only for stable presentation. Open the full view to compare the two evaluation baselines and inspect every exclusion.</p></div><GitBranch className="size-5 text-[#477661]" /></div><div className="mt-5 space-y-2">{candidateOverview.candidates.eligible.slice(0, 3).map((skill) => <div className="flex items-center justify-between gap-4 rounded-xl border border-[#e0e5dd] bg-[#fafbf8] p-3" key={skill.id}><div><div className="flex flex-wrap gap-1.5"><Badge variant={skill.kind === "REVISION" ? "warning" : "success"}>{skill.kind.toLowerCase().replaceAll("_", " ")}</Badge>{skill.masteryGap === null && <Badge variant="outline">mastery unknown</Badge>}</div><p className="mt-2 text-sm font-semibold">{skill.name}</p><p className="mt-1 line-clamp-1 text-xs text-[#738078]">{skill.eligibilityExplanation}</p></div><ChevronRight className="size-4 shrink-0 text-[#89958f]" /></div>)}</div>{candidateOverview.candidates.eligible.length === 0 && <div className="mt-5 rounded-xl bg-[#f0f3ed] p-4 text-sm text-[#65736c]">No skill is currently eligible. The locked pool explains which prerequisite evidence must change.</div>}<Button asChild className="mt-5"><Link to={`/my-courses/${primaryEnrollment.id}/candidates`}>Open candidate intelligence <ArrowRight className="size-4" /></Link></Button></div></div></section>}

            <section className="overflow-hidden rounded-[1.75rem] border border-[#dce2da] bg-white">
              <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
                <div className="p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Learning resources & activity</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Study behavior the system can actually observe</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6d7a74]">Resources are mapped to global skills and reused across course contexts. Starts, completions, skips, and elapsed study time come from the backend activity stream.</p></div><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e7efe5] text-[#35624f]"><BookOpen className="size-5" /></span></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-[#f4f6f1] p-4"><p className="text-2xl font-semibold">{learningOverview?.summary.availableResources ?? 0}</p><p className="mt-1 text-[11px] text-[#738079]">Available</p></div><div className="rounded-2xl bg-[#f4f6f1] p-4"><p className="text-2xl font-semibold">{learningOverview?.summary.skillsCovered ?? 0}</p><p className="mt-1 text-[11px] text-[#738079]">Skills covered</p></div><div className="rounded-2xl bg-[#f4f6f1] p-4"><p className="text-2xl font-semibold">{learningOverview?.summary.completedResources ?? 0}</p><p className="mt-1 text-[11px] text-[#738079]">Completed</p></div><div className="rounded-2xl bg-[#f4f6f1] p-4"><p className="text-2xl font-semibold">{learningOverview?.summary.eventsRecorded ?? 0}</p><p className="mt-1 text-[11px] text-[#738079]">Recent events</p></div></div><Button asChild className="mt-5"><Link to="/learning-library">Open learning studio <ArrowRight className="size-4" /></Link></Button></div>
                <div className="border-t border-[#dce2da] bg-[#fffaf1] p-5 sm:p-7 lg:border-l lg:border-t-0"><div className="flex items-center gap-2 text-[#d06f3d]"><CircleDot className="size-5" /><p className="text-xs font-bold uppercase tracking-[0.15em]">Intelligence boundary</p></div><h3 className="mt-5 text-xl font-semibold tracking-[-0.025em]">Graph first. ML second.</h3><p className="mt-3 text-sm leading-6 text-[#756f65]">Phase 16 ranks only prerequisite-eligible skills with the checked 55-feature model contract. Locked skills stay visible and unscored; unavailable inference fails explicitly.</p><div className="mt-5 space-y-2 text-xs"><div className="flex items-center justify-between rounded-xl border border-[#e8dfd0] bg-white/70 px-3 py-2.5"><span className="text-[#776f64]">Candidate generation</span><Badge variant="success">Live</Badge></div><div className="flex items-center justify-between rounded-xl border border-[#e8dfd0] bg-white/70 px-3 py-2.5"><span className="text-[#776f64]">Offline evaluation</span><Button asChild className="h-7 px-2 text-[11px]" variant="outline"><Link to="/model-evaluation">Measured metrics</Link></Button></div><div className="flex items-center justify-between rounded-xl border border-[#e8dfd0] bg-white/70 px-3 py-2.5"><span className="text-[#776f64]">Probability inference</span><Button asChild className="h-7 px-2 text-[11px]" variant="outline"><Link to="/inference-lab">Open live lab</Link></Button></div><div className="flex items-center justify-between rounded-xl border border-[#e8dfd0] bg-white/70 px-3 py-2.5"><span className="text-[#776f64]">Course-specific path</span><Badge variant={personalizedPath ? "success" : "outline"}>{personalizedPath ? "Live" : "Ready"}</Badge></div></div></div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[1.75rem] border border-[#dce2da] bg-white">
              <div className="grid lg:grid-cols-[0.92fr_1.08fr]">
                <div className="bg-[#173d33] p-5 text-white sm:p-7"><div className="flex items-center gap-2 text-[#f2a06d]"><ShieldCheck className="size-5" /><p className="text-xs font-bold uppercase tracking-[0.15em]">Retention health</p></div><p className="mt-5 text-4xl font-semibold">{passport?.summary.averageRetention === null || passport?.summary.averageRetention === undefined ? "—" : `${Math.round(passport.summary.averageRetention * 100)}%`}</p><p className="mt-2 text-xs text-[#bcd0c7]">Average retained knowledge across assessed skills</p><div className="mt-5 grid grid-cols-2 gap-2"><div className="rounded-xl border border-white/10 bg-white/[0.06] p-3"><p className="text-xl font-semibold">{passport?.summary.strongRetentionSkills ?? 0}</p><p className="mt-1 text-[10px] text-[#aebfb8]">Strong</p></div><div className="rounded-xl border border-white/10 bg-white/[0.06] p-3"><p className="text-xl font-semibold">{passport?.summary.revisionDueSkills ?? 0}</p><p className="mt-1 text-[10px] text-[#aebfb8]">Revision due</p></div></div></div>
                <div className="p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Forgetting made visible</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Protect knowledge before it fades</h2><p className="mt-2 text-sm leading-6 text-[#6d7a74]">Retention decays from the latest validated answer. Mastery remains historical, while revision checks create new immutable evidence.</p></div><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#fff0e7] text-[#af5834]"><AlarmClock className="size-5" /></span></div>{revisionSkills.length ? <div className="mt-5 space-y-2">{revisionSkills.slice(0, 3).map((skill) => <div className="flex items-center justify-between gap-3 rounded-xl border border-[#ead8cf] bg-[#fffaf6] p-3" key={skill.id}><div><p className="text-sm font-semibold">{skill.name}</p><p className="mt-1 text-xs text-[#7b706a]">Retention {skill.retention === null ? "unknown" : `${Math.round(skill.retention * 100)}%`} · mastery {skill.mastery === null ? "unknown" : `${Math.round(skill.mastery * 100)}%`}</p></div><Badge variant="warning">Review</Badge></div>)}</div> : <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#edf5ec] p-4 text-sm text-[#3b6851]"><ShieldCheck className="size-4" />No previously mastered skill currently needs revision.</div>}<Button asChild className="mt-5"><Link to="/retention"><TimerReset className="size-4" /> Open retention intelligence</Link></Button></div>
              </div>
            </section>

            <section className="scroll-mt-24" id="skill-passport">
              <div className="overflow-hidden rounded-[1.75rem] border border-[#dce2da] bg-white">
                <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="p-5 sm:p-7">
                    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Global Skill Passport</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">One knowledge profile across every course</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6d7a74]">Course and goal contexts create one reusable state per skill. Unknown evidence stays visibly unknown—never treated as zero mastery.</p></div><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e7efe5] text-[#35624f]"><Fingerprint className="size-5" /></span></div>
                    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-[#f4f6f1] p-4"><p className="text-2xl font-semibold">{passport?.summary.trackedSkills ?? 0}</p><p className="mt-1 text-[11px] text-[#738079]">Tracked skills</p></div>
                      <div className="rounded-2xl bg-[#f4f6f1] p-4"><p className="text-2xl font-semibold">{passport?.summary.assessedSkills ?? 0}</p><p className="mt-1 text-[11px] text-[#738079]">Assessed</p></div>
                      <div className="rounded-2xl bg-[#f4f6f1] p-4"><p className="text-2xl font-semibold">{passport?.summary.sharedAcrossCourses ?? 0}</p><p className="mt-1 text-[11px] text-[#738079]">Cross-course</p></div>
                      <div className="rounded-2xl bg-[#f4f6f1] p-4"><p className="text-2xl font-semibold">{passport?.summary.evidenceCoverage ?? 0}%</p><p className="mt-1 text-[11px] text-[#738079]">Evidence coverage</p></div>
                    </div>
                    <Button asChild className="mt-5"><Link to="/skill-passport">Open Skill Passport <ArrowRight className="size-4" /></Link></Button>
                  </div>
                  <div className="border-t border-[#dce2da] bg-[#173d33] p-5 text-white sm:p-7 lg:border-l lg:border-t-0">
                    <div className="flex items-center gap-2 text-[#f2a06d]"><Layers3 className="size-5" /><p className="text-xs font-bold uppercase tracking-[0.15em]">Verified reuse</p></div>
                    <p className="mt-5 text-xl font-semibold tracking-[-0.025em]">{passport?.summary.sharedAcrossCourses ? `${passport.summary.sharedAcrossCourses} skills already span multiple enrollments.` : "Enroll in overlapping courses to reveal shared skill identities."}</p>
                    <p className="mt-3 text-sm leading-6 text-[#bfd0c9]">The same database record follows the learner wherever that skill appears. Completing a module still does not manufacture knowledge evidence.</p>
                    <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.06] p-4"><div className="flex items-center justify-between gap-3 text-xs"><span className="text-[#bfd0c9]">Mastery source</span><Badge className="border-white/10 bg-white/10 text-white" variant="outline">{diagnosticCompleted ? "Diagnostic evidence live" : "Diagnostic pending"}</Badge></div></div>
                  </div>
                </div>
              </div>
            </section>

            <section className="scroll-mt-24" id="my-courses">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5d776b]">Independent course progress</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Active enrolled courses</h2><p className="mt-2 text-sm text-[#6d7a74]">Course completion is tracked separately for each enrollment and never overwrites global skill knowledge.</p></div>
                <Badge variant="outline">{activeEnrollments.length} enrolled</Badge>
              </div>
              {activeEnrollments.length ? <div className="grid gap-4 lg:grid-cols-2">
                {activeEnrollments.map((enrollment) => (
                  <Card className="overflow-hidden" key={enrollment.id}>
                    <CardContent className="p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-4"><div><Badge variant={enrollment.status === "ACTIVE" ? "success" : "outline"}>{enrollment.status.toLowerCase()}</Badge><h3 className="mt-3 text-lg font-semibold">{enrollment.courseName}</h3><p className="mt-1 text-xs text-[#75817b]">{enrollment.learningGoalName ? `Supports ${enrollment.learningGoalName}` : "Independent course enrollment"}</p></div><span className="grid size-11 place-items-center rounded-2xl bg-[#e9f0e7] text-[#35624f]"><TrendingUp className="size-5" /></span></div>
                      <div className="mt-5 flex items-center justify-between text-xs"><span className="font-semibold text-[#4f6259]">{enrollment.completedModules} of {enrollment.totalModules} modules</span><span className="font-bold text-[#2f674f]">{enrollment.progressPercentage}%</span></div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e8ece6]"><div className="h-full rounded-full bg-[#3f8064] transition-all" style={{ width: `${enrollment.progressPercentage}%` }} /></div>
                      <Button asChild className="mt-5 w-full"><Link to={`/my-courses/${enrollment.id}`}><PlayCircle className="size-4" /> Open course workspace</Link></Button>
                    </CardContent>
                  </Card>
                ))}
              </div> : <div className="grid min-h-48 place-items-center rounded-[1.5rem] border border-dashed border-[#cad4ca] bg-[#fafbf7] p-8 text-center"><div><BookOpen className="mx-auto size-7 text-[#7e8d85]" /><p className="mt-3 font-semibold">No active course enrollments yet</p><p className="mt-2 text-sm text-[#748078]">Choose one or more courses below. Each course will keep its own module progress.</p><Button asChild className="mt-4" variant="outline"><a href="#courses">Browse courses</a></Button></div></div>}
            </section>

            <section><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5d776b]">Optional learning goals</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Add an outcome lens when it helps</h2><p className="mt-2 text-sm text-[#6d7a74]">Goals can shape a future path, but enrollment, assessment, practice, and the Skill Passport work without one.</p></div><span className="hidden text-sm text-[#7a8580] sm:block">{overview.goals.length} goal options</span></div><div className="grid gap-4 md:grid-cols-3">{overview.goals.map((goal) => <GoalCard goal={goal} key={goal.id} onRemove={(id) => void removeGoal(id)} onSelect={(id) => void chooseGoal(id)} removing={removingGoal} selecting={selectingGoal} />)}</div></section>

            <section className="scroll-mt-24 rounded-[1.75rem] border border-[#dce2da] bg-white p-5 sm:p-7" id="skill-map">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Prerequisite knowledge graph</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">{prerequisiteAnalysis ? `${prerequisiteAnalysis.context.name} readiness map` : "Enroll in a course to reveal its readiness map"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6d7a74]">Required relationships enforce mastery thresholds using the global Skill Passport. Recommended relationships remain visible but never block progression.</p></div>{prerequisiteAnalysis && <div className="flex gap-2"><Badge variant="outline">{prerequisiteAnalysis.summary.contextSkills} context skills</Badge><Badge variant="outline">{prerequisiteAnalysis.summary.requiredEdges} required edges</Badge></div>}</div>
              {prerequisiteAnalysis && <div className="mb-6 grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
                <div className="rounded-2xl bg-[#173d33] p-5 text-white"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#f0a06e]">{prerequisiteAnalysis.context.type === "COURSE" ? "Course" : "Goal"} readiness</p><p className="mt-2 text-4xl font-semibold">{Math.round(prerequisiteAnalysis.summary.contextReadiness * 100)}%</p></div><span className="grid size-12 place-items-center rounded-2xl bg-white/10"><Network className="size-5" /></span></div><p className="mt-4 text-xs leading-5 text-[#bfd0c9]">Weighted progress toward this context’s skill thresholds—not a fabricated recommendation score.</p><div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-center"><div><p className="font-semibold text-[#cfe7d5]">{prerequisiteAnalysis.summary.masteredSkills}</p><p className="text-[10px] text-[#9fb5ad]">Mastered</p></div><div><p className="font-semibold text-[#ffd1af]">{prerequisiteAnalysis.summary.unlockedSkills}</p><p className="text-[10px] text-[#9fb5ad]">Unlocked</p></div><div><p className="font-semibold text-[#e7c1b1]">{prerequisiteAnalysis.summary.lockedSkills}</p><p className="text-[10px] text-[#9fb5ad]">Locked</p></div></div></div>
                <div className="rounded-2xl border border-[#e0e5dd] bg-[#fafbf8] p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">Missing prerequisite explanations</p><p className="mt-1 text-xs text-[#75817b]">The most immediate locked skills from the real graph.</p></div><Button asChild className="h-9 px-3"><Link to="/prerequisites">Full analysis <ArrowRight className="size-4" /></Link></Button></div>{lockedContextSkills.length ? <div className="mt-4 space-y-2">{lockedContextSkills.slice(0, 3).map((skill) => <div className="flex items-start justify-between gap-3 rounded-xl border border-[#ead8cf] bg-white p-3" key={skill.id}><div><p className="text-sm font-semibold">{skill.name}</p><p className="mt-1 text-xs leading-5 text-[#7a706b]">Needs {skill.missingPrerequisites.slice(0, 2).map((item) => `${item.prerequisiteSkillName} ${item.currentMastery === null ? "unknown" : `${Math.round(item.currentMastery * 100)}%`}/${Math.round(item.requiredMastery * 100)}%`).join(" · ")}</p></div><LockKeyhole className="mt-0.5 size-4 shrink-0 text-[#a55a3c]" /></div>)}</div> : <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#edf5ec] p-4 text-sm text-[#3b6851]"><Unlock className="size-4" />No context skill is currently blocked.</div>}</div>
              </div>}
              {goalDetail ? <SkillMap detail={goalDetail} /> : prerequisiteAnalysis ? <div className="flex min-h-40 items-center justify-between gap-4 rounded-2xl border border-[#dce2da] bg-[#f7faf5] p-6"><div><p className="font-semibold">Course graph is live</p><p className="mt-2 text-sm text-[#6f7d75]">Open the full analysis to inspect every course skill, supporting prerequisite, threshold, and cross-course recognition.</p></div><Button asChild><Link to="/prerequisites">Inspect graph <ArrowRight className="size-4" /></Link></Button></div> : <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-[#cfd7ce] bg-[#fafbf7] p-8 text-center"><div><Compass className="mx-auto size-7 text-[#829088]" /><p className="mt-3 font-semibold">The map needs a course context</p><p className="mt-2 text-sm text-[#7a8580]">Enroll in a course below. A learning goal is optional.</p></div></div>}
            </section>

            {(goalDetail || prerequisiteAnalysis) && <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <Card><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>Cross-course knowledge reuse</CardTitle><CardDescription>One skill identity can satisfy requirements in every course that references it.</CardDescription></div><GitBranch className="size-5 text-[#d67541]" /></div></CardHeader><CardContent>{sharedSkills.length ? <div className="grid gap-2 sm:grid-cols-2">{sharedSkills.slice(0, 8).map((skill) => <div className="rounded-xl border border-[#e1e6df] bg-[#fafbf8] p-3" key={skill.id}><p className="text-sm font-semibold">{skill.name}</p><p className="mt-1 text-xs leading-5 text-[#738078]">Shared by {skill.courses.map((course) => course.courseName).join(" · ")}</p></div>)}</div> : <p className="text-sm text-[#748078]">{passport?.summary.sharedAcrossCourses ? `${passport.summary.sharedAcrossCourses} global skills are recognized across active enrollments. Open the Skill Passport for their course contexts.` : "Enroll in overlapping courses to demonstrate knowledge reuse."}</p>}</CardContent></Card>
              <Card className="bg-[#fffaf1]"><CardHeader><CircleDot className="mb-2 size-5 text-[#d5743f]" /><CardTitle>Current evidence state</CardTitle><CardDescription>{passport?.summary.assessedSkills ? `${passport.summary.assessedSkills} skills have real performance evidence.` : "Knowledge remains unknown until diagnostic or practice evidence exists."}</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center justify-between border-t border-[#ece3d4] pt-3"><span className="text-[#756f65]">Average mastery</span><Badge variant={averageMastery === null || averageMastery === undefined ? "outline" : "success"}>{averageMastery === null || averageMastery === undefined ? "Not assessed" : `${Math.round(averageMastery * 100)}%`}</Badge></div><div className="flex items-center justify-between border-t border-[#ece3d4] pt-3"><span className="text-[#756f65]">Context readiness</span><Badge variant={graphIntelligenceReady ? "success" : "outline"}>{prerequisiteAnalysis ? `${Math.round(prerequisiteAnalysis.summary.contextReadiness * 100)}%` : "No context"}</Badge></div><div className="flex items-center justify-between border-t border-[#ece3d4] pt-3"><span className="text-[#756f65]">Prerequisite state</span><Badge variant="outline">{prerequisiteAnalysis ? `${prerequisiteAnalysis.summary.unlockedSkills} unlocked · ${prerequisiteAnalysis.summary.lockedSkills} locked` : "Not evaluated"}</Badge></div><div className="flex items-center justify-between border-t border-[#ece3d4] pt-3"><span className="text-[#756f65]">Candidate pool</span><Badge variant={candidateOverview ? "success" : "outline"}>{candidateOverview ? `${candidateOverview.summary.eligibleSkills} eligible` : "Not generated"}</Badge></div><div className="flex items-center justify-between border-t border-[#ece3d4] pt-3"><span className="text-[#756f65]">Benefit inference</span><Badge variant="success">Available</Badge></div><div className="flex items-center justify-between border-t border-[#ece3d4] pt-3"><span className="text-[#756f65]">Course path ranking</span><Badge variant="outline">Phase 16</Badge></div></CardContent></Card>
            </section>}

            <section id="courses"><div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5d776b]">Connected curriculum</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Courses using the global skill graph</h2><p className="mt-2 text-sm text-[#6d7a74]">Enroll in several courses at once. Shared skill identities remain global while each course keeps independent progress.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{overview.courses.map((course) => {
              const existing = enrollments.find((enrollment) => enrollment.courseId === course.id);
              return <Card key={course.id}><CardContent className="flex h-full flex-col p-5"><span className="grid size-10 place-items-center rounded-xl bg-[#e9f0e7] text-[#35624f]"><GraduationCap className="size-5" /></span><Badge className="mt-5 w-fit" variant={existing ? "success" : "outline"}>{existing ? "Enrolled" : course.level.toLowerCase()}</Badge><h3 className="mt-3 min-h-12 text-base font-semibold leading-6">{course.name}</h3><p className="mt-2 line-clamp-2 text-xs leading-5 text-[#738078]">{course.description}</p><div className="mt-4 flex items-center justify-between border-t border-[#e4e8e2] pt-4 text-xs text-[#6c7973]"><span>{course.moduleCount} modules</span><span>{course.skillCount} skills</span></div><p className="mt-2 flex items-center gap-1.5 text-xs text-[#7a8580]"><Clock3 className="size-3.5" /> {course.estimatedHours} estimated hours</p>{existing ? <Button asChild className="mt-4 w-full" variant="outline"><Link to={`/my-courses/${existing.id}`}>Open course <ArrowRight className="size-4" /></Link></Button> : <Button className="mt-4 w-full" disabled={enrollingCourseId !== null} onClick={() => void enroll(course.id)}>{enrollingCourseId === course.id ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Enroll</Button>}</CardContent></Card>;
            })}</div></section>
          </div> : null}
        </main>
      </div>
    </div>
  );
}
