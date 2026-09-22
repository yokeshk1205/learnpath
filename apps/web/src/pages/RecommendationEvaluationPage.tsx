import {
  ArrowLeft, BarChart3, BrainCircuit, CheckCircle2, Clock3, FlaskConical,
  LoaderCircle, MessageSquareText, RefreshCw, Sparkles, Target, TrendingDown, TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  getRecommendationEvaluation,
  type RecommendationEvaluationOverview,
  type RecommendationReason,
} from "../recommendations/api";

const reasonLabels: Record<RecommendationReason, string> = {
  ALREADY_KNOW: "Already knew it",
  NOT_RELEVANT: "Not relevant now",
  OTHER: "Other",
  PREFER_DIFFERENT: "Preferred another skill",
  TOO_DIFFICULT: "Too difficult",
  TOO_EASY: "Too easy",
};

function percent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function gain(value: number | null): string {
  if (value === null) return "Awaiting evidence";
  const points = Math.round(value * 100);
  return `${points > 0 ? "+" : ""}${points} pts`;
}

export function RecommendationEvaluationPage() {
  const { accessToken, refreshSession } = useAuth();
  const [overview, setOverview] = useState<RecommendationEvaluationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    if (!accessToken) throw new Error("Your learner session is unavailable.");
    try { return await operation(accessToken); }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return operation(await refreshSession());
      throw requestError;
    }
  }, [accessToken, refreshSession]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setOverview(await withSession((token) => getRecommendationEvaluation(token))); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Recommendation evaluation could not be loaded."); }
    finally { setLoading(false); }
  }, [withSession]);

  useEffect(() => { void load(); }, [load]);

  const funnel = useMemo(() => overview ? [
    { color: "bg-[#2f6653]", label: "Shown", value: overview.summary.shown },
    { color: "bg-[#4b806a]", label: "Responded", value: overview.summary.responded },
    { color: "bg-[#da7b47]", label: "Accepted", value: overview.summary.accepted },
    { color: "bg-[#e39a6d]", label: "Completed", value: overview.summary.completed },
    { color: "bg-[#9a6d9c]", label: "Outcome evidence", value: overview.summary.outcomeEvidence },
  ] : [], [overview]);

  if (loading && !overview) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef]"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-[#35614b]" /><p className="mt-3 text-sm text-[#6f7b75]">Attributing recommendation outcomes…</p></div></div>;

  return (
    <div className="min-h-screen bg-[#f3f4ef] text-[#18372f]">
      <header className="border-b border-[#dfe3da] bg-[#fbfcf8]/95"><div className="mx-auto flex max-w-[1380px] items-center justify-between px-4 py-4 sm:px-7"><Link className="flex items-center gap-3" to="/reviewer"><span className="grid size-9 place-items-center rounded-xl bg-[#163b32] text-white"><BarChart3 className="size-4" /></span><div><p className="font-bold tracking-[-.03em]">Recommendation Outcomes</p><p className="text-[11px] text-[#7b8681]">Phase 19 · observational evaluation</p></div></Link><div className="flex gap-2"><Button asChild variant="ghost"><Link to="/reviewer"><ArrowLeft className="size-4" /> Reviewer</Link></Button><Button disabled={loading} onClick={() => void load()} variant="outline"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button></div></div></header>
      <main className="mx-auto max-w-[1380px] px-4 py-7 sm:px-7 sm:py-10">
        {error && <div className="mb-5 rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]">{error}</div>}
        {overview ? <div className="space-y-7">
          <section className="relative overflow-hidden rounded-[2rem] bg-[#173d33] p-7 text-white sm:p-10"><div className="absolute -right-24 -top-24 size-80 rounded-full bg-[#507d69]/40 blur-3xl" /><div className="relative grid gap-8 xl:grid-cols-[1fr_430px] xl:items-end"><div><Badge className="border-white/10 bg-white/10 text-[#ffd0b2]" variant="outline"><FlaskConical className="mr-1.5 size-3.5" /> Live path-version attribution</Badge><h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-[-.055em] sm:text-6xl">Is Learn Next producing useful learning?</h1><p className="mt-5 max-w-3xl text-sm leading-7 text-[#c4d5ce]">Connect learner choice, lesson completion, and later assessed skill evidence to the exact recommendation and model version—without claiming correlation is causation.</p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-3xl font-semibold">{percent(overview.summary.responseRate)}</p><p className="mt-1 text-xs text-[#b6c9c1]">Response rate</p></div><div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-3xl font-semibold">{percent(overview.summary.acceptanceRate)}</p><p className="mt-1 text-xs text-[#b6c9c1]">Acceptance rate</p></div><div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-3xl font-semibold">{percent(overview.summary.completionRate)}</p><p className="mt-1 text-xs text-[#b6c9c1]">Accepted → completed</p></div><div className="rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-3xl font-semibold">{gain(overview.summary.meanLearningGain)}</p><p className="mt-1 text-xs text-[#b6c9c1]">Mean observed gain</p></div></div></div></section>

          {overview.summary.shown === 0 ? <Card className="text-center"><CardHeader><Sparkles className="mx-auto size-7 text-[#d47846]" /><CardTitle>No recommendations have been shown yet</CardTitle><CardDescription>Generate a personalized path to create the first versioned evaluation opportunity.</CardDescription></CardHeader><CardContent><Button asChild><Link to="/dashboard">Open learner dashboard</Link></Button></CardContent></Card> : <>
          <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Card><CardHeader><CardTitle>Observed recommendation funnel</CardTitle><CardDescription>Every denominator stays visible; missing responses and outcome evidence are not silently discarded.</CardDescription></CardHeader><CardContent><div className="space-y-4">{funnel.map((stage) => { const width = overview.summary.shown ? Math.max(4, stage.value / overview.summary.shown * 100) : 0; return <div key={stage.label}><div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold">{stage.label}</span><span>{stage.value} <span className="text-xs text-[#7b8780]">({Math.round(width)}%)</span></span></div><div className="h-3 overflow-hidden rounded-full bg-[#e8ebe5]"><div className={`h-full rounded-full ${stage.color}`} style={{ width: `${width}%` }} /></div></div>; })}</div></CardContent></Card><Card><CardHeader><Target className="mb-2 size-5 text-[#ca7040]" /><CardTitle>Outcome boundary</CardTitle><CardDescription>What this evaluation can and cannot claim.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm leading-6 text-[#637169]"><p className="rounded-xl bg-[#f3f6ef] p-3">Outcome evidence counts later assessed skill observations within {overview.methodology.attributionWindowDays} days. Gain is computed only when a pre-response mastery baseline exists.</p><p className="rounded-xl bg-[#fff5eb] p-3">A positive outcome requires at least {Math.round(overview.methodology.positiveGainThreshold * 100)} mastery points.</p><p className="text-xs text-[#7a8580]">{overview.methodology.disclaimer}</p></CardContent></Card></section>

            <section><div className="mb-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#d16f3c]">Version-level evidence</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.045em]">Every response remains inspectable</h2></div><div className="grid gap-4 lg:grid-cols-2">{overview.records.map((record) => <article className="rounded-2xl border border-[#dce2da] bg-white p-5" key={record.id}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#7a8780]">{record.courseName} · path v{record.pathVersion}</p><h3 className="mt-1 text-xl font-semibold">{record.skillName}</h3></div><Badge variant={record.decision === "ACCEPTED" ? "success" : "warning"}>{record.decision.toLowerCase()}</Badge></div><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-[#f3f6ef] p-3"><p className="font-semibold">{record.completion ? "Yes" : "No"}</p><p className="text-[10px] text-[#78847d]">Completed</p></div><div className="rounded-xl bg-[#f3f6ef] p-3"><p className="font-semibold">{record.evidenceAfterDecision}</p><p className="text-[10px] text-[#78847d]">Later evidence</p></div><div className="rounded-xl bg-[#f3f6ef] p-3"><p className={`font-semibold ${record.learningGain !== null && record.learningGain > 0 ? "text-[#32704f]" : record.learningGain !== null && record.learningGain < 0 ? "text-[#a45136]" : ""}`}>{record.learningGain === null && record.evidenceAfterDecision > 0 ? "No baseline" : gain(record.learningGain)}</p><p className="text-[10px] text-[#78847d]">Learning gain</p></div></div><div className="mt-4 flex items-center justify-between border-t border-[#e4e8e1] pt-3 text-xs"><span className="flex items-center gap-1.5 text-[#6e7b74]">{record.outcomeState === "IMPROVED" ? <TrendingUp className="size-3.5 text-[#367153]" /> : record.outcomeState === "DECLINED" ? <TrendingDown className="size-3.5 text-[#a65337]" /> : <Clock3 className="size-3.5" />}{record.outcomeState.replaceAll("_", " ").toLowerCase()}</span><span className="font-semibold">{record.provenance.modelVersion}</span></div>{record.reasonCode && <p className="mt-3 rounded-lg bg-[#fff4eb] px-3 py-2 text-xs text-[#885139]">Reason: {reasonLabels[record.reasonCode]}</p>}</article>)}</div>{overview.records.length === 0 && <div className="rounded-2xl border border-dashed border-[#cad4ca] bg-white p-8 text-center"><MessageSquareText className="mx-auto size-6 text-[#7f8c85]" /><p className="mt-3 font-semibold">Recommendations are shown, but no learner has responded yet.</p></div>}</section>

            <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]"><Card><CardHeader><BrainCircuit className="mb-2 size-5 text-[#3f7058]" /><CardTitle>Model-version monitoring</CardTitle><CardDescription>Operational outcomes grouped by the exact served model artifact.</CardDescription></CardHeader><CardContent className="space-y-3">{overview.modelVersions.map((model) => <div className="rounded-xl border border-[#e0e5dd] p-4" key={model.modelVersion}><div className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{model.modelVersion}</strong><Badge variant="outline">{model.shown} shown</Badge></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><p className="font-semibold">{percent(model.acceptanceRate)}</p><p className="text-[#7c8781]">Accepted</p></div><div><p className="font-semibold">{model.completed}</p><p className="text-[#7c8781]">Completed</p></div><div><p className="font-semibold">{gain(model.meanLearningGain)}</p><p className="text-[#7c8781]">Mean gain</p></div></div></div>)}</CardContent></Card><Card><CardHeader><MessageSquareText className="mb-2 size-5 text-[#ca7040]" /><CardTitle>Why learners decline</CardTitle><CardDescription>Structured reasons expose different recommendation failure modes.</CardDescription></CardHeader><CardContent>{overview.reasons.length ? <div className="space-y-2">{overview.reasons.map((reason) => <div className="flex items-center justify-between rounded-xl bg-[#fff7ef] px-4 py-3 text-sm" key={reason.reasonCode}><span>{reasonLabels[reason.reasonCode]}</span><Badge variant="warning">{reason.count}</Badge></div>)}</div> : <div className="rounded-xl bg-[#f3f6ef] p-5 text-center text-sm text-[#6d7973]"><CheckCircle2 className="mx-auto mb-2 size-5 text-[#3f7658]" />No declined recommendations yet.</div>}</CardContent></Card></section>
          </>}
        </div> : <Card className="mx-auto max-w-lg text-center"><CardHeader><CardTitle>Evaluation unavailable</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent><Button onClick={() => void load()}>Try again</Button></CardContent></Card>}
      </main>
    </div>
  );
}
