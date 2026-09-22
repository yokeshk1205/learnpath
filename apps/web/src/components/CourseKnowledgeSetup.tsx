import { ArrowLeft, ArrowRight, BrainCircuit, Check, CircleHelp, Layers3, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";

import type {
  AssessmentProgramOverview,
  SelfReportConfidence,
  SelfReportExperienceSource,
  SelfReportFamiliarity,
} from "../assessment-programs/api";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const familiarityOptions: Array<{ value: SelfReportFamiliarity; label: string; help: string }> = [
  { value: "NEVER_LEARNED", label: "New to me", help: "I have not learned this yet" },
  { value: "KNOW_A_LITTLE", label: "Know a little", help: "I recognize some ideas" },
  { value: "COMFORTABLE", label: "Comfortable", help: "I can use the main ideas" },
  { value: "VERY_COMFORTABLE", label: "Very comfortable", help: "I have used this confidently" },
  { value: "UNSURE", label: "Not sure", help: "Let the check find out" },
];

const confidenceOptions: SelfReportConfidence[] = ["LOW", "MEDIUM", "HIGH"];
const skillChoices: Array<{ value: SelfReportFamiliarity; label: string; help: string }> = [
  { value: "COMFORTABLE", label: "I know this", help: "Check what I can do" },
  { value: "NEVER_LEARNED", label: "I don't know this", help: "Find my starting point" },
  { value: "UNSURE", label: "Not sure", help: "Let the questions decide" },
];

export interface CourseSelfReportDraft {
  enrollmentId: string;
  modules: Array<{ moduleId: string; familiarity: SelfReportFamiliarity; confidence?: SelfReportConfidence | null }>;
  skills: Array<{ skillId: string; familiarity: SelfReportFamiliarity; confidence?: SelfReportConfidence | null; experienceSource?: SelfReportExperienceSource | null }>;
}

export function CourseKnowledgeSetup({
  enrollmentId,
  onCancel,
  onSave,
  overview,
  saving,
}: {
  enrollmentId: string;
  onCancel?: () => void;
  onSave: (draft: CourseSelfReportDraft) => Promise<void>;
  overview: AssessmentProgramOverview;
  saving: boolean;
}) {
  const [step, setStep] = useState<"MODULES" | "SKILLS">("MODULES");
  const [familiarity, setFamiliarity] = useState<Record<string, SelfReportFamiliarity>>(() =>
    Object.fromEntries(overview.selfReport.moduleReports.map((report) => [report.moduleId, report.familiarity])),
  );
  const [confidence, setConfidence] = useState<Record<string, SelfReportConfidence>>(() =>
    Object.fromEntries(overview.selfReport.moduleReports.filter((report) => report.confidence).map((report) => [report.moduleId, report.confidence!])),
  );
  const [experience, setExperience] = useState<Record<string, SelfReportExperienceSource>>({});
  const [skillFamiliarity, setSkillFamiliarity] = useState<Record<string, SelfReportFamiliarity>>(() =>
    Object.fromEntries(overview.selfReport.skillReports.map((report) => [report.skillId, report.familiarity])),
  );
  const complete = overview.modules.every((module) => Boolean(familiarity[module.id]));

  const payload = (moduleValues = familiarity): CourseSelfReportDraft => ({
    enrollmentId,
    modules: overview.modules.map((module) => ({
      moduleId: module.id,
      familiarity: moduleValues[module.id]!,
      confidence: confidence[module.id] ?? null,
    })),
    skills: overview.skills.map((skill) => ({
      skillId: skill.skillId,
      familiarity: skillFamiliarity[skill.skillId] ?? "UNSURE",
      confidence: confidence[skill.moduleId] ?? null,
      experienceSource: experience[skill.moduleId] ?? null,
    })),
  });
  const continueFromModules = async () => {
    if (!complete) return;
    if (overview.skills.length) setStep("SKILLS");
    else await onSave(payload());
  };
  const assessMe = async () => {
    const unsure = Object.fromEntries(overview.modules.map((module) => [module.id, "UNSURE" as const]));
    setFamiliarity(unsure);
    setSkillFamiliarity({});
    await onSave({ enrollmentId, modules: overview.modules.map((module) => ({ moduleId: module.id, familiarity: "UNSURE" })), skills: [] });
  };

  return <section className="overflow-hidden rounded-[2rem] border border-[#dbe2d9] bg-white shadow-[0_24px_70px_rgba(25,57,48,.08)]">
    <div className="grid lg:grid-cols-[.72fr_1.28fr]">
      <aside className="relative overflow-hidden bg-[#183d34] p-7 text-white sm:p-10">
        <div className="absolute -left-24 -top-28 size-72 rounded-full bg-[#4f816b]/30 blur-3xl" />
        <div className="relative">
          <span className="grid size-12 place-items-center rounded-2xl bg-white/10"><BrainCircuit className="size-6 text-[#f0a070]" /></span>
          <p className="mt-8 text-xs font-bold uppercase tracking-[.18em] text-[#efac7c]">Before we build your path</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-.05em]">Tell us where you’re starting.</h1>
          <p className="mt-5 text-sm leading-7 text-[#c3d4cc]">This is only a hypothesis. LearnPath will verify it with real questions and will never turn your self-report into a mastery score.</p>
          <div className="mt-8 space-y-3 text-sm">
            <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-4"><Layers3 className="mt-0.5 size-4 shrink-0 text-[#a9d0b1]" /><span>Start with {overview.modules.length} broad areas, then mark the skills you know, don’t know, or aren’t sure about. You can mark a whole module at once.</span></div>
            <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-4"><Sparkles className="mt-0.5 size-4 shrink-0 text-[#f0a070]" /><span>Your answers only help choose which knowledge to verify first.</span></div>
          </div>
        </div>
      </aside>

      <div className="p-6 sm:p-9">
        <div className="flex items-start justify-between gap-4">
          <div><Badge variant="outline">{step === "MODULES" ? "Step 1 of 2" : "Step 2 of 2"}</Badge><h2 className="mt-4 text-2xl font-semibold tracking-[-.035em]">{step === "MODULES" ? "How familiar are these areas?" : "Which skills do you know?"}</h2><p className="mt-2 text-sm leading-6 text-[#718077]">{step === "MODULES" ? "Choose the closest answer. It is completely fine to be unsure." : "For each skill, choose what best describes you. Unmarked skills remain ‘Not sure’. We’ll verify your answers with questions before deciding mastery."}</p></div>
          {step === "SKILLS" && <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#416c57]" onClick={() => setStep("MODULES")} type="button"><ArrowLeft className="size-3.5" />Back</button>}
        </div>

        {step === "MODULES" ? <div className="mt-7 max-h-[62vh] space-y-4 overflow-y-auto pr-1">{overview.modules.map((module) => <article className="rounded-2xl border border-[#e0e6dd] bg-[#fbfcf8] p-4" key={module.id}>
          <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="font-semibold">{module.name}</h3><p className="mt-1 text-xs text-[#849087]">{module.skillIds.length} skill{module.skillIds.length === 1 ? "" : "s"}</p></div>{familiarity[module.id] && <Check className="size-4 text-[#4b805d]" />}</div>
          <div className="grid gap-2 sm:grid-cols-5">{familiarityOptions.map((option) => <button aria-pressed={familiarity[module.id] === option.value} className={`rounded-xl border px-3 py-3 text-left transition ${familiarity[module.id] === option.value ? "border-[#4f7d61] bg-[#eaf3e7] text-[#28533f]" : "border-[#e1e6df] bg-white hover:border-[#b4c6b5]"}`} key={option.value} onClick={() => setFamiliarity((current) => ({ ...current, [module.id]: option.value }))} type="button"><span className="block text-xs font-semibold">{option.label}</span><span className="mt-1 block text-[10px] leading-4 text-[#819087]">{option.help}</span></button>)}</div>
        </article>)}</div> : <div className="mt-7 max-h-[62vh] space-y-4 overflow-y-auto pr-1">{overview.modules.map((module) => {
          const skills = overview.skills.filter((skill) => skill.moduleId === module.id);
          if (!skills.length) return null;
          return <article className="rounded-2xl border border-[#e0e6dd] bg-[#fbfcf8] p-5" key={module.id}><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h3 className="font-semibold">{module.name}</h3><p className="mt-1 text-xs text-[#7f8c84]">{skills.length} skills · Your module answer: {familiarityOptions.find((option) => option.value === familiarity[module.id])?.label}</p></div><div className="flex flex-wrap gap-1.5">{skillChoices.map((choice) => <button className="rounded-full border border-[#dce3da] bg-white px-2.5 py-1 text-[11px] font-medium text-[#4d6857] hover:border-[#8daa94]" key={choice.value} onClick={() => setSkillFamiliarity((current) => ({ ...current, ...Object.fromEntries(skills.map((skill) => [skill.skillId, choice.value])) }))} type="button">All: {choice.label}</button>)}</div></div>
            <div className="mt-4 space-y-2">{skills.map((skill) => <div className="flex flex-col gap-2 rounded-xl border border-[#e2e7df] bg-white p-3 sm:flex-row sm:items-center sm:justify-between" key={skill.skillId}><span className="text-sm font-medium">{skill.skillName}</span><div aria-label={`Your knowledge of ${skill.skillName}`} className="grid grid-cols-3 gap-1.5">{skillChoices.map((choice) => <button aria-pressed={(skillFamiliarity[skill.skillId] ?? "UNSURE") === choice.value} className={`rounded-lg border px-2 py-2 text-[11px] font-medium transition ${((skillFamiliarity[skill.skillId] ?? "UNSURE") === choice.value) ? "border-[#4f7d61] bg-[#eaf3e7] text-[#28533f]" : "border-[#e1e6df] bg-white text-[#718078] hover:border-[#b4c6b5]"}`} key={choice.value} onClick={() => setSkillFamiliarity((current) => ({ ...current, [skill.skillId]: choice.value }))} title={choice.help} type="button">{choice.label}</button>)}</div></div>)}</div>
            <div className="mt-4 grid gap-4 border-t border-[#e3e8df] pt-4 sm:grid-cols-2"><div><p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#849087]">How confident?</p><div className="mt-2 flex gap-2">{confidenceOptions.map((value) => <button aria-pressed={confidence[module.id] === value} className={`rounded-full border px-3 py-1.5 text-xs ${confidence[module.id] === value ? "border-[#37684f] bg-[#37684f] text-white" : "border-[#dce3da] bg-white"}`} key={value} onClick={() => setConfidence((current) => ({ ...current, [module.id]: value }))} type="button">{value.toLowerCase()}</button>)}</div></div><label className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#849087]">Main experience<select className="mt-2 block w-full rounded-xl border border-[#dce3da] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none" onChange={(event) => setExperience((current) => ({ ...current, [module.id]: event.target.value as SelfReportExperienceSource }))} value={experience[module.id] ?? ""}><option value="">Optional</option><option value="LEARNED_IN_COURSE">Learned in a course</option><option value="SOLVED_PROBLEMS">Solved problems</option><option value="USED_IN_PROJECT">Used in a project or task</option><option value="READ_OR_WATCHED_ONLY">Read or watched only</option><option value="OTHER">Other experience</option></select></label></div>
          </article>;
        })}</div>}

        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-[#e3e7e0] pt-6">
          <Button disabled={saving || (step === "MODULES" && !complete)} onClick={() => void (step === "MODULES" ? continueFromModules() : onSave(payload()))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}{saving ? "Saving…" : step === "MODULES" ? "Continue" : "Save and choose my check"}</Button>
          {step === "MODULES" && <Button disabled={saving} onClick={() => void assessMe()} variant="ghost"><CircleHelp className="size-4" />I’m not sure — assess me</Button>}
          {onCancel && <Button disabled={saving} onClick={onCancel} variant="ghost">Return to course knowledge</Button>}
          {step === "MODULES" && !complete && <span className="text-xs text-[#9b724b]">Choose one answer for each module.</span>}
        </div>
      </div>
    </div>
  </section>;
}
