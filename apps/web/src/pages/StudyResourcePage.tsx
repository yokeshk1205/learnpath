import {
  ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, Clock3, ExternalLink,
  Fingerprint, LoaderCircle, PauseCircle, Play, RefreshCw, Sparkles, Timer,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  getLearningResource,
  recordResourceEvent,
  type LearningResourceDetail,
  type ResourceEventType,
} from "../learning/api";

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

export function StudyResourcePage() {
  const { resourceId } = useParams();
  const [searchParams] = useSearchParams();
  const { accessToken, refreshSession, user } = useAuth();
  const [resource, setResource] = useState<LearningResourceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<ResourceEventType | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const courseId = searchParams.get("courseId") ?? undefined;
  const moduleId = searchParams.get("moduleId") ?? undefined;
  const enrollmentId = searchParams.get("enrollmentId") ?? undefined;
  const pathId = searchParams.get("pathId") ?? undefined;
  const pathVersion = searchParams.get("pathVersion") ?? undefined;
  const recommendationFeedbackId = searchParams.get("recommendationFeedbackId") ?? undefined;

  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    if (!accessToken) throw new Error("The learner session is not available.");
    try { return await operation(accessToken); }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return operation(await refreshSession());
      throw requestError;
    }
  }, [accessToken, refreshSession]);

  const load = useCallback(async () => {
    if (!resourceId) return;
    setLoading(true); setError(null);
    try { setResource(await withSession((token) => getLearningResource(token, resourceId))); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "The learning resource could not be loaded."); }
    finally { setLoading(false); }
  }, [resourceId, withSession]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (sessionStartedAt === null) return;
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1_000)));
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [sessionStartedAt]);

  const selectedContext = useMemo(() => resource?.contexts.find((context) => (
    (!courseId || context.courseId === courseId) && (!moduleId || context.moduleId === moduleId)
  )) ?? resource?.contexts.find((context) => context.isEnrolled), [courseId, moduleId, resource]);

  const record = async (eventType: ResourceEventType) => {
    if (!resourceId) return;
    setWorking(eventType); setError(null); setNotice(null);
    const durationSeconds = eventType === "RESOURCE_STARTED" || sessionStartedAt === null
      ? 0
      : Math.max(1, Math.floor((Date.now() - sessionStartedAt) / 1_000));
    try {
      const result = await withSession((token) => recordResourceEvent(token, resourceId, {
        courseId: selectedContext?.courseId ?? courseId,
        durationSeconds,
        eventType,
        metadata: {
          interface: "study_resource",
          ...(pathId ? { pathId } : {}),
          ...(pathVersion ? { pathVersion } : {}),
          ...(recommendationFeedbackId ? { recommendationFeedbackId } : {}),
        },
        moduleId: selectedContext?.moduleId,
      }));
      setResource(result.resource);
      if (eventType === "RESOURCE_STARTED") {
        setSessionStartedAt(Date.now()); setElapsed(0);
        setNotice("Lesson started. Take your time—LearnPath will remember where you left off.");
      } else {
        setSessionStartedAt(null); setElapsed(0);
        setNotice(eventType === "RESOURCE_COMPLETED"
          ? "Nice work. Your lesson is complete—practice will now check what you understood."
          : "No problem. You can return to this lesson whenever you are ready.");
      }
    } catch (recordError) {
      setError(recordError instanceof Error ? recordError.message : "The resource activity could not be recorded.");
    } finally { setWorking(null); }
  };

  if (!user) return null;
  if (loading && !resource) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef]"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-[#35614b]" /><p className="mt-3 text-sm text-[#6f7b75]">Opening your learning resource…</p></div></div>;
  if (!resource) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef] p-5"><Card className="max-w-lg text-center"><CardHeader><CardTitle>Resource unavailable</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent className="flex justify-center gap-2"><Button asChild variant="outline"><Link to="/learning-library"><ArrowLeft className="size-4" /> Library</Link></Button><Button onClick={() => void load()}><RefreshCw className="size-4" /> Retry</Button></CardContent></Card></div>;

  const completed = (resource.progress?.completionCount ?? 0) > 0;

  return (
    <div className="min-h-screen bg-[#f3f4ef] text-[#18372f]">
      <header className="border-b border-[#dfe3da] bg-[#fbfcf8]/95">
        <div className="mx-auto flex max-w-[1260px] items-center justify-between px-4 py-4 sm:px-7"><Link className="flex items-center gap-3" to="/dashboard"><span className="grid size-9 place-items-center rounded-xl bg-[#163b32] text-white"><Sparkles className="size-4" /></span><div><p className="font-bold tracking-[-0.03em]">LearnPath</p><p className="text-[11px] text-[#7b8681]">Learning Studio</p></div></Link><Button asChild variant="ghost"><Link to={enrollmentId ? `/my-courses/${enrollmentId}/path` : "/learning-library"}><ArrowLeft className="size-4" /> {enrollmentId ? "My path" : "Lessons"}</Link></Button></div>
      </header>

      <main className="mx-auto max-w-[1260px] px-4 py-7 sm:px-7 sm:py-10">
        {error && <div className="mb-5 rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]">{error}</div>}
        {notice && <div className="mb-5 flex items-start gap-2 rounded-xl border border-[#bcd6c3] bg-[#edf7ed] px-4 py-3 text-sm text-[#32664d]"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{notice}</div>}

        <section className="relative overflow-hidden rounded-[1.8rem] bg-[#173d33] p-6 text-white sm:p-8">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-[#4b7b68]/50 blur-3xl" />
          <div className="relative grid gap-8 xl:grid-cols-[1fr_330px] xl:items-end">
            <div><div className="flex flex-wrap gap-2"><Badge className="border-white/10 bg-white/10 text-[#d7e7df]" variant="outline">{resource.resourceType.replace("_", " ").toLowerCase()}</Badge><Badge className="border-white/10 bg-white/10 text-[#d7e7df]" variant="outline">About {resource.estimatedMinutes} min</Badge>{completed && <Badge className="border-[#7bb28d]/30 bg-[#7bb28d]/20 text-[#d9f0df]" variant="outline"><Check className="mr-1 size-3" /> Lesson complete</Badge>}</div><p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-[#f0a06e]">{selectedContext?.courseName ?? resource.skillCategory} · Your current step</p><h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{resource.title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#c2d3cc]">{resource.summary}</p><div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-[#b9cbc4]"><span>{selectedContext?.moduleName ?? "Course foundation"}</span><ArrowRight className="size-3.5" /><strong className="text-white">{resource.skillName}</strong><ArrowRight className="size-3.5" /><span>Practice</span></div></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-5"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.13em] text-[#abc0b8]">Current session</p><p className="mt-2 font-mono text-3xl font-semibold tracking-[-0.04em]">{formatElapsed(elapsed)}</p></div><span className={`grid size-12 place-items-center rounded-2xl ${sessionStartedAt ? "bg-[#f09a67] text-[#173d33]" : "bg-white/10 text-white"}`}><Timer className="size-5" /></span></div><div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs"><span className="text-[#abc0b8]">Estimated</span><span className="font-semibold">{resource.estimatedMinutes} minutes</span></div><div className="mt-2 flex items-center justify-between text-xs"><span className="text-[#abc0b8]">Recorded total</span><span className="font-semibold">{formatElapsed(resource.progress?.totalTimeSpentSeconds ?? 0)}</span></div></div>
          </div>
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[1fr_330px]">
          <article className="space-y-5">
            <Card><CardHeader><CardTitle>Learning objectives</CardTitle><CardDescription>Use these to focus your reading and self-explanation.</CardDescription></CardHeader><CardContent><ul className="space-y-3">{resource.learningObjectives.map((objective) => <li className="flex items-start gap-3 text-sm leading-6 text-[#5e6e66]" key={objective}><span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-[#e3efe3] text-[#397054]"><Check className="size-3" /></span>{objective}</li>)}</ul></CardContent></Card>
            {resource.contentSections.map((section, index) => <Card key={section.heading}><CardContent className="p-6 sm:p-8"><div className="flex items-start gap-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#edf1e9] text-sm font-bold text-[#416957]">{index + 1}</span><div><h2 className="text-xl font-semibold tracking-[-0.025em]">{section.heading}</h2><p className="mt-3 text-[15px] leading-7 text-[#5f6f67]">{section.body}</p></div></div></CardContent></Card>)}
            {resource.externalUrl && <Button asChild variant="outline"><a href={resource.externalUrl} rel="noreferrer" target="_blank">Open supporting source <ExternalLink className="size-4" /></a></Button>}
          </article>

          <aside className="space-y-4">
            <Card className={sessionStartedAt ? "border-[#e39a70] bg-[#fffaf4]" : "bg-white"}><CardHeader><Play className="mb-2 size-5 text-[#d5743f]" /><CardTitle>{sessionStartedAt ? "Lesson in progress" : resource.progress?.status === "IN_PROGRESS" ? "Continue this lesson" : completed ? "Lesson complete" : "Ready to learn?"}</CardTitle><CardDescription>{sessionStartedAt ? "When you finish, we’ll guide you into a short practice check." : completed ? "Practice now to show what you understood." : "Start when you’re ready. Your progress will be saved."}</CardDescription></CardHeader><CardContent>{sessionStartedAt ? <div className="space-y-2"><Button className="w-full" disabled={working !== null} onClick={() => void record("RESOURCE_COMPLETED")}><CheckCircle2 className="size-4" />{working === "RESOURCE_COMPLETED" ? "Saving…" : "Mark lesson complete"}</Button><Button className="w-full" disabled={working !== null} onClick={() => void record("RESOURCE_SKIPPED")} variant="outline"><PauseCircle className="size-4" />{working === "RESOURCE_SKIPPED" ? "Saving…" : "Pause for now"}</Button></div> : completed ? <Button asChild className="w-full"><Link to={`/practice/${resource.skillId}${enrollmentId ? `?enrollmentId=${enrollmentId}` : ""}`}>Start practice <ArrowRight className="size-4" /></Link></Button> : <Button className="w-full" disabled={working !== null} onClick={() => void record("RESOURCE_STARTED")}><Play className="size-4" />{working === "RESOURCE_STARTED" ? "Starting…" : resource.progress ? "Continue lesson" : "Start lesson"}</Button>}</CardContent></Card>
            <Card className="bg-[#fffaf1]"><CardHeader><Fingerprint className="mb-2 size-5 text-[#d5743f]" /><CardTitle>Your current understanding</CardTitle><CardDescription>{resource.mastery === null ? "Not assessed yet" : "Based on your latest answers"}</CardDescription></CardHeader><CardContent><div className="flex items-center justify-between rounded-xl border border-[#e9dfcf] bg-white/70 p-3 text-sm"><span className="text-[#746f65]">Mastery</span><Badge variant={resource.mastery === null ? "outline" : "success"}>{resource.mastery === null ? "Not assessed" : `${Math.round(resource.mastery * 100)}%`}</Badge></div><details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-[#776f66]">How this is measured</summary><p className="mt-2 text-xs leading-5 text-[#7b766d]">Completing a lesson records learning activity. Your answers in practice or assessment update mastery and confidence.</p></details></CardContent></Card>
            {selectedContext && <Card><CardHeader><BookOpen className="mb-2 size-5 text-[#3f6d58]" /><CardTitle>Study context</CardTitle><CardDescription>This global resource is being used inside an enrolled course.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center justify-between gap-3 border-t border-[#e4e8e2] pt-3"><span className="text-[#718078]">Course</span><span className="text-right font-semibold">{selectedContext.courseName}</span></div><div className="flex items-center justify-between gap-3 border-t border-[#e4e8e2] pt-3"><span className="text-[#718078]">Module</span><span className="text-right font-semibold">{selectedContext.moduleName}</span></div><div className="flex items-center justify-between gap-3 border-t border-[#e4e8e2] pt-3"><span className="text-[#718078]">Skill identity</span><span className="text-right font-semibold">Global</span></div></CardContent></Card>}
            <div className="flex items-center gap-2 rounded-xl bg-[#e9eeea] px-4 py-3 text-xs leading-5 text-[#65736c]"><Clock3 className="size-4 shrink-0" />Your lesson progress and time are saved so you can continue later.</div>
          </aside>
        </section>
      </main>
    </div>
  );
}
