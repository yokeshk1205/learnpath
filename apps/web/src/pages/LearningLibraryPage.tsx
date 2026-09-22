import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, CircleDot, Clock3,
  Filter, Fingerprint, History, Layers3, Play, RefreshCw,
  Search, Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  getLearningOverview,
  type LearningActivityEvent,
  type LearningContextFilter,
  type LearningOverview,
  type LearningResourceSummary,
  type ResourceType,
} from "../learning/api";

type StatusFilter = "ALL" | "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED" | "SKIPPED";
type TypeFilter = "ALL" | ResourceType;

const typeLabels: Record<ResourceType, string> = {
  CONCEPT_GUIDE: "Concept guide",
  INTERACTIVE: "Interactive",
  REFERENCE: "Reference",
  VIDEO: "Video",
  WORKED_EXAMPLE: "Worked example",
};

const eventLabels: Record<LearningActivityEvent["eventType"], string> = {
  ASSESSMENT_SUBMITTED: "Diagnostic submitted",
  LESSON_COMPLETED: "Module completed",
  LESSON_STARTED: "Module started",
  PRACTICE_COMPLETED: "Practice completed",
  PRACTICE_STARTED: "Practice started",
  RESOURCE_COMPLETED: "Resource completed",
  RESOURCE_SKIPPED: "Resource skipped",
  RESOURCE_STARTED: "Resource started",
  RETENTION_CHECK_COMPLETED: "Retention check completed",
  RETENTION_CHECK_STARTED: "Retention check started",
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function resourceStatus(resource: LearningResourceSummary): StatusFilter {
  return resource.progress?.status ?? "NOT_STARTED";
}

function ResourceCard({ resource, filter }: {
  filter: LearningContextFilter;
  resource: LearningResourceSummary;
}) {
  const status = resourceStatus(resource);
  const context = resource.contexts.find((item) => (
    item.isEnrolled
    && (!filter.courseId || item.courseId === filter.courseId)
    && (!filter.moduleId || item.moduleId === filter.moduleId)
  )) ?? resource.contexts.find((item) => item.isEnrolled);
  const query = new URLSearchParams();
  if (context?.courseId) query.set("courseId", context.courseId);
  if (context?.moduleId) query.set("moduleId", context.moduleId);
  const href = `/learn/${resource.id}${query.size ? `?${query.toString()}` : ""}`;
  const completed = (resource.progress?.completionCount ?? 0) > 0;

  return (
    <Card className={`overflow-hidden ${status === "IN_PROGRESS" ? "border-[#e39a70] bg-[#fffaf4]" : completed ? "border-[#bad4c2] bg-[#f8fcf7]" : "bg-white"}`}>
      <CardContent className="flex h-full flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${completed ? "bg-[#dfeee1] text-[#326d50]" : status === "IN_PROGRESS" ? "bg-[#fbe7d9] text-[#b25d31]" : "bg-[#edf1e9] text-[#3e6a57]"}`}>
            {completed ? <CheckCircle2 className="size-5" /> : status === "IN_PROGRESS" ? <Play className="size-4 fill-current" /> : <BookOpen className="size-5" />}
          </span>
          <div className="flex flex-wrap justify-end gap-1.5">
            <Badge variant="outline">{typeLabels[resource.resourceType]}</Badge>
            <Badge variant={completed ? "success" : status === "IN_PROGRESS" ? "warning" : "outline"}>
              {completed ? "Completed" : status.replace("_", " ").toLowerCase()}
            </Badge>
          </div>
        </div>
        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#d06f3d]">{resource.skillName}</p>
        <h3 className="mt-2 text-lg font-semibold tracking-[-0.025em]">{resource.title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#6d7973]">{resource.summary}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-[#64736c]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0f3ed] px-2.5 py-1"><Clock3 className="size-3" />{resource.estimatedMinutes} min</span>
          <span className="rounded-full bg-[#f0f3ed] px-2.5 py-1">Difficulty {resource.difficulty}/5</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0f3ed] px-2.5 py-1"><Fingerprint className="size-3" />{resource.mastery === null ? "Mastery unknown" : `${Math.round(resource.mastery * 100)}% mastery`}</span>
        </div>
        <div className="mt-4 rounded-xl border border-[#e1e5df] bg-white/70 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#849089]">Global reuse</p>
          <p className="mt-1 text-xs leading-5 text-[#65746d]">
            {resource.contexts.length
              ? resource.contexts.map((item) => item.courseName).filter((name, index, items) => items.indexOf(name) === index).join(" · ")
              : "Goal resource without a course-specific placement"}
          </p>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <p className="text-[11px] text-[#7b8781]">{resource.progress ? `${formatDuration(resource.progress.totalTimeSpentSeconds)} recorded` : "No activity yet"}</p>
          <Button asChild><Link to={href}>{status === "IN_PROGRESS" ? "Continue" : completed ? "Review" : "Study"}<ArrowRight className="size-4" /></Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function LearningLibraryPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [overview, setOverview] = useState<LearningOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  const filter = useMemo<LearningContextFilter>(() => ({
    courseId: searchParams.get("courseId") ?? undefined,
    moduleId: searchParams.get("moduleId") ?? undefined,
    skillId: searchParams.get("skillId") ?? undefined,
  }), [searchParams]);

  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    if (!accessToken) throw new Error("The learner session is not available.");
    try { return await operation(accessToken); }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return operation(await refreshSession());
      throw requestError;
    }
  }, [accessToken, refreshSession]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setOverview(await withSession((token) => getLearningOverview(token, filter))); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "The learning library could not be loaded."); }
    finally { setLoading(false); }
  }, [filter, withSession]);

  useEffect(() => { void load(); }, [load]);

  const resources = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (overview?.resources ?? []).filter((resource) => {
      const matchesSearch = !query || [resource.title, resource.skillName, resource.skillCategory, resource.summary]
        .some((value) => value.toLowerCase().includes(query));
      const matchesStatus = statusFilter === "ALL" || resourceStatus(resource) === statusFilter
        || (statusFilter === "COMPLETED" && (resource.progress?.completionCount ?? 0) > 0);
      const matchesType = typeFilter === "ALL" || resource.resourceType === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [overview, search, statusFilter, typeFilter]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#f3f4ef] text-[#18372f]">
      <header className="border-b border-[#dfe3da] bg-[#fbfcf8]/95">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between px-4 py-4 sm:px-7">
          <Link className="flex items-center gap-3" to="/dashboard"><span className="grid size-9 place-items-center rounded-xl bg-[#163b32] text-white"><Sparkles className="size-4" /></span><div><p className="font-bold tracking-[-0.03em]">LearnPath</p><p className="text-[11px] text-[#7b8681]">Learning studio</p></div></Link>
          <Button asChild variant="ghost"><Link to="/dashboard"><ArrowLeft className="size-4" /> Dashboard</Link></Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1380px] px-4 py-7 sm:px-7 sm:py-10">
        <section className="relative overflow-hidden rounded-[1.8rem] bg-[#173d33] p-6 text-white sm:p-8">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-[#4b7b68]/50 blur-3xl" />
          <div className="relative grid gap-8 xl:grid-cols-[1fr_auto] xl:items-end">
            <div><Badge className="border-white/10 bg-white/10 text-[#d7e7df]" variant="outline">Learning Studio</Badge><h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Choose the way you learn best.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#c2d3cc]">Open a recommended lesson, worked example, video, or interactive activity connected to the skills in your courses.</p></div>
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center sm:grid-cols-4">
              <div className="px-3 py-2"><p className="text-xl font-semibold">{overview?.summary.availableResources ?? "—"}</p><p className="text-[10px] uppercase tracking-wider text-[#afc4bc]">Resources</p></div>
              <div className="border-l border-white/10 px-3 py-2"><p className="text-xl font-semibold">{overview?.summary.skillsCovered ?? "—"}</p><p className="text-[10px] uppercase tracking-wider text-[#afc4bc]">Skills</p></div>
              <div className="border-l border-white/10 px-3 py-2"><p className="text-xl font-semibold">{overview?.summary.completedResources ?? "—"}</p><p className="text-[10px] uppercase tracking-wider text-[#afc4bc]">Completed</p></div>
              <div className="border-l border-white/10 px-3 py-2"><p className="text-xl font-semibold">{formatDuration(overview?.summary.totalTimeSpentSeconds ?? 0)}</p><p className="text-[10px] uppercase tracking-wider text-[#afc4bc]">Study time</p></div>
            </div>
          </div>
        </section>

        {error && <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]"><span>{error}</span><Button onClick={() => void load()} variant="outline"><RefreshCw className="size-4" /> Retry</Button></div>}

        <section className="mt-6 grid gap-5 xl:grid-cols-[1fr_350px]">
          <div>
            <div className="rounded-2xl border border-[#dce2da] bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7d8983]" /><Input aria-label="Search learning resources" className="pl-9" onChange={(event) => setSearch(event.target.value)} placeholder="Search by skill or resource…" value={search} /></div>
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-2 rounded-xl border border-[#d8ded7] bg-[#fafbf8] px-3 text-xs font-semibold"><Filter className="size-3.5" /><select aria-label="Resource status" className="h-10 bg-transparent outline-none" onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} value={statusFilter}><option value="ALL">All activity</option><option value="NOT_STARTED">Not started</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option><option value="SKIPPED">Skipped</option></select></label>
                  <label className="rounded-xl border border-[#d8ded7] bg-[#fafbf8] px-3 text-xs font-semibold"><select aria-label="Resource type" className="h-10 bg-transparent outline-none" onChange={(event) => setTypeFilter(event.target.value as TypeFilter)} value={typeFilter}><option value="ALL">All formats</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  {(filter.courseId || filter.moduleId || filter.skillId) && <Button onClick={() => setSearchParams({})} variant="outline">Clear context</Button>}
                </div>
              </div>
              {(filter.courseId || filter.moduleId || filter.skillId) && <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#edf3ea] px-3 py-2 text-xs text-[#4c6c5d]"><Layers3 className="size-3.5" />Showing resources for the selected course, module, or skill context.</div>}
            </div>

            {loading && !overview ? <div className="mt-5 grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map((item) => <div className="h-80 animate-pulse rounded-3xl bg-[#e4e9e1]" key={item} />)}</div> : resources.length ? <div className="mt-5 grid gap-4 md:grid-cols-2">{resources.map((resource) => <ResourceCard filter={filter} key={resource.id} resource={resource} />)}</div> : <div className="mt-5 grid min-h-72 place-items-center rounded-3xl border border-dashed border-[#cbd4cb] bg-[#fafbf7] p-8 text-center"><div><CircleDot className="mx-auto size-7 text-[#829088]" /><p className="mt-3 font-semibold">No resources match this view</p><p className="mt-2 text-sm text-[#748078]">Clear the search or filters, or choose another active learning context.</p></div></div>}
          </div>

          <aside className="space-y-4">
            <details className="rounded-2xl border border-[#e5ddcf] bg-[#fffaf1] p-5"><summary className="cursor-pointer text-sm font-semibold">How lesson progress is used</summary><p className="mt-3 text-sm leading-6 text-[#706f67]">Completing a lesson saves progress and study time. Practice or assessment answers update your mastery and confidence.</p></details>
            <Card><CardHeader><div className="flex items-start justify-between"><div><CardTitle>Recently learned</CardTitle><CardDescription>Your latest lessons, practice, and assessments.</CardDescription></div><History className="size-5 text-[#4a735f]" /></div></CardHeader><CardContent>{overview?.activity.length ? <div className="space-y-1">{overview.activity.slice(0, 10).map((event, index) => <div className="relative flex gap-3 py-3" key={event.id}>{index < Math.min(overview.activity.length, 10) - 1 && <span className="absolute bottom-0 left-[7px] top-8 w-px bg-[#dce2da]" />}<span className={`mt-1.5 size-3.5 shrink-0 rounded-full border-[3px] border-white ${event.eventType.endsWith("COMPLETED") || event.eventType === "ASSESSMENT_SUBMITTED" ? "bg-[#3d7a5d]" : event.eventType.endsWith("SKIPPED") ? "bg-[#d98252]" : "bg-[#8aa497]"}`} /><div className="min-w-0"><p className="text-sm font-semibold">{eventLabels[event.eventType]}</p><p className="mt-1 truncate text-xs text-[#718078]">{event.resourceTitle ?? event.moduleName ?? event.skillName ?? "Learning activity"}</p><p className="mt-1 text-[10px] text-[#959e99]">{new Date(event.occurredAt).toLocaleString()}{event.durationSeconds ? ` · ${formatDuration(event.durationSeconds)}` : ""}</p></div></div>)}</div> : <div className="py-8 text-center"><History className="mx-auto size-6 text-[#9aa39f]" /><p className="mt-3 text-sm font-semibold">Nothing here yet</p><p className="mt-1 text-xs text-[#7a8580]">Start a lesson and your recent learning will appear here.</p></div>}</CardContent></Card>
          </aside>
        </section>
      </main>
    </div>
  );
}
