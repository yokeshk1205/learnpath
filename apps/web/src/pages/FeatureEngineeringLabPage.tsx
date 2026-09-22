import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, BarChart3, BrainCircuit, Check,
  Clock3, Database, Filter, Fingerprint, GitBranch, Layers3,
  LockKeyhole, RefreshCw, Search, ShieldCheck, Sparkles, Target, Workflow,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { getFeatureDatasetOverview, type FeatureDatasetOverview } from "../features/api";

const categoryMeta: Record<string, { detail: string; icon: typeof Activity; tone: string }> = {
  LEARNER: { detail: "Experience, pace, activity and prior outcomes", icon: Activity, tone: "bg-[#e8f1e7] text-[#356b50]" },
  SKILL: { detail: "Difficulty, relevance and graph position", icon: Layers3, tone: "bg-[#fff0e5] text-[#ad5f37]" },
  MASTERY: { detail: "Knowledge, confidence and evidence", icon: BrainCircuit, tone: "bg-[#e8f1e7] text-[#356b50]" },
  PERFORMANCE: { detail: "Scores, trends and prior attempts", icon: BarChart3, tone: "bg-[#fff0e5] text-[#ad5f37]" },
  RETENTION: { detail: "Decay, recency and revision state", icon: Clock3, tone: "bg-[#e8f1e7] text-[#356b50]" },
  PREREQUISITE: { detail: "Threshold readiness and graph dependencies", icon: GitBranch, tone: "bg-[#fff0e5] text-[#ad5f37]" },
  INTERACTION: { detail: "Strictly shifted behavioral history", icon: Workflow, tone: "bg-[#e8f1e7] text-[#356b50]" },
};

function number(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function compact(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function label(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function LoadingState() {
  return <div className="mx-auto max-w-[1240px] space-y-5 px-5 py-10 sm:px-8"><div className="h-80 animate-pulse rounded-[2rem] bg-[#dfe7dc]" /><div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((item) => <div className="h-48 animate-pulse rounded-3xl bg-[#e7ebe4]" key={item} />)}</div></div>;
}

export function FeatureEngineeringLabPage() {
  const [overview, setOverview] = useState<FeatureDatasetOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [query, setQuery] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await getFeatureDatasetOverview());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The feature contract is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visibleFeatures = useMemo(() => {
    if (!overview) return [];
    const normalized = query.trim().toLowerCase();
    return overview.featureContract.features.filter((feature) =>
      (activeCategory === "ALL" || feature.category === activeCategory)
      && (!normalized || `${feature.name} ${feature.description} ${feature.source}`.toLowerCase().includes(normalized)),
    );
  }, [activeCategory, overview, query]);

  if (loading) return <LoadingState />;
  if (error || !overview) return <main className="grid min-h-screen place-items-center bg-[#f5f5ef] px-5"><Card className="max-w-lg"><CardHeader><CardTitle>Feature contract unavailable</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent className="flex gap-2"><Button onClick={() => void load()}><RefreshCw className="size-4" /> Retry</Button><Button asChild variant="outline"><Link to="/dashboard">Dashboard</Link></Button></CardContent></Card></main>;

  const categories = Object.entries(overview.categoryCounts);
  const sample = overview.sampleRows[0]!;
  return (
    <div className="min-h-screen bg-[#f5f5ef] text-[#18372f]">
      <header className="border-b border-[#dde3db] bg-[#f8f8f3]/95"><div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8"><Link className="flex items-center gap-3" to="/dashboard"><span className="grid size-10 place-items-center rounded-xl bg-[#173d33] text-white"><Sparkles className="size-5" /></span><div><p className="font-bold">LearnPath</p><p className="text-xs text-[#78847e]">Feature intelligence lab</p></div></Link><div className="flex items-center gap-1"><Button asChild className="hidden sm:inline-flex" variant="ghost"><Link to="/synthetic-data">Synthetic data</Link></Button><Button asChild variant="ghost"><Link to="/dashboard"><ArrowLeft className="size-4" /> Dashboard</Link></Button></div></div></header>

      <main className="mx-auto max-w-[1240px] space-y-6 px-5 py-8 sm:px-8 sm:py-10">
        <section className="overflow-hidden rounded-[2rem] bg-[#173f34] text-white"><div className="grid lg:grid-cols-[1.12fr_0.88fr]"><div className="p-7 sm:p-10 lg:p-12"><Badge className="border-white/15 bg-white/10 text-[#ffd0b1]" variant="outline"><Fingerprint className="mr-1.5 size-3.5" /> Phase 13 · frozen feature contract</Badge><h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.055em] sm:text-6xl">The reasoning inputs are visible before the model exists.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-[#c3d5ce] sm:text-base">Every learner × eligible candidate skill becomes one fixed-order vector. Current knowledge is allowed, prior outcomes are shifted, and the current outcome is sealed away as the label.</p><div className="mt-7 flex flex-wrap gap-2"><Badge className="border-white/15 bg-white/[0.07] text-white" variant="outline"><LockKeyhole className="mr-1.5 size-3.5" /> {overview.featureContract.contractVersion}</Badge><Badge className="border-white/15 bg-white/[0.07] text-white" variant="outline"><ShieldCheck className="mr-1.5 size-3.5" /> SHA {overview.dataset.sha256.slice(0, 12)}</Badge></div></div><div className="border-t border-white/10 bg-white/[0.055] p-7 sm:p-10 lg:border-l lg:border-t-0"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f2a06d]">Contract integrity</p><div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><Fingerprint className="size-5 text-[#9bd2b3]" /><p className="mt-5 text-3xl font-semibold">{overview.featureContract.featureCount}</p><p className="mt-1 text-xs text-[#b7cac2]">ordered numeric features</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><Database className="size-5 text-[#f3aa7d]" /><p className="mt-5 text-3xl font-semibold">{number(overview.dataset.rowCount)}</p><p className="mt-1 text-xs text-[#b7cac2]">engineered candidate rows</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><Layers3 className="size-5 text-[#9bd2b3]" /><p className="mt-5 text-3xl font-semibold">{categories.length}</p><p className="mt-1 text-xs text-[#b7cac2]">required feature families</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><Target className="size-5 text-[#f3aa7d]" /><p className="mt-5 text-3xl font-semibold">0</p><p className="mt-1 text-xs text-[#b7cac2]">labels inside the matrix</p></div></div></div></div></section>

        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce2da] bg-white"><div className="grid lg:grid-cols-[0.92fr_1.08fr]"><div className="bg-[#fff7ef] p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c76535]">Leakage shield</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">Only information known at decision time.</h2><p className="mt-4 text-sm leading-6 text-[#746e65]">The target remains useful for later training, but it is never mixed into the current feature vector.</p><div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#ead8c9] bg-white/80 p-4"><ShieldCheck className="size-5 text-[#387154]" /><div><p className="text-sm font-semibold">{overview.featureContract.leakagePolicy.currentOutcomeColumnsExcluded.length} current-outcome columns blocked</p><p className="mt-1 text-xs text-[#7c746b]">Including mastery gain, completion, post-assessment and benefit score.</p></div></div></div><div className="grid gap-3 p-6 sm:grid-cols-3 sm:p-8"><div className="rounded-2xl bg-[#edf4eb] p-5"><Badge variant="success">Allowed</Badge><p className="mt-4 font-semibold">Current learner state</p><p className="mt-2 text-xs leading-5 text-[#65746d]">Mastery, confidence, retention, prerequisite readiness and candidate context.</p></div><div className="rounded-2xl bg-[#f3f5f0] p-5"><Badge variant="outline">Shifted</Badge><p className="mt-4 font-semibold">Prior history only</p><p className="mt-2 text-xs leading-5 text-[#65746d]">Completion, time, engagement, feedback and scores move back one interaction.</p></div><div className="rounded-2xl bg-[#fff0e6] p-5"><Badge className="border-[#e8c5ae] bg-white text-[#a85835]" variant="outline">Blocked</Badge><p className="mt-4 font-semibold">Current outcomes</p><p className="mt-2 text-xs leading-5 text-[#756d66]">The current label and everything used to calculate it stay outside the matrix.</p></div></div></div></section>

        <section><div className="mb-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Seven feature families</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">A balanced view of readiness and fit</h2></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{categories.map(([category, count]) => { const meta = categoryMeta[category]; const Icon = meta?.icon ?? Layers3; return <button className={`rounded-2xl border p-5 text-left transition ${activeCategory === category ? "border-[#315f4c] bg-[#173f34] text-white" : "border-[#dce2da] bg-white hover:border-[#9ab2a6]"}`} key={category} onClick={() => setActiveCategory(activeCategory === category ? "ALL" : category)} type="button"><div className="flex items-center justify-between"><span className={`grid size-9 place-items-center rounded-xl ${activeCategory === category ? "bg-white/10 text-[#f2aa7c]" : meta?.tone}`}><Icon className="size-4" /></span><span className="font-mono text-sm">{String(count).padStart(2, "0")}</span></div><p className="mt-5 text-sm font-bold">{label(category)}</p><p className={`mt-2 text-xs leading-5 ${activeCategory === category ? "text-[#bed0c9]" : "text-[#728079]"}`}>{meta?.detail}</p></button>; })}</div></section>

        <section className="rounded-[1.75rem] border border-[#dce2da] bg-white"><div className="border-b border-[#e1e6df] p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Frozen order explorer</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Inspect every feature and its source</h2><p className="mt-2 text-sm text-[#6d7a74]">The same names, sequence and bounds are enforced for future training and inference.</p></div><div className="relative w-full lg:w-80"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7a867f]" /><Input aria-label="Search features" className="pl-9" onChange={(event) => setQuery(event.target.value)} placeholder="Search name, source, meaning…" value={query} /></div></div><div className="mt-5 flex flex-wrap items-center gap-2"><Button className={activeCategory === "ALL" ? "bg-[#173f34] text-white" : ""} onClick={() => setActiveCategory("ALL")} variant={activeCategory === "ALL" ? "default" : "outline"}><Filter className="size-3.5" /> All {overview.featureContract.featureCount}</Button>{activeCategory !== "ALL" && <Badge variant="outline">Showing {label(activeCategory)}</Badge>}<span className="ml-auto text-xs text-[#718078]">{visibleFeatures.length} visible</span></div></div><div className="grid gap-px bg-[#e2e6e0] lg:grid-cols-2">{visibleFeatures.map((feature) => { const range = overview.featureRanges[feature.name] ?? { maximum: feature.maximum, mean: 0, minimum: feature.minimum }; return <article className="bg-white p-5 sm:p-6" key={feature.name}><div className="flex items-start gap-4"><span className="font-mono text-xs text-[#c66e40]">#{String(feature.order).padStart(2, "0")}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="break-all font-mono text-sm font-bold">{feature.name}</h3><Badge variant={feature.availability === "PRIOR_HISTORY" ? "outline" : "success"}>{feature.availability === "PRIOR_HISTORY" ? "shifted history" : "current state"}</Badge></div><p className="mt-2 text-sm leading-6 text-[#64736c]">{feature.description}</p><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]"><div className="rounded-xl bg-[#f4f6f2] px-3 py-2 text-xs"><span className="text-[#7d8883]">Source</span><p className="mt-1 break-words font-mono text-[11px] text-[#395a4c]">{feature.source}</p></div><div className="rounded-xl bg-[#f4f6f2] px-3 py-2 text-xs sm:min-w-32"><span className="text-[#7d8883]">Observed</span><p className="mt-1 font-mono text-[11px] text-[#395a4c]">{compact(range.minimum)} → {compact(range.maximum)}</p></div></div></div></div></article>; })}</div>{visibleFeatures.length === 0 && <div className="p-12 text-center"><Search className="mx-auto size-7 text-[#8c9892]" /><p className="mt-3 font-semibold">No feature matches this filter.</p><Button className="mt-4" onClick={() => { setQuery(""); setActiveCategory("ALL"); }} variant="outline">Clear filters</Button></div>}</section>

        <section className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]"><Card><CardHeader><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Real vector inspection</p><CardTitle className="mt-2">One generated candidate, before its label</CardTitle><CardDescription className="mt-2">Values come directly from the Phase 13 feature artifact.</CardDescription></div><Database className="size-5 text-[#477761]" /></div></CardHeader><CardContent><div className="rounded-2xl bg-[#173f34] p-5 text-white"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-mono text-xs text-[#a9c2b7]">{String(sample.interaction_id)}</p><p className="mt-1 font-semibold">{String(sample.learner_id)} × candidate skill</p></div><Badge className="border-white/15 bg-white/10 text-white" variant="outline">label isolated: {Number(sample.beneficial) === 1 ? "beneficial" : "not beneficial"}</Badge></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{["current_mastery", "confidence", "retention", "prerequisite_readiness", "mastery_gap", "recent_score", "goal_relevance", "previous_interaction"].map((name) => <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3" key={name}><p className="truncate text-[10px] text-[#abc2b8]">{label(name)}</p><p className="mt-2 font-mono text-sm">{compact(Number(sample[name]))}</p></div>)}</div></div></CardContent></Card><Card><CardHeader><div className="flex items-start justify-between"><div><CardTitle>Contract gates</CardTitle><CardDescription className="mt-2">Artifact generation fails when any invariant is false.</CardDescription></div><BadgeCheck className="size-5 text-[#3e765a]" /></div></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">{Object.entries(overview.validation).map(([key, passed]) => <div className="flex items-center gap-3 rounded-xl border border-[#e1e6df] p-3" key={key}><span className={`grid size-7 place-items-center rounded-full ${passed ? "bg-[#e3f0e3] text-[#367051]" : "bg-[#f8e5dc] text-[#a85739]"}`}>{passed ? <Check className="size-3.5" /> : <Target className="size-3.5" />}</span><span className="text-xs font-semibold capitalize">{label(key.replace(/([A-Z])/g, "_$1"))}</span></div>)}</CardContent></Card></section>

        <section className="rounded-[1.75rem] border border-[#d4e2d6] bg-[#f1f7ef] p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#dcebdd] text-[#356d51]"><BrainCircuit className="size-5" /></span><div><p className="font-semibold">This exact contract now guards both training and inference.</p><p className="mt-2 max-w-3xl text-sm leading-6 text-[#66756d]">Phase 15 refuses missing, unexpected, non-finite, out-of-range, or reordered inputs before the model runs. Candidate ranking, Learn Next, and course paths remain separate.</p></div></div><Button asChild><Link to="/inference-lab">Test checked inference <ArrowRight className="size-4" /></Link></Button></div></section>
      </main>
    </div>
  );
}
