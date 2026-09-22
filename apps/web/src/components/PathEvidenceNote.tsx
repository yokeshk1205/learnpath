import type { PersonalizedPath } from "../paths/api";

export function PathEvidenceNote({ provenance }: { provenance: PersonalizedPath["provenance"] }) {
  const synthetic = provenance.sourceClassification.toUpperCase().includes("SYNTHETIC");
  return (
    <details className="mt-6 rounded-2xl border border-[#dce2da] bg-white p-5 text-sm text-[#5f6f67]">
      <summary className="cursor-pointer font-semibold text-[#345b49]">How reliable is this path?</summary>
      <div className="mt-3 space-y-3 leading-6">
        <p>Your saved answers inform mastery and confidence. The prerequisite graph determines which skills are ready, and the ranking model helps order eligible next steps. Estimates can change as you provide more evidence.</p>
        {synthetic && <p>The ranking model was trained on synthetic learning data, principally for programming courses. Its learning-benefit estimates have not been validated across subjects or with real learner outcomes. Treat the order as a provisional recommendation, not a guarantee of learning success.</p>}
        <dl className="grid gap-x-5 gap-y-1 break-words text-xs sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold">Saved ranking source</dt><dd>{provenance.sourceClassification}</dd>
          <dt className="font-semibold">Model</dt><dd>{provenance.modelVersion}</dd>
          <dt className="font-semibold">Feature contract</dt><dd>{provenance.featureVersion}</dd>
          <dt className="font-semibold">Inference version</dt><dd>{provenance.inferenceVersion}</dd>
        </dl>
      </div>
    </details>
  );
}
