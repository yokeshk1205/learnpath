import {
  ArrowLeft, ArrowRight, BadgeCheck, Braces, Check, Cpu, Gauge,
  LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles,
  Target, Workflow, Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  getInferenceOverview,
  predictBenefit,
  type InferenceOverview,
  type InferenceSampleCandidate,
  type PredictionResponse,
} from "../inference/api";

const controls = [
  { feature: "recent_score", label: "Recent performance", detail: "Latest decision-time score" },
  { feature: "current_mastery", label: "Current mastery", detail: "Global knowledge estimate" },
  { feature: "confidence", label: "Evidence confidence", detail: "Reliability of mastery" },
  { feature: "retention", label: "Retention", detail: "Currently retained knowledge" },
  { feature: "prerequisite_readiness", label: "Prerequisite readiness", detail: "Dependency threshold state" },
  { feature: "historical_feedback", label: "Prior feedback", detail: "Shifted interaction history" },
] as const;

function pretty(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replaceAll("_", " ").toLowerCase();
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function LoadingState() {
  return <div className="mx-auto max-w-[1240px] space-y-5 px-5 py-10 sm:px-8"><div className="h-80 animate-pulse rounded-[2rem] bg-[#dfe7dc]" /><div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((item) => <div className="h-48 animate-pulse rounded-3xl bg-[#e7ebe4]" key={item} />)}</div></div>;
}

function ProbabilityDial({ probability, threshold }: { probability: number; threshold: number }) {
  const percentage = Math.round(probability * 100);
  const above = probability >= threshold;
  return <div className="flex flex-col items-center"><div className="relative grid size-48 place-items-center rounded-full" style={{ background: `conic-gradient(#f09a68 ${percentage}%, rgba(255,255,255,.1) ${percentage}% 100%)` }}><div className="grid size-[10.25rem] place-items-center rounded-full bg-[#173f34] text-center"><div><p className="text-5xl font-semibold tracking-[-0.06em]">{percentage}%</p><p className="mt-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#abc2b8]">benefit probability</p></div></div></div><Badge className={`mt-5 ${above ? "border-[#8fc39d]/30 bg-[#6ba47a]/15 text-[#d4f0d8]" : "border-[#e9a678]/30 bg-[#e98752]/10 text-[#ffd0b1]"}`} variant="outline">{above ? "Above validation threshold" : "Below validation threshold"}</Badge></div>;
}

export function InferenceLabPage() {
  const [overview, setOverview] = useState<InferenceOverview | null>(null);
  const [selected, setSelected] = useState(0);
  const [features, setFeatures] = useState<Record<string, number>>({});
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const infer = useCallback(async (
    currentOverview: InferenceOverview,
    candidate: InferenceSampleCandidate,
    vector: Record<string, number>,
  ) => {
    setPredicting(true);
    setError(null);
    try {
      setPrediction(await predictBenefit(
        currentOverview.featureContract.contractVersion,
        candidate.skillId,
        vector,
      ));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Probability inference failed.");
      setPrediction(null);
    } finally {
      setPredicting(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getInferenceOverview();
      const first = next.sampleCandidates[0];
      if (!first) throw new Error("No checked inference example is available.");
      const vector = { ...first.features };
      setOverview(next);
      setSelected(0);
      setFeatures(vector);
      await infer(next, first, vector);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The inference runtime is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [infer]);

  useEffect(() => { void load(); }, [load]);

  const candidate = overview?.sampleCandidates[selected];
  const probability = prediction?.predictions[0]?.benefit_probability;
  const topSignals = useMemo(() => overview?.model.featureImportance.slice(0, 6) ?? [], [overview]);

  const chooseCandidate = (index: number) => {
    if (!overview) return;
    const next = overview.sampleCandidates[index];
    if (!next) return;
    const vector = { ...next.features };
    setSelected(index);
    setFeatures(vector);
    setPrediction(null);
    void infer(overview, next, vector);
  };

  const changeFeature = (name: string, value: number) => {
    setFeatures((current) => {
      const next = { ...current, [name]: value };
      if (name === "current_mastery") {
        next.mastery_gap = 1 - value;
      }
      if (name === "retention") {
        next.retention_state_fresh = value >= 0.75 ? 1 : 0;
        next.retention_state_due = value >= 0.5 && value < 0.75 ? 1 : 0;
        next.retention_state_critical = value < 0.5 ? 1 : 0;
      }
      return next;
    });
    setPrediction(null);
  };

  if (loading) return <LoadingState />;
  if (!overview || !candidate) return <main className="grid min-h-screen place-items-center bg-[#f5f5ef] px-5"><Card className="max-w-lg"><CardHeader><CardTitle>Inference runtime unavailable</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent className="flex gap-2"><Button onClick={() => void load()}><RefreshCw className="size-4" /> Retry</Button><Button asChild variant="outline"><Link to="/dashboard">Dashboard</Link></Button></CardContent></Card></main>;

  return (
    <div className="min-h-screen bg-[#f5f5ef] text-[#18372f]">
      <header className="border-b border-[#dde3db] bg-[#f8f8f3]/95"><div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8"><Link className="flex items-center gap-3" to="/dashboard"><span className="grid size-10 place-items-center rounded-xl bg-[#173d33] text-white"><Sparkles className="size-5" /></span><div><p className="font-bold">LearnPath</p><p className="text-xs text-[#78847e]">Inference lab</p></div></Link><div className="flex items-center gap-1"><Button asChild className="hidden sm:inline-flex" variant="ghost"><Link to="/model-evaluation">Model evaluation</Link></Button><Button asChild variant="ghost"><Link to="/dashboard"><ArrowLeft className="size-4" /> Dashboard</Link></Button></div></div></header>

      <main className="mx-auto max-w-[1240px] space-y-6 px-5 py-8 sm:px-8 sm:py-10">
        <section className="overflow-hidden rounded-[2rem] bg-[#173f34] text-white"><div className="grid lg:grid-cols-[1.05fr_0.95fr]"><div className="p-7 sm:p-10 lg:p-12"><Badge className="border-white/15 bg-white/10 text-[#ffd0b1]" variant="outline"><Zap className="mr-1.5 size-3.5" /> Phase 15 · live probability inference</Badge><h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.055em] sm:text-6xl">One checked vector. One real probability.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-[#c3d5ce] sm:text-base">The evaluated Random Forest is loaded only after its checksum and all 55 feature names match. This service estimates benefit; it does not select Learn Next.</p><div className="mt-7 flex flex-wrap gap-2"><Badge className="border-white/15 bg-white/[0.07] text-white" variant="outline"><Cpu className="mr-1.5 size-3.5" /> {overview.model.modelVersion}</Badge><Badge className="border-[#8fc39d]/30 bg-[#6ba47a]/15 text-[#d4f0d8]" variant="outline"><BadgeCheck className="mr-1.5 size-3.5" /> inference ready</Badge></div></div><div className="border-t border-white/10 bg-white/[0.055] p-7 sm:p-10 lg:border-l lg:border-t-0"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f2a06d]">Live model response</p><div className="mt-7">{typeof probability === "number" ? <ProbabilityDial probability={probability} threshold={overview.inference.decisionThreshold} /> : <div className="grid h-64 place-items-center rounded-3xl border border-dashed border-white/15"><div className="text-center">{predicting ? <LoaderCircle className="mx-auto size-7 animate-spin text-[#f1a172]" /> : <SlidersHorizontal className="mx-auto size-7 text-[#9bb4aa]" />}<p className="mt-3 text-sm text-[#b8cbc3]">{predicting ? "Running checked inference…" : "Feature changes are ready to evaluate."}</p></div></div>}</div></div></div></section>

        <section className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]"><Card><CardHeader><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Simulated candidate context</p><CardTitle className="mt-2">Choose a backend feature example</CardTitle><CardDescription className="mt-2">These examples come from the generated Phase 13 artifact, never from a real learner.</CardDescription></div><Workflow className="size-5 text-[#477761]" /></div></CardHeader><CardContent className="space-y-2">{overview.sampleCandidates.map((item, index) => <button className={`w-full rounded-2xl border p-4 text-left transition ${selected === index ? "border-[#8bb29b] bg-[#edf5ea]" : "border-[#e0e5dd] bg-[#fafbf8] hover:border-[#b9c8bc]"}`} key={item.candidateId} onClick={() => chooseCandidate(index)} type="button"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{item.skillName}</p><p className="mt-1 text-xs text-[#738078]">{item.courseName} · {item.skillCategory}</p></div>{selected === index && <span className="grid size-7 place-items-center rounded-full bg-[#3f785b] text-white"><Check className="size-3.5" /></span>}</div></button>)}</CardContent></Card>

          <Card><CardHeader><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Hypothetical input controls</p><CardTitle className="mt-2">See the same model react</CardTitle><CardDescription className="mt-2">Adjust selected decision-time signals, then submit the complete 55-feature vector.</CardDescription></div><SlidersHorizontal className="size-5 text-[#477761]" /></div></CardHeader><CardContent><div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">{controls.map((control) => <label className="block" key={control.feature}><span className="flex items-start justify-between gap-3"><span><span className="block text-sm font-semibold">{control.label}</span><span className="mt-1 block text-[11px] text-[#7b8781]">{control.detail}</span></span><span className="font-mono text-sm font-bold text-[#397056]">{Math.round((features[control.feature] ?? 0) * 100)}%</span></span><input aria-label={control.label} className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-[#dfe6de] accent-[#3f785b]" max="1" min="0" onChange={(event) => changeFeature(control.feature, Number(event.target.value))} step="0.01" type="range" value={features[control.feature] ?? 0} /></label>)}</div>{error && <div className="mt-5 rounded-xl border border-[#edc6b4] bg-[#fff1e8] p-3 text-xs text-[#995337]">{error}</div>}<div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#e2e6df] pt-5"><p className="text-xs text-[#75817b]">Pending vector: {overview.featureContract.featureCount} ordered numeric features</p><Button disabled={predicting} onClick={() => void infer(overview, candidate, features)}>{predicting ? <LoaderCircle className="size-4 animate-spin" /> : <Zap className="size-4" />}{prediction ? "Run again" : "Run real inference"}</Button></div></CardContent></Card></section>

        <section className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]"><Card><CardHeader><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Inference trace</p><CardTitle className="mt-2">What just crossed the service boundary</CardTitle></div><Braces className="size-5 text-[#477761]" /></div></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-[#f2f5ef] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#77827d]">01 · Validate</p><p className="mt-3 font-semibold">{overview.featureContract.featureCount} exact features</p><p className="mt-2 text-xs leading-5 text-[#6e7b75]">Unknown, missing, non-finite, or out-of-range inputs return HTTP 422.</p></div><div className="rounded-2xl bg-[#173f34] p-4 text-white"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a9c2b8]">02 · Infer</p><p className="mt-3 font-semibold">{overview.model.modelType}</p><p className="mt-2 text-xs leading-5 text-[#b8cbc3]">Checked artifact {shortHash(overview.model.artifactSha256)}</p></div><div className="rounded-2xl bg-[#fff2e8] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#a9633e]">03 · Return</p><p className="mt-3 font-semibold">Benefit probability</p><p className="mt-2 text-xs leading-5 text-[#786f68]">Model and feature versions travel with every response.</p></div></div><div className="mt-4 rounded-xl border border-[#e0e5dd] px-4 py-3 text-xs text-[#69766f]"><span className="font-semibold">Current example:</span> {candidate.skillName} · {candidate.courseName} · <span className="font-mono">{candidate.candidateId}</span></div></CardContent></Card><Card><CardHeader><div className="flex items-start justify-between"><div><CardTitle>Serving gates</CardTitle><CardDescription className="mt-2">Inference is unavailable when any runtime invariant fails.</CardDescription></div><ShieldCheck className="size-5 text-[#3e765a]" /></div></CardHeader><CardContent className="space-y-2">{Object.entries(overview.validation).map(([name, passed]) => <div className="flex items-center gap-3 rounded-xl border border-[#e1e6df] p-3" key={name}><span className={`grid size-7 place-items-center rounded-full ${passed ? "bg-[#e3f0e3] text-[#367051]" : "bg-[#f8e5dc] text-[#a85739]"}`}>{passed ? <Check className="size-3.5" /> : <Target className="size-3.5" />}</span><span className="text-xs font-semibold capitalize">{pretty(name)}</span></div>)}</CardContent></Card></section>

        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce2da] bg-white"><div className="grid lg:grid-cols-[0.72fr_1.28fr]"><div className="bg-[#173f34] p-6 text-white sm:p-8"><Gauge className="size-6 text-[#f0a070]" /><p className="mt-8 text-xs font-bold uppercase tracking-[0.16em] text-[#a9c2b8]">Measured model signals</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">Importance is visible, not causal.</h2><p className="mt-4 text-sm leading-6 text-[#b9ccc4]">These weights come from the saved Random Forest artifact. They explain model reliance—not why a learner will benefit.</p></div><div className="grid gap-x-8 gap-y-4 p-6 sm:grid-cols-2 sm:p-8">{topSignals.map((signal, index) => <div key={signal.feature}><div className="flex items-center justify-between gap-4 text-xs"><span><span className="mr-2 font-mono text-[#c66e40]">0{index + 1}</span>{pretty(signal.feature)}</span><span className="font-mono font-semibold">{(signal.importance * 100).toFixed(1)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e4e8e2]"><div className="h-full rounded-full bg-[#3e795c]" style={{ width: `${Math.min(100, signal.importance / (topSignals[0]?.importance ?? 1) * 100)}%` }} /></div></div>)}</div></div></section>

        <section className="rounded-[1.75rem] border border-[#ecd8c7] bg-[#fff8ef] p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#f6e3d3] text-[#ac5c35]"><LockKeyhole className="size-5" /></span><div><p className="font-semibold">Probability inference is not a personalized path.</p><p className="mt-2 max-w-3xl text-sm leading-6 text-[#746f65]">Phase 15 can score an already-eligible candidate vector. Phase 16 must combine those probabilities with prerequisite-valid candidate generation to create one course-enrollment path. No live candidate order, Learn Next decision, course progress, or learner evidence is changed here.</p></div></div><Button asChild variant="outline"><Link to="/model-evaluation">Review held-out evidence <ArrowRight className="size-4" /></Link></Button></div></section>
      </main>
    </div>
  );
}
