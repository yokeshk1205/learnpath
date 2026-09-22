import {
  AlarmClock, Award, BookOpen, CheckCircle2, CircleDot,
  Fingerprint, Layers3, LoaderCircle, PlayCircle, RefreshCw, Search, TimerReset,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { LearnerAppShell } from "../components/LearnerAppShell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { getSkillPassport, type LearnerSkillState, type SkillPassport } from "../learner-skills/api";

function percentage(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function SignalBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[#617169]">{label}</span>
        <span className="font-bold text-[#264e40]">{percentage(value)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e7ebe5]">
        {value !== null && <div className="h-full rounded-full bg-[#3b7a5f]" style={{ width: `${value * 100}%` }} />}
      </div>
    </div>
  );
}

function SkillCard({ skill }: { skill: LearnerSkillState }) {
  const shared = skill.mastery !== null && skill.courseContexts.length > 1;
  const directContexts = skill.courseContexts.filter((course) => course.usageType === "COURSE_SKILL");
  const prerequisiteContexts = skill.courseContexts.filter((course) => course.usageType === "PREREQUISITE");
  const practiceContext = directContexts.find((course) => course.enrollmentStatus === "ACTIVE") ?? directContexts[0];
  const masteryBand = skill.mastery === null ? "Not yet assessed" : skill.mastery >= 0.8 ? "Strong" : skill.mastery >= 0.5 ? "Developing" : "Just starting";
  return (
    <Card className="overflow-hidden bg-white">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <Badge variant={skill.mastery !== null && skill.mastery >= 0.7 ? "success" : "outline"}>{masteryBand}</Badge>
              {skill.revisionDue && <Badge className="bg-[#a94f32] text-white"><AlarmClock className="mr-1 size-3" /> Quick review</Badge>}
              {shared && <Badge className="bg-[#eef1fb] text-[#4d5b8f]" variant="outline"><Layers3 className="mr-1 size-3" /> Used across courses</Badge>}
            </div>
            <h2 className="mt-4 text-lg font-semibold tracking-[-0.02em]">{skill.name}</h2>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-[#8a948f]">{skill.category}</p>
          </div>
          <div className="text-right"><p className="text-2xl font-semibold">{percentage(skill.mastery)}</p><p className="text-[10px] text-[#7a8580]">mastery</p></div>
        </div>

        <p className="mt-4 line-clamp-2 text-sm leading-6 text-[#6e7a74]">{skill.description}</p>
        <div className={`mt-4 rounded-2xl p-4 ${shared ? "bg-[#f0f2fb]" : "bg-[#f7f8f4]"}`}><div className="flex items-start gap-2"><BookOpen className="mt-0.5 size-4 shrink-0 text-[#5d6d91]" /><div><p className="text-xs font-semibold">{shared ? "Knowledge reused across courses" : "Used in your learning"}</p><p className="mt-1 text-xs leading-5 text-[#6c7973]">{directContexts.length ? `Learned in ${directContexts.map((course) => course.courseName).join(" · ")}` : "Built as a course prerequisite"}{prerequisiteContexts.length ? ` · supports ${prerequisiteContexts.map((course) => course.courseName).join(" · ")}` : ""}</p></div></div></div>
        {skill.practiceAvailable && <div className="mt-4 grid gap-2 sm:grid-cols-2"><Button asChild variant="outline"><Link to={`/practice/${skill.id}${practiceContext ? `?enrollmentId=${practiceContext.enrollmentId}` : ""}`}><PlayCircle className="size-4" /> Practice</Link></Button>{skill.retentionState !== "UNKNOWN" && <Button asChild><Link to={`/practice/${skill.id}?mode=retention${practiceContext ? `&enrollmentId=${practiceContext.enrollmentId}` : ""}`}><TimerReset className="size-4" /> {skill.revisionDue ? "Refresh now" : "Check memory"}</Link></Button>}</div>}
        <details className="mt-4 border-t border-[#e5e8e2] pt-3"><summary className="cursor-pointer text-xs font-semibold text-[#65736c]">Skill details</summary><div className="mt-4 space-y-3 rounded-2xl bg-[#f7f8f4] p-4"><SignalBar label="Mastery" value={skill.mastery} /><SignalBar label="Confidence" value={skill.confidence} /><SignalBar label="Memory now" value={skill.retention} /></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl border border-[#e2e6df] p-2"><p className="font-semibold">{skill.evidenceCount}</p><p className="text-[10px] text-[#78837e]">Answers</p></div><div className="rounded-xl border border-[#e2e6df] p-2"><p className="font-semibold">{skill.correctAttempts}</p><p className="text-[10px] text-[#78837e]">Correct</p></div><div className="rounded-xl border border-[#e2e6df] p-2"><p className="font-semibold">{skill.incorrectAttempts}</p><p className="text-[10px] text-[#78837e]">Review</p></div></div><p className="mt-3 text-xs leading-5 text-[#6c7973]">{skill.lastAssessedAt ? `Last assessed ${new Date(skill.lastAssessedAt).toLocaleDateString()}` : "No assessment yet"}{skill.lastPracticedAt ? ` · practiced ${new Date(skill.lastPracticedAt).toLocaleDateString()}` : ""}</p></details>
      </CardContent>
    </Card>
  );
}

export function SkillPassportPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const [passport, setPassport] = useState<SkillPassport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "ASSESSED" | "ESTIMATED" | "UNKNOWN" | "VERIFIED" | "SHARED" | "REVISION">("ALL");

  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    if (!accessToken) throw new Error("The learner session is not available.");
    try { return await operation(accessToken); }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return operation(await refreshSession());
      throw requestError;
    }
  }, [accessToken, refreshSession]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setPassport(await withSession(getSkillPassport)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Your skill passport could not be loaded."); }
    finally { setLoading(false); }
  }, [withSession]);

  useEffect(() => { void load(); }, [load]);

  const visibleSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (passport?.skills ?? []).filter((skill) => {
      const matchesText = !normalized || `${skill.name} ${skill.category} ${skill.domainName}`.toLowerCase().includes(normalized);
      const matchesFilter = filter === "ALL"
        || filter === skill.evidenceState
        || (filter === "SHARED" && skill.mastery !== null && skill.courseContexts.length > 1)
        || (filter === "REVISION" && skill.revisionDue);
      return matchesText && matchesFilter;
    });
  }, [filter, passport, query]);

  if (!user) return null;
  if (loading && !passport) return <div className="grid min-h-screen place-items-center bg-[#f3f4ef]"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin text-[#35614b]" /><p className="mt-3 text-sm text-[#6f7b75]">Loading your global skill profile…</p></div></div>;

  const summary = passport?.summary;
  return (
    <LearnerAppShell>
      <main className="mx-auto max-w-[1320px] px-4 py-7 sm:px-7 sm:py-10">
        {error && <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]"><span>{error}</span><Button className="h-8 px-3 text-xs" onClick={() => void load()} variant="outline"><RefreshCw className="size-3.5" /> Retry</Button></div>}

        <section className="relative overflow-hidden rounded-[1.8rem] bg-[#173d33] p-6 text-white sm:p-8 lg:p-10">
          <div className="absolute -right-16 -top-24 size-80 rounded-full bg-[#4f7d69]/40 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_380px] lg:items-end">
            <div><Badge className="border-white/10 bg-white/10 text-[#dbe8e2]" variant="outline"><Fingerprint className="mr-1.5 size-3.5" /> Your Skill Passport</Badge><h1 className="mt-5 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">Your skills go wherever you learn.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-[#c4d4ce] sm:text-base">When you demonstrate a skill in one course, LearnPath can recognize it in every other course that uses the same knowledge.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-5"><div className="flex items-end justify-between"><div><p className="text-4xl font-semibold">{summary?.assessedSkills ?? 0}</p><p className="mt-1 text-xs text-[#b9cbc4]">skills explored</p></div><Award className="size-7 text-[#f0a06e]" /></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#f09a67]" style={{ width: `${summary?.evidenceCoverage ?? 0}%` }} /></div><p className="mt-3 text-xs leading-5 text-[#bdcec7]">{summary?.sharedAcrossCourses ?? 0} skills currently help across multiple courses.</p></div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: Fingerprint, label: "Tracked globally", value: summary?.trackedSkills ?? 0 },
            { icon: CheckCircle2, label: "Assessed or verified", value: (summary?.assessedStateSkills ?? 0) + (summary?.verifiedSkills ?? 0) },
            { icon: Layers3, label: "Cross-course skills", value: summary?.sharedAcrossCourses ?? 0 },
            { icon: AlarmClock, label: "Revision due", value: summary?.revisionDueSkills ?? 0 },
          ].map(({ icon: Icon, label, value }) => <Card key={label}><CardContent className="flex items-center gap-4 p-5"><span className="grid size-11 place-items-center rounded-2xl bg-[#e8efe6] text-[#35624f]"><Icon className="size-5" /></span><div><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-[#748078]">{label}</p></div></CardContent></Card>)}
        </section>

        <section className="mt-7">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d06f3d]">Your skills</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Strong, developing, and ready to explore</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6d7a74]">Open a skill for detailed mastery, confidence, memory, answer history, and every course where it is reused.</p></div>
            <div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7d8983]" /><Input aria-label="Search skills" className="w-full pl-9 sm:w-64" onChange={(event) => setQuery(event.target.value)} placeholder="Search skills" value={query} /></div><div className="flex flex-wrap gap-1 rounded-xl border border-[#d8ded6] bg-white p-1">{(["ALL", "REVISION", "UNKNOWN", "ESTIMATED", "ASSESSED", "VERIFIED", "SHARED"] as const).map((value) => <button aria-pressed={filter === value} className={`rounded-lg px-3 py-2 text-[11px] font-semibold transition ${filter === value ? "bg-[#173d33] text-white" : "text-[#69766f] hover:bg-[#f0f2ed]"}`} key={value} onClick={() => setFilter(value)} type="button">{value === "ALL" ? "All" : value === "SHARED" ? "Cross-course" : value.toLowerCase()}</button>)}</div></div>
          </div>

          {visibleSkills.length ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleSkills.map((skill) => <SkillCard key={skill.id} skill={skill} />)}</div> : <div className="mt-5 grid min-h-64 place-items-center rounded-[1.5rem] border border-dashed border-[#cbd4cb] bg-[#fafbf7] p-8 text-center"><div><CircleDot className="mx-auto size-7 text-[#829088]" /><p className="mt-3 font-semibold">{passport?.skills.length ? "No skills match this view" : "No skill context yet"}</p><p className="mt-2 max-w-md text-sm leading-6 text-[#748078]">{passport?.skills.length ? "Try another search or evidence filter." : "Enroll in a course. LearnPath will create one reusable global state for every relevant skill; a goal is optional."}</p>{!passport?.skills.length && <Button asChild className="mt-4"><Link to="/dashboard">Choose a course</Link></Button>}</div></div>}
        </section>
      </main>
    </LearnerAppShell>
  );
}
