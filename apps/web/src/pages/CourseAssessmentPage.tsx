import { ArrowRight, Check, CheckCircle2, CircleDashed, ClipboardCheck, Clock3, Layers3, LoaderCircle, Play, RefreshCw, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { createAssessmentProgram, getAssessmentProgramOverview, saveCourseSelfReport, startAssessmentProgramSession, startFocusedKnowledgeCheck, type AssessmentCoverageStatus, type AssessmentProgramMode, type AssessmentProgramOverview } from "../assessment-programs/api";
import { CourseKnowledgeSetup, type CourseSelfReportDraft } from "../components/CourseKnowledgeSetup";
import { getDiagnosticOverview } from "../diagnostics/api";
import { CourseNavigation } from "../components/CourseNavigation";
import { LearnerAppShell } from "../components/LearnerAppShell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";

const coverageLabels: Record<AssessmentCoverageStatus, string> = {
  ASSESSED: "Assessed", NEEDS_CONFIRMATION: "Needs confirmation", UNASSESSED: "Not assessed", NEEDS_REFRESH: "Needs a refresh",
};
const coverageTones: Record<AssessmentCoverageStatus, string> = {
  ASSESSED: "bg-[#e5f0e2] text-[#34684b]", NEEDS_CONFIRMATION: "bg-[#fff1db] text-[#91612d]", UNASSESSED: "bg-[#edf0eb] text-[#728077]", NEEDS_REFRESH: "bg-[#fce9df] text-[#aa603d]",
};

export function CourseAssessmentPage() {
  const { enrollmentId } = useParams();
  const navigate = useNavigate();
  const { accessToken, refreshSession } = useAuth();
  const [overview, setOverview] = useState<AssessmentProgramOverview | null>(null);
  const [mode, setMode] = useState<AssessmentProgramMode>("COMPREHENSIVE");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [focusedSkillId, setFocusedSkillId] = useState<string | null>(null);
  const [savedAttemptId, setSavedAttemptId] = useState<string | null>(null);
  const [hasSubmittedDiagnostic, setHasSubmittedDiagnostic] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | AssessmentCoverageStatus>("ALL");
  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    if (!accessToken) throw new Error("Your session is not available.");
    try { return await operation(accessToken); }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return operation(await refreshSession());
      throw requestError;
    }
  }, [accessToken, refreshSession]);
  const load = useCallback(async () => {
    if (!enrollmentId) return;
    setLoading(true); setError(null);
    try {
      const [next, diagnostic] = await Promise.all([
        withSession((token) => getAssessmentProgramOverview(token, enrollmentId)),
        withSession((token) => getDiagnosticOverview(token, { enrollmentId })),
      ]);
      setSavedAttemptId(diagnostic.inProgressAttempt?.id ?? null);
      setHasSubmittedDiagnostic(Boolean(diagnostic.latestAttempt));
      setOverview(next);
      if (next.program?.status === "IN_PROGRESS") setMode(next.program.mode);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Your assessment coverage could not be loaded."); }
    finally { setLoading(false); }
  }, [enrollmentId, withSession]);
  useEffect(() => { void load(); }, [load]);
  const activeSession = overview?.sessions.find((session) => session.id === overview.program?.activeSessionId)
    ?? overview?.sessions.find((session) => session.status === "IN_PROGRESS");
  const begin = async () => {
    if (!enrollmentId || !overview) return;
    setWorking(true); setError(null);
    try {
      if (savedAttemptId) { navigate(`/diagnostic/${savedAttemptId}`); return; }
      if (activeSession?.attemptId && overview.program) {
        navigate(`/diagnostic/${activeSession.attemptId}?${new URLSearchParams({ programId: overview.program.id, enrollmentId })}`);
        return;
      }
      const current = !overview.program || overview.program.mode !== mode || overview.program.status === "COMPLETED"
        ? await withSession((token) => createAssessmentProgram(token, enrollmentId, mode)) : overview;
      setOverview(current);
      if (!current.program) throw new Error("The assessment could not be prepared. Please try again.");
      const started = await withSession((token) => startAssessmentProgramSession(token, current.program!.id));
      setOverview(started.program);
      navigate(`/diagnostic/${started.attempt.id}?${new URLSearchParams({ programId: current.program.id, enrollmentId })}`);
    } catch (startError) { setError(startError instanceof Error ? startError.message : "The next assessment session could not be opened."); }
    finally { setWorking(false); }
  };
  const saveSetup = async (draft: CourseSelfReportDraft) => {
    setWorking(true); setError(null);
    try { setOverview(await withSession((token) => saveCourseSelfReport(token, draft))); setShowSetup(false); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Your course knowledge setup could not be saved."); }
    finally { setWorking(false); }
  };
  const startFocused = async (skillId: string, challenge: boolean) => {
    if (!enrollmentId) return;
    setFocusedSkillId(skillId); setError(null);
    try {
      const attempt = await withSession((token) => startFocusedKnowledgeCheck(token, {
        enrollmentId, skillId, intent: challenge ? "CHALLENGE" : "KNOWLEDGE_CHECK",
      }));
      navigate(`/diagnostic/${attempt.id}?${new URLSearchParams({ enrollmentId })}`);
    } catch (startError) { setError(startError instanceof Error ? startError.message : "The focused knowledge check could not be started."); }
    finally { setFocusedSkillId(null); }
  };
  const visibleSkills = useMemo(() => overview?.skills.filter((skill) => (filter === "ALL" || skill.coverageStatus === filter)
    && `${skill.skillName} ${skill.moduleName} ${skill.category}`.toLowerCase().includes(search.toLowerCase())) ?? [], [filter, overview, search]);
  const coverage = overview?.coverage;
  const fullCoverage = Boolean(coverage && coverage.totalSkills > 0 && coverage.assessed === coverage.totalSkills);
  const saved = Boolean(activeSession || savedAttemptId);
  const modeChanged = mode !== (overview?.program?.mode ?? "COMPREHENSIVE");
  const hasNext = Boolean(saved || overview?.nextSession);
  const pending = coverage ? coverage.totalSkills - coverage.assessed : 0;
  const nextSkills = overview?.skills.filter((skill) => overview.nextSession?.focusSkillIds.includes(skill.skillId)) ?? [];
  const submitted = overview?.sessions.filter((session) => session.status === "SUBMITTED") ?? [];
  const comprehensiveSwitch = Boolean(overview?.program?.mode === "QUICK_PLACEMENT" && mode === "COMPREHENSIVE");

  return <LearnerAppShell><main className="mx-auto max-w-[1320px] px-4 py-7 sm:px-7 sm:py-10">
    {enrollmentId && <CourseNavigation enrollmentId={enrollmentId} courseName={overview?.context.name} />}
    {error && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#e7bdab] bg-[#fff5ef] p-4 text-sm text-[#945035]" role="alert"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><div className="flex-1">{error}</div><button className="font-semibold underline" onClick={() => void load()} type="button">Retry</button></div>}
    {loading && !overview ? <div className="grid min-h-80 place-items-center rounded-[2rem] border border-[#dce3da] bg-white"><div className="text-center"><LoaderCircle className="mx-auto size-6 animate-spin text-[#397356]" /><p className="mt-4 text-sm text-[#768279]">Opening your course knowledge map…</p></div></div> : overview && coverage ? showSetup || (overview.selfReport && !overview.selfReport.submittedAt && coverage.observed === 0 && !hasSubmittedDiagnostic && !savedAttemptId) ? <CourseKnowledgeSetup enrollmentId={enrollmentId!} onCancel={showSetup ? () => setShowSetup(false) : undefined} onSave={saveSetup} overview={overview} saving={working} /> : <div className="space-y-7">
      <section className="grid overflow-hidden rounded-[2rem] bg-[#183d34] text-white sm:grid-cols-[1.2fr_.8fr]">
        <div className="relative overflow-hidden p-6 sm:p-7"><div className="absolute -right-20 -top-32 size-80 rounded-full bg-[#699579]/20 blur-3xl" /><div className="relative"><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#efac7c]">Your course knowledge</p><h1 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-[-.04em]">Know where you stand.</h1><p className="mt-5 max-w-xl text-sm leading-7 text-[#c6d6ce]">Build a clear picture of {overview.context.name}, one manageable session at a time. Your coverage stays with you when you pause, learn, and return.</p><div className="mt-7 flex flex-wrap gap-2"><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs"><ShieldCheck className="size-4 text-[#aaceac]" />Progress saved between sessions</span><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs"><Layers3 className="size-4 text-[#eab083]" />{overview.modules.length} modules · {coverage.totalSkills} skills</span></div></div></div>
        <div className="flex flex-col justify-center border-t border-white/10 bg-white/[.05] p-6 sm:p-7 sm:border-l sm:border-t-0"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#c1d1c7]">Assessment coverage</p><div className="mt-4 flex items-baseline gap-2"><strong className="text-5xl font-medium tracking-[-.06em]">{coverage.assessed}</strong><span className="text-2xl text-[#9bb9aa]">/ {coverage.totalSkills}</span></div><p className="mt-2 text-sm text-[#c3d6cb]">skills with sufficient assessment evidence</p><div aria-label={`${coverage.assessed} of ${coverage.totalSkills} skills assessed`} className="mt-6 flex h-2.5 overflow-hidden rounded-full bg-white/10"><span className="h-full rounded-full bg-[#b0d5a8]" style={{ width: `${coverage.assessedPercentage}%` }} /></div><div className="mt-5 flex items-center justify-between gap-3 text-xs text-[#c3d6cb]"><span>{coverage.mastered} currently meet mastery requirements</span><span>{coverage.assessedPercentage}% assessed</span></div><p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-[#a9c0b2]">Assessed means we have enough evidence to understand a skill. It can reveal either strength or a learning need.</p></div>
      </section>

      {!saved && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dce3da] bg-[#f8faf5] px-5 py-4"><p className="text-xs leading-5 text-[#6d7d70]">Tell LearnPath which skills you know, do not know, or are unsure about. This only guides future questions.</p><Button onClick={() => setShowSetup(true)} variant="outline">{overview.selfReport?.skillReports.length ? "Update my starting answers" : "Tell us what I know"}</Button></div>}

      {overview.selfReport?.skillReports.length > 0 && <section aria-label="Your starting knowledge claims" className="rounded-[1.75rem] border border-[#dce3da] bg-white p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#b9724d]">Your starting answers</p><h2 className="mt-2 text-xl font-semibold tracking-[-.03em]">What you said you know</h2><p className="mt-1 text-xs leading-5 text-[#77877a]">These are your starting claims, not measured mastery. The knowledge check verifies them with skill-specific questions.</p></div><div className="flex flex-wrap gap-2">{([
        { label: "I know this", count: overview.selfReport.skillReports.filter((item) => item.familiarity === "COMFORTABLE" || item.familiarity === "VERY_COMFORTABLE").length, tone: "border-[#c8dec8] bg-[#f0f7ef] text-[#376247]" },
        { label: "I don't know this", count: overview.selfReport.skillReports.filter((item) => item.familiarity === "NEVER_LEARNED").length, tone: "border-[#ead8c5] bg-[#fff7ed] text-[#8c6545]" },
        { label: "Not sure", count: overview.selfReport.skillReports.filter((item) => !["COMFORTABLE", "VERY_COMFORTABLE", "NEVER_LEARNED"].includes(item.familiarity)).length, tone: "border-[#dce3da] bg-[#f6f8f4] text-[#65796b]" },
      ]).map((item) => <span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${item.tone}`} key={item.label}>{item.label}: {item.count}</span>)}</div></div></section>}

      {overview.knowledgeBoundary && <section className="rounded-[1.75rem] border border-[#dce3da] bg-white p-6 sm:p-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#b9724d]">Knowledge boundary</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Your safe starting point</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#708076]">{overview.knowledgeBoundary.reason}</p></div>{overview.knowledgeBoundary.startingSkillName && <Badge variant="warning">Start near {overview.knowledgeBoundary.startingSkillName}</Badge>}</div><div className="mt-5 flex gap-2 overflow-x-auto pb-2">{overview.knowledgeBoundary.skills.map((skill, index) => <div className={`min-w-44 rounded-2xl border p-4 ${skill.status === "STRONG" ? "border-[#bdd5bd] bg-[#eff7ed]" : skill.status === "NEEDS_WORK" ? "border-[#e6c0aa] bg-[#fff4ed]" : skill.status === "NOT_ASSESSED_YET" ? "border-[#dde2dc] bg-[#f5f6f3]" : "border-[#ead7b2] bg-[#fff9ea]"}`} key={skill.skillId}><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#879188]">{index + 1} · {skill.moduleName}</p><p className="mt-2 text-sm font-semibold">{skill.skillName}</p><p className="mt-2 text-xs text-[#6f7e74]">{skill.status.toLowerCase().replaceAll("_", " ")}</p></div>)}</div><p className="mt-3 text-xs text-[#829087]">Not assessed yet is unknown—not a failed skill. LearnPath will verify high-impact unknowns when they approach your path.</p></section>}

      <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-[1.75rem] border border-[#dce3da] bg-white p-6 sm:p-8"><div className="flex items-center justify-between gap-4"><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#b9724d]">Your next session</p>{saved && <Badge variant="warning">Saved session</Badge>}</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-.035em]">{saved ? "Pick up where you left off" : fullCoverage ? "Your whole course has been assessed" : (hasNext || comprehensiveSwitch) ? "Your next knowledge check" : "More assessment content is needed"}</h2>
          <p className="mt-3 text-sm leading-6 text-[#708076]">{saved ? "Return to your saved answers. The course keeps every completed session and every skill still to explore." : fullCoverage ? "Your evidence map is complete for now. Follow your path to strengthen the skills that need attention." : overview.nextSession?.reason ?? "This session program has finished or needs more questions. Choose Full course to continue any remaining coverage, or inspect the content gaps below."}</p>
          {!saved && !fullCoverage && <div aria-label="Assessment approach" className="mt-5 grid gap-2 sm:grid-cols-2">
            {([{ value: "COMPREHENSIVE", title: "Full course", description: "Cover every skill across resumable sessions." }, { value: "QUICK_PLACEMENT", title: "Quick starting point", description: "A partial check to guide your first lessons." }] as const).map((option) => <button aria-pressed={mode === option.value} className={`rounded-2xl border p-4 text-left transition ${mode === option.value ? "border-[#4d8062] bg-[#eef5e9]" : "border-[#e1e6de] bg-[#fbfcf8] hover:border-[#afc4b2]"}`} key={option.value} onClick={() => setMode(option.value)} type="button"><span className="flex items-center justify-between gap-2 text-sm font-semibold">{option.title}{mode === option.value && <Check className="size-4 text-[#3c7753]" />}</span><span className="mt-2 block text-xs leading-5 text-[#748277]">{option.description}</span></button>)}
          </div>}
          {nextSkills.length > 0 && !saved && !modeChanged && <div className="mt-5"><p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#8c978e]">Coming into focus</p><div className="mt-2 flex flex-wrap gap-2">{nextSkills.map((skill) => <span className="rounded-full border border-[#dfe5dc] bg-[#f7f9f3] px-3 py-1.5 text-xs text-[#526a5c]" key={skill.skillId}>{skill.skillName}</span>)}</div></div>}
          <div className="mt-6 flex flex-wrap items-center gap-3">{fullCoverage && !saved ? <Button asChild><Link to={`/my-courses/${enrollmentId}/path`}>Continue on my path <ArrowRight className="size-4" /></Link></Button> : <Button disabled={working || (!hasNext && !comprehensiveSwitch)} onClick={() => void begin()}>{working ? <LoaderCircle className="size-4 animate-spin" /> : saved ? <Play className="size-4" /> : <ClipboardCheck className="size-4" />}{working ? "Opening session…" : saved ? "Resume knowledge check" : overview.program && !comprehensiveSwitch ? "Start next session" : mode === "COMPREHENSIVE" ? "Start full-course check" : "Find my starting point"}</Button>}<span className="text-xs text-[#849086]">{saved ? "Your saved answers are ready to resume" : overview.nextSession && !modeChanged ? `Up to ${overview.nextSession.maximumQuestions} questions this session` : `${submitted.length} saved result${submitted.length === 1 ? "" : "s"}`}</span></div>
          {mode === "QUICK_PLACEMENT" && !fullCoverage && <p className="mt-4 text-xs leading-5 text-[#987247]">Quick placement is partial. It does not establish coverage or mastery of the entire course.</p>}
        </div>
        <div className="rounded-[1.75rem] border border-[#dce3da] bg-[#f9faf5] p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#819080]">A complete picture</p><h2 className="mt-3 text-2xl font-semibold tracking-[-.035em]">What we know so far</h2><div className="mt-5 space-y-2">{([{ status: "ASSESSED", count: coverage.assessed }, { status: "NEEDS_CONFIRMATION", count: coverage.needsConfirmation }, { status: "UNASSESSED", count: coverage.unassessed }, { status: "NEEDS_REFRESH", count: coverage.needsRefresh }] as const).map(({ status, count }) => <button aria-pressed={filter === status} className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#e3e8df] bg-white px-4 py-3 text-left text-sm hover:border-[#a6bda9]" key={status} onClick={() => setFilter(filter === status ? "ALL" : status)} type="button"><span className="flex items-center gap-2.5"><span className={`size-2.5 rounded-full ${status === "ASSESSED" ? "bg-[#77a26f]" : status === "NEEDS_CONFIRMATION" ? "bg-[#d6ac63]" : status === "NEEDS_REFRESH" ? "bg-[#db9671]" : "bg-[#bdc7bc]"}`} />{coverageLabels[status]}</span><strong>{count}</strong></button>)}</div><p className="mt-4 text-xs leading-5 text-[#7c887d]">{pending} skill{pending === 1 ? "" : "s"} still need assessment evidence. A low score and an unassessed skill mean different things.</p>{coverage.blocked > 0 && <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#ead3bd] bg-[#fff6e9] p-3 text-xs leading-5 text-[#8c683f]"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><p>{coverage.blocked} skill{coverage.blocked === 1 ? " needs" : "s need"} more question coverage. These content gaps do not count as completed.</p></div>}</div>
      </section>

      <section aria-label="Course assessment coverage"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#b9724d]">The whole course</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Module-by-module coverage</h2><p className="mt-2 text-sm text-[#78867a]">Explore each module to see its evidence and remaining coverage.</p></div><label className="flex items-center gap-2 rounded-xl border border-[#d9e2d6] bg-white px-3 py-2.5"><Search className="size-4 shrink-0 text-[#7b8a7b]" /><input aria-label="Search course skills" className="w-full min-w-0 bg-transparent text-sm outline-none sm:w-48" onChange={(event) => setSearch(event.target.value)} placeholder="Find a skill or module" value={search} /></label></div>
        <div className="mt-5 flex flex-wrap gap-2">{(["ALL", "ASSESSED", "NEEDS_CONFIRMATION", "UNASSESSED", "NEEDS_REFRESH"] as const).map((value) => <button aria-pressed={filter === value} className={`rounded-full border px-3 py-2 text-xs font-medium ${filter === value ? "border-[#315f47] bg-[#315f47] text-white" : "border-[#dce3d8] bg-white text-[#71816f]"}`} key={value} onClick={() => setFilter(value)} type="button">{value === "ALL" ? "All skills" : coverageLabels[value]}</button>)}</div>
        <div className="mt-4 space-y-3">{overview.modules.map((module) => {
          const skills = visibleSkills.filter((skill) => skill.moduleId === module.id);
          if (!skills.length) return null;
          return <details className="group overflow-hidden rounded-2xl border border-[#dce3d8] bg-white" key={module.id} open={search.length > 0 || filter !== "ALL" ? true : undefined}><summary className="flex cursor-pointer list-none items-center gap-4 p-5 sm:p-6"><span className={`grid size-11 shrink-0 place-items-center rounded-xl text-sm font-semibold ${module.coverage.assessed === module.coverage.totalSkills && module.coverage.totalSkills > 0 ? "bg-[#e8f2e3] text-[#477445]" : "bg-[#f0f3eb] text-[#7d8c78]"}`}>{module.coverage.assessed === module.coverage.totalSkills && module.coverage.totalSkills > 0 ? <CheckCircle2 className="size-5" /> : String(module.sequence).padStart(2, "0")}</span><div className="min-w-0 flex-1"><h3 className="font-semibold tracking-[-.02em]">{module.name}</h3><p className="mt-1 text-xs text-[#83907f]">{module.coverage.assessed} of {module.coverage.totalSkills} skills assessed · {module.coverage.mastered} mastered</p></div><div className="hidden w-28 overflow-hidden rounded-full bg-[#edf1e8] sm:block"><div className="h-1.5 rounded-full bg-[#80a76e]" style={{ width: `${module.coverage.assessedPercentage}%` }} /></div><ArrowRight className="size-4 shrink-0 text-[#81927b] transition-transform group-open:rotate-90" /></summary><div className="border-t border-[#e6eade] bg-[#fafbf7] px-5 py-2 sm:px-6">{skills.map((skill) => { const claim = overview.selfReport?.skillReports.find((report) => report.skillId === skill.skillId); const challenge = claim?.familiarity === "COMFORTABLE" || claim?.familiarity === "VERY_COMFORTABLE"; return <div className="border-b border-[#e4e9dd] py-4 last:border-0" key={skill.skillId}><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div className="flex items-center gap-2.5">{skill.coverageStatus === "ASSESSED" ? <Check className="size-4 text-[#6d9a5e]" /> : <CircleDashed className="size-4 text-[#a7b29f]" />}<h4 className="text-sm font-semibold">{skill.skillName}</h4></div><span className={`self-start rounded-full px-2.5 py-1 text-[11px] font-medium ${coverageTones[skill.coverageStatus]}`}>{coverageLabels[skill.coverageStatus]}{skill.mastered ? " · Mastered" : ""}</span></div><p className="ml-6 mt-2 text-xs leading-5 text-[#788873]">{skill.coverageReason}</p><div className="ml-6 mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[#8c9885]"><span>{skill.distinctQuestionCount} distinct observations</span><span>{skill.applicationQuestionCount} application questions</span><span>{skill.mastery === null ? "Mastery unknown" : `Mastery estimate ${Math.round(skill.mastery * 100)}%`}</span>{skill.coverageStatus !== "ASSESSED" && skill.bankStatus !== "BLOCKED" && <button className="font-semibold text-[#3d6b52] underline decoration-[#adc2b2] underline-offset-4" disabled={focusedSkillId !== null} onClick={() => void startFocused(skill.skillId, challenge)} type="button">{focusedSkillId === skill.skillId ? "Opening check…" : challenge ? "Challenge this skill" : "Check this skill"}</button>}</div>{skill.bankStatus !== "READY" && <p className="ml-6 mt-2 flex items-start gap-1.5 text-xs leading-5 text-[#a77b4a]"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{skill.bankReason}</p>}</div>; })}</div></details>;
        })}{!visibleSkills.length && <div className="rounded-2xl border border-dashed border-[#d1dbcb] p-8 text-center text-sm text-[#798972]">{overview.skills.length ? "No skills match this view. Try a different filter." : "No skills have been mapped to this course yet."}</div>}</div>
      </section>
      {submitted.length > 0 && <section className="rounded-[1.75rem] border border-[#dce3da] bg-white p-6 sm:p-8"><div className="flex items-center gap-3"><Clock3 className="size-5 text-[#8b9b81]" /><h2 className="text-xl font-semibold tracking-[-.025em]">Your saved sessions</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{submitted.map((session) => <Link className="flex items-center justify-between gap-3 rounded-xl border border-[#e2e8db] bg-[#fafbf7] p-4 text-sm transition hover:border-[#aabd9e]" key={session.id} to={`/diagnostic/${session.attemptId}?${new URLSearchParams({ programId: overview.program?.id ?? "", enrollmentId: enrollmentId ?? "" })}`}><div><p className="font-semibold">Session {session.sequence}</p><p className="mt-1 text-xs text-[#8a9782]">{session.focusSkillIds.length} skills · {session.questionCount} questions</p></div><ArrowRight className="size-4 text-[#84947a]" /></Link>)}</div></section>}
      <div className="flex items-center justify-between gap-3 text-xs text-[#8a9784]"><span>Coverage includes prior direct evidence from shared skills across courses.</span><button className="inline-flex items-center gap-1.5 font-semibold" disabled={loading} onClick={() => void load()} type="button"><RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</button></div>
    </div> : null}
  </main></LearnerAppShell>;
}
