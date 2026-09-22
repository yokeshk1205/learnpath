import { ArrowLeft, ClipboardCheck, GitBranch, Route } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";

export function CourseNavigation({ enrollmentId, courseName }: { enrollmentId: string; courseName?: string }) {
  const { pathname } = useLocation();
  const links = [
    { label: "Path", icon: Route, to: `/my-courses/${enrollmentId}/path`, active: pathname.endsWith("/path") },
    { label: "Knowledge check", icon: ClipboardCheck, to: `/my-courses/${enrollmentId}/assessment`, active: pathname.endsWith("/assessment") },
    { label: "Knowledge graph", icon: GitBranch, to: `/prerequisites?enrollmentId=${enrollmentId}`, active: pathname === "/prerequisites" },
  ];
  return <div className="mb-6 space-y-5">
    <div className="flex items-center justify-between gap-4 text-sm"><Link className="inline-flex shrink-0 items-center gap-2 font-semibold text-[#60756b] hover:text-[#18372f]" to="/courses"><ArrowLeft className="size-4" /> My courses</Link>{courseName && <span className="truncate text-right text-xs font-medium text-[#7b8780]">{courseName}</span>}</div>
    <nav aria-label="Course navigation" className="flex gap-1 overflow-x-auto rounded-2xl border border-[#dce3da] bg-white p-1.5">
      {links.map(({ active, icon: Icon, label, to }) => <Link aria-current={active ? "page" : undefined} className={cn("inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold transition-colors sm:text-sm", active ? "bg-[#173d33] text-white" : "text-[#6d7b72] hover:bg-[#f0f4ed]")} key={to} to={to}><Icon className="size-4" />{label}</Link>)}
    </nav>
  </div>;
}
