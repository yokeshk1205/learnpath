import {
  ArrowRight, BarChart3, BookOpen, Check, Circle, Clock3, Compass, Fingerprint, GraduationCap,
  LoaderCircle, LockKeyhole, Play, PlayCircle, RefreshCw,
  Search, ShieldCheck, Sparkles, Target, TimerReset, UserRoundCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { getCatalogOverview, type CatalogOverview } from "../catalog/api";
import { LearnerAppShell } from "../components/LearnerAppShell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { CoordinatedLearnNext } from "../components/CoordinatedLearnNext";
import { getDiagnosticOverview, type DiagnosticOverview } from "../diagnostics/api";
import { listEnrollments, type EnrollmentSummary } from "../enrollments/api";
import { getSkillPassport, type LearnerSkillState, type SkillPassport } from "../learner-skills/api";
import { getLearningOverview, type LearningResourceSummary } from "../learning/api";
import {
  generateCoordinatedLearningPlan,
  getCoordinatedLearningPlan,
  getPersonalizedPath,
  type CoordinatedLearningPlan,
  type PersonalizedPath,
} from "../paths/api";

type CoursePaths = Record<string, PersonalizedPath | null>;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function masteryLabel(skill: LearnerSkillState): string {
  if (skill.mastery === null) return "Not assessed";
  if (skill.mastery >= 0.8) return "Strong";
  if (skill.mastery >= 0.5) return "Developing";
  return "Just starting";
}

function nextReason(path: PersonalizedPath): string {
  const next = path.learnNext;
  if (!next) return "You have no recommended lesson waiting right now.";
  if (next.revisionDue) return `A short review will help keep ${next.name} available when you need it.`;
  const unlocks = path.items.filter((item) => item.missingPrerequisites.some((prerequisite) => prerequisite.prerequisiteSkillId === next.skillId));
  if (unlocks.length > 1) return `This foundation helps unlock ${unlocks.length} upcoming skills in ${path.context.courseName}.`;
  if (unlocks.length === 1) return `This is the foundation you need before ${unlocks[0]!.name}.`;
  if (next.candidateKind === "SUPPORTING_PREREQUISITE") return "This foundation prepares you for the next concepts in your course.";
  return "Your current skills show that you are ready to build this next.";
}

function DashboardSkeleton() {
  return <div className="space-y-5" aria-label="Loading your learning dashboard"><div className="h-72 animate-pulse rounded-[2rem] bg-[#e4e8e1]" /><div className="grid gap-4 md:grid-cols-2"><div className="h-52 animate-pulse rounded-3xl bg-[#e4e8e1]" /><div className="h-52 animate-pulse rounded-3xl bg-[#e4e8e1]" /></div></div>;
}

function LearnerJourney({
  diagnosticComplete,
  hasEnrollment,
  pathReady,
}: {
  diagnosticComplete: boolean;
  hasEnrollment: boolean;
  pathReady: boolean;
}) {
  const currentStep = !hasEnrollment ? 0 : !diagnosticComplete ? 1 : !pathReady ? 2 : 3;
  const steps = [
    { label: "Choose course", detail: "Your subject" },
    { label: "Knowledge check", detail: "Find your level" },
    { label: "Personalized path", detail: "See your route" },
    { label: "Learn & improve", detail: "Repeat and adapt" },
  ];

  return (
    <section aria-label="Your learning journey" className="overflow-hidden rounded-2xl border border-[#dce3da] bg-white shadow-[0_10px_30px_rgba(33,58,49,.05)]">
      <div className="flex items-center justify-between border-b border-[#e7ebe5] px-4 py-3 sm:px-5">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#6c7973]">Your learning flow</p>
        <p className="text-xs font-semibold text-[#b65f35]">Step {currentStep + 1} of {steps.length}</p>
      </div>
      <ol className="grid grid-cols-2 sm:grid-cols-4">
        {steps.map((step, index) => {
          const complete = index < currentStep;
          const current = index === currentStep;
          return (
            <li className={`relative flex items-center gap-3 border-[#e7ebe5] px-4 py-4 sm:border-r sm:last:border-r-0 ${current ? "bg-[#fff7ef]" : "bg-white"}`} key={step.label}>
              <span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${complete ? "bg-[#dcebdd] text-[#356b50]" : current ? "bg-[#e9844d] text-white" : "border border-[#d8ded7] text-[#89948e]"}`}>
                {complete ? <Check className="size-4" /> : index + 1}
              </span>
              <span className="min-w-0"><span className={`block truncate text-xs font-semibold ${current ? "text-[#9d4f29]" : "text-[#3f4c46]"}`}>{step.label}</span><span className="mt-0.5 block truncate text-[10px] text-[#7d8882]">{step.detail}</span></span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DashboardPathPreview({ enrollmentId, path }: { enrollmentId: string; path: PersonalizedPath }) {
  const recognized = path.items.filter((item) => item.lane === "RECOGNIZED").slice(-2);
  const current = path.items.filter((item) => item.lane === "CURRENT").slice(0, 1);
  const upcoming = path.items.filter((item) => item.lane === "UPCOMING").slice(0, 2);
  const locked = path.items.filter((item) => item.lane === "LOCKED").slice(0, 1);
  const preview = [
    ...recognized.map((item) => ({ item, label: "Already know", tone: "known" })),
    ...current.map((item) => ({ item, label: "In progress", tone: "current" })),
    ...(path.learnNext ? [{ item: path.learnNext, label: path.status === "STALE" ? "Needs update" : "Learn next", tone: "next" }] : []),
    ...upcoming.map((item) => ({ item, label: "Coming up", tone: "upcoming" })),
    ...locked.map((item) => ({ item, label: "Building toward", tone: "locked" })),
  ].filter((entry, index, entries) => entries.findIndex((candidate) => candidate.item.skillId === entry.item.skillId) === index).slice(0, 5);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-[#dce3da] bg-white shadow-[0_18px_55px_rgba(33,58,49,.07)]" aria-label="Personalized path preview">
      <div className="flex flex-col gap-4 border-b border-[#e5e9e3] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[#c86b3c]"><Sparkles className="size-3.5" /> Your adaptive path</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">See exactly where you are going</h2>
          <p className="mt-1 text-sm text-[#718078]">{path.context.courseName} · updated from your real learning evidence</p>
        </div>
        <Button asChild variant="outline"><Link to={`/my-courses/${enrollmentId}/path`}>Open full path <ArrowRight className="size-4" /></Link></Button>
      </div>
      <div className="relative overflow-x-auto px-5 py-6 sm:px-7">
        <div className="absolute left-12 right-12 top-[4.15rem] hidden h-px bg-[#d8dfd7] sm:block" />
        <ol className="relative grid min-w-[720px] gap-3" aria-label="Completed, current, recommended, upcoming, and locked skills" style={{ gridTemplateColumns: `repeat(${Math.max(preview.length, 1)}, minmax(132px, 1fr))` }}>
          {preview.map(({ item, label, tone }, index) => {
            const next = tone === "next";
            const known = tone === "known";
            const isLocked = tone === "locked";
            return (
              <li className={`relative rounded-2xl border p-4 ${next ? "border-[#e9844d] bg-[#fff6ef] shadow-[0_10px_30px_rgba(221,119,61,.13)]" : known ? "border-[#c9ddcc] bg-[#f5faf4]" : isLocked ? "border-[#e0e3df] bg-[#f5f6f3]" : "border-[#dfe5de] bg-white"}`} key={`${item.skillId}-${index}`}>
                <div className="flex items-center gap-2">
                  <span className={`grid size-8 place-items-center rounded-full ${next ? "bg-[#e9844d] text-white" : known ? "bg-[#dcebdd] text-[#367054]" : isLocked ? "bg-[#e4e6e2] text-[#818b86]" : "bg-[#e7eee6] text-[#47735e]"}`}>
                    {known ? <Check className="size-4" /> : next ? <Sparkles className="size-4" /> : isLocked ? <LockKeyhole className="size-3.5" /> : <Circle className="size-3.5" />}
                  </span>
                  <span className={`text-[10px] font-bold uppercase tracking-[.12em] ${next ? "text-[#b95f31]" : "text-[#78847e]"}`}>{label}</span>
                </div>
                <p className="mt-4 line-clamp-2 min-h-10 text-sm font-semibold leading-5">{item.name}</p>
                <div className="mt-3 flex items-center justify-between text-[10px] text-[#7b8680]"><span>{item.module?.name ?? "Course skill"}</span><span>{item.mastery === null ? "New" : `${Math.round(item.mastery * 100)}%`}</span></div>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#e5e9e3] bg-[#fafbf8] px-5 py-3 text-xs text-[#6f7c76] sm:px-7">
        <span><strong className="text-[#315e4b]">{path.summary.recognizedFromGlobalMastery}</strong> skills recognized</span>
        <span><strong className="text-[#315e4b]">{path.summary.eligibleRanked}</strong> ready candidates</span>
        <span><strong className="text-[#315e4b]">{path.summary.locked}</strong> explained future locks</span>
      </div>
    </section>
  );
}

export function LearnerDashboardPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<CatalogOverview | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentSummary[]>([]);
  const [paths, setPaths] = useState<CoursePaths>({});
  const [coordinatedPlan, setCoordinatedPlan] = useState<CoordinatedLearningPlan | null>(null);
  const [passport, setPassport] = useState<SkillPassport | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticOverview | null>(null);
  const [recommendedResource, setRecommendedResource] = useState<LearningResourceSummary | null>(null);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | null>(null);
  const [courseContextLoading, setCourseContextLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    if (!accessToken) throw new Error("Your session is not available.");
    try { return await operation(accessToken); }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return operation(await refreshSession());
      throw requestError;
    }
  }, [accessToken, refreshSession]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [nextCatalog, enrollmentResult, nextPassport, nextCoordination] = await Promise.all([
        withSession(getCatalogOverview),
        withSession(listEnrollments),
        withSession(getSkillPassport),
        withSession(getCoordinatedLearningPlan),
      ]);
      const active = enrollmentResult.enrollments.filter((item) => item.status !== "DROPPED");
      const nextPaths = Object.fromEntries(await Promise.all(active.map(async (enrollment) => {
        const coursePath = await withSession((token) => getPersonalizedPath(token, enrollment.id)).catch((pathError: unknown) => {
          if (pathError instanceof ApiError && pathError.status === 404) return null;
          throw pathError;
        });
        return [enrollment.id, coursePath] as const;
      })));
      const coordinatedDefault = active.find((item) => item.id === nextCoordination.learnNext?.primaryCourse.enrollmentId)
        ?? active.find((item) => item.status === "ACTIVE") ?? active[0];
      setCatalog(nextCatalog);
      setEnrollments(enrollmentResult.enrollments);
      setPaths(nextPaths);
      setCoordinatedPlan(nextCoordination);
      setPassport(nextPassport);
      setSelectedEnrollmentId((current) => {
        const storageKey = user ? `learnpath:selected-enrollment:${user.id}` : null;
        const remembered = current ?? (storageKey && typeof window !== "undefined" ? window.sessionStorage.getItem(storageKey) : null);
        return active.some((item) => item.id === remembered) ? remembered : coordinatedDefault?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Your learning dashboard could not be loaded.");
    } finally { setLoading(false); }
  }, [user, withSession]);

  useEffect(() => { void load(); }, [load]);

  const activeEnrollments = useMemo(() => enrollments.filter((item) => item.status !== "DROPPED"), [enrollments]);
  const coordinatedEnrollmentId = coordinatedPlan?.learnNext?.primaryCourse.enrollmentId ?? null;
  const selectedEnrollment = activeEnrollments.find((item) => item.id === selectedEnrollmentId)
    ?? activeEnrollments.find((item) => item.id === coordinatedEnrollmentId)
    ?? activeEnrollments.find((item) => item.status === "ACTIVE")
    ?? activeEnrollments[0];
  const selectedPath = selectedEnrollment ? paths[selectedEnrollment.id] : null;
  const pathNeedsUpdate = selectedPath?.status === "STALE";
  const learnNext = selectedPath?.learnNext ?? null;
  const revisionSkills = passport?.skills.filter((skill) => skill.revisionDue) ?? [];
  const visibleSkills = passport?.skills.filter((skill) => skill.mastery !== null).sort((a, b) => (b.mastery ?? 0) - (a.mastery ?? 0)).slice(0, 6) ?? [];
  const crossCourseSkillCount = passport?.skills.filter((skill) => skill.mastery !== null && skill.courseContexts.length > 1).length ?? 0;
  const summaryCards = [
    [BarChart3, "Average mastery", passport?.summary.averageMastery === null || passport?.summary.averageMastery === undefined ? "—" : `${Math.round(passport.summary.averageMastery * 100)}%`, "assessed skills only"],
    [Fingerprint, "Skills understood", passport?.summary.assessedSkills ?? 0, `${Math.round(passport?.summary.evidenceCoverage ?? 0)}% evidence coverage`],
    [UserRoundCheck, "Reusable knowledge", crossCourseSkillCount, "skills shared across courses"],
    [TimerReset, "Review today", passport?.summary.revisionDueSkills ?? 0, "memory refreshes due"],
  ] as const;

  useEffect(() => {
    if (!selectedEnrollment) {
      setDiagnostic(null);
      setRecommendedResource(null);
      setCourseContextLoading(false);
      return;
    }
    let cancelled = false;
    setCourseContextLoading(true);
    setDiagnostic(null);
    setRecommendedResource(null);
    void Promise.all([
      withSession((token) => getDiagnosticOverview(token, { enrollmentId: selectedEnrollment.id })),
      selectedPath?.learnNext ? withSession((token) => getLearningOverview(token, {
        courseId: selectedEnrollment.courseId,
        skillId: selectedPath.learnNext!.skillId,
      })) : Promise.resolve(null),
    ]).then(([nextDiagnostic, resourceOverview]) => {
      if (cancelled) return;
      setDiagnostic(nextDiagnostic);
      setRecommendedResource(resourceOverview?.resources[0] ?? null);
    }).catch((courseError: unknown) => {
      if (!cancelled) setError(courseError instanceof Error ? courseError.message : "The selected course could not be loaded.");
    }).finally(() => {
      if (!cancelled) setCourseContextLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedEnrollment, selectedPath, withSession]);

  const selectEnrollment = (enrollmentId: string) => {
    setSelectedEnrollmentId(enrollmentId);
    if (user && typeof window !== "undefined") window.sessionStorage.setItem(`learnpath:selected-enrollment:${user.id}`, enrollmentId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const beginDiagnostic = async () => {
    if (!selectedEnrollment) return;
    setWorking("diagnostic"); setError(null);
    try {
      if (diagnostic?.inProgressAttempt) {
        navigate(`/diagnostic/${diagnostic.inProgressAttempt.id}`);
        return;
      }
      navigate(`/my-courses/${selectedEnrollment.id}/assessment`);
    } catch (diagnosticError) {
      setError(diagnosticError instanceof Error ? diagnosticError.message : "The knowledge check could not be started.");
    } finally { setWorking(null); }
  };

  const coordinateCourses = async () => {
    setWorking("coordination"); setError(null);
    try {
      const result = await withSession(generateCoordinatedLearningPlan);
      setCoordinatedPlan(result.plan);
      await load();
    } catch (coordinationError) {
      setError(coordinationError instanceof Error ? coordinationError.message : "We could not coordinate your course recommendations.");
    } finally { setWorking(null); }
  };

  if (!user) return null;

  const lessonUrl = selectedEnrollment && pathNeedsUpdate
    ? `/my-courses/${selectedEnrollment.id}/path`
    : selectedEnrollment && learnNext && recommendedResource
    ? `/learn/${recommendedResource.id}?courseId=${selectedEnrollment.courseId}&moduleId=${recommendedResource.contexts.find((context) => context.courseId === selectedEnrollment.courseId)?.moduleId ?? ""}&enrollmentId=${selectedEnrollment.id}${selectedPath ? `&pathId=${selectedPath.id}&pathVersion=${selectedPath.pathVersion}` : ""}`
    : selectedEnrollment ? `/my-courses/${selectedEnrollment.id}/path` : "#courses";

  const directPracticeContext = (skill: LearnerSkillState) => skill.courseContexts.find(
    (course) => course.usageType === "COURSE_SKILL" && course.enrollmentStatus === "ACTIVE",
  ) ?? skill.courseContexts.find((course) => course.usageType === "COURSE_SKILL");

  return (
    <LearnerAppShell>
      <main className="mx-auto max-w-[1320px] px-4 py-7 sm:px-7 sm:py-10">
        {loading && !catalog ? <DashboardSkeleton /> : error && !catalog ? <Card className="mx-auto mt-20 max-w-lg"><CardContent className="p-8 text-center"><h1 className="text-xl font-semibold">We could not open your learning dashboard</h1><p className="mt-3 text-sm text-[#6b7972]">{error}</p><Button className="mt-5" onClick={() => void load()}><RefreshCw className="size-4" /> Try again</Button></CardContent></Card> : catalog ? <div className="space-y-8">
          {error && <div className="rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]">{error}</div>}

          <section id="continue">
            <p className="text-sm font-semibold text-[#597068]">{greeting()}, {user.displayName.split(" ")[0]}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-5xl">{selectedEnrollment ? "Ready to continue learning?" : "What would you like to learn?"}</h1>

            {activeEnrollments.length > 1 && <div className="mt-6 rounded-2xl border border-[#dce3da] bg-white p-3 shadow-[0_10px_30px_rgba(33,58,49,.05)]" aria-label="Choose a course to view on your dashboard">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><p className="shrink-0 px-2 text-xs font-bold uppercase tracking-[.14em] text-[#77837d]">Viewing course</p><div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 sm:pb-0">{activeEnrollments.map((enrollment) => {
                const isSelected = enrollment.id === selectedEnrollment?.id;
                const isCoordinatedPick = enrollment.id === coordinatedEnrollmentId;
                const coursePath = paths[enrollment.id];
                return <button aria-pressed={isSelected} className={`min-w-[190px] flex-1 rounded-xl border px-4 py-3 text-left transition ${isSelected ? "border-[#3d745a] bg-[#eaf2e9] shadow-sm" : "border-[#e2e7df] bg-[#fafbf8] hover:border-[#b9cbbd] hover:bg-white"}`} key={enrollment.id} onClick={() => selectEnrollment(enrollment.id)} type="button"><span className="flex items-center justify-between gap-2"><span className={`truncate text-sm font-semibold ${isSelected ? "text-[#24533f]" : "text-[#3d4943]"}`}>{enrollment.courseName}</span>{isCoordinatedPick && <span className="size-2 shrink-0 rounded-full bg-[#e9844d]" title="Best next step across active courses" />}</span><span className="mt-1 block truncate text-[11px] text-[#76827c]">{coursePath?.status === "STALE" ? "Path update needed" : coursePath?.learnNext ? `Next: ${coursePath.learnNext.name}` : coursePath ? "Review course path" : "Personalization needed"}</span></button>;
              })}</div></div>
              {coordinatedEnrollmentId && <p className="mt-2 px-2 text-[11px] text-[#7b8780]"><span className="mr-1.5 inline-block size-2 rounded-full bg-[#e9844d]" />Orange marks LearnPath’s best next course across all active enrollments. You can still inspect every course independently.</p>}
            </div>}

            <div className="mt-5">
              <LearnerJourney diagnosticComplete={Boolean(diagnostic?.latestAttempt)} hasEnrollment={Boolean(selectedEnrollment)} pathReady={Boolean(selectedPath)} />
            </div>

            <div className="mt-6 overflow-hidden rounded-[2rem] bg-[#173d33] text-white shadow-[0_24px_70px_rgba(23,61,51,.16)]">
              {selectedEnrollment ? <div className="grid lg:grid-cols-[1.2fr_.8fr]">
                <div className="relative overflow-hidden p-6 sm:p-9 lg:p-11"><div className="absolute -right-24 -top-24 size-80 rounded-full bg-[#4f7d69]/40 blur-3xl" /><div className="relative"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#f2a173]">{selectedEnrollment.courseName}</p>
                  {courseContextLoading ? <div className="flex min-h-48 items-center"><LoaderCircle className="mr-3 size-5 animate-spin text-[#f2a173]" /><p className="text-sm text-[#c3d4cd]">Loading this course’s diagnostic and recommendation…</p></div>
                    : !diagnostic?.latestAttempt ? <><h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-.05em] sm:text-5xl">Let’s find out what you already know.</h2><p className="mt-4 max-w-xl text-sm leading-7 text-[#c3d4cd]">A short knowledge check helps you skip familiar foundations and start at the right place.</p><Button className="mt-7 bg-[#f0925e] text-[#173d33] hover:bg-[#f4a77f]" disabled={working === "diagnostic"} onClick={() => void beginDiagnostic()}>{working === "diagnostic" ? <LoaderCircle className="size-4 animate-spin" /> : <Target className="size-4" />}{diagnostic?.inProgressAttempt ? "Resume knowledge check" : "Start knowledge check"}</Button></>
                    : selectedPath && learnNext ? <><p className="mt-4 text-sm font-semibold text-[#b8cec5]">{pathNeedsUpdate ? "New evidence received" : "Your next step"}</p><h2 className="mt-2 max-w-2xl text-4xl font-semibold tracking-[-.055em] sm:text-6xl">{pathNeedsUpdate ? "Your path is ready to adapt" : learnNext.name}</h2><div className="mt-4 flex flex-wrap gap-3 text-sm text-[#c6d7d0]"><span className="flex items-center gap-1.5">{pathNeedsUpdate ? <RefreshCw className="size-4" /> : <Clock3 className="size-4" />}{pathNeedsUpdate ? "Assessment evidence changed your knowledge" : recommendedResource ? `${recommendedResource.estimatedMinutes} min lesson` : "Ready when you are"}</span><span className="flex items-center gap-1.5"><GraduationCap className="size-4" />{learnNext.module?.name ?? "Course foundation"}</span></div><Button asChild className="mt-7 bg-[#f0925e] text-[#173d33] hover:bg-[#f4a77f]"><Link to={lessonUrl}>{pathNeedsUpdate ? <RefreshCw className="size-4" /> : <Play className="size-4 fill-current" />}{pathNeedsUpdate ? "Update my path" : recommendedResource ? "Continue learning" : "View my path"}</Link></Button></>
                    : <><h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-.05em] sm:text-5xl">Your starting point is ready to build.</h2><p className="mt-4 max-w-xl text-sm leading-7 text-[#c3d4cd]">We’ll use what you demonstrated to place familiar skills behind you and show the best next step.</p><Button asChild className="mt-7 bg-[#f0925e] text-[#173d33] hover:bg-[#f4a77f]"><Link to={`/my-courses/${selectedEnrollment.id}/path`}><Sparkles className="size-4" /> View my starting point</Link></Button></>}
                </div></div>
                <div className="border-t border-white/10 bg-white/[.055] p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-9"><p className="text-xs font-bold uppercase tracking-[.17em] text-[#aac0b7]">Why this?</p>{courseContextLoading ? <p className="mt-5 text-sm text-[#c3d4cd]">Checking this course’s current evidence…</p> : <><p className="mt-5 text-xl font-semibold leading-8">{pathNeedsUpdate ? "Your latest assessed performance changed your global mastery, so LearnPath paused the saved recommendation until you open the path to refresh it." : selectedPath ? nextReason(selectedPath) : diagnostic?.latestAttempt ? "Your diagnostic gives LearnPath the information needed to personalize this course." : "You won’t have to repeat skills you already know."}</p>{selectedPath?.learnNext && !pathNeedsUpdate && <details className="mt-6 rounded-2xl border border-white/10 bg-white/[.05] p-4"><summary className="cursor-pointer text-sm font-semibold text-[#f5c4a6]">See why this is next</summary><ul className="mt-4 space-y-2 text-sm leading-6 text-[#c3d4cd]"><li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-[#9dceb0]" />It supports your {selectedEnrollment.courseName} course.</li><li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-[#9dceb0]" />All required foundations are ready.</li><li className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-[#9dceb0]" />{nextReason(selectedPath)}</li></ul><Link className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#f2ab7d]" to={`/my-courses/${selectedEnrollment.id}/path`}>See your full path <ArrowRight className="size-3.5" /></Link></details>}</>}</div>
              </div> : <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_360px] lg:items-center"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[#f2a173]">Start with a course</p><h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-.055em] sm:text-6xl">Choose a subject. We’ll find your starting point.</h2><p className="mt-5 max-w-xl text-sm leading-7 text-[#c3d4cd]">Enroll, take a short knowledge check, and get a course path shaped around what you already know.</p><Button asChild className="mt-7 bg-[#f0925e] text-[#173d33] hover:bg-[#f4a77f]"><a href="#courses"><Compass className="size-4" /> Browse courses</a></Button></div><div className="space-y-3">{["Choose a course", "Show what you know", "Start at the right lesson"].map((label, index) => <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.06] p-4" key={label}><span className={`grid size-9 place-items-center rounded-full ${index === 0 ? "bg-[#f0925e] text-[#173d33]" : "bg-white/10 text-white"}`}>{index + 1}</span><span className="font-semibold">{label}</span></div>)}</div></div>}
            </div>
          </section>

          {selectedEnrollment && selectedPath && <DashboardPathPreview enrollmentId={selectedEnrollment.id} path={selectedPath} />}

          <section aria-label="Learning summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">{summaryCards.map(([Icon, label, value, detail]) => <Card className="border-[#dde4dc] bg-white/90" key={label}><CardContent className="flex items-center gap-4 p-4 sm:p-5"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#e8efe6] text-[#3f735b]"><Icon className="size-5" /></span><div><p className="text-2xl font-semibold tracking-[-.035em]">{value}</p><p className="mt-0.5 text-xs font-semibold">{label}</p><p className="mt-0.5 text-[10px] text-[#78847e]">{detail}</p></div></CardContent></Card>)}</section>

          {activeEnrollments.filter((enrollment) => enrollment.status === "ACTIVE").length > 1 && coordinatedPlan && <details className="rounded-2xl border border-[#dce3da] bg-white p-5"><summary className="cursor-pointer text-sm font-semibold text-[#5c7165]">How LearnPath compares my active courses</summary><div className="mt-4"><CoordinatedLearnNext generating={working === "coordination"} onGenerate={() => void coordinateCourses()} plan={coordinatedPlan} /></div></details>}

          <section id="my-courses"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#c86b3c]">My courses</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em] sm:text-3xl">Pick up where you left off</h2></div><Button asChild variant="outline"><Link to="/courses"><Search className="size-4" /> All courses</Link></Button></div>
            {activeEnrollments.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2">{activeEnrollments.map((enrollment) => { const coursePath = paths[enrollment.id]; const next = coursePath?.learnNext; return <Card className="overflow-hidden" key={enrollment.id}><CardContent className="p-0"><div className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><Badge variant={enrollment.status === "ACTIVE" ? "success" : "outline"}>{enrollment.status === "PAUSED" ? "Paused" : "In progress"}</Badge><h3 className="mt-3 text-xl font-semibold">{enrollment.courseName}</h3></div><span className="text-2xl font-semibold text-[#386b55]">{enrollment.progressPercentage}%</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-[#e8ece6]"><div className="h-full rounded-full bg-[#438065]" style={{ width: `${enrollment.progressPercentage}%` }} /></div><div className="mt-5 rounded-2xl bg-[#f4f6f1] p-4"><p className="text-[11px] font-bold uppercase tracking-[.13em] text-[#748078]">Next</p><p className="mt-1 font-semibold">{next?.name ?? (coursePath ? "Review your course path" : "Complete your knowledge check")}</p><div className="mt-3 flex flex-wrap gap-3 text-xs text-[#718078]"><span>{enrollment.completedModules}/{enrollment.totalModules} modules complete</span>{coursePath && <><span>{coursePath.summary.recognizedFromGlobalMastery} already known</span><span>{coursePath.summary.locked} building toward</span></>}</div></div><Button asChild className="mt-5 w-full"><Link to={`/my-courses/${enrollment.id}/path`}><PlayCircle className="size-4" />{coursePath ? "Open personalized path" : "Personalize this course"}</Link></Button></div></CardContent></Card>; })}</div> : <div className="mt-5 rounded-3xl border border-dashed border-[#cbd5ca] bg-white p-8 text-center"><BookOpen className="mx-auto size-7 text-[#718078]" /><p className="mt-3 font-semibold">Your courses will appear here</p><p className="mt-2 text-sm text-[#718078]">Choose a course below to begin.</p></div>}
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
            <Card><CardContent className="p-6 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#c86b3c]">Your skills</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Knowledge you can carry anywhere</h2><p className="mt-2 text-sm leading-6 text-[#6b7972]">Skills you demonstrate in one course are reused wherever else they matter.</p></div><UserRoundCheck className="size-6 text-[#3f7059]" /></div>{visibleSkills.length ? <div className="mt-5 grid gap-2 sm:grid-cols-2">{visibleSkills.map((skill) => <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f4f6f1] px-4 py-3" key={skill.id}><div><p className="text-sm font-semibold">{skill.name}</p><p className="text-[11px] text-[#78847e]">{masteryLabel(skill)}{skill.courseContexts.length > 1 ? ` · used in ${skill.courseContexts.length} courses` : ""}</p></div><span className="font-semibold">{skill.mastery === null ? "—" : `${Math.round(skill.mastery * 100)}%`}</span></div>)}</div> : <div className="mt-5 rounded-2xl bg-[#f4f6f1] p-5 text-sm text-[#66756e]">Complete a knowledge check to begin your Skill Passport.</div>}<Button asChild className="mt-5" variant="outline"><Link to="/skill-passport">View all my skills <ArrowRight className="size-4" /></Link></Button></CardContent></Card>
            <Card className={revisionSkills.length ? "border-[#e6c2ae] bg-[#fffaf5]" : "bg-white"}><CardContent className="p-6 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#c86b3c]">Quick review</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">{revisionSkills.length ? "Keep earlier learning fresh" : "Your recent learning looks fresh"}</h2></div><TimerReset className="size-6 text-[#c86b3c]" /></div>{revisionSkills.length ? <div className="mt-5 space-y-2">{revisionSkills.slice(0, 3).map((skill) => { const practiceContext = directPracticeContext(skill); return <div className="rounded-xl border border-[#ead8cd] bg-white p-4" key={skill.id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{skill.name}</p><p className="mt-1 text-xs leading-5 text-[#746f68]">It has been a while since you practiced this skill.</p></div><Badge variant="warning">5-minute refresh</Badge></div>{skill.practiceAvailable && practiceContext && <Button asChild className="mt-3 h-9" variant="outline"><Link to={`/practice/${skill.id}?mode=retention&enrollmentId=${practiceContext.enrollmentId}`}>Review now</Link></Button>}</div>; })}</div> : <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#edf5ec] p-5 text-sm text-[#38684f]"><ShieldCheck className="size-5" />No quick refresh is needed right now.</div>}<Button asChild className="mt-5" variant="outline"><Link to="/retention">Review memory health <ArrowRight className="size-4" /></Link></Button></CardContent></Card>
          </section>

          <section id="courses" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#dce3da] bg-white p-6"><div><h2 className="text-lg font-semibold">Find your next subject</h2><p className="mt-1 text-sm text-[#718078]">Browse the catalog and manage all your courses in one place.</p></div><Button asChild variant="outline"><Link to="/courses#catalog">Explore courses <ArrowRight className="size-4" /></Link></Button></section>
        </div> : null}
      </main>
    </LearnerAppShell>
  );
}
