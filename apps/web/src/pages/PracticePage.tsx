import {
  ArrowLeft, ArrowRight, BrainCircuit, CheckCircle2, CircleAlert, Clock3,
  Fingerprint, Lightbulb, LoaderCircle, RefreshCw, Sparkles, XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { startPractice, submitPractice, type PracticeAttempt, type PracticeResult } from "../practice/api";
import { getPrerequisiteAnalysis, type GoalPrerequisiteAnalysis } from "../prerequisites/api";

function percent(value: number | null): string {
  return value === null ? "Unknown" : `${Math.round(value * 100)}%`;
}

const stateTone = {
  UNKNOWN: "border-[#d8ded7] bg-[#f5f6f2] text-[#68756f]",
  ESTIMATED: "border-[#ecd0b7] bg-[#fff7ed] text-[#9a572e]",
  ASSESSED: "border-[#bad5c2] bg-[#eef8ef] text-[#2d684b]",
  VERIFIED: "border-[#a8c7b5] bg-[#e4f2e7] text-[#1f5d40]",
} as const;

function confidenceLabel(value: number | null): string {
  if (value === null) return "Not assessed";
  if (value >= 0.75) return "Strong";
  if (value >= 0.45) return "Growing";
  return "Early";
}

export function PracticePage() {
  const { skillId } = useParams();
  const [searchParams] = useSearchParams();
  const enrollmentId = searchParams.get("enrollmentId") ?? undefined;
  const requestedMode = searchParams.get("mode") === "retention"
    ? "RETENTION_CHECK"
    : searchParams.get("mode") === "assessment" ? "ASSESSMENT" : "PRACTICE";
  const { accessToken, refreshSession, user } = useAuth();
  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null);
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [beforeReadiness, setBeforeReadiness] = useState<GoalPrerequisiteAnalysis | null>(null);
  const [newlyUnlocked, setNewlyUnlocked] = useState<string[]>([]);
  const startedAt = useRef(Date.now());

  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    if (!accessToken) throw new Error("The learner session is not available.");
    try { return await operation(accessToken); }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return operation(await refreshSession());
      throw requestError;
    }
  }, [accessToken, refreshSession]);

  const begin = useCallback(async () => {
    if (!skillId) return;
    setLoading(true); setError(null); setResult(null); setSelectedOptionId(null);
    try {
      const [next, readiness] = await Promise.all([
        withSession((token) => startPractice(token, skillId, enrollmentId, requestedMode)),
        enrollmentId
          ? withSession((token) => getPrerequisiteAnalysis(token, { enrollmentId })).catch(() => null)
          : Promise.resolve(null),
      ]);
      setAttempt(next);
      setBeforeReadiness(readiness);
      setNewlyUnlocked([]);
      startedAt.current = Date.now();
    } catch (beginError) {
      setError(beginError instanceof Error ? beginError.message : "Practice could not be started.");
    } finally { setLoading(false); }
  }, [enrollmentId, requestedMode, skillId, withSession]);

  useEffect(() => { void begin(); }, [begin]);

  const submit = async () => {
    if (!attempt || !selectedOptionId) return;
    setSubmitting(true); setError(null);
    try {
      const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1_000));
      const nextResult = await withSession((token) => submitPractice(token, attempt.id, {
        durationSeconds,
        hintsUsed: 0,
        optionId: selectedOptionId,
      }));
      setResult(nextResult);
      if (enrollmentId && beforeReadiness) {
        const afterReadiness = await withSession((token) => getPrerequisiteAnalysis(token, { enrollmentId }));
        const previous = new Map(beforeReadiness.skills.map((skill) => [skill.id, skill.status]));
        setNewlyUnlocked(afterReadiness.skills.filter((skill) => previous.get(skill.id) === "LOCKED" && skill.status !== "LOCKED").map((skill) => skill.name));
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Your answer could not be recorded.");
    } finally { setSubmitting(false); }
  };

  const returnUrl = requestedMode === "RETENTION_CHECK" ? "/retention" : enrollmentId ? `/my-courses/${enrollmentId}/path` : "/skill-passport";
  const returnLabel = requestedMode === "RETENTION_CHECK" ? "Review" : enrollmentId ? "My course path" : "My skills";
  if (!user) return null;
  if (loading && !attempt) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef]"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-[#35614b]" /><p className="mt-3 text-sm text-[#6f7b75]">Choosing a real skill question…</p></div></div>;
  if (!attempt) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef] p-5"><Card className="max-w-lg text-center"><CardHeader><CircleAlert className="mx-auto size-7 text-[#b95c3c]" /><CardTitle>Practice unavailable</CardTitle><CardDescription>{error ?? "No active question is available for this skill."}</CardDescription></CardHeader><CardContent className="flex justify-center gap-2"><Button asChild variant="outline"><Link to={returnUrl}><ArrowLeft className="size-4" /> {returnLabel}</Link></Button><Button onClick={() => void begin()}><RefreshCw className="size-4" /> Retry</Button></CardContent></Card></div>;

  const masteryDelta = result ? result.evidence.masteryAfter - (result.evidence.masteryBefore ?? 0) : 0;
  return (
    <div className="min-h-screen bg-[#f3f4ef] text-[#18372f]">
      <header className="border-b border-[#dfe3da] bg-[#fbfcf8]/95"><div className="mx-auto flex max-w-[1180px] items-center justify-between px-4 py-4 sm:px-7"><Link className="flex items-center gap-3" to="/dashboard"><span className="grid size-9 place-items-center rounded-xl bg-[#163b32] text-white"><Sparkles className="size-4" /></span><div><p className="font-bold">LearnPath</p><p className="text-[11px] text-[#7b8681]">{attempt.mode === "RETENTION_CHECK" ? "Retention check" : attempt.mode === "ASSESSMENT" ? "Post-lesson assessment" : "Evidence-based practice"}</p></div></Link><Button asChild variant="ghost"><Link to={returnUrl}><ArrowLeft className="size-4" /> {returnLabel}</Link></Button></div></header>
      <main className="mx-auto grid max-w-[1180px] gap-5 px-4 py-7 sm:px-7 sm:py-10 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-[1.6rem] bg-[#173d33] p-6 text-white">
          <Badge className="border-white/10 bg-white/10 text-white" variant="outline"><Fingerprint className="mr-1 size-3.5" /> {attempt.mode === "RETENTION_CHECK" ? "Retention check" : attempt.mode === "ASSESSMENT" ? "Lesson assessment" : `Attempt ${attempt.attemptNumber}`}</Badge>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.045em]">{attempt.skill.name}</h1>
          <p className="mt-2 text-sm text-[#bfd0c9]">{attempt.skill.category}</p>
          {attempt.context && <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.06] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#f0a06e]">Course context</p><p className="mt-2 text-sm font-semibold">{attempt.context.courseName}</p><p className="mt-1 text-xs text-[#b9cbc4]">{attempt.context.moduleName}</p></div>}
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.06] p-4 text-xs leading-5 text-[#bfd0c9]"><BrainCircuit className="mb-3 size-5 text-[#f0a06e]" />{attempt.mode === "RETENTION_CHECK" ? "This quick check helps LearnPath decide whether the skill is still fresh or needs a short review." : attempt.mode === "ASSESSMENT" ? "This separate post-lesson assessment creates assessed evidence. Lesson completion alone never changes mastery." : "Practice gives feedback and lower-weight evidence before the lesson assessment."}</div>
        </aside>

        <section>
          {error && <div className="mb-4 rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]">{error}</div>}
          {!result ? <Card className="overflow-hidden bg-white"><div className="h-1.5 bg-[linear-gradient(90deg,#e9854e_0_34%,#e5e8e2_34%_100%)]" /><CardContent className="p-6 sm:p-9"><div className="flex flex-wrap items-center justify-between gap-3"><Badge variant="outline">{attempt.mode === "RETENTION_CHECK" ? "Quick memory check" : attempt.mode === "ASSESSMENT" ? "Post-lesson assessment" : `Practice · question ${attempt.attemptNumber}`}</Badge><span className="flex items-center gap-1.5 text-xs text-[#718078]"><Clock3 className="size-3.5" /> Choose the best answer</span></div><h2 className="mt-7 max-w-3xl text-2xl font-semibold leading-tight tracking-[-0.035em] sm:text-3xl">{attempt.question.prompt}</h2><div className="mt-8 grid gap-3">{attempt.question.options.map((option) => { const selected = selectedOptionId === option.id; return <button aria-pressed={selected} className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition sm:p-5 ${selected ? "border-[#478269] bg-[#edf5ed] shadow-[0_8px_24px_rgba(47,101,76,0.08)]" : "border-[#dce2da] bg-[#fbfcf9] hover:border-[#9eb9a8]"}`} key={option.id} onClick={() => setSelectedOptionId(option.id)} type="button"><span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${selected ? "bg-[#2f6e53] text-white" : "border border-[#cfd7ce] bg-white text-[#6f7b75]"}`}>{option.key}</span><span className="text-sm font-medium leading-6 sm:text-base">{option.content}</span>{selected && <CheckCircle2 className="ml-auto size-5 text-[#2f6e53]" />}</button>; })}</div><div className="mt-8 flex justify-end border-t border-[#e4e8e2] pt-6"><Button disabled={!selectedOptionId || submitting} onClick={() => void submit()}>{submitting ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Check my answer</Button></div></CardContent></Card> : <div className="space-y-5"><Card className={`overflow-hidden border-2 ${result.feedback.isCorrect ? "border-[#9fc9aa]" : "border-[#e6b39c]"}`}><CardHeader className={result.feedback.isCorrect ? "bg-[#edf7ee]" : "bg-[#fff4ee]"}><div className="flex items-start gap-4"><span className={`grid size-12 place-items-center rounded-2xl ${result.feedback.isCorrect ? "bg-[#2f7256] text-white" : "bg-[#b85d3d] text-white"}`}>{result.feedback.isCorrect ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}</span><div><CardTitle>{result.feedback.isCorrect ? "Correct ✓" : "Not quite"}</CardTitle><CardDescription className="mt-1">{result.feedback.isCorrect ? "Nice work—your understanding has been updated." : "Use the explanation below, then try another question when you’re ready."}</CardDescription></div></div></CardHeader><CardContent className="p-6 sm:p-8"><div className="rounded-2xl bg-[#f5f6f2] p-5"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#68766f]"><Lightbulb className="size-4 text-[#c96d3c]" /> Explanation</p><p className="mt-3 text-sm leading-7 text-[#596b62]">{result.feedback.explanation}</p>{!result.feedback.isCorrect && <p className="mt-3 text-xs text-[#78847e]">Correct answer: {result.feedback.correctOptionContent}</p>}</div></CardContent></Card>
            <Card><CardHeader><CardTitle>{masteryDelta > 0 ? "Great progress!" : "Your learning profile is updated"}</CardTitle><CardDescription>{result.skill.name} now reflects your latest answer everywhere this skill is used.</CardDescription></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-[#f5f6f2] p-5"><p className="text-xs text-[#748078]">Mastery</p><div className="mt-3 flex items-center gap-3"><span className="text-lg text-[#7b8781]">{percent(result.evidence.masteryBefore)}</span><ArrowRight className="size-4 text-[#a0aaa4]" /><strong className="text-3xl">{percent(result.evidence.masteryAfter)}</strong></div></div><div className="rounded-2xl bg-[#edf5ed] p-5"><p className="text-xs text-[#607268]">Confidence</p><div className="mt-3 flex items-center gap-3"><span className="text-sm text-[#7b8781]">{confidenceLabel(result.evidence.confidenceBefore)}</span><ArrowRight className="size-4 text-[#a0aaa4]" /><strong className="text-xl">{confidenceLabel(result.evidence.confidenceAfter)}</strong></div></div></div>{newlyUnlocked.length > 0 && <div className="mt-4 rounded-2xl border border-[#b9d4c1] bg-[#eef8ef] p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#347052]">You unlocked</p><div className="mt-3 flex flex-wrap gap-2">{newlyUnlocked.map((name) => <Badge key={name} variant="success">{name}</Badge>)}</div></div>}<p className="mt-4 text-sm leading-6 text-[#65736c]">Your prerequisite readiness was recalculated from this real result.</p>{attempt.mode === "ASSESSMENT" && enrollmentId && <div className="mt-4 rounded-2xl border border-[#e8c3ac] bg-[#fff6ef] p-4 text-sm leading-6 text-[#815337]"><strong>Your path is ready to adapt.</strong> Any saved recommendation affected by this assessed evidence is paused until LearnPath recalculates it.</div>}</CardContent></Card>
            <details className="rounded-2xl border border-[#dce2da] bg-white p-5"><summary className="cursor-pointer text-sm font-semibold">Technical evidence details</summary><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-[#f5f6f2] p-4"><p className="text-xs text-[#748078]">Evidence strength</p><Badge className={`mt-2 ${stateTone[result.evidence.evidenceStateAfter]}`} variant="outline">{result.evidence.evidenceStateAfter.toLowerCase()}</Badge></div><div className="rounded-xl bg-[#f5f6f2] p-4"><p className="text-xs text-[#748078]">Observations</p><p className="mt-2 text-xl font-semibold">{result.evidence.evidenceCount}</p></div><div className="rounded-xl bg-[#f5f6f2] p-4"><p className="text-xs text-[#748078]">Retention now</p><p className="mt-2 text-xl font-semibold">{percent(result.evidence.retentionAfter)}</p></div></div></details>
            <div className="flex flex-wrap justify-end gap-2">{enrollmentId && <Button asChild variant={attempt.mode === "PRACTICE" ? "outline" : "default"}><Link to={`/my-courses/${enrollmentId}/path`}>See my path <ArrowRight className="size-4" /></Link></Button>}{attempt.mode === "PRACTICE" && <Button asChild><Link to={`/practice/${attempt.skill.id}?mode=assessment${enrollmentId ? `&enrollmentId=${enrollmentId}` : ""}`}><CheckCircle2 className="size-4" /> Take lesson assessment</Link></Button>}<Button onClick={() => void begin()} variant="outline"><RefreshCw className="size-4" /> {attempt.mode === "RETENTION_CHECK" ? "Check again" : attempt.mode === "ASSESSMENT" ? "Try another assessment" : "Try another question"}</Button></div></div>}
        </section>
      </main>
    </div>
  );
}
