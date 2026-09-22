import {
  ArrowRight, BrainCircuit, Check, GitMerge, LoaderCircle, Route, Sparkles, Target,
} from "lucide-react";
import { Link } from "react-router-dom";

import type { CoordinatedLearningPlan } from "../paths/api";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

function percentage(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function CoordinatedLearnNext({
  generating,
  onGenerate,
  plan,
}: {
  generating: boolean;
  onGenerate(): void;
  plan: CoordinatedLearningPlan;
}) {
  const recommendation = plan.learnNext;
  const staleCourses = plan.courses.filter((course) => course.enrollmentStatus === "ACTIVE" && course.pathState === "STALE");
  return (
    <>
    {staleCourses.length > 0 && <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#e6a27a] bg-[#fff4eb] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-[#874726]">{staleCourses.length} course path{staleCourses.length === 1 ? " needs" : "s need"} an update</p><p className="mt-1 text-xs text-[#806557]">New learning evidence changed global mastery. Stale recommendations are excluded until the paths are regenerated.</p></div><Button disabled={generating} onClick={onGenerate} variant="outline">{generating ? <LoaderCircle className="size-4 animate-spin" /> : <Route className="size-4" />} Update and coordinate</Button></div>}
    <section className="scroll-mt-24 overflow-hidden rounded-[2rem] border border-[#d4ddd4] bg-white" id="coordinated-path">
      {recommendation ? <div className="p-5 sm:p-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e4eee3] text-[#356b50]"><GitMerge className="size-5" /></span><div><div className="flex flex-wrap gap-2"><Badge variant="success">Across {plan.summary.activeCourses} active courses</Badge><Badge variant="outline"><Check className="mr-1 size-3" /> Prerequisites preserved</Badge></div><p className="mt-4 text-xs font-bold uppercase tracking-[.16em] text-[#c96d3d]">Cross-course check complete</p><h2 className="mt-1 text-3xl font-semibold tracking-[-.045em]">{recommendation.item.name}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[#66756e]">{recommendation.explanation}</p></div></div>
          <div className="flex shrink-0 flex-wrap gap-2"><Button asChild><Link to={`/my-courses/${recommendation.primaryCourse.enrollmentId}/path`}><Sparkles className="size-4" /> Open next step</Link></Button><Button disabled={generating} onClick={onGenerate} variant="outline">{generating ? <LoaderCircle className="size-4 animate-spin" /> : <Route className="size-4" />} Re-coordinate</Button></div>
        </div>
        <div className="mt-5 grid gap-3 border-t border-[#e2e7e0] pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-[#f2f6ef] p-3"><p className="text-lg font-semibold">{percentage(recommendation.basePriority)}</p><p className="text-[11px] text-[#738078]">Best course priority</p></div>
          <div className="rounded-xl bg-[#f2f6ef] p-3"><p className="text-lg font-semibold">{percentage(recommendation.coordinationScore)}</p><p className="text-[11px] text-[#738078]">Final coordinated score</p></div>
          <div className="rounded-xl bg-[#fff5ed] p-3"><p className="text-lg font-semibold">+{percentage(recommendation.crossCourseBonus)}</p><p className="text-[11px] text-[#7b7069]">Shared-skill bonus</p></div>
          <div className="rounded-xl bg-[#fff5ed] p-3"><p className="text-lg font-semibold">+{percentage(recommendation.goalBonus)}</p><p className="text-[11px] text-[#7b7069]">Goal bonus</p></div>
        </div>
        {plan.activeGoal && <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#eadfce] bg-[#fffaf1] p-3"><Target className="mt-0.5 size-4 shrink-0 text-[#c66a3b]" /><div><p className="text-sm font-semibold">Supports {plan.activeGoal.name}</p><p className="mt-0.5 text-xs leading-5 text-[#756f65]">Goal relevance is bounded and never bypasses prerequisites.</p></div></div>}
        <details className="mt-4 rounded-xl border border-[#e0e5dd] bg-[#fafbf8] p-4"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold"><BrainCircuit className="size-4 text-[#46745c]" /> Compare the independent course decisions <ArrowRight className="ml-auto size-4" /></summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{recommendation.courseContexts.map((context) => <Link className="flex items-center justify-between gap-3 rounded-xl border border-[#e0e5dd] bg-white px-4 py-3 text-sm hover:border-[#abc5b2]" key={context.enrollmentId} to={`/my-courses/${context.enrollmentId}/path`}><span><strong>{context.courseName}</strong><span className="ml-2 text-xs text-[#748078]">{percentage(context.priorityScore)}</span></span><ArrowRight className="size-4 text-[#718078]" /></Link>)}</div><p className="mt-3 text-[11px] text-[#7b8780]">{plan.policyVersion} · {plan.summary.coordinatedCourses} active paths compared</p></details>
      </div> : <div className="grid xl:grid-cols-[1.05fr_.95fr]">
        <div className="p-7 sm:p-10"><Badge variant="warning"><GitMerge className="mr-1.5 size-3.5" /> Adaptive coordination</Badge><h2 className="mt-5 text-4xl font-semibold tracking-[-.05em]">Choose one next step across every active course.</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-[#68766f]">Generate missing course-owned paths, refresh stale versions, then compare only graph-valid current recommendations. Shared skills and your active goal can influence the final choice within documented limits.</p><Button className="mt-7" disabled={generating || plan.summary.activeCourses === 0} onClick={onGenerate}>{generating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{generating ? "Coordinating courses…" : "Coordinate my courses"}</Button></div>
        <div className="bg-[#173d33] p-7 text-white sm:p-9"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#f0a06e]">Coordination readiness</p><div className="mt-6 space-y-3">{plan.courses.filter((course) => course.enrollmentStatus === "ACTIVE").map((course) => <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[.06] p-4" key={course.enrollmentId}><div><p className="text-sm font-semibold">{course.courseName}</p><p className="mt-1 text-xs text-[#adc1b8]">{course.pathState === "NOT_GENERATED" ? "Path needs generation" : course.pathState === "STALE" ? "Knowledge changed—refresh this path" : course.pathState === "READY" ? `Next: ${course.learnNext?.name}` : "Course knowledge covered"}</p></div><Badge className="border-white/10 bg-white/10 text-white" variant="outline">{course.pathState === "READY" ? "Ready" : course.pathState === "STALE" ? "Refresh" : "Waiting"}</Badge></div>)}</div></div>
      </div>}
    </section>
    </>
  );
}
