import { CheckCircle2, CircleHelp, LoaderCircle } from "lucide-react";
import type { DiagnosticQuestion } from "../diagnostics/api";
import { isResponseValid, type QuestionResponseDraft } from "../diagnostics/response";
import { Button } from "./ui/button";

interface QuestionResponseProps {
  question: DiagnosticQuestion;
  draft: QuestionResponseDraft;
  dirty: boolean;
  saving: boolean;
  saveFailed: boolean;
  onChange: (draft: QuestionResponseDraft, autosave: boolean) => void;
  onSave: () => void;
}

export function QuestionResponse({ question, draft, dirty, saving, saveFailed, onChange, onSave }: QuestionResponseProps) {
  const numeric = question.questionType === "NUMERIC";
  const multi = question.questionType === "MULTI_SELECT";
  const explicitSave = numeric || multi;
  const valid = isResponseValid(question, draft);
  const hasNumericError = numeric && !draft.isUnsure && draft.numericText.trim().length > 0 && !valid;
  const inputId = `numeric-response-${question.id}`;
  return <div className="mb-7 mt-8 space-y-3">
    {numeric ? <div className="rounded-2xl border border-[#dce2da] bg-[#f8faf5] p-5 sm:p-6">
      <label className="block text-sm font-semibold" htmlFor={inputId}>Your answer{question.numericUnit ? ` (${question.numericUnit})` : ""}</label>
      <div className="mt-3 flex items-center gap-3"><input aria-describedby={`${inputId}-help${hasNumericError ? ` ${inputId}-error` : ""}`} aria-invalid={hasNumericError} autoComplete="off" className="min-w-0 flex-1 rounded-xl border border-[#bfcebf] bg-white px-4 py-3 text-lg text-[#254d3a] outline-none focus:border-[#438267] focus:ring-2 focus:ring-[#438267]/15 disabled:opacity-60" disabled={saving} id={inputId} inputMode="decimal" onChange={(event) => onChange({ isUnsure: false, optionId: null, selectedOptionIds: [], numericText: event.target.value }, false)} placeholder="Enter a number" type="text" value={draft.numericText} />{question.numericUnit && <span className="text-sm font-medium text-[#718078]">{question.numericUnit}</span>}</div>
      <p className="mt-3 text-xs leading-5 text-[#758375]" id={`${inputId}-help`}>Enter a number, including zero, a negative value, or a decimal. Save it when you are ready.</p>
      {hasNumericError && <p className="mt-2 text-xs text-[#a85f37]" id={`${inputId}-error`} role="alert">Enter a finite number, such as 0, −2, or 1.5.</p>}
    </div> : multi ? <fieldset className="space-y-3" disabled={saving}><legend className="mb-3 text-sm font-medium text-[#687c6d]">Select all that apply, then save your answer.</legend>{question.options.map((option) => {
      const selected = !draft.isUnsure && draft.selectedOptionIds.includes(option.id);
      return <label className={`flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition sm:p-5 ${selected ? "border-[#478269] bg-[#edf5ed]" : "border-[#dce2da] bg-[#fbfcf9] hover:border-[#9eb9a8]"} ${saving ? "cursor-wait opacity-70" : ""}`} key={option.id}><input checked={selected} className="size-5 shrink-0 accent-[#2f6e53]" onChange={() => onChange({ isUnsure: false, optionId: null, numericText: "", selectedOptionIds: selected ? draft.selectedOptionIds.filter((id) => id !== option.id) : [...draft.selectedOptionIds, option.id] }, false)} type="checkbox" /><span className="text-sm font-medium leading-6 sm:text-base">{option.content}</span></label>;
    })}</fieldset> : <div aria-label="Choose one answer" className="space-y-3">{question.options.map((option) => {
      const selected = !draft.isUnsure && draft.optionId === option.id;
      return <button aria-pressed={selected} className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition sm:p-5 ${selected ? "border-[#478269] bg-[#edf5ed] shadow-[0_8px_24px_rgba(47,101,76,0.08)]" : "border-[#dce2da] bg-[#fbfcf9] hover:border-[#9eb9a8]"}`} disabled={saving} key={option.id} onClick={() => onChange({ isUnsure: false, optionId: option.id, selectedOptionIds: [], numericText: "" }, true)} type="button"><span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${selected ? "bg-[#2f6e53] text-white" : "border border-[#cfd7ce] bg-white text-[#6f7b75]"}`}>{option.key}</span><span className="text-sm font-medium leading-6 sm:text-base">{option.content}</span>{selected && <CheckCircle2 className="ml-auto size-5 shrink-0 text-[#2f6e53]" />}</button>;
    })}</div>}
    <button aria-pressed={draft.isUnsure} className={`flex w-full items-center gap-4 rounded-2xl border border-dashed p-4 text-left transition ${draft.isUnsure ? "border-[#c17a50] bg-[#fff5ed]" : "border-[#cfd7ce] bg-white hover:border-[#b9957c]"}`} disabled={saving} onClick={() => onChange({ isUnsure: true, optionId: null, selectedOptionIds: [], numericText: "" }, !explicitSave)} type="button"><span className={`grid size-8 shrink-0 place-items-center rounded-full ${draft.isUnsure ? "bg-[#c97748] text-white" : "bg-[#f3eee9] text-[#8b6f5d]"}`}><CircleHelp className="size-4" /></span><span><span className="block text-sm font-semibold">I’m not sure</span><span className="mt-0.5 block text-xs text-[#7c8782]">Use this instead of guessing. We’ll use it to choose useful support.</span></span>{draft.isUnsure && <CheckCircle2 className="ml-auto size-5 shrink-0 text-[#b86239]" />}</button>
    {(explicitSave || saveFailed) && <div className="flex flex-wrap items-center gap-3 pt-2"><Button disabled={saving || !valid || (!dirty && !saveFailed)} onClick={onSave} type="button">{saving ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}{saving ? "Saving answer…" : saveFailed ? "Retry saving answer" : "Save answer"}</Button><p aria-live="polite" className={`text-xs ${saveFailed ? "text-[#a85f37]" : "text-[#778775]"}`}>{saveFailed ? "Your answer is still here. Save it before continuing." : dirty ? "Changes are not saved yet." : "Your saved answer will be restored when you return."}</p></div>}
  </div>;
}
