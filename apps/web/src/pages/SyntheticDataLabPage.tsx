import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, BarChart3, BrainCircuit, Check,
  CircleDot, Database, Dices, FlaskConical, GitBranch, Layers3,
  RefreshCw, ShieldCheck, Sparkles, Target, Users, Workflow,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { getSyntheticDatasetOverview, type SyntheticDatasetOverview } from "../synthetic-data/api";

function number(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function DistributionBars({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  return <div className="space-y-3">{entries.map(([label, value]) => <div key={label}><div className="flex items-center justify-between gap-4 text-xs"><span className="font-semibold capitalize">{label.toLowerCase().replaceAll("_", " ")}</span><span className="text-[#75817b]">{number(value)} · {percent(value / total)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e1e6df]"><div className="h-full rounded-full bg-[#3e7a5e]" style={{ width: `${(value / total) * 100}%` }} /></div></div>)}</div>;
}

const relationshipLabels: Record<string, { detail: string; label: string }> = {
  difficultyMismatchToMasteryGain: { detail: "Mismatch should suppress simulated gains.", label: "Difficulty fit → mastery" },
  engagementToCompletion: { detail: "Engaged learners should finish more often.", label: "Engagement → completion" },
  engagementToMasteryGain: { detail: "Engagement contributes to learning strength.", label: "Engagement → mastery" },
  practiceToAssessmentImprovement: { detail: "Practice should support post-assessment change.", label: "Practice → assessment" },
  prerequisiteMasteryToPostAssessment: { detail: "Stronger foundations support later performance.", label: "Prerequisites → performance" },
};

function LoadingState() {
  return <div className="mx-auto max-w-[1180px] space-y-5 px-5 py-10 sm:px-8"><div className="h-80 animate-pulse rounded-[2rem] bg-[#dfe7dc]" /><div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((item) => <div className="h-44 animate-pulse rounded-3xl bg-[#e7ebe4]" key={item} />)}</div></div>;
}

export function SyntheticDataLabPage() {
  const [overview, setOverview] = useState<SyntheticDatasetOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await getSyntheticDatasetOverview());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The dataset manifest is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const weightCards = useMemo(() => overview ? [
    { label: "Mastery gain", value: overview.benefitDefinition.mastery_gain_weight },
    { label: "Completion", value: overview.benefitDefinition.completion_weight },
    { label: "Assessment improvement", value: overview.benefitDefinition.assessment_improvement_weight },
    { label: "Learner feedback", value: overview.benefitDefinition.learner_feedback_weight },
  ] : [], [overview]);

  if (loading) return <LoadingState />;
  if (error || !overview) return <main className="grid min-h-screen place-items-center bg-[#f5f5ef] px-5"><Card className="max-w-lg"><CardHeader><CardTitle>Dataset manifest unavailable</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent className="flex gap-2"><Button onClick={() => void load()}><RefreshCw className="size-4" /> Retry</Button><Button asChild variant="outline"><Link to="/dashboard">Dashboard</Link></Button></CardContent></Card></main>;

  const positive = overview.distributions.beneficial.True ?? 0;
  const negative = overview.distributions.beneficial.False ?? 0;
  return (
    <div className="min-h-screen bg-[#f5f5ef] text-[#18372f]">
      <header className="border-b border-[#dde3db] bg-[#f8f8f3]/95"><div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8"><Link className="flex items-center gap-3" to="/dashboard"><span className="grid size-10 place-items-center rounded-xl bg-[#173d33] text-white"><Sparkles className="size-5" /></span><div><p className="font-bold">LearnPath</p><p className="text-xs text-[#78847e]">Synthetic data lab</p></div></Link><Button asChild variant="ghost"><Link to="/dashboard"><ArrowLeft className="size-4" /> Dashboard</Link></Button></div></header>
      <main className="mx-auto max-w-[1240px] space-y-6 px-5 py-8 sm:px-8 sm:py-10">
        <section className="overflow-hidden rounded-[2rem] bg-[#173f34] text-white"><div className="grid lg:grid-cols-[1.08fr_0.92fr]"><div className="p-7 sm:p-10 lg:p-12"><Badge className="border-white/15 bg-white/10 text-[#ffd0b1]" variant="outline"><FlaskConical className="mr-1.5 size-3.5" /> Phase 12 · {overview.classification}</Badge><h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.055em] sm:text-6xl">A training foundation reviewers can inspect.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-[#c3d5ce] sm:text-base">This artifact simulates learner–skill interactions against the real LearnPath curriculum graph. Its outcomes are noisy; its labels are not random. No row represents a real person.</p><div className="mt-7 flex flex-wrap gap-2"><Badge className="border-white/15 bg-white/[0.07] text-white" variant="outline"><Dices className="mr-1.5 size-3.5" /> Fixed seed {overview.dataset.randomSeed}</Badge><Badge className="border-white/15 bg-white/[0.07] text-white" variant="outline"><ShieldCheck className="mr-1.5 size-3.5" /> SHA {overview.dataset.sha256.slice(0, 12)}</Badge></div></div><div className="border-t border-white/10 bg-white/[0.055] p-7 sm:p-10 lg:border-l lg:border-t-0"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f2a06d]">Artifact integrity</p><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><Users className="size-5 text-[#9bd2b3]" /><p className="mt-5 text-3xl font-semibold">{number(overview.dataset.learnerCount)}</p><p className="mt-1 text-xs text-[#b7cac2]">simulated learners</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><Activity className="size-5 text-[#f3aa7d]" /><p className="mt-5 text-3xl font-semibold">{number(overview.dataset.interactionCount)}</p><p className="mt-1 text-xs text-[#b7cac2]">learner-skill interactions</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><Layers3 className="size-5 text-[#9bd2b3]" /><p className="mt-5 text-3xl font-semibold">{overview.curriculum.skillCount}</p><p className="mt-1 text-xs text-[#b7cac2]">real curriculum skills</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><GitBranch className="size-5 text-[#f3aa7d]" /><p className="mt-5 text-3xl font-semibold">{overview.curriculum.prerequisiteEdgeCount}</p><p className="mt-1 text-xs text-[#b7cac2]">real prerequisite edges</p></div></div></div></div></section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]"><Card><CardHeader><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Simulation pipeline</p><CardTitle className="mt-2">Relationships first, outcomes second</CardTitle><CardDescription className="mt-2 leading-6">Each interaction is generated from learner characteristics, live curriculum structure, study behavior, and bounded noise.</CardDescription></div><Workflow className="size-6 text-[#44755e]" /></div></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#eef3eb] p-4"><p className="text-xs font-bold text-[#3d7157]">01 · Learner</p><p className="mt-2 text-sm leading-6">Level, pace, consistency, ability, engagement and practice propensity.</p></div><div className="rounded-2xl bg-[#fff3e9] p-4"><p className="text-xs font-bold text-[#aa5c36]">02 · Candidate</p><p className="mt-2 text-sm leading-6">Skill difficulty, mastery, retention and required prerequisite readiness.</p></div><div className="rounded-2xl bg-[#eef3eb] p-4"><p className="text-xs font-bold text-[#3d7157]">03 · Interaction</p><p className="mt-2 text-sm leading-6">Engagement, practice, time, completion, guessing, skips and disengagement.</p></div><div className="rounded-2xl bg-[#fff3e9] p-4"><p className="text-xs font-bold text-[#aa5c36]">04 · Outcome</p><p className="mt-2 text-sm leading-6">Mastery gain, assessment change, completion and learner feedback.</p></div></div></CardContent></Card><Card><CardHeader><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Archetype coverage</p><CardTitle className="mt-2">Different learners, explicit proportions</CardTitle></div><Users className="size-6 text-[#44755e]" /></div></CardHeader><CardContent className="space-y-6"><div><p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#738078]">Starting level</p><DistributionBars values={overview.distributions.learnerLevel} /></div><div className="grid gap-6 sm:grid-cols-2"><div><p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#738078]">Learning pace</p><DistributionBars values={overview.distributions.learningPace} /></div><div><p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#738078]">Performance</p><DistributionBars values={overview.distributions.performanceConsistency} /></div></div></CardContent></Card></section>

        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce2da] bg-white"><div className="grid lg:grid-cols-[0.84fr_1.16fr]"><div className="bg-[#fff7ef] p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c76535]">Versioned benefit definition</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">Labels follow outcomes—not a coin flip.</h2><p className="mt-4 text-sm leading-6 text-[#746e65]">The simulator produces observable outcomes first. <code className="rounded bg-white px-1.5 py-1 text-xs">beneficial</code> is then calculated from {overview.benefitDefinition.version} at a {overview.benefitDefinition.threshold.toFixed(2)} threshold.</p><div className="mt-6 rounded-2xl border border-[#ead8c9] bg-white/75 p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#876c5d]">Observed label balance</p><div className="mt-4 flex h-3 overflow-hidden rounded-full"><span className="bg-[#438161]" style={{ width: `${overview.outcomes.beneficialRate * 100}%` }} /><span className="flex-1 bg-[#e3b191]" /></div><div className="mt-3 flex justify-between text-xs"><span>{number(positive)} beneficial · {percent(overview.outcomes.beneficialRate)}</span><span>{number(negative)} not beneficial</span></div></div></div><div className="p-6 sm:p-8"><div className="grid gap-3 sm:grid-cols-2">{weightCards.map((item) => <div className="rounded-2xl border border-[#e0e5dd] bg-[#fafbf8] p-5" key={item.label}><div className="flex items-center justify-between"><p className="text-sm font-semibold">{item.label}</p><Badge variant="outline">{percent(item.value)} weight</Badge></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e1e6df]"><div className="h-full rounded-full bg-[#3d785c]" style={{ width: `${item.value * 100}%` }} /></div></div>)}</div><p className="mt-5 flex items-start gap-2 rounded-xl bg-[#edf4eb] p-4 text-sm leading-6 text-[#3f6854]"><BadgeCheck className="mt-0.5 size-4 shrink-0" />Random labels: disabled. Formula verification: {overview.validation.benefitFormulaVerified ? "passed" : "failed"}.</p></div></div></section>

        <section><div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Measured simulator behavior</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Relationships visible in the generated artifact</h2><p className="mt-2 text-sm text-[#6d7a74]">These are calculated correlations, not hardcoded model metrics.</p></div><BarChart3 className="hidden size-6 text-[#477761] sm:block" /></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{Object.entries(overview.modeledRelationships).map(([key, value]) => <Card key={key}><CardContent className="p-5"><div className="flex items-center justify-between gap-2"><CircleDot className={`size-4 ${value < 0 ? "text-[#d16d3b]" : "text-[#3e795c]"}`} /><Badge variant="outline">r = {value.toFixed(2)}</Badge></div><p className="mt-5 text-sm font-semibold">{relationshipLabels[key]?.label ?? key}</p><p className="mt-2 text-xs leading-5 text-[#748078]">{relationshipLabels[key]?.detail}</p></CardContent></Card>)}</div></section>

        <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"><Card><CardHeader><div className="flex items-start justify-between"><div><CardTitle>Realistic noise is present</CardTitle><CardDescription className="mt-2">Noise changes simulated outcomes, never the label rule.</CardDescription></div><Dices className="size-5 text-[#d17441]" /></div></CardHeader><CardContent className="grid grid-cols-2 gap-2">{Object.entries(overview.noise).map(([key, value]) => <div className="rounded-xl bg-[#f3f5f0] p-3" key={key}><p className="text-lg font-semibold">{number(value)}</p><p className="mt-1 text-[11px] capitalize text-[#77837d]">{key.replace(/([A-Z])/g, " $1")}</p></div>)}</CardContent></Card><Card><CardHeader><div className="flex items-start justify-between"><div><CardTitle>Integrity gates</CardTitle><CardDescription className="mt-2">Generation fails when any required invariant is false.</CardDescription></div><ShieldCheck className="size-5 text-[#3e765a]" /></div></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{Object.entries(overview.validation).map(([key, passed]) => <div className="flex items-center gap-3 rounded-xl border border-[#e1e6df] p-3" key={key}><span className={`grid size-7 place-items-center rounded-full ${passed ? "bg-[#e3f0e3] text-[#367051]" : "bg-[#f8e5dc] text-[#a85739]"}`}>{passed ? <Check className="size-3.5" /> : <Target className="size-3.5" />}</span><span className="text-xs font-semibold capitalize">{key.replace(/([A-Z])/g, " $1")}</span></div>)}</CardContent></Card></section>

        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce2da] bg-white"><div className="border-b border-[#e1e6df] p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Generated row inspection</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Sample interactions from the manifest</h2><p className="mt-2 text-sm text-[#6d7a74]">Synthetic identifiers make the classification obvious and contain no user information.</p></div><Database className="size-6 text-[#477761]" /></div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-[#f5f7f2] text-[#6c7972]"><tr><th className="px-5 py-3">Learner</th><th className="px-5 py-3">Archetype</th><th className="px-5 py-3">Skill</th><th className="px-5 py-3">Candidate</th><th className="px-5 py-3">Mastery</th><th className="px-5 py-3">Engagement</th><th className="px-5 py-3">Benefit</th><th className="px-5 py-3">Label</th></tr></thead><tbody>{overview.sampleRows.slice(0, 6).map((row) => <tr className="border-t border-[#e6e9e4]" key={String(row.interaction_id)}><td className="px-5 py-4 font-mono">{String(row.learner_id)}</td><td className="px-5 py-4">{String(row.learner_archetype).toLowerCase().replaceAll("_", " ")}</td><td className="px-5 py-4 font-semibold">{String(row.skill_slug).replaceAll("-", " ")}</td><td className="px-5 py-4"><Badge variant="outline">{String(row.candidate_kind).toLowerCase().replaceAll("_", " ")}</Badge></td><td className="px-5 py-4">{percent(Number(row.current_mastery))} → {percent(Number(row.post_mastery))}</td><td className="px-5 py-4">{percent(Number(row.engagement))}</td><td className="px-5 py-4 font-mono">{Number(row.benefit_score).toFixed(3)}</td><td className="px-5 py-4"><Badge variant={row.beneficial ? "success" : "outline"}>{row.beneficial ? "beneficial" : "not beneficial"}</Badge></td></tr>)}</tbody></table></div></section>

        <section className="rounded-[1.75rem] border border-[#ecd8c7] bg-[#fff8ef] p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#f6e3d3] text-[#ac5c35]"><BrainCircuit className="size-5" /></span><div><p className="font-semibold">This dataset is not a recommendation model.</p><p className="mt-2 max-w-3xl text-sm leading-6 text-[#746f65]">Phase 13 now transforms these raw interactions into a frozen, leakage-safe feature contract. Training, measured evaluation, inference, Learn Next, and path generation remain unavailable.</p></div></div><Button asChild variant="outline"><Link to="/feature-lab">Inspect engineered features <ArrowRight className="size-4" /></Link></Button></div></section>
      </main>
    </div>
  );
}
