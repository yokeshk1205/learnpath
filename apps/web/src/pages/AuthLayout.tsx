import { ArrowLeft, Check, Sparkles } from "lucide-react";
import { Link, Outlet } from "react-router-dom";

const assurances = [
  "Your skill knowledge follows you across courses",
  "Start each course at the right lesson",
  "Practice turns progress into clear next steps",
];

export function AuthLayout() {
  return (
    <main className="grid min-h-screen bg-[#f5f5ef] lg:grid-cols-[0.92fr_1.08fr]">
      <section className="relative hidden overflow-hidden bg-[#163b32] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="absolute -left-32 top-1/3 size-[28rem] rounded-full bg-[#2c6b58]/70 blur-3xl" />
        <Link className="relative flex items-center gap-3" to="/">
          <span className="grid size-10 place-items-center rounded-[0.9rem] bg-white text-[#163b32]">
            <Sparkles className="size-5" />
          </span>
          <span className="text-xl font-bold tracking-[-0.04em]">LearnPath</span>
        </Link>

        <div className="relative max-w-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f1a071]">Learning that remembers you</p>
          <h1 className="mt-5 text-5xl font-semibold leading-[1.02] tracking-[-0.055em] xl:text-6xl">
            One account. A path shaped around you.
          </h1>
          <ul className="mt-10 space-y-4">
            {assurances.map((assurance) => (
              <li className="flex items-start gap-3 text-sm leading-6 text-[#c8d7d2]" key={assurance}>
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#ef9a69] text-[#163b32]">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {assurance}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-[#93aaa2]">Choose a course · Find your starting point · Keep growing</p>
      </section>

      <section className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between px-5 py-5 sm:px-8">
          <Link className="flex items-center gap-2 text-sm font-semibold text-[#52645d] hover:text-[#18372f]" to="/">
            <ArrowLeft className="size-4" /> Back to LearnPath
          </Link>
          <Link className="flex items-center gap-2 font-bold tracking-[-0.03em] lg:hidden" to="/">
            <Sparkles className="size-4" /> LearnPath
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[680px]">
            <Outlet />
          </div>
        </div>
      </section>
    </main>
  );
}
