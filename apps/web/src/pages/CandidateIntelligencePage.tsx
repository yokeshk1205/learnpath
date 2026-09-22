import {
  AlertTriangle, ArrowLeft, ArrowRight, BarChart3, BookOpen, BrainCircuit, CheckCircle2,
  CircleDot, FlaskConical, GitBranch, Layers3, LoaderCircle, LockKeyhole, Network,
  RefreshCw, Route, ShieldCheck, Sparkles, Target, TimerReset, TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import {
  getCandidateOverview,
  type CandidateBaselineEntry,
  type CandidateOverview,
  type CandidateSkill,
  type CandidateStatus,
} from "../candidates/api";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

type ViewFilter = "ALL" | CandidateStatus;

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

const kindLabels = {
  LEARN: "Learning gap",
  REVISION: "Revision",
  SUPPORTING_PREREQUISITE: "Supporting prerequisite",
} as const;

function MasterySignal({ skill }: { skill: CandidateSkill }) {
  return (
    <div className="rounded-2xl bg-[#f4f6f1] p-4">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-[#6f7c75]">Global mastery</span>
        <span className="font-semibold">{percent(skill.mastery)} <span className="font-normal text-[#8a948e]">/ {percent(skill.targetMastery)} target</span></span>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-[#dfe5dc]">
        {skill.mastery !== null && <div className="h-full rounded-full bg-[#39795d]" style={{ width: `${skill.mastery * 100}%` }} />}
        <span className="absolute -top-1 h-4 w-0.5 bg-[#d67542]" style={{ left: `${skill.targetMastery * 100}%` }} title="Course target" />
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-[#7b8781]">
        <span>{skill.evidenceState.toLowerCase()} evidence · {skill.evidenceCount} observations</span>
        <span>{skill.masteryGap === null ? "Gap unknown" : `${Math.round(skill.masteryGap * 100)} point gap`}</span>
      </div>
    </div>
  );
}

function CandidateCard({ context, skill }: {
  context: CandidateOverview["context"];
  skill: CandidateSkill;
}) {
  const resourceUrl = skill.isContextSkill
    ? `/learning-library?courseId=${context.courseId}&skillId=${skill.id}`
    : `/learning-library?skillId=${skill.id}`;
  const practiceUrl = `/practice/${skill.id}?enrollmentId=${context.enrollmentId}`;
  const retentionUrl = `${practiceUrl}&mode=retention`;
  const tone = skill.status === "ELIGIBLE"
    ? skill.kind === "REVISION" ? "border-[#e3a17d] bg-[#fffaf5]" : "border-[#b9d3c0] bg-white"
    : skill.status === "LOCKED" ? "border-[#dfc7bc] bg-[#fbf8f5]" : "border-[#dfe3dd] bg-[#f8f9f6]";
  return (
    <Card className={`overflow-hidden ${tone}`}>
      <CardContent className="flex h-full flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={skill.status === "ELIGIBLE" ? "success" : skill.status === "LOCKED" ? "warning" : "outline"}>{skill.status.toLowerCase()}</Badge>
            <Badge variant="outline">{skill.status === "EXCLUDED" ? "Already covered" : kindLabels[skill.kind]}</Badge>
            {skill.retentionState !== "UNKNOWN" && <Badge variant={skill.revisionDue ? "warning" : "outline"}>{skill.retentionState.toLowerCase().replace("_", " ")} retention</Badge>}
          </div>
          <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${skill.status === "ELIGIBLE" ? "bg-[#e6f2e7] text-[#347050]" : skill.status === "LOCKED" ? "bg-[#f7e7df] text-[#a85b3d]" : "bg-[#ecefeb] text-[#78847e]"}`}>
            {skill.status === "LOCKED" ? <LockKeyhole className="size-5" /> : skill.status === "EXCLUDED" ? <ShieldCheck className="size-5" /> : skill.kind === "REVISION" ? <TimerReset className="size-5" /> : <Route className="size-5" />}
          </span>
        </div>
        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#7a8780]">{skill.module ? `Module ${skill.module.sequence} · ${skill.module.name}` : "Cross-course foundation"}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{skill.name}</h2>
        <p className="mt-2 text-sm leading-6 text-[#6b7972]">{skill.description}</p>
        <div className="mt-5"><MasterySignal skill={skill} /></div>
        <div className="mt-4 rounded-xl border border-[#e0e5dd] bg-white/70 p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#69776f]"><CircleDot className="size-3.5 text-[#d27340]" /> {skill.status === "EXCLUDED" ? "Why it is removed" : "Why it is here"}</p>
          <p className="mt-2 text-sm leading-6 text-[#617068]">{skill.eligibilityExplanation}</p>
        </div>
        {skill.missingPrerequisites.length > 0 && <div className="mt-4 space-y-2">{skill.missingPrerequisites.map((missing) => <div className="rounded-xl border border-[#ead5ca] bg-[#fff7f2] p-3" key={missing.prerequisiteSkillId}><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{missing.prerequisiteSkillName}</p><Badge variant="warning">{percent(missing.currentMastery)} / {percent(missing.requiredMastery)}</Badge></div><p className="mt-1 text-xs text-[#7b706a]">{Math.round(missing.shortfall * 100)} mastery points still required{missing.recognizedAcrossCourses ? " · global cross-course state recognized" : ""}</p></div>)}</div>}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="rounded-xl bg-[#f2f4ef] p-2.5"><p className="font-semibold">{skill.prerequisiteCount}</p><p className="mt-1 text-[#7b8781]">required edges</p></div>
          <div className="rounded-xl bg-[#f2f4ef] p-2.5"><p className="font-semibold">{skill.resourceCount}</p><p className="mt-1 text-[#7b8781]">resources</p></div>
          <div className="rounded-xl bg-[#f2f4ef] p-2.5"><p className="font-semibold">{skill.popularity.observedLearners}</p><p className="mt-1 text-[#7b8781]">observed learners</p></div>
        </div>
        <div className="mt-auto flex flex-wrap justify-end gap-2 pt-5">
          {skill.status === "ELIGIBLE" && skill.kind === "REVISION" && skill.practiceAvailable && <Button asChild><Link to={retentionUrl}><TimerReset className="size-4" /> Run retention check</Link></Button>}
          {skill.status === "ELIGIBLE" && skill.kind !== "REVISION" && skill.resourceCount > 0 && <Button asChild><Link to={resourceUrl}><BookOpen className="size-4" /> Study resources</Link></Button>}
          {skill.status === "ELIGIBLE" && skill.kind === "LEARN" && skill.practiceAvailable && <Button asChild variant="outline"><Link to={practiceUrl}>Practice</Link></Button>}
          {(skill.status === "LOCKED" || skill.kind === "SUPPORTING_PREREQUISITE") && <Button asChild variant="outline"><Link to="/prerequisites"><Network className="size-4" /> Inspect dependencies</Link></Button>}
        </div>
      </CardContent>
    </Card>
  );
}

function BaselineCard({ description, entries, name, type }: {
  description: string;
  entries: CandidateBaselineEntry[];
  name: string;
  type: "gap" | "popularity";
}) {
  return (
    <Card className="overflow-hidden bg-white">
      <CardHeader className="border-b border-[#e2e6df] bg-[#fafbf8]">
        <div className="flex items-start justify-between gap-4"><div><CardTitle>{name}</CardTitle><CardDescription className="mt-1 leading-5">{description}</CardDescription></div>{type === "gap" ? <TrendingUp className="size-5 text-[#d06f3d]" /> : <BarChart3 className="size-5 text-[#397258]" />}</div>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length ? entries.slice(0, 6).map((entry) => <div className="grid grid-cols-[36px_1fr_auto] items-center gap-3 border-b border-[#e8ebe6] px-5 py-4 last:border-0" key={entry.skillId}><span className="grid size-8 place-items-center rounded-full bg-[#edf1e9] text-xs font-bold">{entry.rank}</span><div><p className="text-sm font-semibold">{entry.skillName}</p><p className="mt-1 text-[11px] text-[#78847e]">{type === "gap" ? entry.masteryGap === null ? "Mastery unknown—no numeric gap invented" : `${Math.round(entry.masteryGap * 100)} point measurable gap` : `${entry.observedLearners} learners · ${entry.evidenceObservations} evidence · ${entry.activityEvents} events`}</p></div><Badge variant="outline">Evaluation only</Badge></div>) : <div className="p-7 text-center text-sm text-[#748078]">No eligible skills are available to order.</div>}
      </CardContent>
    </Card>
  );
}

export function CandidateIntelligencePage() {
  const { enrollmentId } = useParams();
  const { accessToken, refreshSession, user } = useAuth();
  const [overview, setOverview] = useState<CandidateOverview | null>(null);
  const [filter, setFilter] = useState<ViewFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    if (!accessToken) throw new Error("The learner session is not available.");
    try { return await operation(accessToken); }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return operation(await refreshSession());
      throw requestError;
    }
  }, [accessToken, refreshSession]);

  const load = useCallback(async () => {
    if (!enrollmentId) return;
    setLoading(true); setError(null);
    try { setOverview(await withSession((token) => getCandidateOverview(token, enrollmentId))); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Candidate intelligence could not be generated."); }
    finally { setLoading(false); }
  }, [enrollmentId, withSession]);

  useEffect(() => { void load(); }, [load]);
  if (!user) return null;
  if (loading && !overview) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef]"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-[#35614b]" /><p className="mt-3 text-sm text-[#6f7b75]">Generating the dependency-valid candidate pool…</p></div></div>;
  if (!overview) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef] p-5"><Card className="max-w-lg text-center"><CardHeader><CardTitle>Candidate intelligence unavailable</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent className="flex justify-center gap-2"><Button asChild variant="outline"><Link to="/dashboard"><ArrowLeft className="size-4" /> Dashboard</Link></Button><Button onClick={() => void load()}><RefreshCw className="size-4" /> Retry</Button></CardContent></Card></div>;

  const all = [...overview.candidates.eligible, ...overview.candidates.locked, ...overview.candidates.excluded];
  const visible = filter === "ALL" ? all : all.filter((skill) => skill.status === filter);
  const filters: Array<{ label: string; value: ViewFilter }> = [
    { label: `All ${all.length}`, value: "ALL" },
    { label: `Eligible ${overview.summary.eligibleSkills}`, value: "ELIGIBLE" },
    { label: `Locked ${overview.summary.lockedSkills}`, value: "LOCKED" },
    { label: `Already covered ${overview.summary.excludedStrongSkills}`, value: "EXCLUDED" },
  ];
  return (
    <div className="min-h-screen bg-[#f3f4ef] text-[#18372f]">
      <header className="border-b border-[#dfe3da] bg-[#fbfcf8]/95">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between px-4 py-4 sm:px-7"><Link className="flex items-center gap-3" to="/dashboard"><span className="grid size-9 place-items-center rounded-xl bg-[#163b32] text-white"><Sparkles className="size-4" /></span><div><p className="font-bold">LearnPath</p><p className="text-[11px] text-[#7b8681]">Candidate intelligence</p></div></Link><Button asChild variant="ghost"><Link to={`/my-courses/${overview.context.enrollmentId}`}><ArrowLeft className="size-4" /> Course workspace</Link></Button></div>
      </header>
      <main className="mx-auto max-w-[1380px] px-4 py-7 sm:px-7 sm:py-10">
        <section className="relative overflow-hidden rounded-[1.8rem] bg-[#173d33] p-6 text-white sm:p-9">
          <div className="absolute -right-20 -top-24 size-80 rounded-full bg-[#668d78]/35 blur-3xl" />
          <div className="relative grid gap-8 xl:grid-cols-[1fr_420px] xl:items-end"><div><Badge className="border-white/10 bg-white/10 text-[#dce9e3]" variant="outline"><GitBranch className="mr-1.5 size-3.5" /> Phase 11 · prerequisite-gated candidates</Badge><h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">Before ranking, prove what is allowed.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-[#c4d4ce] sm:text-base">For {overview.context.courseName}, LearnPath combines the global Skill Passport, course curriculum, prerequisite graph, module context, and retention state into one inspectable candidate pool. No ML probability or personalized path is fabricated.</p>{overview.context.goalName && <p className="mt-4 flex items-center gap-2 text-xs text-[#d6e4de]"><Target className="size-4 text-[#f0a06e]" />Optional goal relevance from {overview.context.goalName} is attached as metadata, never treated as path ownership.</p>}</div><div className="rounded-2xl border border-white/10 bg-white/[0.07] p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#f0a06e]">Candidate funnel</p><div className="mt-4 grid grid-cols-4 gap-2 text-center"><div><p className="text-2xl font-semibold">{overview.summary.totalRelevantSkills}</p><p className="mt-1 text-[10px] text-[#aec1ba]">Relevant</p></div><div><p className="text-2xl font-semibold text-[#d4ead9]">{overview.summary.eligibleSkills}</p><p className="mt-1 text-[10px] text-[#aec1ba]">Eligible</p></div><div><p className="text-2xl font-semibold text-[#f3c4a8]">{overview.summary.lockedSkills}</p><p className="mt-1 text-[10px] text-[#aec1ba]">Locked</p></div><div><p className="text-2xl font-semibold text-[#c7d2cd]">{overview.summary.excludedStrongSkills}</p><p className="mt-1 text-[10px] text-[#aec1ba]">Covered</p></div></div><div className="mt-5 flex h-2 overflow-hidden rounded-full bg-white/10">{overview.summary.totalRelevantSkills > 0 && <><span className="bg-[#67a17e]" style={{ width: `${overview.summary.eligibleSkills / overview.summary.totalRelevantSkills * 100}%` }} /><span className="bg-[#dc895c]" style={{ width: `${overview.summary.lockedSkills / overview.summary.totalRelevantSkills * 100}%` }} /><span className="bg-[#859a90]" style={{ width: `${overview.summary.excludedStrongSkills / overview.summary.totalRelevantSkills * 100}%` }} /></>}</div></div></div>
        </section>

        {error && <div className="mt-5 flex items-center justify-between rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]"><span>{error}</span><Button onClick={() => void load()} variant="outline"><RefreshCw className="size-4" /> Refresh</Button></div>}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { icon: CheckCircle2, label: "Eligible now", value: overview.summary.eligibleSkills },
            { icon: TimerReset, label: "Revision", value: overview.summary.revisionCandidates },
            { icon: Layers3, label: "Supporting", value: overview.summary.supportingCandidates },
            { icon: LockKeyhole, label: "Locked", value: overview.summary.lockedSkills },
            { icon: ShieldCheck, label: "Already covered", value: overview.summary.excludedStrongSkills },
          ].map(({ icon: Icon, label, value }) => <Card key={label}><CardContent className="flex items-center gap-4 p-4"><span className="grid size-10 place-items-center rounded-xl bg-[#edf1e9] text-[#3c6d58]"><Icon className="size-4" /></span><div><p className="text-xl font-semibold">{value}</p><p className="text-[11px] text-[#738078]">{label}</p></div></CardContent></Card>)}
        </section>

        <section className="mt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Inspectable candidate set</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Eligible, locked, and intentionally removed</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#6d7a74]">This is the complete pre-ranking boundary. Locked skills never enter either baseline. Strongly mastered skills are removed unless retention creates a real revision signal.</p></div><div className="flex flex-wrap gap-2">{filters.map((item) => <button aria-pressed={filter === item.value} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${filter === item.value ? "border-[#285f4a] bg-[#285f4a] text-white" : "border-[#d7ded6] bg-white text-[#66756e] hover:border-[#8eaa9a]"}`} key={item.value} onClick={() => setFilter(item.value)} type="button">{item.label}</button>)}</div></div>
          {visible.length ? <div className="mt-5 grid gap-4 lg:grid-cols-2">{visible.map((skill) => <CandidateCard context={overview.context} key={skill.id} skill={skill} />)}</div> : <div className="mt-5 grid min-h-56 place-items-center rounded-3xl border border-dashed border-[#cbd4cb] bg-[#fafbf7] p-8 text-center"><div><CircleDot className="mx-auto size-7 text-[#829088]" /><p className="mt-3 font-semibold">No candidates match this view</p><p className="mt-2 text-sm text-[#748078]">Choose another status filter or generate new performance evidence.</p></div></div>}
        </section>

        <section className="mt-8 rounded-[1.8rem] border border-[#dce2da] bg-[#f8faf6] p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]"><FlaskConical className="size-4" /> Evaluation baseline laboratory</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Two comparators, zero fake intelligence</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#6d7a74]">{overview.baselines.disclaimer}</p></div><div className="rounded-2xl border border-[#dce2da] bg-white px-4 py-3 text-center"><p className="text-2xl font-semibold">{overview.baselines.topKOverlap}/{overview.baselines.topK}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-[#7b8781]">Top-{overview.baselines.topK} overlap</p></div></div>
          <div className="mt-6 grid gap-5 xl:grid-cols-2"><BaselineCard description={overview.baselines.highestSkillGap.description} entries={overview.baselines.highestSkillGap.ranking} name="Highest skill gap" type="gap" /><BaselineCard description={overview.baselines.popularity.description} entries={overview.baselines.popularity.ranking} name="Observed popularity" type="popularity" /></div>
          <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-2xl border border-[#e0e4dd] bg-white p-4"><TrendingUp className="size-5 text-[#d06f3d]" /><p className="mt-3 text-sm font-semibold">Gap baseline limitation</p><p className="mt-2 text-xs leading-5 text-[#738078]">It ignores outcome probability and cannot invent a numeric gap when mastery is unknown.</p></div><div className="rounded-2xl border border-[#e0e4dd] bg-white p-4"><BarChart3 className="size-5 text-[#397258]" /><p className="mt-3 text-sm font-semibold">Popularity limitation</p><p className="mt-2 text-xs leading-5 text-[#738078]">It follows aggregate behavior, not this learner’s likely benefit.</p></div><div className="rounded-2xl border border-[#e0e4dd] bg-white p-4"><BrainCircuit className="size-5 text-[#5d6d91]" /><p className="mt-3 text-sm font-semibold">ML boundary</p><p className="mt-2 text-xs leading-5 text-[#738078]">A later trained model may rank only this eligible pool. It can never override prerequisite eligibility.</p></div></div>
        </section>

        <section className="mt-6 flex flex-col gap-4 rounded-[1.6rem] bg-[#fff8ef] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#c66c3c]" /><div><p className="font-semibold">Candidate generation is not a personalized learning path.</p><p className="mt-1 text-sm leading-6 text-[#746f66]">Phase 11 determines which skills may be considered and preserves locked future work. Course path persistence, ML ranking, Learn Next, and dynamic regeneration remain later phases.</p></div></div><Button asChild variant="outline"><Link to="/prerequisites"><Network className="size-4" /> Verify graph <ArrowRight className="size-4" /></Link></Button></section>
      </main>
    </div>
  );
}
