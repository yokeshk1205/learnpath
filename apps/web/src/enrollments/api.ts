import { apiRequest } from "../auth/api";

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

function bearer(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

export function listEnrollments(accessToken: string): Promise<{ enrollments: EnrollmentSummary[] }> {
  return apiRequest<{ enrollments: EnrollmentSummary[] }>("/enrollments", {
    headers: bearer(accessToken),
  });
}

export function enrollInCourse(
  accessToken: string,
  courseId: string,
  learningGoalId?: string,
): Promise<EnrollmentDetail> {
  return apiRequest<EnrollmentDetail>("/enrollments", {
    body: JSON.stringify({ courseId, ...(learningGoalId ? { learningGoalId } : {}) }),
    headers: bearer(accessToken),
    method: "POST",
  });
}

export function getEnrollment(accessToken: string, enrollmentId: string): Promise<EnrollmentDetail> {
  return apiRequest<EnrollmentDetail>(`/enrollments/${enrollmentId}`, {
    headers: bearer(accessToken),
  });
}

export function updateModuleProgress(
  accessToken: string,
  enrollmentId: string,
  moduleId: string,
  status: "IN_PROGRESS" | "COMPLETED",
): Promise<EnrollmentDetail> {
  return apiRequest<EnrollmentDetail>(
    `/enrollments/${enrollmentId}/modules/${moduleId}/progress`,
    {
      body: JSON.stringify({ status }),
      headers: bearer(accessToken),
      method: "POST",
    },
  );
}

export function setEnrollmentStatus(
  accessToken: string,
  enrollmentId: string,
  status: "ACTIVE" | "PAUSED" | "DROPPED",
): Promise<{ enrollment: EnrollmentSummary }> {
  return apiRequest<{ enrollment: EnrollmentSummary }>(`/enrollments/${enrollmentId}/status`, {
    body: JSON.stringify({ status }),
    headers: bearer(accessToken),
    method: "POST",
  });
}
