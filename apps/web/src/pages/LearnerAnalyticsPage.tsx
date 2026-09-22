import {
  Activity, BarChart3, BookCheck, BrainCircuit, CheckCircle2,
  CircleAlert, Fingerprint, Gauge, LoaderCircle, RefreshCw, Route, TimerReset,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getLearnerAnalytics, type LearnerAnalyticsOverview } from "../analytics/api";
import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { LearnerAppShell } from "../components/LearnerAppShell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { getRecommendationEvaluation, type RecommendationEvaluationOverview } from "../recommendations/api";

const percentage = (value: number | null) => value === null ? "—" : `${Math.round(value * 100)}%`;
const sourceLabel = (source: string) => source.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

function Distribution({ items, total }: { items: Array<{ color: string; label: string; value: number }>; total: number }) {
  return <div><div className="flex h-3 overflow-hidden rounded-full bg-[#e8ece6]">{items.map((item) => item.value > 0 && <span className={item.color} key={item.label} style={{ width: `${item.value / Math.max(total, 1) * 100}%` }} />)}</div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{items.map((item) => <div className="rounded-xl border border-[#e1e6df] bg-[#fafbf8] p-3" key={item.label}><div className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${item.color}`} /><p className="text-xs text-[#6f7c75]">{item.label}</p></div><p className="mt-2 text-2xl font-semibold">{item.value}</p></div>)}</div></div>;
}

function ProgressChart({ points }: { points: LearnerAnalyticsOverview["timeline"] }) {
  if (!points.length) return <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-[#cdd6cc] bg-[#fafbf8] p-6 text-center"><div><Activity className="mx-auto size-6 text-[#7b8881]" /><p className="mt-3 font-semibold">No evidence progression yet</p><p className="mt-2 text-sm text-[#718078]">Complete a diagnostic to establish your first mastery observation.</p></div></div>;
  const width = 720; const height = 220; const padX = 34; const padY = 24;
  const x = (index: number) => points.length === 1 ? width / 2 : padX + index * ((width - padX * 2) / (points.length - 1));
  const y = (value: number) => padY + (1 - value) * (height - padY * 2);
  const line = points.map((point, index) => `${x(index)},${y(point.portfolioAverage)}`).join(" ");
  return <div><svg aria-label="Average assessed mastery progression" className="h-auto w-full overflow-visible" role="img" viewBox={`0 0 ${width} ${height}`}><line stroke="#d9e0d8" x1={padX} x2={width - padX} y1={y(1)} y2={y(1)} /><line stroke="#d9e0d8" x1={padX} x2={width - padX} y1={y(.5)} y2={y(.5)} /><line stroke="#d9e0d8" x1={padX} x2={width - padX} y1={y(0)} y2={y(0)} /><text className="fill-[#7a8780] text-[11px]" x="2" y={y(1) + 4}>100</text><text className="fill-[#7a8780] text-[11px]" x="8" y={y(.5) + 4}>50</text><text className="fill-[#7a8780] text-[11px]" x="14" y={y(0) + 4}>0</text><polyline fill="none" points={line} stroke="#2f7358" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />{points.map((point, index) => <circle cx={x(index)} cy={y(point.portfolioAverage)} fill={index === points.length - 1 ? "#ed8d58" : "#2f7358"} key={`${point.createdAt}-${point.skillId}`} r={index === points.length - 1 ? 6 : 4}><title>{`${point.skillName}: portfolio average ${percentage(point.portfolioAverage)} after ${sourceLabel(point.sourceType)}`}</title></circle>)}</svg><div className="mt-3 flex items-center justify-between gap-4 text-xs text-[#748078]"><span>{new Date(points[0]!.createdAt).toLocaleDateString()}</span><span>Average across skills with evidence at each point</span><span>{new Date(points.at(-1)!.createdAt).toLocaleDateString()}</span></div></div>;
}

export function LearnerAnalyticsPage() {
  const { accessToken, refreshSession } = useAuth();
  const [analytics, setAnalytics] = useState<LearnerAnalyticsOverview | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationEvaluationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      const [nextAnalytics, nextRecommendations] = await Promise.all([
        withSession(getLearnerAnalytics),
        withSession(getRecommendationEvaluation),
      ]);
      setAnalytics(nextAnalytics); setRecommendations(nextRecommendations);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Your analytics could not be loaded."); }
    finally { setLoading(false); }
  }, [withSession]);

  useEffect(() => { void load(); }, [load]);
  const evidenceMax = useMemo(() => Math.max(1, ...(analytics?.evidenceCoverage.map((item) => item.evidenceCount) ?? [1])), [analytics]);

  if (loading && !analytics) return <main className="grid min-h-screen place-items-center bg-[#f4f5f0]"><LoaderCircle className="size-7 animate-spin text-[#356b54]" /><span className="sr-only">Loading analytics</span></main>;
  if (!analytics) return <main className="grid min-h-screen place-items-center bg-[#f4f5f0] p-5"><Card className="max-w-lg"><CardContent className="p-8 text-center"><CircleAlert className="mx-auto size-7 text-[#c16d43]" /><h1 className="mt-3 text-xl font-semibold">Analytics unavailable</h1><p className="mt-3 text-sm text-[#6e7a74]">{error}</p><Button className="mt-5" onClick={() => void load()}><RefreshCw className="size-4" /> Try again</Button></CardContent></Card></main>;

  const mastery = analytics.distributions.mastery;
  const retention = analytics.distributions.retention;
  const outcome = recommendations?.summary;
  const summaryCards = [
    [BookCheck, "Enrolled courses", analytics.summary.enrolledCourses, "Active learner scope"],
    [Fingerprint, "Skills assessed", analytics.summary.assessedSkills, `${analytics.summary.evidenceCoveragePercent}% evidence coverage`],
    [Gauge, "Average mastery", percentage(analytics.summary.averageMastery), "Unknown skills excluded"],
    [TimerReset, "Retention health", percentage(analytics.summary.averageRetention), `${analytics.summary.revisionDueSkills} need review`],
    [Route, "Active paths", analytics.summary.activePaths, "Enrollment-specific"],
    [CheckCircle2, "Lessons completed", analytics.summary.lessonsCompleted, `${analytics.summary.evidenceCount} evidence observations`],
  ] as const;

  return <LearnerAppShell>
    <main className="mx-auto max-w-[1320px] px-4 py-8 sm:px-7 sm:py-10"><section className="overflow-hidden rounded-[2rem] bg-[#173d33] p-7 text-white sm:p-10"><Badge className="border-white/10 bg-white/10 text-[#dbe8e2]" variant="outline"><BarChart3 className="mr-1.5 size-3.5" /> Evidence-based analytics</Badge><h1 className="mt-5 text-4xl font-semibold tracking-[-.055em] sm:text-5xl">See how your knowledge is changing.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-[#c4d4ce] sm:text-base">Every figure below comes from your diagnostics, practice, assessments, lesson activity, and current retention estimates. Unknown knowledge stays visible instead of being counted as failure.</p></section>
      {error && <div className="mt-5 rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]">{error}</div>}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{summaryCards.map(([Icon, label, value, detail]) => <Card key={label}><CardContent className="p-4"><Icon className="size-5 text-[#3c7259]" /><p className="mt-4 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs font-semibold">{label}</p><p className="mt-1 text-[11px] leading-4 text-[#75817b]">{detail}</p></CardContent></Card>)}</section>
      <section className="mt-6 grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Card><CardContent className="p-6 sm:p-7"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#ca6e3f]">Mastery over time</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Your assessed knowledge progression</h2><p className="mt-2 text-sm leading-6 text-[#6d7973]">The line recomputes your average using only skills with evidence at each observation.</p><div className="mt-6"><ProgressChart points={analytics.timeline} /></div></CardContent></Card><Card><CardContent className="p-6 sm:p-7"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#ca6e3f]">Evidence coverage</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">What supports your Skill Passport</h2>{analytics.evidenceCoverage.length ? <div className="mt-6 space-y-4">{analytics.evidenceCoverage.map((item) => <div key={item.sourceType}><div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{sourceLabel(item.sourceType)}</span><span className="text-[#718078]">{item.evidenceCount} observations · {item.skillCount} skills</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e9ede7]"><div className="h-full rounded-full bg-[#3f775d]" style={{ width: `${item.evidenceCount / evidenceMax * 100}%` }} /></div></div>)}</div> : <p className="mt-6 rounded-2xl bg-[#f4f6f1] p-5 text-sm text-[#6c7972]">No assessed evidence is available yet.</p>}</CardContent></Card></section>
      <section className="mt-6 grid gap-5 xl:grid-cols-2"><Card><CardContent className="p-6 sm:p-7"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#ca6e3f]">Skill mastery distribution</p><h2 className="mt-2 text-2xl font-semibold">Where your skills stand</h2><div className="mt-6"><Distribution items={[{ color: "bg-[#347255]", label: "Strong", value: mastery.strong }, { color: "bg-[#82aa72]", label: "Developing", value: mastery.developing }, { color: "bg-[#dc895c]", label: "Needs work", value: mastery.needsWork }, { color: "bg-[#b8c0bb]", label: "Unknown", value: mastery.unknown }]} total={analytics.summary.trackedSkills} /></div></CardContent></Card><Card><CardContent className="p-6 sm:p-7"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#ca6e3f]">Retention health</p><h2 className="mt-2 text-2xl font-semibold">What is likely to stay available</h2><div className="mt-6"><Distribution items={[{ color: "bg-[#347255]", label: "Healthy", value: retention.healthy }, { color: "bg-[#d3a84f]", label: "Review soon", value: retention.reviewSoon }, { color: "bg-[#c85d4d]", label: "At risk", value: retention.atRisk }, { color: "bg-[#b8c0bb]", label: "Unknown", value: retention.unknown }]} total={analytics.summary.trackedSkills} /></div></CardContent></Card></section>
      <section className="mt-6 rounded-[1.75rem] border border-[#dce2da] bg-white p-6 sm:p-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#ca6e3f]">Recommendation outcomes</p><h2 className="mt-2 text-2xl font-semibold">What happened after Learn Next</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#6d7973]">Observed assessed gain following accepted recommendations. This is descriptive attribution, not a causal effectiveness claim.</p></div><BrainCircuit className="size-6 text-[#3c7259]" /></div><div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{[["Received", outcome?.shown ?? 0], ["Accepted", outcome?.accepted ?? 0], ["Rejected", outcome?.rejected ?? 0], ["Lessons complete", outcome?.completed ?? 0], ["Assessed outcomes", outcome?.outcomeEvidence ?? 0], ["Observed gain", percentage(outcome?.meanLearningGain ?? null)]].map(([label, value]) => <div className="rounded-2xl bg-[#f4f6f1] p-4" key={String(label)}><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-[#6e7b74]">{label}</p></div>)}</div></section>
      <details className="mt-6 rounded-2xl border border-[#dfe4dd] bg-white p-5"><summary className="cursor-pointer text-sm font-semibold">How these analytics are calculated</summary><div className="mt-4 space-y-2 text-sm leading-6 text-[#68766f]"><p>{analytics.methodology.averageMastery}</p><p>{analytics.methodology.retention}</p><p>{analytics.methodology.disclaimer}</p></div></details>
    </main></LearnerAppShell>;
}
