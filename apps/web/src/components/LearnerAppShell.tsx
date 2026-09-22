import {
  Fingerprint,
  Home,
  Library,
  LogOut,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { cn } from "../lib/utils";

const navigation = [
  { icon: Home, label: "Home", to: "/dashboard" },
  { icon: Library, label: "My courses", to: "/courses" },
  { icon: Fingerprint, label: "My skills", to: "/skill-passport" },
  { icon: TimerReset, label: "Review", to: "/retention" },
] as const;

function isActive(pathname: string, hash: string, to: string): boolean {
  if (to === "/courses") return pathname === "/courses" || pathname.startsWith("/my-courses") || pathname.startsWith("/diagnostic") || pathname.startsWith("/learn/") || pathname.startsWith("/practice/") || pathname === "/prerequisites" || pathname === "/learning-library" || (pathname === "/dashboard" && hash === "#my-courses");
  if (to === "/dashboard") return pathname === "/dashboard" && hash !== "#my-courses";
  return pathname === to;
}

export function LearnerAppShell({ children }: { children: ReactNode }) {
  const { logout, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!location.hash) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, location.pathname]);

  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#f3f4ef] text-[#18372f]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[244px] flex-col border-r border-[#dde3da] bg-[#fbfcf8] px-4 py-6 lg:flex">
        <Link className="flex items-center gap-3 px-2 py-2" to="/dashboard">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#163b32] text-white shadow-[0_8px_24px_rgba(22,59,50,.16)]">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="text-lg font-bold tracking-[-.045em]">LearnPath</p>
            <p className="text-[11px] text-[#7a8680]">A path that grows with you</p>
          </div>
        </Link>

        <nav aria-label="Learner navigation" className="mt-8 space-y-1">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-[#9a6a50]">Your learning</p>
          {navigation.map(({ icon: Icon, label, to }) => {
            const active = isActive(location.pathname, location.hash, to);
            return (
              <Link
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition-colors",
                  active
                    ? "bg-[#e4ece2] font-semibold text-[#204d3e]"
                    : "text-[#63716b] hover:bg-[#f0f3ed] hover:text-[#244f41]",
                )}
                key={to}
                aria-current={active ? "page" : undefined}
                to={to}
              >
                <span className={cn("grid size-8 place-items-center rounded-xl", active ? "bg-white text-[#2f6b52]" : "text-[#7a8781]")}>
                  <Icon className="size-4" />
                </span>
                {label}
                {active && <span className="ml-auto size-1.5 rounded-full bg-[#e9864d]" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-[1.35rem] border border-[#dfe4dd] bg-white p-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#deeadf] text-sm font-bold text-[#35624e]">
              {user.displayName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.displayName}</p>
              <p className="text-[11px] text-[#7d8882]">Learner profile</p>
            </div>
            <button
              aria-label="Sign out"
              className="grid size-9 place-items-center rounded-xl text-[#6f7c76] transition-colors hover:bg-[#f0f3ed] hover:text-[#244f41]"
              onClick={() => void signOut()}
              type="button"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#dde3da] bg-[#fbfcf8]/95 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link className="flex items-center gap-2.5" to="/dashboard">
          <span className="grid size-9 place-items-center rounded-xl bg-[#163b32] text-white"><Sparkles className="size-4" /></span>
          <span className="font-bold tracking-[-.035em]">LearnPath</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="max-w-32 truncate text-sm font-semibold">{user.displayName}</span>
          <span className="grid size-8 place-items-center rounded-full bg-[#deeadf] text-xs font-bold">{user.displayName.charAt(0).toUpperCase()}</span>
          <button aria-label="Sign out" className="grid size-8 place-items-center rounded-xl text-[#6f7c76] hover:bg-[#eef2eb]" onClick={() => void signOut()} type="button"><LogOut className="size-4" /></button>
        </div>
      </header>

      <div className="pb-24 lg:ml-[244px] lg:pb-0">{children}</div>

      <nav aria-label="Mobile learner navigation" className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 rounded-[1.4rem] border border-[#d9e0d8] bg-[#fbfcf8]/95 p-1.5 shadow-[0_14px_40px_rgba(29,55,47,.18)] backdrop-blur-xl lg:hidden">
        {navigation.map(({ icon: Icon, label, to }) => {
          const active = isActive(location.pathname, location.hash, to);
          return (
            <Link aria-current={active ? "page" : undefined} className={cn("flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold", active ? "bg-[#e3ece2] text-[#285a46]" : "text-[#79857f]")} key={to} to={to}>
              <Icon className="size-4" />
              <span className="max-w-full truncate">{label === "My courses" ? "Courses" : label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
