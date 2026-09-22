import {
  ArrowLeft, BookOpen, Check, CheckCircle2, Circle, ClipboardCheck, Clock3, Fingerprint, GitBranch,
  LoaderCircle, LockKeyhole, Pause, Play, RefreshCw, Route, Sparkles, Target,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { LearnerAppShell } from "../components/LearnerAppShell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  getEnrollment,
  setEnrollmentStatus,
  updateModuleProgress,
  type EnrollmentDetail,
  type EnrollmentModule,
} from "../enrollments/api";
import { getSkillPassport, type SkillPassport } from "../learner-skills/api";
import { getDiagnosticOverview, startDiagnostic, type DiagnosticOverview } from "../diagnostics/api";
import { generatePersonalizedPath, getPersonalizedPath, type PersonalizedPath } from "../paths/api";

function ModuleIcon({ module }: { module: EnrollmentModule }) {
  if (module.status === "COMPLETED") return <CheckCircle2 className="size-5" />;
  if (!module.isAccessible) return <LockKeyhole className="size-4" />;
  if (module.status === "IN_PROGRESS") return <Play className="size-4 fill-current" />;
  return <Circle className="size-4" />;
}

export function CourseWorkspacePage() {
  const { enrollmentId } = useParams();
  const navigate = useNavigate();
  const { accessToken, refreshSession, user } = useAuth();
  const [detail, setDetail] = useState<EnrollmentDetail | null>(null);
  const [passport, setPassport] = useState<SkillPassport | null>(null);
  const [path, setPath] = useState<PersonalizedPath | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    if (!accessToken) throw new Error("The learner session is not available.");
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
      const [nextDetail, nextPassport, nextPath, nextDiagnostic] = await Promise.all([
        withSession((token) => getEnrollment(token, enrollmentId)),
        withSession(getSkillPassport),
        withSession((token) => getPersonalizedPath(token, enrollmentId)).catch((pathError: unknown) => {
          if (pathError instanceof ApiError && pathError.status === 404) return null;
          throw pathError;
        }),
        withSession((token) => getDiagnosticOverview(token, { enrollmentId })),
      ]);
      setDetail(nextDetail);
      setPassport(nextPassport);
      setPath(nextPath);
      setDiagnostic(nextDiagnostic);
    }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "The course workspace could not be loaded."); }
    finally { setLoading(false); }
  }, [enrollmentId, withSession]);

  useEffect(() => { void load(); }, [load]);

  const changeModule = async (module: EnrollmentModule) => {
    if (!enrollmentId) return;
    setWorkingId(module.id); setError(null);
    try {
      const nextStatus = module.status === "IN_PROGRESS" ? "COMPLETED" : "IN_PROGRESS";
      setDetail(await withSession((token) => updateModuleProgress(token, enrollmentId, module.id, nextStatus)));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Module progress could not be updated.");
    } finally { setWorkingId(null); }
  };

  const changeStatus = async (status: "ACTIVE" | "PAUSED" | "DROPPED") => {
    if (!enrollmentId || !detail) return;
    setWorkingId("course-status"); setError(null);
    try {
      const result = await withSession((token) => setEnrollmentStatus(token, enrollmentId, status));
      setDetail({ ...detail, enrollment: result.enrollment });
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "The enrollment status could not be updated.");
    } finally { setWorkingId(null); }
  };

  const beginDiagnostic = async () => {
    if (!enrollmentId) return;
    setWorkingId("diagnostic"); setError(null);
    try {
      if (diagnostic?.inProgressAttempt) {
        navigate(`/diagnostic/${diagnostic.inProgressAttempt.id}`);
        return;
      }
      const attempt = await withSession((token) => startDiagnostic(token, { enrollmentId }));
      navigate(`/diagnostic/${attempt.id}`);
    } catch (diagnosticError) {
      setError(diagnosticError instanceof Error ? diagnosticError.message : "The course diagnostic could not be started.");
    } finally { setWorkingId(null); }
  };

  const buildPath = async () => {
    if (!enrollmentId) return;
    setWorkingId("path"); setError(null);
    try { setPath((await withSession((token) => generatePersonalizedPath(token, enrollmentId))).path); }
    catch (pathError) { setError(pathError instanceof Error ? pathError.message : "The course path could not be generated."); }
    finally { setWorkingId(null); }
  };

  if (!user) return null;
  if (loading && !detail) {
    return <div className="grid min-h-screen place-items-center bg-[#f3f4ef]"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-[#35614b]" /><p className="mt-3 text-sm text-[#6f7b75]">Loading your course workspace…</p></div></div>;
  }
  if (!detail) {
    return <div className="grid min-h-screen place-items-center bg-[#f3f4ef] p-5"><Card className="max-w-lg text-center"><CardHeader><CardTitle>Course workspace unavailable</CardTitle><CardDescription>{error}</CardDescription></CardHeader><CardContent className="flex justify-center gap-2"><Button asChild variant="outline"><Link to="/dashboard"><ArrowLeft className="size-4" /> Dashboard</Link></Button><Button onClick={() => void load()}><RefreshCw className="size-4" /> Retry</Button></CardContent></Card></div>;
  }

  const { enrollment, modules, skills } = detail;
  const active = enrollment.status === "ACTIVE";
  const nextModule = modules.find((module) => module.status !== "COMPLETED" && module.isAccessible);

  return (
    <LearnerAppShell>
      <main className="mx-auto max-w-[1280px] px-4 py-7 sm:px-7 sm:py-10">
        <div className="mb-5 flex items-center justify-between gap-4"><Button asChild variant="ghost"><Link to="/dashboard"><ArrowLeft className="size-4" /> Today</Link></Button><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#8a958f]">Course workspace</p></div>
        {error && <div className="mb-5 rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]">{error}</div>}
        <section className="relative overflow-hidden rounded-[1.75rem] bg-[#173d33] p-6 text-white sm:p-8">
          <div className="absolute -right-16 -top-16 size-64 rounded-full bg-[#4d806c]/40 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_320px] lg:items-end">
            <div><div className="flex flex-wrap gap-2"><Badge className="border-white/10 bg-white/10 text-white" variant="outline">{enrollment.status.toLowerCase()}</Badge>{enrollment.learningGoalName && <Badge className="border-white/10 bg-white/10 text-[#d8e6df]" variant="outline"><Target className="mr-1 size-3" /> {enrollment.learningGoalName}</Badge>}</div><h1 className="mt-5 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{enrollment.courseName}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#c4d4ce]">{enrollment.courseDescription}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-5"><div className="flex items-end justify-between"><div><p className="text-3xl font-semibold">{enrollment.progressPercentage}%</p><p className="mt-1 text-xs text-[#b9cbc4]">Course progress</p></div><p className="text-sm font-semibold">{enrollment.completedModules}/{enrollment.totalModules} modules</p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#f09a67]" style={{ width: `${enrollment.progressPercentage}%` }} /></div></div>
          </div>
        </section>

        {!diagnostic?.latestAttempt && <section className="mt-6 overflow-hidden rounded-[1.75rem] border border-[#e4c3ad] bg-[#fffaf4]"><div className="grid lg:grid-cols-[1fr_330px]"><div className="p-6 sm:p-8"><Badge variant="warning"><Sparkles className="mr-1 size-3.5" /> First step</Badge><h2 className="mt-4 text-3xl font-semibold tracking-[-.045em]">Let’s personalize {enrollment.courseName} for you.</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-[#6d746f]">We’ll first check what you already know so you don’t have to repeat familiar concepts. This is not a pass-or-fail test.</p><Button className="mt-6" disabled={workingId !== null} onClick={() => void beginDiagnostic()}>{workingId === "diagnostic" ? <LoaderCircle className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}{diagnostic?.inProgressAttempt ? "Resume knowledge check" : "Start knowledge check"}</Button></div><div className="border-t border-[#ead8cb] bg-white/55 p-6 lg:border-l lg:border-t-0"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#bd6a3d]">What happens next</p><div className="mt-4 space-y-3 text-sm"><div className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#173d33] text-xs text-white">1</span><span>Answer questions across the course foundations.</span></div><div className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e9eee8] text-xs">2</span><span>See what you already know and what needs support.</span></div><div className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e9eee8] text-xs">3</span><span>Open your personalized starting point.</span></div></div></div></div></section>}

        {path && <section className="mt-6 overflow-hidden rounded-[1.75rem] border border-[#dbe2da] bg-white shadow-[0_16px_45px_rgba(34,62,52,.07)]"><div className="grid lg:grid-cols-[1fr_360px]"><div className="p-6 sm:p-8"><div className="flex flex-wrap items-center gap-2"><Badge variant={path.status === "STALE" ? "warning" : "success"}>{path.status === "STALE" ? "New evidence received" : "Personalized for you"}</Badge><span className="text-xs text-[#77837d]">Path version {path.pathVersion}</span></div><p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-[#c66b3d]">Your one next action</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">{path.status === "STALE" ? "Update your path before continuing" : path.learnNext?.name ?? "Your course path is up to date"}</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-[#66756e]">{path.status === "STALE" ? "Your latest assessment changed what LearnPath knows about you. The previous recommendation is paused so you never follow an outdated path." : path.learnNext ? `LearnPath chose this from ${path.summary.eligibleRanked} ready skills after checking prerequisites, mastery, confidence, retention, and predicted learning benefit.` : "There is no new recommended lesson waiting right now."}</p><Button asChild className="mt-6 h-11 px-6"><Link to={`/my-courses/${enrollment.id}/path`}>{path.status === "STALE" ? <RefreshCw className="size-4" /> : <Sparkles className="size-4" />}{path.status === "STALE" ? "Update my path" : "Open my learning path"}<ArrowLeft className="size-4 rotate-180" /></Link></Button></div><div className="border-t border-[#e3e8e1] bg-[#f7f9f5] p-6 lg:border-l lg:border-t-0"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#7c8882]">Why it fits now</p><div className="mt-4 space-y-3 text-sm"><div className="flex items-start gap-3 rounded-xl bg-white p-3"><Check className="mt-0.5 size-4 shrink-0 text-[#397457]" /><span>Required foundations are checked before ranking.</span></div><div className="flex items-start gap-3 rounded-xl bg-white p-3"><Fingerprint className="mt-0.5 size-4 shrink-0 text-[#397457]" /><span>{path.summary.recognizedFromGlobalMastery} course skills are already recognized.</span></div><div className="flex items-start gap-3 rounded-xl bg-white p-3"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-[#9b6547]" /><span>{path.summary.locked} future skills stay locked with explanations.</span></div></div></div></div></section>}

        <section className="mt-6 grid gap-5 xl:grid-cols-[1fr_340px]">
          <div>
            <div className="mb-4 flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Course journey</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Your course at a glance</h2></div>{enrollment.status !== "COMPLETED" && <Button disabled={workingId === "course-status"} onClick={() => void changeStatus(active ? "PAUSED" : "ACTIVE")} variant="outline">{workingId === "course-status" ? <LoaderCircle className="size-4 animate-spin" /> : active ? <Pause className="size-4" /> : <Play className="size-4" />}{active ? "Pause course" : "Resume course"}</Button>}</div>
            <div className="space-y-3">
              {modules.map((module) => {
                const moduleSkills = skills.filter((skill) => skill.moduleId === module.id);
                const locked = !module.isAccessible;
                return <Card className={module.status === "IN_PROGRESS" ? "border-[#e19a70] bg-[#fffaf4]" : module.status === "COMPLETED" ? "border-[#b9d3c0] bg-[#f7fbf6]" : locked ? "bg-[#f1f2ee] opacity-80" : "bg-white"} key={module.id}>
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${module.status === "COMPLETED" ? "bg-[#2f7256] text-white" : module.status === "IN_PROGRESS" ? "bg-[#e68049] text-white" : locked ? "bg-[#dde1dc] text-[#89928d]" : "border border-[#cfd7ce] bg-white text-[#607168]"}`}><ModuleIcon module={module} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7b8781]">Module {module.sequence}</p><h3 className="mt-1 text-lg font-semibold">{module.name}</h3></div><Badge variant={module.status === "COMPLETED" ? "success" : "outline"}>{locked ? "Locked" : module.status.replace("_", " ").toLowerCase()}</Badge></div>
                        <p className="mt-2 text-sm leading-6 text-[#6d7973]">{module.description}</p>
                        <div className="mt-4 flex flex-wrap gap-2">{moduleSkills.map((skill) => { const globalState = passport?.skills.find((item) => item.id === skill.id); return <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dde3dc] bg-white px-2.5 py-1 text-[11px] font-medium text-[#5e6f67]" key={skill.id}><Fingerprint className="size-3 text-[#7d8a83]" />{skill.name}<span className="text-[#9aa39e]">{globalState?.mastery === null || globalState?.mastery === undefined ? "unknown" : `${Math.round(globalState.mastery * 100)}%`}</span></span>; })}</div>
                        <div className="mt-5 flex flex-col gap-3 border-t border-[#e1e5df] pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-[#78837e]">{locked ? "Complete earlier modules to unlock" : module.status === "COMPLETED" ? "Course progress updated; global mastery unchanged" : `${moduleSkills.length} skills · LearnPath chooses practice when it supports your next step`}</p><div className="flex flex-wrap gap-2">{!locked && <Button asChild variant="outline"><Link to={`/learning-library?courseId=${enrollment.courseId}&moduleId=${module.id}`}><BookOpen className="size-4" /> Browse resources</Link></Button>}{module.status === "COMPLETED" ? <span className="flex items-center gap-1.5 px-2 text-xs font-semibold text-[#2e694f]"><Check className="size-4" /> Complete</span> : <Button disabled={!active || locked || workingId !== null} onClick={() => void changeModule(module)} variant="outline">{workingId === module.id ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}{module.status === "IN_PROGRESS" ? "Mark module complete" : "Begin module"}</Button>}</div></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>;
              })}
            </div>
          </div>

          <aside className="space-y-4">
            {!path && <Card className="overflow-hidden border-[#e18b58] bg-[#fff8f0]"><div className="h-1 bg-[#e9854e]" /><CardHeader><div className="flex items-start justify-between"><div><Badge variant="warning">Your next step</Badge><CardTitle className="mt-3">{diagnostic?.latestAttempt ? "Your starting point is ready" : "Complete your knowledge check"}</CardTitle><CardDescription>{diagnostic?.latestAttempt ? "Create the course journey built around what you demonstrated." : "This helps you skip familiar concepts and begin at the right lesson."}</CardDescription></div><Sparkles className="size-5 shrink-0 text-[#c86939]" /></div></CardHeader><CardContent>{diagnostic?.latestAttempt ? <Button className="w-full" disabled={workingId !== null} onClick={() => void buildPath()}>{workingId === "path" ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{workingId === "path" ? "Personalizing…" : "Create my learning path"}</Button> : <Button className="w-full" disabled={workingId !== null} onClick={() => void beginDiagnostic()}><ClipboardCheck className="size-4" />{diagnostic?.inProgressAttempt ? "Resume knowledge check" : "Start knowledge check"}</Button>}</CardContent></Card>}
            <Card className="overflow-hidden border-[#b9d3c0] bg-[#f7fbf6]"><CardHeader><ClipboardCheck className="mb-2 size-5 text-[#35614b]" /><CardTitle>Knowledge check</CardTitle><CardDescription>{diagnostic?.latestAttempt ? "Your starting-point check is complete." : "A short, no-pressure check before you begin."}</CardDescription></CardHeader><CardContent>{diagnostic?.latestAttempt ? <Button asChild className="w-full" variant="outline"><Link to={`/diagnostic/${diagnostic.latestAttempt.id}`}>View my results</Link></Button> : <Button className="w-full" disabled={workingId !== null} onClick={() => void beginDiagnostic()}>{workingId === "diagnostic" ? <LoaderCircle className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />} {diagnostic?.inProgressAttempt ? "Resume" : "Start"}</Button>}</CardContent></Card>
            <Card className="bg-[#fffaf1]"><CardHeader><GitBranch className="mb-2 size-5 text-[#d5743f]" /><CardTitle>Your skills travel with you</CardTitle><CardDescription>Knowledge from other courses can help you move faster here.</CardDescription></CardHeader><CardContent><p className="text-sm leading-6 text-[#706f67]">{passport?.skills.some((skill) => skills.some((courseSkill) => courseSkill.id === skill.id) && skill.evidenceState !== "UNKNOWN") ? "LearnPath is already reusing skills you demonstrated elsewhere in this course." : "As you demonstrate shared skills, LearnPath will recognize them across every relevant course."}</p><Button asChild className="mt-4 w-full" variant="outline"><Link to="/skill-passport"><Fingerprint className="size-4" /> See my skills</Link></Button></CardContent></Card>
            <Card><CardHeader><BookOpen className="mb-2 size-5 text-[#35614b]" /><CardTitle>Continue from here</CardTitle><CardDescription>{nextModule ? nextModule.name : "All modules completed"}</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex items-center justify-between border-t border-[#e4e8e2] pt-3"><span className="text-[#718078]">Current position</span><span className="font-semibold">{nextModule ? `Module ${nextModule.sequence}` : "Complete"}</span></div><div className="flex items-center justify-between border-t border-[#e4e8e2] pt-3"><span className="text-[#718078]">Last opened</span><span className="flex items-center gap-1.5 font-semibold"><Clock3 className="size-3.5" /> {new Date(enrollment.lastAccessedAt).toLocaleDateString()}</span></div></CardContent></Card>
            <details className="rounded-2xl border border-[#dce2da] bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Technical details for reviewers</summary><p className="mt-3 text-xs leading-5 text-[#6e7b74]">Inspect prerequisite filtering, the eligible candidate set, and why future skills remain blocked.</p><Button asChild className="mt-3 w-full" variant="outline"><Link to={`/my-courses/${enrollment.id}/candidates`}><Route className="size-4" /> Open candidate analysis</Link></Button></details>
          </aside>
        </section>
      </main>
    </LearnerAppShell>
  );
}

