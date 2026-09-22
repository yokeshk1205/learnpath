import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { demoProfiles, type DemoProfile } from "../demo/profiles";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [requestError, setRequestError] = useState<string | null>(null);
  const [openingDemo, setOpeningDemo] = useState<DemoProfile["id"] | null>(null);
  const { formState: { errors, isSubmitting }, handleSubmit, register } = useForm<LoginValues>({
    defaultValues: { email: "", password: "" },
    resolver: zodResolver(loginSchema),
  });

  const submit = handleSubmit(async (values) => {
    setRequestError(null);
    try {
      await login(values);
      const destination = (location.state as { from?: string } | null)?.from ?? "/dashboard";
      navigate(destination, { replace: true });
    } catch (error) {
      setRequestError(error instanceof ApiError ? error.message : "Sign in is temporarily unavailable.");
    }
  });

  const openDemo = async (profile: DemoProfile) => {
    setRequestError(null);
    setOpeningDemo(profile.id);
    try {
      await login({ email: profile.email, password: profile.password });
      const destination = (location.state as { from?: string } | null)?.from ?? "/dashboard";
      navigate(destination, { replace: true });
    } catch (error) {
      setRequestError(error instanceof ApiError ? error.message : "This demo profile is temporarily unavailable.");
    } finally {
      setOpeningDemo(null);
    }
  };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#cb6f3e]">Welcome back</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">Continue your learning path</h1>
      <p className="mt-3 text-sm leading-6 text-[#6b7973]">Pick up from your next lesson, course path, or quick review.</p>

      {requestError && (
        <div className="mt-6 rounded-xl border border-[#efc5bb] bg-[#fff0ec] px-4 py-3 text-sm text-[#923e2f]" role="alert">
          {requestError}
        </div>
      )}

      <section className="mt-7 rounded-2xl border border-[#d8e0d7] bg-white p-4 shadow-[0_14px_40px_rgba(27,58,48,.06)]" aria-labelledby="demo-profiles-title">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#c86b3c]">Interactive demo</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-.025em]" id="demo-profiles-title">Choose a learner story</h2>
            <p className="mt-1 text-xs leading-5 text-[#718078]">Each account opens real seeded learning data.</p>
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#e7efe5] text-[#35624f]"><Sparkles className="size-4" /></span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {demoProfiles.map((profile) => {
            const Icon = profile.icon;
            return (
              <button
                className="group rounded-xl border border-[#dce3da] bg-[#fafbf8] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#9fb7a8] hover:bg-white hover:shadow-md disabled:pointer-events-none disabled:opacity-60"
                disabled={openingDemo !== null || isSubmitting}
                key={profile.id}
                onClick={() => void openDemo(profile)}
                type="button"
              >
                <div className="flex items-start gap-3">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${profile.accent}`}><Icon className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{profile.name}</p>{openingDemo === profile.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5 text-[#84918b] transition group-hover:translate-x-0.5" />}</div>
                    <p className="mt-0.5 text-[11px] font-medium text-[#687871]">{profile.shortLabel}</p>
                    <p className="mt-2 text-[11px] leading-4 text-[#78847e]">{profile.proof}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="my-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[.14em] text-[#919b96]"><span className="h-px flex-1 bg-[#dce2da]" />Or sign in manually<span className="h-px flex-1 bg-[#dce2da]" /></div>

      <form className="space-y-5" noValidate onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input autoComplete="email" id="email" type="email" {...register("email")} />
          {errors.email && <p className="text-xs text-[#ad4736]">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <span className="text-xs text-[#8a9490]">At least 12 characters</span>
          </div>
          <Input autoComplete="current-password" id="password" type="password" {...register("password")} />
          {errors.password && <p className="text-xs text-[#ad4736]">{errors.password.message}</p>}
        </div>
        <Button className="h-12 w-full rounded-xl" disabled={isSubmitting || openingDemo !== null} type="submit">
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <>Sign in <ArrowRight className="size-4" /></>}
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-[#6c7974]">
        New to LearnPath?{" "}
        <Link className="font-semibold text-[#245b4b] underline-offset-4 hover:underline" to="/register">Create an account</Link>
      </p>
    </div>
  );
}
