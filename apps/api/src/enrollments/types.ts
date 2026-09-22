export type EnrollmentStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "DROPPED";
export type ModuleProgressStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface EnrollmentSummary {
  completedModules: number;
  courseDescription: string;
  courseId: string;
  courseLevel: string;
  courseName: string;
  courseSlug: string;
  enrolledAt: string;
  id: string;
  lastAccessedAt: string;
  learningGoalId: string | null;
  learningGoalName: string | null;
  progressPercentage: number;
  status: EnrollmentStatus;
  totalModules: number;
}

export interface EnrollmentModule {
  completedAt: string | null;
  description: string;
  id: string;
  isAccessible: boolean;
  lastAccessedAt: string | null;
  name: string;
  sequence: number;
  slug: string;
  startedAt: string | null;
  status: ModuleProgressStatus;
}

export interface EnrollmentSkill {
  category: string;
  difficulty: number;
  id: string;
  moduleId: string;
  moduleName: string;
  name: string;
  slug: string;
}

export interface EnrollmentDetail {
  enrollment: EnrollmentSummary;
  modules: EnrollmentModule[];
  skills: EnrollmentSkill[];
}

export interface EnrollmentServiceContract {
  enroll(
    learnerId: string,
    input: { courseId: string; learningGoalId?: string },
  ): Promise<EnrollmentDetail>;
  getEnrollment(learnerId: string, enrollmentId: string): Promise<EnrollmentDetail>;
  listEnrollments(learnerId: string): Promise<EnrollmentSummary[]>;
  setStatus(
    learnerId: string,
    enrollmentId: string,
    status: "ACTIVE" | "PAUSED" | "DROPPED",
  ): Promise<EnrollmentSummary>;
  updateModuleProgress(
    learnerId: string,
    enrollmentId: string,
    moduleId: string,
    status: "IN_PROGRESS" | "COMPLETED",
  ): Promise<EnrollmentDetail>;
}
