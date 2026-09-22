import {
  AlarmClock, CheckCircle2,
  CircleAlert, Clock3, LoaderCircle, RefreshCw, ShieldCheck, TimerReset,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { LearnerAppShell } from "../components/LearnerAppShell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { getRetentionOverview, type RetentionOverview, type RetentionSkill, type RetentionState } from "../retention/api";

function percentage(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

const stateTone: Record<RetentionState, string> = {
  AT_RISK: "border-[#e8c17e] bg-[#fff8e8] text-[#936018]",
  CRITICAL: "border-[#e1aa98] bg-[#fff1eb] text-[#a4472f]",
  MODERATE: "border-[#c9d2ae] bg-[#f5f8e8] text-[#617026]",
  STRONG: "border-[#a9cfb4] bg-[#eaf7ec] text-[#276244]",
  UNKNOWN: "border-[#d7ddd6] bg-[#f4f5f1] text-[#6f7b75]",
};

function RetentionBar({ mastery, retention }: { mastery: number | null; retention: number | null }) {
  return (
    <div className="relative h-3 overflow-hidden rounded-full bg-[#e5e9e2]">
      {mastery !== null && <div className="absolute inset-y-0 left-0 rounded-full bg-[#c8d5ca]" style={{ width: `${mastery * 100}%` }} />}
      {retention !== null && <div className="absolute inset-y-0 left-0 rounded-full bg-[#37745a]" style={{ width: `${retention * 100}%` }} />}
    </div>
  );
}

function RetentionCard({ skill }: { skill: RetentionSkill }) {
  const context = skill.courseContexts[0];
  const checkUrl = `/practice/${skill.id}?mode=retention${context ? `&enrollmentId=${context.enrollmentId}` : ""}`;
  return (
    <Card className={`overflow-hidden bg-white ${skill.revisionDue ? "border-[#e5a77f] shadow-[0_14px_38px_rgba(139,73,38,0.08)]" : ""}`}>
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><Badge className={stateTone[skill.state]} variant="outline">{skill.revisionDue ? "Quick refresh recommended" : skill.state === "STRONG" ? "Memory looks fresh" : skill.state === "UNKNOWN" ? "Not assessed" : "Worth a quick check"}</Badge><h2 className="mt-4 text-lg font-semibold tracking-[-0.025em]">{skill.name}</h2><p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-[#87928c]">{skill.category}</p></div>
          <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${skill.revisionDue ? "bg-[#fff0e8] text-[#ad5033]" : skill.state === "STRONG" ? "bg-[#e5f3e8] text-[#2d694c]" : "bg-[#f0f2ed] text-[#77847e]"}`}>{skill.revisionDue ? <AlarmClock className="size-5" /> : <ShieldCheck className="size-5" />}</span>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#68766f]">{skill.revisionDue ? `You learned this earlier, but ${skill.daysSinceEvidence === null ? "it has not been checked recently" : `it has been about ${Math.max(1, Math.round(skill.daysSinceEvidence))} days since you practiced`}. A short review can refresh it.` : skill.state === "STRONG" ? "Your recent answers suggest this skill is still easy to recall." : skill.state === "UNKNOWN" ? "Complete a knowledge check or practice question before LearnPath can recommend a refresh." : "A quick check will show whether this skill is still easy to recall."}</p>
        {skill.practiceAvailable && skill.state !== "UNKNOWN" && <Button asChild className="mt-5 w-full" variant={skill.revisionDue ? "default" : "outline"}><Link to={checkUrl}><TimerReset className="size-4" />{skill.revisionDue ? "Review now" : "Check my memory"}</Link></Button>}
        <details className="mt-4 border-t border-[#e4e8e2] pt-3"><summary className="cursor-pointer text-xs font-semibold text-[#68766f]">Memory details</summary><div className="mt-3 rounded-2xl bg-[#f7f8f4] p-4"><div className="flex items-end justify-between gap-4"><div><p className="text-xs text-[#738078]">Estimated recall now</p><p className="mt-1 text-3xl font-semibold">{percentage(skill.retention)}</p></div><div className="text-right"><p className="text-xs text-[#738078]">Mastery</p><p className="mt-1 text-lg font-semibold text-[#63726a]">{percentage(skill.mastery)}</p></div></div><div className="mt-4"><RetentionBar mastery={skill.mastery} retention={skill.retention} /></div></div><div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#738078]"><span className="rounded-lg bg-[#f2f4ef] px-2.5 py-1.5">{skill.evidenceCount} observations</span>{context && <span className="rounded-lg bg-[#f2f4ef] px-2.5 py-1.5">{context.courseName}</span>}</div></details>
      </CardContent>
    </Card>
  );
}

export function RetentionPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const [overview, setOverview] = useState<RetentionOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "REVISION" | RetentionState>("ALL");
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
    try { setOverview(await withSession(getRetentionOverview)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Retention could not be calculated."); }
    finally { setLoading(false); }
  }, [withSession]);
  useEffect(() => { void load(); }, [load]);
  const skills = useMemo(() => (overview?.skills ?? []).filter((skill) => (
    filter === "ALL" || (filter === "REVISION" ? skill.revisionDue : skill.state === filter)
  )), [filter, overview]);

  if (!user) return null;
  if (loading && !overview) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef]"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-[#35614b]" /><p className="mt-3 text-sm text-[#6f7b75]">Calculating retained knowledge…</p></div></div>;
  const summary = overview?.summary;
  return (
    <LearnerAppShell>
      <main className="mx-auto max-w-[1320px] px-4 py-7 sm:px-7 sm:py-10">
        {error && <div className="mb-5 flex items-center justify-between rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]"><span>{error}</span><Button className="h-8 px-3 text-xs" onClick={() => void load()} variant="outline"><RefreshCw className="size-3.5" /> Retry</Button></div>}
        <section className="relative overflow-hidden rounded-[1.8rem] bg-[#173d33] p-6 text-white sm:p-9"><div className="absolute -right-20 -top-24 size-80 rounded-full bg-[#618670]/35 blur-3xl" /><div className="relative grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end"><div><Badge className="border-white/10 bg-white/10 text-[#dce9e3]" variant="outline"><TimerReset className="mr-1.5 size-3.5" /> Quick review</Badge><h1 className="mt-5 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">Keep important skills fresh.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-[#c4d4ce] sm:text-base">LearnPath watches for skills you learned earlier but have not practiced recently, then suggests a short refresh at the right time.</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.07] p-5"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#f0a06e]">Recommended now</p><p className="mt-3 text-5xl font-semibold">{summary?.revisionDueSkills ?? 0}</p><p className="mt-1 text-sm text-[#b9cbc4]">quick refresh{summary?.revisionDueSkills === 1 ? "" : "es"}</p><p className="mt-4 text-xs leading-5 text-[#bdcec7]">A successful review refreshes the skill using a real answer.</p></div></div></section>
        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
          { icon: CheckCircle2, label: "Strong", value: summary?.strongSkills ?? 0 },
          { icon: Clock3, label: "Moderate", value: summary?.moderateSkills ?? 0 },
          { icon: AlarmClock, label: "At risk / critical", value: (summary?.atRiskSkills ?? 0) + (summary?.criticalSkills ?? 0) },
          { icon: TimerReset, label: "Revision due", value: summary?.revisionDueSkills ?? 0 },
        ].map(({ icon: Icon, label, value }) => <Card key={label}><CardContent className="flex items-center gap-4 p-5"><span className="grid size-11 place-items-center rounded-2xl bg-[#e8efe6] text-[#35624f]"><Icon className="size-5" /></span><div><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-[#748078]">{label}</p></div></CardContent></Card>)}</section>
        <section className="mt-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Your memory plan</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Review what needs attention</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6d7a74]">Skills you have never learned are not treated as forgotten. Refreshes appear only after real learning evidence exists.</p></div><div className="flex flex-wrap gap-1 rounded-xl border border-[#d8ded6] bg-white p-1">{(["ALL", "REVISION", "STRONG", "MODERATE", "AT_RISK", "CRITICAL", "UNKNOWN"] as const).map((value) => <button aria-pressed={filter === value} className={`rounded-lg px-3 py-2 text-[11px] font-semibold ${filter === value ? "bg-[#173d33] text-white" : "text-[#69766f] hover:bg-[#f0f2ed]"}`} key={value} onClick={() => setFilter(value)} type="button">{value === "REVISION" ? "quick refresh" : value.toLowerCase().replace("_", " ")}</button>)}</div></div>
          {skills.length ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{skills.map((skill) => <RetentionCard key={skill.id} skill={skill} />)}</div> : <div className="mt-5 grid min-h-64 place-items-center rounded-[1.5rem] border border-dashed border-[#cbd4cb] bg-[#fafbf7] p-8 text-center"><div><CircleAlert className="mx-auto size-7 text-[#829088]" /><p className="mt-3 font-semibold">No skills match this retention view</p><p className="mt-2 text-sm text-[#748078]">Complete a diagnostic or practice check to establish a performance-evidence anchor.</p></div></div>}
        </section>
      </main>
    </LearnerAppShell>
  );
}
