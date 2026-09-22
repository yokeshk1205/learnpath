import {
  BookOpen, BrainCircuit, Check, CheckCircle2, CircleAlert, GitBranch, Link2,
  LoaderCircle, LockKeyhole, Network, Route, Search, Unlock, Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { CourseNavigation } from "../components/CourseNavigation";
import { LearnerAppShell } from "../components/LearnerAppShell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { listEnrollments, type EnrollmentSummary } from "../enrollments/api";
import {
  getPrerequisiteAnalysis,
  type GoalPrerequisiteAnalysis,
  type PrerequisiteCheck,
  type PrerequisiteSkillAnalysis,
  type PrerequisiteSkillStatus,
} from "../prerequisites/api";

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

const statusStyles: Record<PrerequisiteSkillStatus, string> = {
  LOCKED: "border-[#d9c9c0] bg-[#fff7f2] text-[#965139]",
  MASTERED: "border-[#a9cdb4] bg-[#edf7ed] text-[#2f6a4d]",
  UNLOCKED: "border-[#e9b68f] bg-[#fff4e8] text-[#a6552f]",
};

function StatusIcon({ status }: { status: PrerequisiteSkillStatus }) {
  if (status === "MASTERED") return <CheckCircle2 className="size-4" />;
  if (status === "UNLOCKED") return <Unlock className="size-4" />;
  return <LockKeyhole className="size-4" />;
}

function CheckRow({ check }: { check: PrerequisiteCheck }) {
  const confidenceAdjusted = check.effectiveMastery !== undefined
    && check.effectiveMastery !== null
    && check.effectiveMastery !== check.currentMastery;
  return (
    <div className={`rounded-xl border p-3 ${check.satisfied ? "border-[#cde0d1] bg-[#f3f9f3]" : check.relationshipType === "RECOMMENDED" ? "border-[#dce2da] bg-[#fafbf8]" : "border-[#ead2c5] bg-[#fff8f4]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2"><span className={`grid size-6 place-items-center rounded-full ${check.satisfied ? "bg-[#d7eadb] text-[#286145]" : "bg-white text-[#a65a3b]"}`}>{check.satisfied ? <Check className="size-3.5" /> : <LockKeyhole className="size-3.5" />}</span><div><p className="text-sm font-semibold">{check.prerequisiteSkillName}</p><p className="mt-0.5 text-[11px] text-[#77827d]">{check.relationshipType === "REQUIRED" ? "Required dependency" : "Recommended support"}</p></div></div>
        <Badge variant={check.satisfied ? "success" : check.relationshipType === "REQUIRED" ? "warning" : "outline"}>{percent(check.effectiveMastery ?? check.currentMastery)} / {percent(check.requiredMastery)}</Badge>
      </div>
      {confidenceAdjusted && <p className="mt-2 text-[11px] leading-5 text-[#786b64]">Observed mastery {percent(check.currentMastery)} becomes {percent(check.effectiveMastery)} after a {percent(check.uncertaintyPenalty)} confidence buffer.</p>}
      {!check.satisfied && check.relationshipType === "REQUIRED" && <p className="mt-2 text-xs font-medium text-[#9a573a]">{check.evidenceStatus === "UNKNOWN" ? "No mastery evidence yet." : `${percent(check.shortfall)} confidence-adjusted mastery still required.`}</p>}
      {check.recognizedAcrossCourses && <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-5 text-[#587066]"><Link2 className="size-3.5 shrink-0" />Shared global skill across {check.courseContexts.length} course contexts</p>}
    </div>
  );
}

function GraphCanvas({ analysis, onSelect, selectedId }: {
  analysis: GoalPrerequisiteAnalysis;
  onSelect(skillId: string): void;
  selectedId: string | null;
}) {
  const positions = useMemo(() => {
    const counts = new Map<number, number>();
    const result = new Map<string, { x: number; y: number }>();
    for (const skill of analysis.skills) {
      const row = counts.get(skill.dependencyLevel) ?? 0;
      result.set(skill.id, { x: 34 + skill.dependencyLevel * 258, y: 60 + row * 112 });
      counts.set(skill.dependencyLevel, row + 1);
    }
    return result;
  }, [analysis.skills]);
  const width = Math.max(880, Math.max(...analysis.skills.map((skill) => skill.dependencyLevel), 0) * 258 + 300);
  const layerCounts = analysis.skills.reduce((counts, skill) => counts.set(skill.dependencyLevel, (counts.get(skill.dependencyLevel) ?? 0) + 1), new Map<number, number>());
  const height = Math.max(380, Math.max(...layerCounts.values(), 1) * 112 + 100);
  const selected = analysis.skills.find((skill) => skill.id === selectedId);
  const related = new Set<string>(selected ? [selected.id, ...selected.prerequisites.map((edge) => edge.prerequisiteSkillId)] : []);
  if (selected) for (const skill of analysis.skills) if (skill.prerequisites.some((edge) => edge.prerequisiteSkillId === selected.id)) related.add(skill.id);

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#dce2da] bg-[#f8faf6]">
      <div className="relative" style={{ height, minWidth: width, width }}>
        <svg aria-label="Interactive prerequisite dependency graph" className="absolute inset-0 size-full" role="img" viewBox={`0 0 ${width} ${height}`}>
          <defs><marker id="graph-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4"><path d="M0,0 L8,4 L0,8 Z" fill="#96a59d" /></marker></defs>
          {analysis.skills.flatMap((skill) => skill.prerequisites.map((edge) => {
            const from = positions.get(edge.prerequisiteSkillId);
            const to = positions.get(skill.id);
            if (!from || !to) return null;
            const emphasized = selectedId !== null && related.has(edge.prerequisiteSkillId) && related.has(skill.id);
            return <line key={`${edge.prerequisiteSkillId}-${skill.id}`} markerEnd="url(#graph-arrow)" stroke={emphasized ? "#df7540" : edge.satisfied ? "#79a98a" : "#b6bdb8"} strokeDasharray={edge.relationshipType === "RECOMMENDED" ? "6 5" : undefined} strokeWidth={emphasized ? 3 : 1.7} x1={from.x + 210} x2={to.x - 4} y1={from.y + 36} y2={to.y + 36} />;
          }))}
        </svg>
        {[...new Set(analysis.skills.map((skill) => skill.dependencyLevel))].map((level) => <p className="absolute top-5 text-[10px] font-bold uppercase tracking-[.14em] text-[#7a8780]" key={level} style={{ left: 34 + level * 258 }}>Layer {level}</p>)}
        {analysis.skills.map((skill) => {
          const position = positions.get(skill.id)!;
          const muted = selectedId !== null && !related.has(skill.id);
          return <button aria-label={`Inspect ${skill.name}`} className={`absolute h-[74px] w-[210px] rounded-2xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${statusStyles[skill.status]} ${selectedId === skill.id ? "ring-2 ring-[#df7540] ring-offset-2" : ""} ${muted ? "opacity-35" : ""}`} key={skill.id} onClick={() => onSelect(skill.id)} style={{ left: position.x, top: position.y }} type="button"><div className="flex items-center gap-2"><StatusIcon status={skill.status} /><span className="truncate text-sm font-semibold">{skill.name}</span></div><div className="mt-2 flex items-center justify-between text-[10px]"><span>{percent(skill.effectiveMastery ?? skill.currentMastery)} / {percent(skill.targetMastery)}</span>{skill.graphMetrics && <span>{skill.graphMetrics.downstreamSkillCount} downstream</span>}</div></button>;
        })}
      </div>
    </div>
  );
}

function SkillInspector({ analysis, skill }: { analysis: GoalPrerequisiteAnalysis; skill: PrerequisiteSkillAnalysis }) {
  const names = new Map(analysis.skills.map((item) => [item.id, item.name]));
  const metrics = skill.graphMetrics;
  return (
    <Card className="overflow-hidden">
      <div className={`h-1.5 ${skill.status === "MASTERED" ? "bg-[#4b8b68]" : skill.status === "UNLOCKED" ? "bg-[#e78a52]" : "bg-[#b56a4d]"}`} />
      <CardHeader><div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2"><Badge className={statusStyles[skill.status]} variant="outline"><StatusIcon status={skill.status} /> <span className="ml-1">{skill.status.toLowerCase()}</span></Badge><Badge variant="outline">Layer {skill.dependencyLevel}</Badge>{!skill.isContextSkill && <Badge variant="outline">Supporting prerequisite</Badge>}</div><CardTitle className="mt-3 text-2xl">{skill.name}</CardTitle><CardDescription className="mt-1">{skill.category} · Difficulty {skill.difficulty}</CardDescription></div><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#edf1e9] text-[#386551]"><StatusIcon status={skill.status} /></span></div></CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl bg-[#f2f5ef] p-4"><p className="text-[11px] text-[#77827d]">Confidence-adjusted mastery</p><p className="mt-1 text-xl font-semibold">{percent(skill.effectiveMastery ?? skill.currentMastery)}</p></div><div className="rounded-xl bg-[#f2f5ef] p-4"><p className="text-[11px] text-[#77827d]">Gateway score</p><p className="mt-1 text-xl font-semibold">{percent(metrics?.gatewayScore)}</p></div><div className="rounded-xl bg-[#f2f5ef] p-4"><p className="text-[11px] text-[#77827d]">Downstream reach</p><p className="mt-1 text-xl font-semibold">{metrics?.downstreamSkillCount ?? 0}</p></div><div className="rounded-xl bg-[#fff2e7] p-4"><p className="text-[11px] text-[#8c684f]">Can unlock next</p><p className="mt-1 text-xl font-semibold text-[#9e512e]">{metrics?.unlockableSkills.length ?? 0}</p></div></div>
        {metrics?.foundationRoute.length ? <div className="mt-4 rounded-xl border border-[#dfe5dc] bg-[#fbfcf8] p-4"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#68766f]">Shortest foundation route</p><div className="mt-3 flex flex-wrap items-center gap-2">{metrics.foundationRoute.map((id, index) => <span className="flex items-center gap-2 text-xs" key={id}><Badge variant={id === skill.id ? "warning" : "outline"}>{names.get(id) ?? id}</Badge>{index < metrics.foundationRoute.length - 1 && <span className="text-[#9aa49e]">→</span>}</span>)}</div></div> : null}
        {metrics?.unlockableSkills.length ? <div className="mt-4 rounded-xl border border-[#ecc9ae] bg-[#fff8ef] p-4"><p className="flex items-center gap-2 text-sm font-semibold"><Zap className="size-4 text-[#c96535]" /> Counterfactual unlock</p><p className="mt-1 text-xs leading-5 text-[#776b63]">If {skill.name} reaches the required confidence-adjusted threshold, these currently locked skills become ready:</p><div className="mt-3 flex flex-wrap gap-2">{metrics.unlockableSkills.map((item) => <Badge key={item.skillId} variant="warning">{item.skillName} at {percent(item.requiredMastery)}</Badge>)}</div></div> : null}
        <p className="mt-4 rounded-xl border border-[#e1e5de] bg-[#fbfcf9] px-4 py-3 text-sm leading-6 text-[#607068]">{skill.explanation}</p>
        {skill.prerequisites.length ? <div className="mt-5"><p className="mb-3 text-xs font-bold uppercase tracking-[.13em] text-[#68766f]">Exact prerequisite gates</p><div className="grid gap-2 lg:grid-cols-2">{skill.prerequisites.map((check) => <CheckRow check={check} key={`${skill.id}-${check.prerequisiteSkillId}`} />)}</div></div> : <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#edf4eb] px-4 py-3 text-xs text-[#3f6954]"><Unlock className="size-4" />Root skill—no prerequisite gate.</div>}
        {skill.status !== "LOCKED" && <Button asChild className="mt-5"><Link to={`/learning-library?skillId=${skill.id}`}><BookOpen className="size-4" /> Study {skill.name}</Link></Button>}
      </CardContent>
    </Card>
  );
}

export function PrerequisiteGraphPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEnrollmentId = searchParams.get("enrollmentId");
  const requestedSkillId = searchParams.get("skillId");
  const [analysis, setAnalysis] = useState<GoalPrerequisiteAnalysis | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentSummary[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(requestedSkillId);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    try {
      const enrollmentResult = await withSession(listEnrollments);
      const available = enrollmentResult.enrollments.filter((item) => item.status !== "DROPPED");
      setEnrollments(available);
      const enrollmentId = available.some((item) => item.id === requestedEnrollmentId) ? requestedEnrollmentId! : available.find((item) => item.status === "ACTIVE")?.id ?? available[0]?.id;
      if (!enrollmentId) throw new Error("Enroll in a course before opening its knowledge graph.");
      if (enrollmentId !== requestedEnrollmentId) setSearchParams({ enrollmentId }, { replace: true });
      const next = await withSession((token) => getPrerequisiteAnalysis(token, { enrollmentId }));
      setAnalysis(next);
      setSelectedSkillId((current) => current && next.skills.some((skill) => skill.id === current) ? current : next.analytics?.bottlenecks[0]?.skillId ?? next.skills.find((skill) => skill.status === "UNLOCKED")?.id ?? next.skills[0]?.id ?? null);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Prerequisite analysis could not be loaded."); }
    finally { setLoading(false); }
  }, [requestedEnrollmentId, setSearchParams, withSession]);

  useEffect(() => { void load(); }, [load]);

  const selectedSkill = analysis?.skills.find((skill) => skill.id === selectedSkillId) ?? null;
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query && analysis ? analysis.skills.filter((skill) => `${skill.name} ${skill.category}`.toLowerCase().includes(query)).slice(0, 6) : [];
  }, [analysis, search]);

  if (!user) return null;
  if (loading && !analysis) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef]"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-[#35614b]" /><p className="mt-3 text-sm text-[#6f7b75]">Running learner graph intelligence…</p></div></div>;
  if (!analysis) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef] p-5"><Card className="max-w-lg text-center"><CardHeader><CircleAlert className="mx-auto size-7 text-[#b95c3c]" /><CardTitle>Knowledge graph unavailable</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent><Button asChild><Link to="/dashboard">Return to dashboard</Link></Button></CardContent></Card></div>;

  const summary = analysis.summary;
  return (
    <LearnerAppShell>
      <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-10">
        {analysis.context.enrollmentId && <CourseNavigation enrollmentId={analysis.context.enrollmentId} courseName={analysis.context.name} />}
        <section className="relative overflow-hidden rounded-[2rem] bg-[#173d33] p-6 text-white sm:p-9"><div className="absolute -right-24 -top-24 size-80 rounded-full bg-[#4d7c68]/40 blur-3xl" /><div className="relative grid gap-7 lg:grid-cols-[1fr_360px] lg:items-center"><div><div className="flex flex-wrap gap-2"><Badge className="border-white/10 bg-white/10 text-[#dce8e2]" variant="outline"><Network className="mr-1.5 size-3.5" /> Knowledge Graph v2</Badge><Badge className="border-[#7cb291]/30 bg-[#65a77b]/15 text-[#d7efdc]" variant="outline">{analysis.analytics?.status === "AVAILABLE" ? "NetworkX live" : "TypeScript safe mode"}</Badge></div><h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">See what unlocks your learning.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-[#c3d3cd]">Required edges are enforced using global mastery and confidence. NetworkX measures gateway importance, downstream reach and counterfactual unlock impact without overriding safety gates.</p></div><div className="rounded-2xl border border-white/10 bg-white/[.07] p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#efa171]">Current graph</p><p className="mt-2 text-2xl font-semibold">{analysis.context.name}</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-white/[.07] p-3"><strong className="block text-xl">{analysis.analytics?.nodeCount ?? analysis.skills.length}</strong>nodes</div><div className="rounded-xl bg-white/[.07] p-3"><strong className="block text-xl">{analysis.analytics?.edgeCount ?? summary.requiredEdges}</strong>required edges</div><div className="rounded-xl bg-white/[.07] p-3"><strong className="block text-xl">{percent(summary.contextReadiness)}</strong>readiness</div><div className="rounded-xl bg-white/[.07] p-3"><strong className="block text-xl">{summary.lockedSkills}</strong>locked</div></div></div></div></section>

        <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#dce2da] bg-white p-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-3"><Route className="size-5 text-[#47745d]" /><div><p className="text-sm font-semibold">Choose the course context</p><p className="text-xs text-[#748078]">The same global mastery produces a different graph projection for each course.</p></div></div><div className="flex flex-wrap gap-2">{enrollments.map((enrollment) => <button aria-pressed={enrollment.id === analysis.context.enrollmentId} className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${enrollment.id === analysis.context.enrollmentId ? "border-[#173d33] bg-[#173d33] text-white" : "border-[#d7ddd5] bg-white text-[#586861] hover:border-[#93ad9d]"}`} key={enrollment.id} onClick={() => { setAnalysis(null); setSelectedSkillId(null); setSearchParams({ enrollmentId: enrollment.id }); }} type="button">{enrollment.courseName}</button>)}</div></section>
        {error && <div className="mt-5 rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]">{error}</div>}

        <section className="mt-7 grid gap-5 xl:grid-cols-[1fr_310px]"><div className="rounded-[1.75rem] border border-[#dce2da] bg-white p-5 sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#d06f3d]">Real dependency map</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Prerequisites → skills → future unlocks</h2><p className="mt-2 text-sm text-[#6d7a74]">Solid edges are required. Dashed edges are advisory. Select a node to highlight its immediate relationships.</p></div><div className="flex gap-2"><Badge variant="success">Mastered</Badge><Badge variant="warning">Ready</Badge><Badge variant="outline">Locked</Badge></div></div><div className="relative mt-5"><Search className="absolute left-3 top-3 size-4 text-[#89938e]" /><input aria-label="Find a graph skill" className="h-10 w-full rounded-xl border border-[#d9ded7] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#608b73]" onChange={(event) => setSearch(event.target.value)} placeholder="Find a skill in this graph" value={search} />{matches.length > 0 && <div className="absolute z-20 mt-1 w-full rounded-xl border border-[#dce2da] bg-white p-2 shadow-xl">{matches.map((skill) => <button className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f3f5f0]" key={skill.id} onClick={() => { setSelectedSkillId(skill.id); setSearch(""); }} type="button"><span className="font-medium">{skill.name}</span><Badge variant="outline">Layer {skill.dependencyLevel}</Badge></button>)}</div>}</div><div className="mt-4"><GraphCanvas analysis={analysis} onSelect={setSelectedSkillId} selectedId={selectedSkillId} /></div></div>
          <aside className="space-y-5"><Card><CardHeader><div className="flex items-center gap-2"><Zap className="size-5 text-[#d06c38]" /><CardTitle>Graph bottlenecks</CardTitle></div><CardDescription>High-impact foundations currently connected to locked course skills.</CardDescription></CardHeader><CardContent>{analysis.analytics?.bottlenecks.length ? <div className="space-y-2">{analysis.analytics.bottlenecks.map((item, index) => <button className="flex w-full items-center gap-3 rounded-xl border border-[#e1e5df] bg-[#fafbf8] p-3 text-left hover:border-[#e1a27e]" key={item.skillId} onClick={() => setSelectedSkillId(item.skillId)} type="button"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#fff0e5] text-xs font-bold text-[#a65a34]">{index + 1}</span><span className="min-w-0"><strong className="block truncate text-sm">{item.skillName}</strong><span className="text-[11px] text-[#748078]">{item.blockedContextSkillCount} locked downstream · {percent(item.gatewayScore)} gateway</span></span></button>)}</div> : <p className="text-sm leading-6 text-[#748078]">No active bottleneck is blocking this course projection.</p>}</CardContent></Card><Card className="bg-[#eef5ed]"><CardHeader><BrainCircuit className="size-5 text-[#3d7157]" /><CardTitle>Hybrid intelligence</CardTitle><CardDescription className="leading-6">PostgreSQL stores the graph. TypeScript enforces confidence-aware gates. NetworkX computes structural impact. Random Forest ranks only valid candidates.</CardDescription></CardHeader></Card></aside>
        </section>

        {selectedSkill && <section className="mt-7"><div className="mb-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#5d776b]">Selected node intelligence</p><h2 className="mt-2 text-2xl font-semibold">Why {selectedSkill.name} is {selectedSkill.status.toLowerCase()}</h2></div><SkillInspector analysis={analysis} skill={selectedSkill} /></section>}
        <section className="mt-7 rounded-2xl border border-[#d9e3d8] bg-[#f1f7ef] p-5"><div className="flex items-start gap-3"><GitBranch className="mt-0.5 size-5 shrink-0 text-[#3d7157]" /><div><p className="font-semibold">Knowledge Graph v2 decision boundary</p><p className="mt-2 text-sm leading-6 text-[#64736c]">NetworkX contributes at most a bounded gateway bonus to graph-valid candidates. It cannot unlock a skill, fabricate mastery, or bypass a required edge. If the analytics service is unavailable, prerequisite enforcement continues in TypeScript safe mode.</p></div></div></section>
      </main>
    </LearnerAppShell>
  );
}
