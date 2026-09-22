import {
  ArrowRight, BadgeCheck, BrainCircuit, Check, ChevronDown, CircleDot,
  AlertTriangle, Clock3, Fingerprint, GitBranch, GitCompareArrows, History,
  LoaderCircle, LockKeyhole, Play, RefreshCw, Sparkles, TimerReset, Unlock,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { LearnerAppShell } from "../components/LearnerAppShell";
import { CourseNavigation } from "../components/CourseNavigation";
import { PathEvidenceNote } from "../components/PathEvidenceNote";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { RecommendationResponsePanel } from "../components/RecommendationResponsePanel";
import { getDiagnosticOverview, type DiagnosticOverview } from "../diagnostics/api";
import { startFocusedKnowledgeCheck } from "../assessment-programs/api";
import { getEnrollment, type EnrollmentDetail } from "../enrollments/api";
import { getLearningOverview, type LearningResourceSummary } from "../learning/api";
import {
  generatePersonalizedPath, getPersonalizedPath, getPersonalizedPathHistory, regeneratePersonalizedPath,
  type PathItem, type PathLane, type PersonalizedPath,
} from "../paths/api";
import {
  getRecommendationFeedback, respondToRecommendation,
  type RecommendationFeedback, type RecommendationReason,
} from "../recommendations/api";

const laneDetails: Record<PathLane, { label: string; description: string }> = {
  RECOGNIZED: { label: "Already known", description: "You have already demonstrated these skills." },
  CURRENT: { label: "In progress", description: "Work you have already started." },
  RECOMMENDED_NEXT: { label: "You are here", description: "The best next step for you right now." },
  UPCOMING: { label: "Ready after this", description: "Skills you are prepared to learn soon." },
  LOCKED: { label: "Building toward", description: "Future skills that need a stronger foundation first." },
};

const laneOrder: PathLane[] = ["RECOGNIZED", "CURRENT", "RECOMMENDED_NEXT", "UPCOMING", "LOCKED"];

function percentage(value: number | null): string {
  return value === null ? "Not assessed" : `${Math.round(value * 100)}%`;
}

function recommendationReason(path: PersonalizedPath): string {
  const next = path.learnNext;
  if (!next) return path.items.length > 0 && path.items.every((item) => item.lane === "RECOGNIZED")
    ? "Your current evidence meets the mapped course skill targets. Keep an eye on retention."
    : "No eligible next step is available yet. Check the skill locks, knowledge coverage, and available learning content.";
  if (next.revisionDue) return `A short review will help keep ${next.name} fresh.`;
  const unlocks = path.items.filter((item) => item.missingPrerequisites.some((prerequisite) => prerequisite.prerequisiteSkillId === next.skillId));
  if (unlocks.length > 1) return `This foundation helps unlock ${unlocks.length} later skills in ${path.context.courseName}.`;
  if (unlocks.length === 1) return `Build this foundation before moving to ${unlocks[0]!.name}.`;
  if (next.candidateKind === "SUPPORTING_PREREQUISITE") return `This foundation prepares you for the upcoming concepts in ${path.context.courseName}.`;
  return "Your current skills show that you are ready for this next.";
}

function learnerDescription(item: PathItem): string {
  if (item.lane === "LOCKED") {
    const names = item.missingPrerequisites.slice(0, 2).map((prerequisite) => prerequisite.prerequisiteSkillName);
    return names.length ? `Build ${names.join(" and ")} first.` : "Complete the earlier foundations first.";
  }
  if (item.lane === "RECOGNIZED") return "Already covered by knowledge in your Skill Passport.";
  if (item.lane === "CURRENT") return "Continue from where you left off.";
  if (item.revisionDue) return "A quick refresh will strengthen your memory.";
  if (item.lane === "UPCOMING") return "Your prerequisites are ready when you reach this step.";
  return "This is your recommended next step.";
}

function PathCard({ checking = false, directLessonUrl, enrollmentId, item, onKnowledgeCheck, pathStale = false }: { checking?: boolean; directLessonUrl?: string; enrollmentId: string; item: PathItem; onKnowledgeCheck?: (skillId: string) => void; pathStale?: boolean }) {
  const recommended = item.lane === "RECOMMENDED_NEXT";
  const locked = item.lane === "LOCKED";
  const recognized = item.lane === "RECOGNIZED";
  const practiceUrl = `/practice/${item.skillId}?enrollmentId=${enrollmentId}`;
  const learningUrl = directLessonUrl ?? `/learning-library?skillId=${item.skillId}`;
  return (
    <article className={`relative h-full overflow-hidden rounded-2xl border p-5 ${recommended ? "border-[#dd8654] bg-[#fff7ef] shadow-[0_18px_45px_rgba(201,103,52,.13)]" : locked ? "border-[#d9ddd7] bg-[#f1f2ee]" : recognized ? "border-[#b8d3be] bg-[#f2f8f1]" : "border-[#dce2da] bg-white"}`}>
      {recommended && <div className="absolute inset-x-0 top-0 h-1 bg-[#e9854e]" />}
      <div className="flex items-start justify-between gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${recommended ? "bg-[#e77f47] text-white" : locked ? "bg-[#dfe2dd] text-[#828d87]" : recognized ? "bg-[#dcebdd] text-[#387052]" : "bg-[#e9f0e7] text-[#3f7058]"}`}>{recommended ? <Sparkles className="size-4" /> : locked ? <LockKeyhole className="size-4" /> : recognized ? <Check className="size-4" /> : item.revisionDue ? <TimerReset className="size-4" /> : <CircleDot className="size-4" />}</span>{item.revisionDue && <Badge variant="warning">Quick review</Badge>}</div>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-[.15em] text-[#7f8b85]">{item.module?.name ?? (item.isContextSkill ? "Course skill" : "Helpful foundation")}</p>
      <h3 className="mt-1.5 text-lg font-semibold tracking-[-.025em]">{item.name}</h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-[#68766f]">{pathStale && recommended ? "This previous recommendation is paused while your path updates." : learnerDescription(item)}</p>
      {locked && item.missingPrerequisites.length > 0 && <div className="mt-4 rounded-xl border border-[#dfd6cf] bg-white/80 p-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9a5c3d]">Build first</p>{item.missingPrerequisites.slice(0, 3).map((prerequisite) => <div className="mt-2 flex items-center justify-between gap-3 text-xs" key={prerequisite.prerequisiteSkillId}><span className="font-medium">{prerequisite.prerequisiteSkillName}</span><span className="text-[#796f69]">{percentage(prerequisite.currentMastery)}</span></div>)}</div>}
      {!locked && !recognized && (pathStale ? <div className="mt-4 rounded-xl bg-[#f3ded0] px-3 py-2 text-center text-xs font-semibold text-[#8a4a2b]">Update path to continue</div> : <Button asChild className="mt-4 w-full" variant="outline"><Link to={item.practiceAvailable && item.resourceCount === 0 ? practiceUrl : learningUrl}>{item.revisionDue ? "Review now" : recommended ? "Start learning" : "Preview lesson"} <ArrowRight className="size-4" /></Link></Button>)}
      {!pathStale && !locked && !recognized && onKnowledgeCheck && (item.evidenceState === "UNKNOWN" || (item.evidenceState === "ESTIMATED" && (item.confidence ?? 0) < 0.5)) && <button className="mt-3 w-full text-center text-xs font-semibold text-[#426b57] underline decoration-[#aec1b3] underline-offset-4" disabled={checking} onClick={() => onKnowledgeCheck(item.skillId)} type="button">{checking ? "Preparing quick check…" : "Already know some of this? Check first"}</button>}
      <details className="mt-4 border-t border-[#dfe4dd] pt-3"><summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-[#617169]">Skill details <ChevronDown className="size-3.5" /></summary><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div className="rounded-lg bg-white/70 p-2"><span className="text-[#7a8580]">Mastery</span><p className="mt-1 font-semibold">{percentage(item.mastery)}</p></div><div className="rounded-lg bg-white/70 p-2"><span className="text-[#7a8580]">Confidence</span><p className="mt-1 font-semibold">{percentage(item.confidence)}</p></div><div className="rounded-lg bg-white/70 p-2"><span className="text-[#7a8580]">Gateway</span><p className="mt-1 font-semibold">{percentage(item.graphMetrics?.gatewayScore ?? null)}</p></div></div><p className="mt-3 text-[11px] leading-5 text-[#75817b]">{item.explanation}</p></details>
    </article>
  );
}

function PathLifecyclePanel({ history, onRegenerate, path, regenerating }: {
  history: PersonalizedPath[];
  onRegenerate(): void;
  path: PersonalizedPath;
  regenerating: boolean;
}) {
  if (path.status === "STALE") return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-[#e7a37b] bg-[#fff4eb]">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f1d0ba] text-[#9c4f2a]"><AlertTriangle className="size-5" /></span><div><Badge variant="warning">Path update available</Badge><h2 className="mt-2 text-xl font-semibold">Your knowledge changed. Let’s recalculate what comes next.</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[#765f53]">This saved version is preserved for comparison, but its recommendation is paused because new performance evidence changed your global mastery.</p></div></div>
        <Button className="shrink-0" disabled={regenerating} onClick={onRegenerate}>{regenerating ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{regenerating ? "Updating path…" : "Update my path"}</Button>
      </div>
    </section>
  );
  if (!path.changeSummary && history.length < 2) return null;
  const change = path.changeSummary;
  return (
    <section className="mb-6 rounded-2xl border border-[#cbdccc] bg-[#f4f8f2] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[#47735c]"><GitCompareArrows className="size-4" /> Your path adapted</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Version {path.pathVersion} uses your latest learning evidence</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#66746d]">{change?.explanation ?? "This version preserves the path state created from your latest mastery, confidence, and retention signals."}</p></div>{change && <div className="grid min-w-[280px] grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-[#d9e3d7] bg-white p-4 text-sm"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#849088]">Before</p><p className="mt-1 font-semibold">{change.previousLearnNext?.name ?? "No next step"}</p></div><ArrowRight className="size-4 text-[#ca764a]" /><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#849088]">Now</p><p className="mt-1 font-semibold text-[#35674e]">{change.newLearnNext?.name ?? "Caught up"}</p></div></div>}</div>
      {change && <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-white p-3"><p className="text-xl font-semibold">{change.unlockedAdded}</p><p className="text-xs text-[#748078]">Newly unlocked</p></div><div className="rounded-xl bg-white p-3"><p className="text-xl font-semibold">{change.recognizedAdded}</p><p className="text-xs text-[#748078]">Newly recognized</p></div><div className="rounded-xl bg-white p-3"><p className="text-xl font-semibold">{change.masterySnapshotsChanged}</p><p className="text-xs text-[#748078]">Mastery snapshots changed</p></div></div>}
      {history.length > 1 && <details className="mt-5 border-t border-[#d5e1d3] pt-4"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold"><History className="size-4" /> View immutable version history ({history.length}) <ChevronDown className="ml-auto size-4" /></summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{history.map((version) => <div className="rounded-xl border border-[#dce5da] bg-white p-3" key={version.id}><div className="flex items-center justify-between"><strong className="text-sm">Version {version.pathVersion}</strong><Badge variant={version.status === "ACTIVE" ? "success" : version.status === "STALE" ? "warning" : "outline"}>{version.status.toLowerCase()}</Badge></div><p className="mt-2 text-xs text-[#718078]">Learn Next: {version.learnNext?.name ?? "None"}</p><p className="mt-1 text-[11px] text-[#8a948e]">{new Date(version.generatedAt).toLocaleString()}</p></div>)}</div></details>}
    </section>
  );
}

export function PersonalizedPathPage() {
  const { enrollmentId } = useParams();
  const navigate = useNavigate();
  const { accessToken, refreshSession } = useAuth();
  const [detail, setDetail] = useState<EnrollmentDetail | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticOverview | null>(null);
  const [path, setPath] = useState<PersonalizedPath | null>(null);
  const [pathHistory, setPathHistory] = useState<PersonalizedPath[]>([]);
  const [recommendationFeedback, setRecommendationFeedback] = useState<RecommendationFeedback | null>(null);
  const [recommendedResource, setRecommendedResource] = useState<LearningResourceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [responding, setResponding] = useState<RecommendationReason | "ACCEPTED" | null>(null);
  const [checkingSkillId, setCheckingSkillId] = useState<string | null>(null);

  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    if (!accessToken) throw new Error("Your learner session is unavailable.");
    try { return await operation(accessToken); }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return operation(await refreshSession());
      throw requestError;
    }
  }, [accessToken, refreshSession]);

  const loadRecommendedResource = useCallback(async (coursePath: PersonalizedPath) => {
    if (!coursePath.learnNext) { setRecommendedResource(null); return; }
    const overview = await withSession((token) => getLearningOverview(token, {
      courseId: coursePath.context.courseId,
      skillId: coursePath.learnNext!.skillId,
    }));
    setRecommendedResource(overview.resources[0] ?? null);
  }, [withSession]);

  const hydratePath = useCallback(async (nextPath: PersonalizedPath) => {
    setPath(nextPath);
    const [historyResult, feedbackResult] = await Promise.all([
      withSession((token) => getPersonalizedPathHistory(token, nextPath.context.enrollmentId)),
      withSession((token) => getRecommendationFeedback(token, nextPath.id)),
    ]);
    setPathHistory(historyResult.paths);
    setRecommendationFeedback(feedbackResult.feedback);
    await loadRecommendedResource(nextPath);
  }, [loadRecommendedResource, withSession]);

  const load = useCallback(async () => {
    if (!enrollmentId) return;
    setLoading(true); setError(null);
    try {
      const [enrollment, diagnosticOverview] = await Promise.all([
        withSession((token) => getEnrollment(token, enrollmentId)),
        withSession((token) => getDiagnosticOverview(token, { enrollmentId })),
      ]);
      setDetail(enrollment);
      setDiagnostic(diagnosticOverview);
      try {
        const nextPath = await withSession((token) => getPersonalizedPath(token, enrollmentId));
        if (nextPath.status === "STALE") {
          setRegenerating(true);
          try {
            const refreshed = await withSession((token) => regeneratePersonalizedPath(token, enrollmentId));
            await hydratePath(refreshed.path);
          } catch (refreshError) {
            await hydratePath(nextPath);
            setError(refreshError instanceof Error ? refreshError.message : "Path update failed. Please retry.");
          } finally { setRegenerating(false); }
        } else await hydratePath(nextPath);
      } catch (pathError) {
        if (!(pathError instanceof ApiError) || pathError.status !== 404) throw pathError;
        setPath(null); setPathHistory([]); setRecommendationFeedback(null); setRecommendedResource(null);
        if (diagnosticOverview.latestAttempt) {
          setGenerating(true);
          try {
            const generated = await withSession((token) => generatePersonalizedPath(token, enrollmentId));
            await hydratePath(generated.path);
          } finally { setGenerating(false); }
        }
      }
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Your personalized path could not be loaded."); }
    finally { setLoading(false); }
  }, [enrollmentId, hydratePath, withSession]);

  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    if (!enrollmentId) return;
    setGenerating(true); setError(null);
    try {
      const nextPath = (await withSession((token) => generatePersonalizedPath(token, enrollmentId))).path;
      await hydratePath(nextPath);
    } catch (generationError) { setError(generationError instanceof Error ? generationError.message : "We could not build your course path right now."); }
    finally { setGenerating(false); }
  };

  const regenerate = async () => {
    if (!enrollmentId) return;
    setRegenerating(true); setError(null);
    try {
      const result = await withSession((token) => regeneratePersonalizedPath(token, enrollmentId));
      setPath(result.path);
      setPathHistory((await withSession((token) => getPersonalizedPathHistory(token, enrollmentId))).paths);
      setRecommendationFeedback(null);
      await loadRecommendedResource(result.path);
    } catch (regenerationError) { setError(regenerationError instanceof Error ? regenerationError.message : "We could not update your path right now."); }
    finally { setRegenerating(false); }
  };

  const startKnowledgeCheck = async (skillId: string) => {
    if (!enrollmentId) return;
    setCheckingSkillId(skillId); setError(null);
    try {
      const attempt = await withSession((token) => startFocusedKnowledgeCheck(token, {
        enrollmentId, skillId, intent: "KNOWLEDGE_CHECK",
      }));
      navigate(`/diagnostic/${attempt.id}?${new URLSearchParams({ enrollmentId })}`);
    } catch (checkError) { setError(checkError instanceof Error ? checkError.message : "The quick knowledge check could not be opened."); }
    finally { setCheckingSkillId(null); }
  };

  const groups = useMemo(() => laneOrder.map((lane) => ({ lane, items: path?.items.filter((item) => item.lane === lane) ?? [] })).filter((group) => group.items.length), [path]);

  if (loading && !detail) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef]"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-[#35614b]" /><p className="mt-3 text-sm text-[#6f7b75]">Opening your course path…</p></div></div>;
  if (!detail) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef] p-5"><Card className="max-w-lg text-center"><CardHeader><CardTitle>We could not open this path</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent><Button onClick={() => void load()}><RefreshCw className="size-4" /> Try again</Button></CardContent></Card></div>;

  const resourceContext = recommendedResource?.contexts.find((context) => context.courseId === detail.enrollment.courseId);
  const attributedLessonUrl = (feedbackId?: string) => path?.learnNext && recommendedResource
    ? `/learn/${recommendedResource.id}?courseId=${detail.enrollment.courseId}&moduleId=${resourceContext?.moduleId ?? ""}&enrollmentId=${detail.enrollment.id}&pathId=${path.id}&pathVersion=${path.pathVersion}${feedbackId ? `&recommendationFeedbackId=${feedbackId}` : ""}`
    : path?.learnNext ? `/learning-library?courseId=${detail.enrollment.courseId}&skillId=${path.learnNext.skillId}` : "/dashboard#my-courses";
  const lessonUrl = attributedLessonUrl(recommendationFeedback?.decision === "ACCEPTED" ? recommendationFeedback.id : undefined);
  const directlyUnlocked = path?.learnNext ? path.items.filter((item) => item.missingPrerequisites.some((prerequisite) => prerequisite.prerequisiteSkillId === path.learnNext!.skillId)).slice(0, 3) : [];

  const acceptRecommendation = async () => {
    if (!path?.learnNext) return;
    if (recommendationFeedback?.decision === "ACCEPTED") {
      navigate(attributedLessonUrl(recommendationFeedback.id));
      return;
    }
    setResponding("ACCEPTED"); setError(null);
    try {
      const result = await withSession((token) => respondToRecommendation(token, path.id, {
        decision: "ACCEPTED",
        resourceId: recommendedResource?.id,
      }));
      setRecommendationFeedback(result.feedback);
      navigate(attributedLessonUrl(result.feedback.id));
    } catch (responseError) { setError(responseError instanceof Error ? responseError.message : "Your recommendation response could not be saved."); }
    finally { setResponding(null); }
  };

  const rejectRecommendation = async (reasonCode: RecommendationReason) => {
    if (!path?.learnNext) return;
    setResponding(reasonCode); setError(null);
    try {
      const result = await withSession((token) => respondToRecommendation(token, path.id, {
        decision: "REJECTED",
        reasonCode,
      }));
      setRecommendationFeedback(result.feedback);
    } catch (responseError) { setError(responseError instanceof Error ? responseError.message : "Your recommendation response could not be saved."); }
    finally { setResponding(null); }
  };

  return (
    <LearnerAppShell>
      <main className="mx-auto max-w-[1320px] px-4 py-7 sm:px-7 sm:py-10">
        <CourseNavigation courseName={detail.enrollment.courseName} enrollmentId={detail.enrollment.id} />
        {error && <div className="mb-5 rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]">{error}</div>}
        {diagnostic?.latestAttempt && path && path.status !== "STALE" && <PathLifecyclePanel history={pathHistory} onRegenerate={() => void regenerate()} path={path} regenerating={regenerating} />}
        {!diagnostic?.latestAttempt ? <section className="overflow-hidden rounded-[2rem] border border-[#dce2da] bg-white"><div className="grid min-h-[560px] lg:grid-cols-[1.05fr_.95fr]"><div className="flex items-center p-7 sm:p-12"><div className="max-w-2xl"><Badge variant="warning"><BrainCircuit className="mr-1 size-3.5" /> Step 1 of 3</Badge><h1 className="mt-6 text-4xl font-semibold leading-tight tracking-[-.055em] sm:text-6xl">First, show us what you already know.</h1><p className="mt-5 max-w-xl text-base leading-7 text-[#66746d]">Build a reliable knowledge profile in manageable sessions. Check the full course over time, or use a shorter placement check to start learning sooner.</p><Button asChild className="mt-8 h-12 px-6"><Link to={diagnostic?.inProgressAttempt ? `/diagnostic/${diagnostic.inProgressAttempt.id}` : `/my-courses/${enrollmentId}/assessment`}><BrainCircuit className="size-4" />{diagnostic?.inProgressAttempt ? "Resume saved knowledge check" : "Choose your knowledge check"}</Link></Button><p className="mt-4 text-xs text-[#77837d]">Your coverage is saved across sessions. A first path can be provisional; unknown skills remain visible.</p></div></div><div className="relative overflow-hidden bg-[#173d33] p-7 text-white sm:p-10"><div className="absolute -right-20 -top-20 size-80 rounded-full bg-[#53816d]/30 blur-3xl" /><div className="relative"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#efa171]">Your course flow</p><div className="mt-8 space-y-3">{[[Check, "Course selected", detail.enrollment.courseName], [BrainCircuit, "Skill-wise knowledge check", "Current step"], [GitBranch, "Personalized path", "Unlocks after your results"], [Sparkles, "Learn next", "Adapts after every result"]].map(([Icon, title, detailText], index) => { const Visual = Icon as typeof Check; return <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.06] p-4" key={String(title)}><span className={`grid size-9 place-items-center rounded-full ${index === 1 ? "bg-[#ed8e58] text-white" : index === 0 ? "bg-[#dcebdd] text-[#356b50]" : "bg-white/10 text-[#bed1c9]"}`}><Visual className="size-4" /></span><div><p className="font-semibold">{String(title)}</p><p className="mt-1 text-xs text-[#aac0b7]">{String(detailText)}</p></div></div>; })}</div></div></div></div></section> : !path ? <section className="overflow-hidden rounded-[2rem] border border-[#dce2da] bg-white"><div className="grid min-h-[560px] lg:grid-cols-[1.05fr_.95fr]"><div className="flex items-center p-7 sm:p-12"><div className="max-w-2xl"><Badge variant="warning"><AlertTriangle className="mr-1 size-3.5" /> Path generation interrupted</Badge><h1 className="mt-6 text-4xl font-semibold leading-tight tracking-[-.055em] sm:text-6xl">We couldn’t create your path yet.</h1><p className="mt-5 max-w-xl text-base leading-7 text-[#66746d]">Your diagnostic results are saved. Retry once to generate the personalized route for {detail.enrollment.courseName}.</p><Button className="mt-8 h-12 px-6" disabled={generating} onClick={() => void generate()}>{generating ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{generating ? "Personalizing your course…" : "Try generating again"}</Button><p className="mt-4 text-xs text-[#77837d]">Your path uses real mastery, confidence, prerequisites, and retention evidence.</p></div></div><div className="relative overflow-hidden bg-[#173d33] p-7 text-white sm:p-10"><div className="absolute -right-20 -top-20 size-80 rounded-full bg-[#53816d]/30 blur-3xl" /><div className="relative"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#efa171]">What you’ll see</p><div className="mt-8 space-y-3">{[[Check, "What you already know", "Skip familiar foundations"], [CircleDot, "Where you are now", "One clear current step"], [Sparkles, "What to learn next", "A lesson chosen for your readiness"], [LockKeyhole, "What you’re building toward", "Every lock explained simply"]].map(([Icon, title, detailText], index) => { const Visual = Icon as typeof Check; return <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.06] p-4" key={String(title)}><span className={`grid size-9 place-items-center rounded-full ${index === 2 ? "bg-[#ed8e58] text-white" : "bg-white/10 text-[#bed1c9]"}`}><Visual className="size-4" /></span><div><p className="font-semibold">{String(title)}</p><p className="mt-1 text-xs text-[#aac0b7]">{String(detailText)}</p></div></div>; })}</div></div></div></div></section> : <>
          <section className="overflow-hidden rounded-[2rem] bg-[#173d33] text-white shadow-[0_24px_70px_rgba(23,61,51,.14)]"><div className="grid lg:grid-cols-[1.15fr_.85fr]"><div className="relative overflow-hidden p-7 sm:p-10 lg:p-12"><div className="absolute -right-24 -top-24 size-80 rounded-full bg-[#4f7d69]/35 blur-3xl" /><div className="relative"><div className="flex flex-wrap gap-2"><Badge className="border-white/10 bg-white/10 text-[#ffd0b1]" variant="outline"><Sparkles className="mr-1.5 size-3.5" /> {path.status === "STALE" ? "Your path is adapting" : "Your next step"}</Badge><Badge className="border-[#89b79a]/30 bg-[#6ba47a]/15 text-[#d4efd9]" variant="outline"><BadgeCheck className="mr-1.5 size-3.5" /> {path.status === "STALE" ? "New evidence received" : "Ready to learn"}</Badge></div><p className="mt-6 text-xs font-bold uppercase tracking-[.18em] text-[#f0a16f]">{path.context.courseName}</p><h1 className="mt-3 text-4xl font-semibold leading-tight tracking-[-.055em] sm:text-6xl">{path.status === "STALE" ? "Your path is ready to adapt" : path.learnNext?.name ?? (path.items.length > 0 && path.items.every((item) => item.lane === "RECOGNIZED") ? "Course skills recognized" : "Let’s review your next step")}</h1><p className="mt-5 max-w-2xl text-base leading-8 text-[#c3d5ce]">{path.status === "STALE" ? "Your latest assessment changed your global mastery. Recalculate now to see what moved, what became recognized, and the best next lesson." : recommendationReason(path)}</p>{path.learnNext && <div className="mt-7 flex flex-wrap gap-3">{path.status === "STALE" ? <Button className="bg-[#ef915c] text-[#173d33] hover:bg-[#f3a579]" disabled={regenerating} onClick={() => void regenerate()}>{regenerating ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{regenerating ? "Updating your path…" : "Update my path"}</Button> : <Button asChild className="bg-[#ef915c] text-[#173d33] hover:bg-[#f3a579]"><Link to={lessonUrl}><Play className="size-4 fill-current" />{recommendedResource ? "Start lesson" : "Find a lesson"}</Link></Button>}<a className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10" href="#journey">See the path</a><Link className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10" to={`/prerequisites?enrollmentId=${enrollmentId}&skillId=${path.learnNext.skillId}`}><GitBranch className="size-4" />Knowledge graph</Link></div>}</div></div><div className="border-t border-white/10 bg-white/[.055] p-7 sm:p-10 lg:border-l lg:border-t-0"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a8beb5]">{path.status === "STALE" ? "What will change" : "This step at a glance"}</p><div className="mt-6 space-y-3">{path.status === "STALE" ? <><div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-4 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-[#9bcaaa]" />Your old path stays in history for comparison.</div><div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-4 text-sm"><RefreshCw className="mt-0.5 size-4 shrink-0 text-[#f1a273]" />Mastery, prerequisites, retention, and ranking are recalculated.</div><div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-4 text-sm"><Sparkles className="mt-0.5 size-4 shrink-0 text-[#f1a273]" />You receive one fresh, explainable next step.</div></> : <><div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.06] p-4"><span className="flex items-center gap-3 text-sm"><Clock3 className="size-4 text-[#f1a273]" />Lesson length</span><span className="font-semibold">{recommendedResource ? `${recommendedResource.estimatedMinutes} min` : "Choose a format"}</span></div><div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.06] p-4"><span className="flex items-center gap-3 text-sm"><Unlock className="size-4 text-[#9bcaaa]" />Helps unlock</span><span className="font-semibold">{directlyUnlocked.length} skill{directlyUnlocked.length === 1 ? "" : "s"}</span></div><div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.06] p-4"><span className="flex items-center gap-3 text-sm"><Fingerprint className="size-4 text-[#9bcaaa]" />Current knowledge</span><span className="font-semibold">{percentage(path.learnNext?.mastery ?? null)}</span></div></>}</div></div></div></section>

          {path.status === "ACTIVE" && path.learnNext && <details className="mt-5 rounded-2xl border border-[#dce2da] bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-[#5c7165]">Is this recommendation right for you? Give feedback</summary><div className="mt-4"><RecommendationResponsePanel feedback={recommendationFeedback} lessonAvailable={Boolean(recommendedResource)} onAccept={() => void acceptRecommendation()} onReject={(reason) => void rejectRecommendation(reason)} skillName={path.learnNext.name} working={responding} /></div></details>}

          <section className="mt-8" id="journey"><div className="mb-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#d16f3c]">Your {path.context.courseName} journey</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.045em]">One clear route through the course</h2><p className="mt-2 text-sm text-[#6d7a74]">Already known → In progress → Learn next → Coming up → Building toward</p></div><div className="space-y-5">{groups.map((group, groupIndex) => { const visibleItems = group.lane === "RECOGNIZED" ? group.items.slice(-2) : group.lane === "LOCKED" ? group.items.slice(0, 3) : group.items; const hiddenCount = group.items.length - visibleItems.length; const staleRecommendation = path.status === "STALE" && group.lane === "RECOMMENDED_NEXT"; return <div className={`relative rounded-[1.5rem] ${group.lane === "RECOMMENDED_NEXT" ? "border border-[#edb08b] bg-[#fffaf5] p-4 sm:p-5" : ""}`} key={group.lane}>{groupIndex > 0 && <div className="absolute -top-5 left-6 h-5 w-px bg-[#c9d2ca]" />}<div className="mb-3 flex items-center gap-3"><span className={`grid size-11 place-items-center rounded-2xl ${group.lane === "RECOMMENDED_NEXT" ? "bg-[#e9844d] text-white" : group.lane === "LOCKED" ? "bg-[#e1e4df] text-[#7b8680]" : "bg-[#dfeadf] text-[#356b50]"}`}>{group.lane === "LOCKED" ? <LockKeyhole className="size-4" /> : group.lane === "RECOGNIZED" ? <Check className="size-4" /> : group.lane === "RECOMMENDED_NEXT" ? <Sparkles className="size-4" /> : <Unlock className="size-4" />}</span><div><h3 className="font-semibold">{staleRecommendation ? "Previous next step" : laneDetails[group.lane].label}</h3><p className="text-xs text-[#77827c]">{staleRecommendation ? "Paused until LearnPath recalculates from your latest evidence." : laneDetails[group.lane].description}</p></div><Badge className="ml-auto" variant="outline">{group.items.length}</Badge></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleItems.map((item) => <PathCard checking={checkingSkillId === item.skillId} directLessonUrl={item.lane === "RECOMMENDED_NEXT" ? lessonUrl : undefined} enrollmentId={enrollmentId!} item={item} key={item.skillId} onKnowledgeCheck={startKnowledgeCheck} pathStale={path.status === "STALE"} />)}</div>{hiddenCount > 0 && <details className="mt-3 rounded-2xl border border-[#dce2da] bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Show {hiddenCount} more {group.lane === "RECOGNIZED" ? "recognized" : "future"} skill{hiddenCount === 1 ? "" : "s"}</summary><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{group.lane === "RECOGNIZED" ? group.items.slice(0, hiddenCount).map((item) => <PathCard checking={checkingSkillId === item.skillId} enrollmentId={enrollmentId!} item={item} key={item.skillId} onKnowledgeCheck={startKnowledgeCheck} pathStale={path.status === "STALE"} />) : group.items.slice(visibleItems.length).map((item) => <PathCard checking={checkingSkillId === item.skillId} enrollmentId={enrollmentId!} item={item} key={item.skillId} onKnowledgeCheck={startKnowledgeCheck} pathStale={path.status === "STALE"} />)}</div></details>}</div>; })}</div></section>

          {path.learnNext && path.status !== "STALE" && <section className="mt-8 rounded-[1.75rem] border border-[#dce2da] bg-white p-6 sm:p-8" id="why"><div className="grid gap-6 lg:grid-cols-[1fr_360px]"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#d16f3c]">Why {path.learnNext.name}?</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">A next step you can understand</h2><ul className="mt-5 space-y-3 text-sm leading-6 text-[#5f6f67]"><li className="flex gap-3"><Check className="mt-1 size-4 shrink-0 text-[#3c7659]" />It supports your {path.context.courseName} course.</li><li className="flex gap-3"><Check className="mt-1 size-4 shrink-0 text-[#3c7659]" />Your required foundations are complete.</li><li className="flex gap-3"><Check className="mt-1 size-4 shrink-0 text-[#3c7659]" />{recommendationReason(path)}</li>{recommendedResource && <li className="flex gap-3"><Check className="mt-1 size-4 shrink-0 text-[#3c7659]" />A {recommendedResource.estimatedMinutes}-minute learning resource is mapped to this skill.</li>}</ul></div><div className="rounded-2xl bg-[#f4f6f1] p-5"><p className="text-sm font-semibold">What this can open next</p>{directlyUnlocked.length ? <div className="mt-3 space-y-2">{directlyUnlocked.map((item) => <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 text-sm" key={item.skillId}><LockKeyhole className="size-4 text-[#b56943]" /><span className="font-medium">{item.name}</span></div>)}</div> : <p className="mt-3 text-sm leading-6 text-[#6d7a74]">This step strengthens your course foundation even when it does not directly unlock a single skill.</p>}</div></div></section>}

          <PathEvidenceNote provenance={path.provenance} />
        </>}
      </main>
    </LearnerAppShell>
  );
}
