import {
  ArrowLeft, ArrowRight, Award, BrainCircuit, Check, CheckCircle2, ChevronLeft,
  CircleAlert, CircleHelp, Clock3, Cloud, Fingerprint, LoaderCircle, RotateCcw,
  Sparkles, Target, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { QuestionResponse } from "../components/QuestionResponse";
import {
  getDiagnosticAttempt, getDiagnosticResult, saveDiagnosticAnswer, submitDiagnostic,
  type DiagnosticAttempt, type DiagnosticDraftAnswer, type DiagnosticResult, type DiagnosticSkillResult,
} from "../diagnostics/api";
import { clearLocalResponse, isResponseValid, recoverLocalResponses, responsePayload, responsesMatch, restoreResponse, storeLocalResponse, type QuestionResponseDraft } from "../diagnostics/response";
import { generatePersonalizedPath, regeneratePersonalizedPath } from "../paths/api";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const classificationLabels: Record<DiagnosticSkillResult["classification"], string> = {
  FORGOTTEN: "Refresh needed",
  FRAGILE_FOUNDATION: "Fragile foundation",
  GAP: "Foundation gap",
  MASTERED: "Mastered",
  NEEDS_CONFIRMATION: "Needs confirmation",
  NOT_TESTED: "Not tested",
  PROBED: "Initial probe",
  READY: "Ready to learn",
};

type AnswerChoice = Pick<DiagnosticDraftAnswer, "isUnsure" | "optionId" | "selectedOptionIds" | "numericAnswer" | "responseSeconds">;

function SkillResultCard({ result }: { result: DiagnosticSkillResult }) {
  const positive = result.classification === "MASTERED" || result.classification === "READY";
  const warning = result.classification === "NEEDS_CONFIRMATION" || result.classification === "PROBED" || result.classification === "FRAGILE_FOUNDATION";
  const tone = positive ? "border-[#b7d1bd] bg-[#f7fbf6]" : warning ? "border-[#ead5b5] bg-[#fffaf1]" : "border-[#ecc7bb] bg-[#fff8f5]";
  const masteryChange = result.masteryAfter - (result.masteryBefore ?? 0);
  return (
    <Card className={tone}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.12em] text-[#7b8781]">{result.category}</p><h3 className="mt-1 font-semibold">{result.skillName}</h3></div><Badge variant={positive ? "success" : warning ? "warning" : "outline"}>{classificationLabels[result.classification]}</Badge></div>
        <div className="mt-5 flex items-end justify-between"><div><p className="text-3xl font-semibold">{percent(result.masteryAfter)}</p><p className="mt-1 text-xs text-[#738078]">Estimated global mastery</p></div><Fingerprint className="size-6 text-[#4c745f]" /></div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/[0.06]"><div className="h-full rounded-full bg-[#3c7a5f]" style={{ width: `${result.masteryAfter * 100}%` }} /></div>
        <p className="mt-2 text-[11px] text-[#758079]">Likely range {percent(result.masteryLowerBound)}–{percent(result.masteryUpperBound)} · {result.correctCount}/{result.questionCount} correct</p>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-black/[0.07] pt-4 text-xs"><div><p className="text-[#7b8781]">Knowledge update</p><p className="mt-1 font-bold">{result.masteryBefore === null ? "New estimate" : percent(result.masteryBefore)} <span className={masteryChange >= 0 ? "text-[#2f6e53]" : "text-[#a84d32]"}>({masteryChange >= 0 ? "+" : ""}{Math.round(masteryChange * 100)} pts)</span></p></div><div><p className="text-[#7b8781]">Evidence strength</p><p className="mt-1 font-bold">{result.evidenceStateAfter.toLowerCase()} <span className="font-normal text-[#89938e]">· {percent(result.confidenceAfter)}</span></p></div></div>
        <p className="mt-3 text-[11px] text-[#77827c]">{result.questionCount} direct observation{result.questionCount === 1 ? "" : "s"} · {result.applicationObservationCount} application-level</p>
        <div className="mt-3 flex flex-wrap gap-1.5">{[
          ["Easy", result.difficultyCoverage.easy], ["Medium", result.difficultyCoverage.medium],
          ["Hard", result.difficultyCoverage.hard], ["Apply", result.cognitiveCoverage.apply],
          ["Analyze", result.cognitiveCoverage.analyze],
        ].map(([label, covered]) => <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${covered ? "bg-[#e1efe3] text-[#35664f]" : "bg-black/[.04] text-[#8a948f]"}`} key={String(label)}>{covered ? "✓ " : "○ "}{String(label)}</span>)}</div>
        <p className="mt-4 border-t border-black/[0.07] pt-3 text-xs leading-5 text-[#617169]">{result.decisionReason}</p>
        {result.selfReportVerification === "NOT_CONFIRMED" && <div className="mt-3 rounded-xl border border-[#ead2ad] bg-[#fff8e9] p-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#98662f]">Earlier estimate needs another look</p><p className="mt-1 text-xs leading-5 text-[#775f42]">Your answers did not confirm the familiarity level you selected. Nothing is penalized; LearnPath uses the verified evidence and can check again later.</p></div>}
        {result.selfReportVerification === "CONFIRMED" && <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#3c7154]"><Check className="size-3.5" />Your earlier familiarity estimate was supported.</p>}
        {result.misconceptions.length > 0 && <div className="mt-3 rounded-xl border border-[#efcfbd] bg-[#fff5ed] p-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#ad5b34]">Misconception signal</p><p className="mt-1 text-xs text-[#81543e]">{result.misconceptions.map((code) => code.toLowerCase().replaceAll("_", " ")).join(", ")}</p></div>}
      </CardContent>
    </Card>
  );
}

function ResultsView({ pathError, result }: { pathError: string | null; result: DiagnosticResult }) {
  const strong = result.skillResults.filter((skill) => skill.classification === "MASTERED").length;
  const ready = result.skillResults.filter((skill) => skill.classification === "READY").length;
  const review = result.skillResults.filter((skill) => skill.classification === "GAP" || skill.classification === "FORGOTTEN").length;
  const uncertain = result.skillResults.filter((skill) => skill.classification === "PROBED" || skill.classification === "NEEDS_CONFIRMATION" || skill.classification === "FRAGILE_FOUNDATION").length + result.untestedSkills.filter((skill) => !skill.recognizedFromPassport).length;
  const unsure = result.answers.filter((answer) => answer.isUnsure).length;
  const knowledgeUrl = result.attempt.enrollmentId ? `/my-courses/${result.attempt.enrollmentId}/assessment` : "/skill-passport";
  return (
    <div className="min-h-screen bg-[#f3f4ef] text-[#18372f]">
      <header className="border-b border-[#dfe3da] bg-[#fbfcf8]"><div className="mx-auto flex max-w-[1280px] items-center justify-between px-4 py-4 sm:px-7"><Link className="flex items-center gap-3" to="/dashboard"><span className="grid size-9 place-items-center rounded-xl bg-[#163b32] text-white"><Sparkles className="size-4" /></span><div><p className="font-bold">LearnPath</p><p className="text-[11px] text-[#7b8681]">Diagnostic results</p></div></Link><Button asChild variant="ghost"><Link to="/dashboard"><ArrowLeft className="size-4" /> Dashboard</Link></Button></div></header>
      <main className="mx-auto max-w-[1280px] px-4 py-7 sm:px-7 sm:py-10">
        <section className="relative overflow-hidden rounded-[1.8rem] bg-[#173d33] p-6 text-white sm:p-9"><div className="absolute -right-20 -top-28 size-80 rounded-full bg-[#4e7e69]/40 blur-3xl" /><div className="relative grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end"><div><Badge className="border-white/10 bg-white/10 text-[#dce8e2]" variant="outline"><CheckCircle2 className="mr-1.5 size-3.5" /> Knowledge-check session complete</Badge><h1 className="mt-5 text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">Your starting point is clearer.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-[#c3d3cd]">LearnPath separates demonstrated knowledge from tentative probes. Untested or inconsistent skills remain uncertain instead of receiving invented mastery.</p><div className="mt-7 flex flex-wrap gap-3">{result.attempt.enrollmentId && <Button asChild className="bg-[#ef915c] text-[#173d33] hover:bg-[#f3a579]"><Link to={`/my-courses/${result.attempt.enrollmentId}/path`}><Sparkles className="size-4" /> Open my personalized path</Link></Button>}<Button asChild className="border-white/15 bg-white/5 text-white hover:bg-white/10" variant="outline"><Link to={knowledgeUrl}>{result.attempt.enrollmentId ? "Continue course knowledge check" : "View Skill Passport"}</Link></Button></div></div><div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.07] p-5"><div className="flex items-center justify-between rounded-xl bg-white/[.06] px-3 py-2.5"><span className="text-sm text-[#c6d6d0]">Mastered here</span><strong>{strong} skills</strong></div><div className="flex items-center justify-between rounded-xl bg-white/[.06] px-3 py-2.5"><span className="text-sm text-[#c6d6d0]">Ready to build</span><strong>{ready} skills</strong></div><div className="flex items-center justify-between rounded-xl bg-white/[.06] px-3 py-2.5"><span className="text-sm text-[#c6d6d0]">Need foundations first</span><strong>{review} skills</strong></div><div className="flex items-center justify-between rounded-xl bg-white/[.06] px-3 py-2.5"><span className="text-sm text-[#c6d6d0]">Still uncertain</span><strong>{uncertain} skills</strong></div>{unsure > 0 && <div className="flex items-center justify-between rounded-xl bg-white/[.06] px-3 py-2.5"><span className="text-sm text-[#c6d6d0]">Marked unsure</span><strong>{unsure} answers</strong></div>}</div></div></section>

        {pathError && <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#e8c6b7] bg-[#fff8f4] p-4 text-sm text-[#91462f]"><CircleAlert className="mt-0.5 size-4 shrink-0" /><p>{pathError} You can still inspect these results and retry from the course path.</p></div>}

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
          { icon: Fingerprint, label: "Skills checked", value: result.skillResults.length },
          { icon: Award, label: "Already strong", value: strong },
          { icon: ArrowRight, label: "Ready to build", value: ready },
          { icon: RotateCcw, label: "Foundations first", value: review },
        ].map(({ icon: Icon, label, value }) => <Card key={label}><CardContent className="flex items-center gap-4 p-5"><span className="grid size-11 place-items-center rounded-2xl bg-[#e8efe6] text-[#35624f]"><Icon className="size-5" /></span><div><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-[#748078]">{label}</p></div></CardContent></Card>)}</section>

        <section className="mt-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Evidence map</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Your starting-point details</h2><p className="mt-2 text-sm text-[#6d7a74]">Every estimate shows how much direct evidence supports it.</p></div><Button asChild><Link to="/skill-passport">Open my Skill Passport <ArrowRight className="size-4" /></Link></Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{result.skillResults.map((skill) => <SkillResultCard key={skill.skillId} result={skill} />)}</div></section>

        {result.untestedSkills.length > 0 && <section className="mt-8 rounded-[1.5rem] border border-[#dce2da] bg-white p-5 sm:p-6"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6f7b75]">Evidence boundary</p><h2 className="mt-2 text-xl font-semibold">Not directly tested in this session</h2><p className="mt-2 text-sm text-[#6d7a74]">A short diagnostic cannot honestly measure every skill. These remain explicit instead of receiving a guessed score.</p></div><Badge variant="outline">{result.untestedSkills.length} skill{result.untestedSkills.length === 1 ? "" : "s"}</Badge></div><div className="mt-5 grid gap-3 md:grid-cols-2">{result.untestedSkills.map((skill) => <div className="rounded-2xl border border-[#e2e6df] bg-[#f8f9f5] p-4" key={skill.skillId}><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#87918c]">{skill.category}</p><h3 className="mt-1 font-semibold">{skill.skillName}</h3></div><Badge variant={skill.recognizedFromPassport ? "success" : "outline"}>{skill.recognizedFromPassport ? "Passport recognized" : "Not tested"}</Badge></div><p className="mt-3 text-xs leading-5 text-[#68756f]">{skill.reason}</p>{skill.mastery !== null && <p className="mt-3 text-xs font-semibold text-[#345f4d]">Existing mastery {percent(skill.mastery)} · confidence {percent(skill.confidence ?? 0)} · retention {skill.retentionState.toLowerCase().replace("_", " ")}</p>}</div>)}</div></section>}

        <section className="mt-8"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5d776b]">Answer review</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Evidence you can inspect</h2></div><div className="mt-5 space-y-3">{result.answers.map((answer) => <details className="group rounded-2xl border border-[#dce2da] bg-white p-5" key={answer.questionId}><summary className="flex cursor-pointer list-none items-start gap-4"><span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${answer.isCorrect ? "bg-[#dff0e2] text-[#2e684e]" : "bg-[#fbe4dc] text-[#a84d32]"}`}>{answer.isCorrect ? <Check className="size-4" /> : <X className="size-4" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Evidence {answer.sequence}</Badge><span className="text-xs text-[#7b8781]">{answer.skillName}</span><span className="text-[11px] text-[#8a948f]">{answer.cognitiveLevel.toLowerCase()} · difficulty {answer.difficulty}/5 · strength {percent(answer.evidenceStrength)}</span></div><p className="mt-2 font-semibold leading-6">{answer.prompt}</p></div></summary><div className="ml-11 mt-4 border-t border-[#e4e8e2] pt-4 text-sm leading-6"><p><span className="font-semibold">Your answer:</span> {answer.selectedOptionContent}</p>{!answer.isCorrect && <p className="mt-2 text-[#2f654f]"><span className="font-semibold">Correct answer:</span> {answer.correctOptionContent}</p>}{answer.misconceptionCode && <p className="mt-2 rounded-lg bg-[#fff4ec] px-3 py-2 text-xs text-[#96502f]"><span className="font-semibold">Detected pattern:</span> {answer.misconceptionCode.toLowerCase().replaceAll("_", " ")}</p>}<p className="mt-3 text-[#6f7b75]">{answer.explanation}</p></div></details>)}</div></section>
      </main>
    </div>
  );
}

export function DiagnosticPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const { accessToken, refreshSession, user } = useAuth();
  const [attempt, setAttempt] = useState<DiagnosticAttempt | null>(null);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerChoice>>({});
  const [drafts, setDrafts] = useState<Record<string, QuestionResponseDraft>>({});
  const [restoredUnsaved, setRestoredUnsaved] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [buildingPath, setBuildingPath] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const questionOpenedAt = useRef(Date.now());
  const savingAnswer = useRef(false);
  const draftStorageKey = user && attemptId ? `learnpath:diagnostic-drafts:${user.id}:${attemptId}` : null;

  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    if (!accessToken) throw new Error("The learner session is not available.");
    try { return await operation(accessToken); }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return operation(await refreshSession());
      throw requestError;
    }
  }, [accessToken, refreshSession]);

  const load = useCallback(async () => {
    if (!attemptId) return;
    setLoading(true); setError(null);
    try {
      const loaded = await withSession((token) => getDiagnosticAttempt(token, attemptId));
      setAttempt(loaded);
      const restored = Object.fromEntries(loaded.savedAnswers.map((answer) => [answer.questionId, {
        isUnsure: answer.isUnsure,
        optionId: answer.optionId,
        selectedOptionIds: answer.selectedOptionIds,
        numericAnswer: answer.numericAnswer,
        responseSeconds: answer.responseSeconds,
      }]));
      setAnswers(restored);
      const localDrafts = draftStorageKey ? recoverLocalResponses(draftStorageKey, loaded) : {};
      setDrafts({ ...Object.fromEntries(loaded.savedAnswers.map((answer) => [answer.questionId, restoreResponse(answer)])), ...localDrafts });
      setRestoredUnsaved(Object.keys(localDrafts).length > 0);
      const firstPending = loaded.questions.findIndex((question) => localDrafts[question.id]);
      const firstUnanswered = loaded.questions.findIndex((question) => !restored[question.id]);
      setCurrentIndex(firstPending >= 0 ? firstPending : firstUnanswered >= 0 ? firstUnanswered : Math.max(0, loaded.questions.length - 1));
      setSaveStatus(loaded.savedAnswers.length > 0 ? "saved" : "idle");
    }
    catch (loadError) {
      if (loadError instanceof ApiError && loadError.code === "DIAGNOSTIC_ALREADY_SUBMITTED") {
        if (draftStorageKey) clearLocalResponse(draftStorageKey);
        try { setResult(await withSession((token) => getDiagnosticResult(token, attemptId))); }
        catch (resultError) { setError(resultError instanceof Error ? resultError.message : "Diagnostic results could not be loaded."); }
      } else setError(loadError instanceof Error ? loadError.message : "The diagnostic could not be loaded.");
    } finally { setLoading(false); }
  }, [attemptId, draftStorageKey, withSession]);

  useEffect(() => { void load(); }, [load]);

  const answeredCount = Object.keys(answers).length;
  const currentQuestion = attempt?.questions[currentIndex];
  const currentDraft = drafts[currentQuestion?.id ?? ""] ?? restoreResponse(answers[currentQuestion?.id ?? ""]);
  const hasPendingEdit = Boolean(currentQuestion && !responsesMatch(currentDraft, restoreResponse(answers[currentQuestion.id])));
  const navigationBlocked = hasPendingEdit || saveStatus === "saving" || saveStatus === "error";
  const canSaveCurrent = Boolean(currentQuestion && isResponseValid(currentQuestion, currentDraft));
  const complete = attempt ? attempt.selection.canComplete && answeredCount === attempt.questions.length : false;
  const questionProgress = attempt ? Math.min(100,
    (attempt.selection.answeredCount / Math.max(1, attempt.selection.maximumQuestionCount)) * 100) : 0;
  useEffect(() => { questionOpenedAt.current = Date.now(); }, [currentQuestion?.id]);
  useEffect(() => {
    if (!navigationBlocked) return;
    const protectUnsavedAnswer = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectUnsavedAnswer);
    return () => window.removeEventListener("beforeunload", protectUnsavedAnswer);
  }, [navigationBlocked]);

  const saveAnswer = async (draft: QuestionResponseDraft): Promise<boolean> => {
    if (!attemptId || !currentQuestion || savingAnswer.current || submitting || !isResponseValid(currentQuestion, draft)) return false;
    savingAnswer.current = true;
    const previous = answers[currentQuestion.id];
    const responseSeconds = Math.min(3_600, (previous?.responseSeconds ?? 0)
      + Math.max(0, Math.round((Date.now() - questionOpenedAt.current) / 1_000)));
    const answer = { ...responsePayload(currentQuestion, draft), responseSeconds, questionId: currentQuestion.id };
    setSaveStatus("saving");
    setError(null);
    try {
      const saved = await withSession((token) => saveDiagnosticAnswer(token, attemptId, {
        ...answer,
      }));
      const persisted: AnswerChoice = saved.savedAnswer ?? { ...answer, optionId: answer.optionId ?? null };
      if (draftStorageKey) clearLocalResponse(draftStorageKey, currentQuestion.id, draft);
      setRestoredUnsaved(false);
      setAnswers((current) => ({ ...current, [currentQuestion.id]: persisted }));
      setDrafts((current) => ({ ...current, [currentQuestion.id]: restoreResponse(persisted) }));
      if (saved.attempt) setAttempt(saved.attempt);
      else if (saved.savedAnswer) setAttempt((current) => current ? {
        ...current,
        savedAnswers: [...current.savedAnswers.filter((item) => item.questionId !== currentQuestion.id), saved.savedAnswer],
        selection: { ...current.selection, answeredCount: saved.answeredCount },
      } : current);
      questionOpenedAt.current = Date.now();
      setSaveStatus("saved");
      return true;
    } catch (saveError) {
      setSaveStatus("error");
      setError(saveError instanceof Error ? `${saveError.message} Your answer is still on this screen.` : "This answer could not be saved.");
      return false;
    } finally { savingAnswer.current = false; }
  };
  const changeAnswer = (draft: QuestionResponseDraft, autosave: boolean) => {
    if (!currentQuestion || savingAnswer.current) return;
    setDrafts((current) => ({ ...current, [currentQuestion.id]: draft }));
    if (draftStorageKey) {
      if (responsesMatch(draft, restoreResponse(answers[currentQuestion.id]))) clearLocalResponse(draftStorageKey, currentQuestion.id);
      else storeLocalResponse(draftStorageKey, currentQuestion, draft, attempt?.savedAnswers.find((answer) => answer.questionId === currentQuestion.id)?.savedAt ?? null);
    }
    setError(null);
    if (autosave) void saveAnswer(draft);
  };
  const saveAndExit = async (destination: string) => {
    if (savingAnswer.current || submitting) return;
    if (navigationBlocked && !(await saveAnswer(currentDraft))) return;
    navigate(destination);
  };
  const submit = async () => {
    if (!attemptId || !attempt || !complete || navigationBlocked) return;
    setSubmitting(true); setError(null);
    try {
      const submitted = attempt.questions.map((question) => ({
        ...responsePayload(question, restoreResponse(answers[question.id])),
        responseSeconds: answers[question.id]!.responseSeconds, questionId: question.id,
      }));
      const durationSeconds = Math.max(0, Math.min(86_400, Math.round((Date.now() - new Date(attempt.startedAt).getTime()) / 1000)));
      const diagnosticResult = await withSession((token) => submitDiagnostic(token, attemptId, submitted, durationSeconds));
      if (draftStorageKey) clearLocalResponse(draftStorageKey);
      setResult(diagnosticResult);
      setAttempt(null);
      if (diagnosticResult.attempt.enrollmentId) {
        setBuildingPath(true);
        const enrollmentId = diagnosticResult.attempt.enrollmentId;
        try {
          try {
            await withSession((token) => regeneratePersonalizedPath(token, enrollmentId));
          } catch (pathError) {
            if (!(pathError instanceof ApiError) || pathError.code !== "PATH_NOT_GENERATED") throw pathError;
            await withSession((token) => generatePersonalizedPath(token, enrollmentId));
          }
          // Keep the evidence summary visible; continuing is a deliberate learner action.
        } catch (pathError) {
          setError(pathError instanceof Error
            ? `Your diagnostic is saved, but the path could not be refreshed: ${pathError.message}`
            : "Your diagnostic is saved, but the path could not be refreshed.");
        } finally { setBuildingPath(false); }
      }
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "The diagnostic could not be submitted."); }
    finally { setSubmitting(false); }
  };

  const returnUrl = attempt?.context.enrollmentId ? `/my-courses/${attempt.context.enrollmentId}/assessment` : "/dashboard";
  if (!user) return null;
  if (loading) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef]"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-[#35614b]" /><p className="mt-3 text-sm text-[#6f7b75]">Preparing your diagnostic…</p></div></div>;
  if (buildingPath) return <div className="grid min-h-screen place-items-center bg-[#173d33] p-6 text-white"><div className="max-w-md text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/10"><LoaderCircle className="size-7 animate-spin text-[#f0a06e]" /></span><h1 className="mt-6 text-3xl font-semibold tracking-[-.04em]">Building your personalized path</h1><p className="mt-3 text-sm leading-6 text-[#bfd0c9]">Updating mastery, checking prerequisites, and ranking only the skills that are ready.</p></div></div>;
  if (result) return <ResultsView pathError={error} result={result} />;
  if (!attempt || !currentQuestion) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef] p-5"><Card className="max-w-lg text-center"><CardHeader><CircleAlert className="mx-auto size-7 text-[#b95c3c]" /><CardTitle>Diagnostic unavailable</CardTitle><CardDescription>{error ?? "The attempt could not be loaded."}</CardDescription></CardHeader><CardContent><Button asChild><Link to="/dashboard">Return to dashboard</Link></Button></CardContent></Card></div>;

  return (
    <div className="min-h-screen bg-[#f3f4ef] text-[#18372f]">
      <header className="border-b border-[#dfe3da] bg-[#fbfcf8]"><div className="mx-auto flex max-w-[1180px] items-center justify-between px-4 py-4 sm:px-7"><button className="flex items-center gap-3 text-left" disabled={saveStatus === "saving" || saveStatus === "error" || submitting || (hasPendingEdit && !canSaveCurrent)} onClick={() => void saveAndExit("/dashboard")} type="button"><span className="grid size-9 place-items-center rounded-xl bg-[#163b32] text-white"><Sparkles className="size-4" /></span><div><p className="font-bold">LearnPath</p><p className="text-[11px] text-[#7b8681]">Adaptive diagnostic</p></div></button><div className="flex items-center gap-4 text-xs text-[#6e7b74]"><span className={`hidden items-center gap-1.5 sm:flex ${saveStatus === "error" ? "text-[#a84d32]" : ""}`}>{saveStatus === "saving" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Cloud className="size-3.5" />}{saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Not saved" : hasPendingEdit ? "Unsaved changes" : saveStatus === "saved" ? "Progress saved" : currentQuestion.questionType && currentQuestion.questionType !== "SINGLE_CHOICE" ? "Save each answer" : "Autosave on"}</span><span className="hidden items-center gap-2 sm:flex"><Clock3 className="size-4" /> About {attempt.estimatedMinutes} min</span><Button disabled={saveStatus === "saving" || saveStatus === "error" || submitting || (hasPendingEdit && !canSaveCurrent)} onClick={() => void saveAndExit(returnUrl)} variant="outline">Save & exit</Button></div></div></header>
      <main className="mx-auto grid max-w-[1180px] gap-5 px-4 py-6 sm:px-7 sm:py-9 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-[1.5rem] bg-[#173d33] p-5 text-white lg:min-h-[650px]">
          <Badge className="border-white/10 bg-white/10 text-white" variant="outline"><Target className="mr-1 size-3" /> {attempt.context.name}</Badge>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">{attempt.assessmentTitle}</h1>
          <p className="mt-3 text-xs leading-5 text-[#bfd0c9]">{attempt.focusSkillIds?.length ? `This checkpoint focuses on ${attempt.focusSkillIds.length} skills. Your course coverage is saved across sessions.` : "This placement session helps choose a starting path. It does not assess every skill in a large course."}</p>
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs"><span className="text-[#bfd0c9]">Session budget used</span><span className="font-semibold">{attempt.selection.answeredCount}/{attempt.selection.maximumQuestionCount}</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#f09a67] transition-all" style={{ width: `${questionProgress}%` }} /></div>
            <div className="mt-6 space-y-2">{[
              { active: attempt.selection.currentStage === "COVERAGE", done: attempt.selection.currentStage !== "COVERAGE", label: "Skill sampling" },
              { active: attempt.selection.currentStage === "CONFIRMATION", done: attempt.selection.currentStage === "VERIFICATION" || complete, label: "Personalizing" },
              { active: attempt.selection.currentStage === "VERIFICATION" && !complete, done: complete, label: "Final verification" },
            ].map((stage) => <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs ${stage.active ? "border-[#f09a67]/60 bg-white/10 text-white" : "border-white/10 text-[#adc1b9]"}`} key={stage.label}><span className={`grid size-6 place-items-center rounded-full ${stage.done ? "bg-[#8ed0a8] text-[#173d33]" : stage.active ? "bg-[#f09a67] text-[#173d33]" : "bg-white/10"}`}>{stage.done ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}</span>{stage.label}</div>)}</div>
            <div className="mt-5 grid grid-cols-8 gap-1.5 lg:grid-cols-4">{attempt.questions.map((question, index) => <button aria-label={`Go to evidence item ${index + 1}`} className={`grid aspect-square place-items-center rounded-lg text-[11px] font-bold transition ${index === currentIndex ? "bg-[#f09a67] text-[#173d33]" : answers[question.id] ? "bg-white/20 text-white" : "border border-white/10 text-[#a9bdb5]"}`} disabled={navigationBlocked || submitting} key={question.id} onClick={() => setCurrentIndex(index)} type="button">{answers[question.id] ? <Check className="size-3.5" /> : index + 1}</button>)}</div>
          </div>
          {(["evidence-bounded-adaptive-v3", "skill-wise-adaptive-v4", "evidence-driven-adaptive-v5"] as string[]).includes(attempt.selection.policyVersion) && <div className="mt-7 rounded-xl border border-white/10 bg-white/[0.06] p-4 text-xs leading-5 text-[#bfd0c9]"><BrainCircuit className="mb-3 size-5 text-[#f0a06e]" /><p className="font-semibold text-white">Evidence-driven and adaptive</p><p className="mt-1">LearnPath probes course regions, then asks only the questions needed to resolve path-relevant uncertainty. A single response remains a probe; mastery requires repeated, varied evidence.</p>{attempt.selection.policyVersion === "evidence-driven-adaptive-v5" && <p className="mt-2 text-[#aee0c1]">A session ends when its evidence is sufficient or its question budget is reached. Untested course skills stay in your coverage backlog.</p>}{attempt.selection.recognizedSkillCount > 0 && <p className="mt-2">Your Skill Passport already provides strong evidence for {attempt.selection.recognizedSkillCount} skill{attempt.selection.recognizedSkillCount === 1 ? "" : "s"}.</p>}</div>}
          {attempt.selection.policyVersion === "prerequisite-aware-v2" && <div className="mt-7 rounded-xl border border-white/10 bg-white/[0.06] p-4 text-xs leading-5 text-[#bfd0c9]"><BrainCircuit className="mb-3 size-5 text-[#f0a06e]" /><p className="font-semibold text-white">Personalized before you begin</p><p className="mt-1">We selected {attempt.selection.selectedQuestionCount} useful questions across {attempt.selection.selectedSkillCount} skills using your Skill Passport and prerequisite graph.</p></div>}
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-5 text-[#bfd0c9]"><CircleHelp className="mb-3 size-5 text-[#f0a06e]" />Not sure is a valid answer. It prevents guessing from creating misleading mastery evidence.</div>
        </aside>

        <section>
          {restoredUnsaved && hasPendingEdit && <div className="mb-4 rounded-xl border border-[#e2d2a9] bg-[#fff9e9] px-4 py-3 text-sm text-[#86703e]" role="status">Unsaved edits restored from this tab. Review your answer and save it when you are ready.</div>}
          {error && <div role="alert" className="mb-4 rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]">{error}</div>}
          <Card className="min-h-[560px] overflow-hidden bg-white">
            <div className="h-1.5 bg-[#e4e8e2]"><div className="h-full bg-[#3d7b60] transition-all" style={{ width: `${questionProgress}%` }} /></div>
            <CardContent className="flex min-h-[558px] flex-col p-5 sm:p-8 lg:p-10">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Evidence item {currentIndex + 1}</Badge><Badge className="bg-[#eef1ec] text-[#617169]" variant="outline">{currentQuestion.skillName}</Badge>{currentQuestion.selectionStage !== "LEGACY" && <Badge variant="outline">{currentQuestion.selectionStage === "COVERAGE" ? "skill sampling" : currentQuestion.selectionStage === "CONFIRMATION" ? "personalizing" : "verification"}</Badge>}<span className="text-[11px] text-[#7c8782]">{currentQuestion.cognitiveLevel.toLowerCase()} · difficulty {currentQuestion.difficulty}/5</span></div>
                <span className="max-w-sm text-right text-xs leading-5 text-[#7c8782]">Why this question: {currentQuestion.selectionReason}</span>
              </div>
              <h2 className="mt-8 max-w-3xl text-2xl font-semibold leading-tight tracking-[-0.035em] sm:text-3xl">{currentQuestion.prompt}</h2>
              <QuestionResponse question={currentQuestion} draft={currentDraft} dirty={hasPendingEdit} saving={saveStatus === "saving" || submitting} saveFailed={saveStatus === "error"} onChange={changeAnswer} onSave={() => void saveAnswer(currentDraft)} />
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#e4e8e2] pt-6">
                <Button disabled={currentIndex === 0 || navigationBlocked || submitting} onClick={() => setCurrentIndex((index) => index - 1)} variant="ghost"><ChevronLeft className="size-4" /> Previous</Button>
                {currentIndex < attempt.questions.length - 1
                  ? <Button disabled={!answers[currentQuestion.id] || navigationBlocked || submitting} onClick={() => setCurrentIndex((index) => index + 1)}>{saveStatus === "saving" ? <LoaderCircle className="size-4 animate-spin" /> : null} Next question <ArrowRight className="size-4" /></Button>
                  : <Button disabled={!complete || submitting || navigationBlocked} onClick={() => void submit()}>{submitting ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Finish this session</Button>}
              </div>
              {!complete && currentIndex === attempt.questions.length - 1 && <p className="mt-3 text-right text-xs text-[#8a7770]">Answer or mark “I’m not sure.” LearnPath will either finish when the evidence is sufficient or select the next most useful question.</p>}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
