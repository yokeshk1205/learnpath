import type { PathChangeSummary, PathItem } from "./types.js";

function identity(item: PathItem | null): { name: string; skillId: string } | null {
  return item ? { name: item.name, skillId: item.skillId } : null;
}

export function comparePaths(previous: PathItem[], next: PathItem[]): PathChangeSummary {
  const oldNext = previous.find((item) => item.lane === "RECOMMENDED_NEXT") ?? null;
  const newNext = next.find((item) => item.lane === "RECOMMENDED_NEXT") ?? null;
  const previousBySkill = new Map(previous.map((item) => [item.skillId, item]));
  const laneChanges = next.flatMap((item) => {
    const oldItem = previousBySkill.get(item.skillId);
    if (!oldItem || oldItem.lane === item.lane) return [];
    return [{ from: oldItem.lane, name: item.name, skillId: item.skillId, to: item.lane }];
  });
  const masterySnapshotsChanged = next.filter((item) => {
    const oldItem = previousBySkill.get(item.skillId);
    return oldItem && oldItem.mastery !== item.mastery;
  }).length;
  const recognizedAdded = laneChanges.filter((change) => change.to === "RECOGNIZED").length;
  const unlockedAdded = laneChanges.filter((change) => change.from === "LOCKED" && change.to !== "LOCKED").length;
  const learnNextChanged = oldNext?.skillId !== newNext?.skillId;
  const explanation = learnNextChanged
    ? newNext
      ? `${newNext.name} is now the strongest prerequisite-valid next step after your latest performance evidence.`
      : "Your latest evidence completed or removed the previous next step, so no new lesson is currently required."
    : newNext
      ? `${newNext.name} remains your best next step, with updated mastery, confidence, and retention evidence.`
      : "Your course path was recalculated and remains complete for the available skills.";
  return {
    explanation,
    laneChanges,
    learnNextChanged,
    masterySnapshotsChanged,
    newLearnNext: identity(newNext),
    previousLearnNext: identity(oldNext),
    recognizedAdded,
    unlockedAdded,
  };
}
