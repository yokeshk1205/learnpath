import { BookOpenCheck, BrainCircuit, Compass, Route, TimerReset, type LucideIcon } from "lucide-react";

export interface DemoProfile {
  accent: string;
  description: string;
  email: string;
  icon: LucideIcon;
  id: "active" | "advanced" | "explorer" | "returning" | "starter";
  name: string;
  password: string;
  proof: string;
  shortLabel: string;
}

const sharedPassword = "LearnPathDemo!2026";

export const demoProfiles: DemoProfile[] = [
  {
    accent: "bg-[#e8f0e6] text-[#34604e]",
    description: "See the first-run experience before a course is chosen.",
    email: "maya.explorer@demo.learnpath.local",
    icon: Compass,
    id: "explorer",
    name: "Maya Explorer",
    password: sharedPassword,
    proof: "No courses yet",
    shortLabel: "New learner",
  },
  {
    accent: "bg-[#fff0e6] text-[#a6532e]",
    description: "See how an enrollment leads into the starting knowledge check.",
    email: "noah.starter@demo.learnpath.local",
    icon: BookOpenCheck,
    id: "starter",
    name: "Noah Starter",
    password: sharedPassword,
    proof: "Diagnostic waiting",
    shortLabel: "Ready to begin",
  },
  {
    accent: "bg-[#e7edf5] text-[#3f5e78]",
    description: "See an accepted recommendation, attributed lesson, and real measured gain.",
    email: "aisha.builder@demo.learnpath.local",
    icon: Route,
    id: "active",
    name: "Aisha Builder",
    password: sharedPassword,
    proof: "Accepted path + outcome",
    shortLabel: "Active learner",
  },
  {
    accent: "bg-[#f0e9f4] text-[#684d73]",
    description: "See stale cross-course paths, overdue review, and a structured decline reason.",
    email: "elena.navigator@demo.learnpath.local",
    icon: TimerReset,
    id: "returning",
    name: "Elena Navigator",
    password: sharedPassword,
    proof: "Cross-course + feedback",
    shortLabel: "Returning learner",
  },
  {
    accent: "bg-[#e9eef8] text-[#435f8a]",
    description: "See mastered foundations recognized while an advanced sorting gap becomes Learn Next.",
    email: "ravi.strategist@demo.learnpath.local",
    icon: BrainCircuit,
    id: "advanced",
    name: "Ravi Strategist",
    password: sharedPassword,
    proof: "Basics recognized",
    shortLabel: "Advanced learner",
  },
];
