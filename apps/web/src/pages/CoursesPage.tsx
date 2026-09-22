import { ArrowRight, BookOpen, CheckCircle2, Clock3, Compass, Layers3, LoaderCircle, Pause, RefreshCw, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { getCatalogOverview, type CatalogCourse } from "../catalog/api";
import { LearnerAppShell } from "../components/LearnerAppShell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { enrollInCourse, listEnrollments, type EnrollmentSummary } from "../enrollments/api";
import { cn } from "../lib/utils";

const enrollmentFilters = [
  { label: "Active", status: "ACTIVE" },
  { label: "Paused", status: "PAUSED" },
  { label: "Completed", status: "COMPLETED" },
] as const;

type EnrollmentFilter = (typeof enrollmentFilters)[number]["status"];

function levelLabel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
}

function EnrollmentCard({ enrollment }: { enrollment: EnrollmentSummary }) {
  const progress = Math.max(0, Math.min(100, Math.round(enrollment.progressPercentage)));
  const paused = enrollment.status === "PAUSED";
  const completed = enrollment.status === "COMPLETED";
  const Icon = paused ? Pause : completed ? CheckCircle2 : BookOpen;

  return (
    <article className="flex flex-col rounded-[1.65rem] border border-[#dce3da] bg-white p-5 shadow-[0_10px_30px_rgba(33,58,49,.04)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className={cn("grid size-12 place-items-center rounded-2xl", paused ? "bg-[#f1eee7] text-[#8b7758]" : "bg-[#e8f0e5] text-[#35674e]")}><Icon className="size-5" /></span>
        <Badge variant={paused ? "warning" : completed ? "success" : "outline"}>{paused ? "Paused" : completed ? "Completed" : "Active"}</Badge>
      </div>
      <p className="mt-5 text-[10px] font-bold uppercase tracking-[.15em] text-[#8b7868]">{levelLabel(enrollment.courseLevel)}</p>
      <h3 className="mt-1.5 text-xl font-semibold leading-7 tracking-[-.035em]">{enrollment.courseName}</h3>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#718078]">{enrollment.courseDescription}</p>
      {enrollment.learningGoalName && <p className="mt-3 text-xs text-[#5b7567]">Your goal: {enrollment.learningGoalName}</p>}
      <div className="mt-auto pt-6">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="text-[#718078]">Module progress</span><span className="font-semibold text-[#3d6350]">{progress}%</span></div>
        <div aria-label={`${enrollment.courseName} module progress`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-[#eaf0e7]" role="progressbar">
          <div className={cn("h-full rounded-full", paused ? "bg-[#b19c7f]" : "bg-[#5f8564]")} style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-[#78857d]">{enrollment.completedModules} of {enrollment.totalModules} modules completed</p>
        <Button asChild className="mt-5 w-full" variant={paused || completed ? "outline" : "default"}>
          <Link to={`/my-courses/${enrollment.id}/path`}>{completed ? "Revisit course" : "Open course"}<ArrowRight className="size-4" /></Link>
        </Button>
      </div>
    </article>
  );
}

export function CoursesPage() {
  const { accessToken, refreshSession, user } = useAuth();
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState<EnrollmentSummary[]>([]);
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [filter, setFilter] = useState<EnrollmentFilter>("ACTIVE");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  const withSession = useCallback(async <T,>(operation: (token: string) => Promise<T>) => {
    if (!accessToken) throw new Error("Your session is not available.");
    try { return await operation(accessToken); }
    catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) return operation(await refreshSession());
      throw requestError;
    }
  }, [accessToken, refreshSession]);

  const load = useCallback(async () => {
    setLoading(true);
    setEnrollmentError(null);
    setCatalogError(null);
    const [enrollmentResult, catalogResult] = await Promise.allSettled([
      withSession(listEnrollments),
      withSession(getCatalogOverview),
    ]);
    if (enrollmentResult.status === "fulfilled") setEnrollments(enrollmentResult.value.enrollments.filter((enrollment) => enrollment.status !== "DROPPED"));
    else setEnrollmentError(enrollmentResult.reason instanceof Error ? enrollmentResult.reason.message : "Your courses could not be loaded.");
    if (catalogResult.status === "fulfilled") setCourses(catalogResult.value.courses);
    else setCatalogError(catalogResult.reason instanceof Error ? catalogResult.reason.message : "The course catalog could not be loaded.");
    setLoading(false);
  }, [withSession]);

  useEffect(() => { void load(); }, [load]);

  const enroll = async (courseId: string) => {
    setEnrollingId(courseId);
    setActionError(null);
    try {
      const detail = await withSession((token) => enrollInCourse(token, courseId));
      navigate(`/my-courses/${detail.enrollment.id}/assessment`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "We could not enroll you in this course. Please try again.");
    } finally { setEnrollingId(null); }
  };

  if (!user) return null;

  const visibleEnrollments = enrollments.filter((enrollment) => enrollment.status === filter);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCourses = courses.filter((course) => `${course.name} ${course.description} ${course.level}`.toLowerCase().includes(normalizedQuery));
  const filterLabel = enrollmentFilters.find((option) => option.status === filter)!.label.toLowerCase();

  return (
    <LearnerAppShell>
      <main className="mx-auto max-w-[1320px] px-4 py-7 sm:px-7 sm:py-10 lg:px-9">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#a26d4d]"><BookOpen className="size-3.5" /> Your learning library</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-.05em] sm:text-4xl">My courses</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#718078]">A place for every course you choose. Open a workspace to find your next step.</p>
          </div>
          <Button asChild variant="outline"><a href="#catalog"><Compass className="size-4" /> Explore courses</a></Button>
        </header>

        <section aria-label="Your enrolled courses" className="mt-8">
          <div aria-label="Filter courses by status" className="inline-flex max-w-full gap-1 rounded-2xl border border-[#dde4da] bg-[#e9eee5] p-1" role="group">
            {enrollmentFilters.map((option) => (
              <button aria-pressed={filter === option.status} className={cn("flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ed8a4c] sm:px-4 sm:text-sm", filter === option.status ? "bg-white text-[#244e3d] shadow-sm" : "text-[#748176] hover:text-[#355d47]")} key={option.status} onClick={() => setFilter(option.status)} type="button">
                {option.label}<span className={cn("grid min-w-5 place-items-center rounded-md px-1 text-[10px]", filter === option.status ? "bg-[#edf2e9] text-[#57765b]" : "text-[#879184]")}>{loading ? "—" : enrollments.filter((enrollment) => enrollment.status === option.status).length}</span>
              </button>
            ))}
          </div>

          {enrollmentError && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#edc1ad] bg-[#fff4ed] p-4 text-sm text-[#8f4526]" role="alert"><p>{enrollmentError}</p><Button disabled={loading} onClick={() => void load()} variant="outline"><RefreshCw className="size-4" /> Retry</Button></div>}
          {loading ? (
            <div aria-label="Loading your courses" className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status">{[0, 1, 2].map((index) => <div className="h-80 animate-pulse rounded-[1.65rem] bg-[#e4e9df]" key={index} />)}<span className="sr-only">Loading your courses</span></div>
          ) : visibleEnrollments.length > 0 ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleEnrollments.map((enrollment) => <EnrollmentCard enrollment={enrollment} key={enrollment.id} />)}</div>
          ) : !enrollmentError ? (
            <div className="mt-5 rounded-[1.65rem] border border-dashed border-[#cad6c6] bg-[#f9fbf5] px-6 py-10 text-center">
              <BookOpen className="mx-auto size-7 text-[#73926c]" />
              <h2 className="mt-4 text-lg font-semibold">No {filterLabel} courses yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#718078]">{filter === "ACTIVE" ? "Choose a course below to assess what you know and start a path built around you." : filter === "PAUSED" ? "Courses you pause will stay here, ready when you are." : "Courses marked complete will appear here so you can revisit them."}</p>
              {filter === "ACTIVE" && <Button asChild className="mt-5"><a href="#catalog">Find a course<ArrowRight className="size-4" /></a></Button>}
            </div>
          ) : null}
          {!loading && visibleEnrollments.length > 0 && <p className="mt-3 text-xs text-[#7b887e]">Module progress reflects completed course modules. Assessed knowledge is shown inside each course.</p>}
        </section>

        <section aria-labelledby="catalog-heading" className="mt-12 scroll-mt-24 border-t border-[#dce3d8] pt-8" id="catalog">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#a26d4d]">Make room for something new</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]" id="catalog-heading">Explore courses</h2><p className="mt-2 text-sm text-[#718078]">Choose a subject. Your course assessment helps shape where you begin.</p></div>
            <label className="relative block sm:w-72"><span className="sr-only">Search the course catalog</span><Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-[#8a978a]" /><input className="h-11 w-full rounded-xl border border-[#d7e0d3] bg-white pl-10 pr-3 text-sm text-[#244e3d] outline-none placeholder:text-[#929b90] focus:border-[#5e845e] focus:ring-2 focus:ring-[#dce8d6]" onChange={(event) => setQuery(event.target.value)} placeholder="Search courses…" type="search" value={query} /></label>
          </div>
          {actionError && <p className="mt-5 rounded-xl border border-[#edc1ad] bg-[#fff4ed] px-4 py-3 text-sm text-[#8f4526]" role="alert">{actionError}</p>}
          {catalogError && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#edc1ad] bg-[#fff4ed] p-4 text-sm text-[#8f4526]" role="alert"><p>{catalogError}</p><Button disabled={loading} onClick={() => void load()} variant="outline"><RefreshCw className="size-4" /> Retry</Button></div>}
          {loading ? (
            <div aria-label="Loading the course catalog" className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status">{[0, 1, 2].map((index) => <div className="h-72 animate-pulse rounded-[1.65rem] bg-[#e4e9df]" key={index} />)}<span className="sr-only">Loading the course catalog</span></div>
          ) : visibleCourses.length > 0 ? (
            <>
              <p aria-live="polite" className="mt-5 text-xs text-[#7b887e]">{visibleCourses.length} {visibleCourses.length === 1 ? "course" : "courses"}{normalizedQuery ? " matching your search" : " to explore"}</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleCourses.map((course) => {
                  const enrollment = enrollments.find((entry) => entry.courseId === course.id);
                  return (
                    <article className="flex flex-col overflow-hidden rounded-[1.65rem] border border-[#dce3da] bg-[#fcfdf9]" key={course.id}>
                      <div className="flex items-center justify-between gap-3 border-b border-[#e3e9de] bg-[#edf2e7] px-5 py-4"><span className="grid size-10 place-items-center rounded-xl bg-white/80 text-[#547747]"><Layers3 className="size-5" /></span><Badge className="bg-[#f8faf3]" variant="outline">{levelLabel(course.level)}</Badge></div>
                      <div className="flex flex-1 flex-col p-5">
                        <h3 className="text-lg font-semibold leading-6 tracking-[-.025em]">{course.name}</h3>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#718078]">{course.description}</p>
                        <div className="mt-auto pt-5">
                          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#6d7e6c]"><span className="flex items-center gap-1.5"><BookOpen className="size-3.5" />{course.moduleCount} modules</span><span className="flex items-center gap-1.5"><Sparkles className="size-3.5" />{course.skillCount} skills</span><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{course.estimatedHours}h estimated</span></div>
                          {enrollment ? <Button asChild className="mt-5 w-full" variant="outline"><Link to={`/my-courses/${enrollment.id}/path`}>Open course<ArrowRight className="size-4" /></Link></Button> : <Button className="mt-5 w-full" disabled={enrollingId !== null || enrollmentError !== null} onClick={() => void enroll(course.id)} type="button">{enrollingId === course.id ? <><LoaderCircle className="size-4 animate-spin" />Enrolling…</> : <>Enroll & assess<ArrowRight className="size-4" /></>}</Button>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          ) : !catalogError ? (
            <div className="mt-6 rounded-2xl border border-[#dde4d8] bg-[#f9fbf5] p-8 text-center"><Search className="mx-auto size-6 text-[#7c9772]" /><h3 className="mt-3 font-semibold">{normalizedQuery ? "No matching courses" : "No courses available yet"}</h3><p className="mt-2 text-sm text-[#718078]">{normalizedQuery ? "Try another subject, skill, or course level." : "Published courses will appear here when they are available."}</p>{normalizedQuery && <Button className="mt-4" onClick={() => setQuery("")} variant="outline">Clear search</Button>}</div>
          ) : null}
        </section>
      </main>
    </LearnerAppShell>
  );
}
