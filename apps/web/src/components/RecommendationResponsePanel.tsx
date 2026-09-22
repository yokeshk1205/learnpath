import { ArrowRight, Check, LoaderCircle, MessageSquareText, ThumbsDown, ThumbsUp } from "lucide-react";

import type { RecommendationFeedback, RecommendationReason } from "../recommendations/api";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const reasons: Array<{ code: RecommendationReason; label: string }> = [
  { code: "ALREADY_KNOW", label: "I already know this" },
  { code: "NOT_RELEVANT", label: "Not relevant right now" },
  { code: "PREFER_DIFFERENT", label: "I prefer another skill" },
  { code: "TOO_DIFFICULT", label: "Feels too difficult" },
  { code: "TOO_EASY", label: "Feels too easy" },
  { code: "OTHER", label: "Another reason" },
];

export function RecommendationResponsePanel({
  feedback,
  lessonAvailable,
  onAccept,
  onReject,
  skillName,
  working,
}: {
  feedback: RecommendationFeedback | null;
  lessonAvailable: boolean;
  onAccept(): void;
  onReject(reason: RecommendationReason): void;
  skillName: string;
  working: RecommendationReason | "ACCEPTED" | null;
}) {
  if (feedback?.decision === "ACCEPTED") return (
    <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-[#bcd5c0] bg-[#eef7ed] p-5 sm:flex-row sm:items-center sm:justify-between" id="recommendation-response">
      <div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d8ead8] text-[#356d50]"><Check className="size-5" /></span><div><Badge variant="success">Recommendation accepted</Badge><h2 className="mt-2 text-lg font-semibold">{skillName} is saved as your chosen next step.</h2><p className="mt-1 text-sm text-[#64736b]">Lesson completion and later assessed evidence will be attributed to path v{feedback.pathVersion} for evaluation.</p></div></div>
      <Button disabled={working !== null} onClick={onAccept}>{lessonAvailable ? "Continue learning" : "Browse learning options"} <ArrowRight className="size-4" /></Button>
    </section>
  );

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-[#d9dfd7] bg-white" id="recommendation-response">
      <div className="grid lg:grid-cols-[1fr_420px]"><div className="p-5 sm:p-6"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[#d06f3d]"><MessageSquareText className="size-4" /> Your decision matters</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Does {skillName} feel like the right next step?</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#68766f]">Your response evaluates recommendation quality. It does not change mastery, unlock skills, or retrain the model automatically.</p><Button className="mt-5" disabled={working !== null} onClick={onAccept}>{working === "ACCEPTED" ? <LoaderCircle className="size-4 animate-spin" /> : <ThumbsUp className="size-4" />}{lessonAvailable ? "Yes, start this step" : "Browse learning options"}</Button>{feedback?.decision === "REJECTED" && <p className="mt-3 text-xs font-semibold text-[#9a5837]">Current response: not a fit · {reasons.find((reason) => reason.code === feedback.reasonCode)?.label}</p>}</div>
        <div className="border-t border-[#e3e7e0] bg-[#f5f6f2] p-5 sm:p-6 lg:border-l lg:border-t-0"><div className="flex items-center gap-2 text-sm font-semibold"><ThumbsDown className="size-4 text-[#a55b38]" /> Not the right step?</div><p className="mt-2 text-xs leading-5 text-[#748078]">Tell us why so reviewers can distinguish relevance, difficulty, and already-known failures.</p><div className="mt-4 grid grid-cols-2 gap-2">{reasons.map((reason) => <button className="rounded-xl border border-[#dce1d9] bg-white px-3 py-2 text-left text-xs font-semibold text-[#58675f] transition hover:border-[#d3916d] hover:bg-[#fff8f2] disabled:opacity-50" disabled={working !== null} key={reason.code} onClick={() => onReject(reason.code)} type="button">{working === reason.code ? "Saving…" : reason.label}</button>)}</div></div></div>
    </section>
  );
}
