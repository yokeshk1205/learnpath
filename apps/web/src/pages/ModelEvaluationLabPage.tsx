import {
  ArrowLeft, ArrowRight, BadgeCheck, BarChart3, BrainCircuit, Check,
  FlaskConical, Gauge, GitCompareArrows,
  LockKeyhole, RefreshCw, Scale, ShieldCheck, Sparkles, Target, Trophy, Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { getModelEvaluationOverview, type EvaluationMetrics, type ModelEvaluationOverview } from "../model-evaluation/api";

const displayNames: Record<string, string> = {
  gradient_boosting: "Gradient Boosting",
  random_forest: "Random Forest",
  logistic_regression: "Logistic Regression",
  highest_skill_gap: "Highest Skill Gap",
  popularity: "Popularity",
};
const predictorOrder = ["random_forest", "gradient_boosting", "logistic_regression", "highest_skill_gap", "popularity"];

function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function number(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function signedPoints(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)} pp`;
}

function label(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replaceAll("_", " ").toLowerCase();
}

function LoadingState() {
  return <div className="mx-auto max-w-[1240px] space-y-5 px-5 py-10 sm:px-8"><div className="h-80 animate-pulse rounded-[2rem] bg-[#dfe7dc]" /><div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map((item) => <div className="h-48 animate-pulse rounded-3xl bg-[#e7ebe4]" key={item} />)}</div></div>;
}

function MetricTile({ detail, label: metricLabel, value }: { detail: string; label: string; value: number }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a9c2b8]">{metricLabel}</p><p className="mt-4 text-3xl font-semibold">{value.toFixed(3)}</p><p className="mt-2 text-xs leading-5 text-[#b9ccc4]">{detail}</p></div>;
}

function ScoreBar({ value }: { value: number }) {
  return <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e2e7e1]"><div className="h-full rounded-full bg-[#3f7b5d]" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div>;
}

export function ModelEvaluationLabPage() {
  const [overview, setOverview] = useState<ModelEvaluationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricGroup, setMetricGroup] = useState<"classification" | "ranking">("ranking");
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await getModelEvaluationOverview());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The model evaluation is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const metricColumns = useMemo(() => metricGroup === "ranking" ? [
    { key: "ndcgAt5", label: "NDCG@5" },
    { key: "precisionAt3", label: "P@3" },
    { key: "precisionAt5", label: "P@5" },
    { key: "recallAt5", label: "R@5" },
  ] : [
    { key: "rocAuc", label: "ROC-AUC" },
    { key: "f1", label: "F1" },
    { key: "precision", label: "Precision" },
    { key: "recall", label: "Recall" },
    { key: "accuracy", label: "Accuracy" },
  ], [metricGroup]);

  if (loading) return <LoadingState />;
  if (error || !overview) return <main className="grid min-h-screen place-items-center bg-[#f5f5ef] px-5"><Card className="max-w-lg"><CardHeader><CardTitle>Model evaluation unavailable</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent className="flex gap-2"><Button onClick={() => void load()}><RefreshCw className="size-4" /> Retry</Button><Button asChild variant="outline"><Link to="/dashboard">Dashboard</Link></Button></CardContent></Card></main>;

  const selectedTest = overview.metrics.test[overview.model.selectedModel]!;
  const selectedValidation = overview.metrics.validation[overview.model.selectedModel]!;
  const maxImportance = Math.max(...overview.model.featureImportance.map((item) => item.importance));
  const matrix = selectedTest.confusionMatrix;
  return (
    <div className="min-h-screen bg-[#f5f5ef] text-[#18372f]">
      <header className="border-b border-[#dde3db] bg-[#f8f8f3]/95"><div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-4 sm:px-8"><Link className="flex items-center gap-3" to="/dashboard"><span className="grid size-10 place-items-center rounded-xl bg-[#173d33] text-white"><Sparkles className="size-5" /></span><div><p className="font-bold">LearnPath</p><p className="text-xs text-[#78847e]">Model evaluation lab</p></div></Link><div className="flex items-center gap-1"><Button asChild className="hidden sm:inline-flex" variant="ghost"><Link to="/feature-lab">Feature contract</Link></Button><Button asChild variant="ghost"><Link to="/dashboard"><ArrowLeft className="size-4" /> Dashboard</Link></Button></div></div></header>

      <main className="mx-auto max-w-[1240px] space-y-6 px-5 py-8 sm:px-8 sm:py-10">
        <section className="overflow-hidden rounded-[2rem] bg-[#173f34] text-white"><div className="grid lg:grid-cols-[1.04fr_0.96fr]"><div className="p-7 sm:p-10 lg:p-12"><Badge className="border-white/15 bg-white/10 text-[#ffd0b1]" variant="outline"><FlaskConical className="mr-1.5 size-3.5" /> Phase 14 · offline evaluation</Badge><h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.055em] sm:text-6xl">Measured intelligence, before deployment.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-[#c3d5ce] sm:text-base">{overview.model.selectedModelDisplayName} was selected on validation learners, then measured once on an untouched test group. These remain the offline results that justify the separate Phase 15 serving boundary.</p><div className="mt-7 flex flex-wrap gap-2"><Badge className="border-white/15 bg-white/[0.07] text-white" variant="outline"><Trophy className="mr-1.5 size-3.5" /> {overview.model.modelVersion}</Badge><Badge className="border-[#e9a678]/40 bg-[#e98752]/10 text-[#ffd0b1]" variant="outline"><LockKeyhole className="mr-1.5 size-3.5" /> evaluation artifact</Badge></div></div><div className="border-t border-white/10 bg-white/[0.055] p-7 sm:p-10 lg:border-l lg:border-t-0"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#f2a06d]">Held-out test performance</p><div className="mt-6 grid grid-cols-2 gap-3"><MetricTile detail="Probability separation" label="ROC-AUC" value={selectedTest.rocAuc} /><MetricTile detail="Top-five ranking quality" label="NDCG@5" value={selectedTest.ndcgAt5} /><MetricTile detail="Relevant items in top five" label="Precision@5" value={selectedTest.precisionAt5} /><MetricTile detail="Positive-class balance" label="F1" value={selectedTest.f1} /></div></div></div></section>

        <section className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]"><Card><CardHeader><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Learner-disjoint protocol</p><CardTitle className="mt-2">No learner crosses a split boundary</CardTitle><CardDescription className="mt-2">Seed {overview.experiment.randomSeed} assigns every simulated learner exactly once.</CardDescription></div><Users className="size-5 text-[#477761]" /></div></CardHeader><CardContent><div className="flex h-4 overflow-hidden rounded-full"><span className="bg-[#2f6f53]" style={{ width: `${overview.split.fractions.train * 100}%` }} /><span className="bg-[#e98b55]" style={{ width: `${overview.split.fractions.validation * 100}%` }} /><span className="bg-[#e9bd9f]" style={{ width: `${overview.split.fractions.test * 100}%` }} /></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{(["train", "validation", "test"] as const).map((name, index) => <div className="rounded-2xl bg-[#f3f5f0] p-4" key={name}><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${index === 0 ? "bg-[#2f6f53]" : index === 1 ? "bg-[#e98b55]" : "bg-[#e9bd9f]"}`} /><p className="text-xs font-bold capitalize">{name}</p></div><p className="mt-4 text-2xl font-semibold">{number(overview.split.learnerCounts[name])}</p><p className="mt-1 text-xs text-[#718078]">learners · {number(overview.split.rowCounts[name])} rows</p><p className="mt-2 text-[11px] text-[#8a948f]">{number(overview.split.positiveLabels[name])} positive labels</p></div>)}</div><p className="mt-4 flex items-center gap-2 rounded-xl bg-[#eaf3e8] p-3 text-xs font-semibold text-[#376950]"><ShieldCheck className="size-4" />Zero learner overlap verified from {number(Object.values(overview.split.learnerCounts).reduce((sum, value) => sum + value, 0))} assignments.</p></CardContent></Card><Card><CardHeader><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Selection discipline</p><CardTitle className="mt-2">Validation chose the model</CardTitle><CardDescription className="mt-2">Test results report generalization; they never revise the choice.</CardDescription></div><Scale className="size-5 text-[#477761]" /></div></CardHeader><CardContent><div className="rounded-2xl bg-[#173f34] p-5 text-white"><p className="text-xs text-[#a9c2b8]">Primary selection metric</p><p className="mt-2 text-xl font-semibold">Validation NDCG@5</p><div className="mt-5 flex items-end justify-between"><div><p className="text-3xl font-semibold">{selectedValidation.ndcgAt5.toFixed(3)}</p><p className="mt-1 text-xs text-[#abc1b7]">{overview.model.selectedModelDisplayName}</p></div><Badge className="border-white/15 bg-white/10 text-white" variant="outline">selected before test</Badge></div></div><p className="mt-4 text-xs leading-5 text-[#6e7b75]">A held-out test model may score slightly differently. Preserving the validation decision prevents test-set tuning.</p></CardContent></Card></section>

        <section className="overflow-hidden rounded-[1.75rem] border border-[#dce2da] bg-white"><div className="border-b border-[#e1e6df] p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Measured comparison</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Models and baselines on the same test learners</h2><p className="mt-2 text-sm text-[#6d7a74]">Highest Skill Gap and Popularity are evaluation baselines—not ML models.</p></div><div className="flex rounded-xl border border-[#dce2da] bg-[#f4f6f2] p-1"><button className={`rounded-lg px-3 py-2 text-xs font-semibold ${metricGroup === "ranking" ? "bg-white shadow-sm" : "text-[#75817b]"}`} onClick={() => setMetricGroup("ranking")} type="button">Ranking</button><button className={`rounded-lg px-3 py-2 text-xs font-semibold ${metricGroup === "classification" ? "bg-white shadow-sm" : "text-[#75817b]"}`} onClick={() => setMetricGroup("classification")} type="button">Classification</button></div></div></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-[#f5f7f2] text-[#6c7972]"><tr><th className="px-5 py-3">Predictor</th><th className="px-5 py-3">Type</th>{metricColumns.map((metric) => <th className="px-5 py-3" key={metric.key}>{metric.label}</th>)}</tr></thead><tbody>{predictorOrder.map((name) => { const metrics = overview.metrics.test[name]!; const selected = name === overview.model.selectedModel; const baseline = name === "highest_skill_gap" || name === "popularity"; return <tr className={`border-t border-[#e6e9e4] ${selected ? "bg-[#f1f7ef]" : ""}`} key={name}><td className="px-5 py-4"><div className="flex items-center gap-2"><span className="font-semibold">{displayNames[name]}</span>{selected && <Badge variant="success">selected</Badge>}</div></td><td className="px-5 py-4"><Badge variant="outline">{baseline ? "baseline" : "ML"}</Badge></td>{metricColumns.map((metric) => { const value = metrics[metric.key as keyof EvaluationMetrics] as number; return <td className="px-5 py-4" key={metric.key}><span className="font-mono font-semibold">{value.toFixed(3)}</span><ScoreBar value={value} /></td>; })}</tr>; })}</tbody></table></div></section>

        <section className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]"><Card><CardHeader><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Baseline lift</p><CardTitle className="mt-2">What ML adds beyond {overview.comparison.bestBaselineDisplayName}</CardTitle></div><GitCompareArrows className="size-5 text-[#477761]" /></div></CardHeader><CardContent className="space-y-3">{[
          { label: "ROC-AUC", value: overview.comparison.selectedModelRocAucLift, detail: "Probability discrimination" },
          { label: "NDCG@5", value: overview.comparison.selectedModelNdcgAt5Lift, detail: "Top-five ordering quality" },
          { label: "Precision@5", value: overview.comparison.selectedModelPrecisionAt5Lift, detail: "Relevant top-five density" },
        ].map((item) => <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#e0e5dd] p-4" key={item.label}><div><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-xs text-[#748078]">{item.detail}</p></div><Badge variant={item.value >= 0 ? "success" : "destructive"}>{signedPoints(item.value)}</Badge></div>)}</CardContent></Card><Card><CardHeader><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Measured feature importance</p><CardTitle className="mt-2">Signals used by the selected model</CardTitle><CardDescription className="mt-2">Normalized Random Forest importance from the saved artifact—not an explanation of causality.</CardDescription></div><BarChart3 className="size-5 text-[#477761]" /></div></CardHeader><CardContent className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{overview.model.featureImportance.slice(0, 10).map((item, index) => <div key={item.feature}><div className="flex items-center justify-between gap-3 text-xs"><span className="truncate"><span className="mr-2 font-mono text-[#c66e40]">{String(index + 1).padStart(2, "0")}</span>{label(item.feature)}</span><span className="font-mono">{percent(item.importance, 1)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e4e8e2]"><div className="h-full rounded-full bg-[#3e795c]" style={{ width: `${(item.importance / maxImportance) * 100}%` }} /></div></div>)}</CardContent></Card></section>

        <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]"><Card><CardHeader><div className="flex items-start justify-between"><div><CardTitle>Held-out confusion matrix</CardTitle><CardDescription className="mt-2">Threshold {selectedTest.classificationThreshold.toFixed(3)}, chosen on validation F1.</CardDescription></div><Gauge className="size-5 text-[#477761]" /></div></CardHeader><CardContent><div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-center text-xs"><div /><div className="font-semibold text-[#6c7972]">Predicted no</div><div className="font-semibold text-[#6c7972]">Predicted yes</div><div className="grid place-items-center font-semibold text-[#6c7972]">Actual no</div><div className="rounded-xl bg-[#e8f2e7] p-4"><p className="text-2xl font-semibold">{number(matrix[0]?.[0] ?? 0)}</p><p className="mt-1 text-[10px]">true negatives</p></div><div className="rounded-xl bg-[#fff0e6] p-4"><p className="text-2xl font-semibold">{number(matrix[0]?.[1] ?? 0)}</p><p className="mt-1 text-[10px]">false positives</p></div><div className="grid place-items-center font-semibold text-[#6c7972]">Actual yes</div><div className="rounded-xl bg-[#fff0e6] p-4"><p className="text-2xl font-semibold">{number(matrix[1]?.[0] ?? 0)}</p><p className="mt-1 text-[10px]">false negatives</p></div><div className="rounded-xl bg-[#e8f2e7] p-4"><p className="text-2xl font-semibold">{number(matrix[1]?.[1] ?? 0)}</p><p className="mt-1 text-[10px]">true positives</p></div></div></CardContent></Card><Card><CardHeader><div className="flex items-start justify-between"><div><CardTitle>Experiment integrity</CardTitle><CardDescription className="mt-2">The service rejects the experiment when any required invariant is false.</CardDescription></div><BadgeCheck className="size-5 text-[#3e765a]" /></div></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">{Object.entries(overview.validation).map(([key, passed]) => <div className="flex items-center gap-3 rounded-xl border border-[#e1e6df] p-3" key={key}><span className={`grid size-7 place-items-center rounded-full ${passed ? "bg-[#e3f0e3] text-[#367051]" : "bg-[#f8e5dc] text-[#a85739]"}`}>{passed ? <Check className="size-3.5" /> : <Target className="size-3.5" />}</span><span className="text-xs font-semibold capitalize">{label(key)}</span></div>)}</CardContent></Card></section>

        <section className="rounded-[1.75rem] border border-[#d4e2d6] bg-[#f1f7ef] p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#dcebdd] text-[#356d51]"><BrainCircuit className="size-5" /></span><div><p className="font-semibold">The evaluated artifact now has a checked inference boundary.</p><p className="mt-2 max-w-3xl text-sm leading-6 text-[#66756d]">Phase 15 verifies the artifact checksum and exact feature schema before returning benefit probabilities. Learn Next, candidate ordering, and personalized course paths remain Phase 16 responsibilities.</p></div></div><Button asChild><Link to="/inference-lab">Open inference lab <ArrowRight className="size-4" /></Link></Button></div></section>
      </main>
    </div>
  );
}
