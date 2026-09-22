import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "../auth/api";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

const registerSchema = z
  .object({
    confirmPassword: z.string(),
    displayName: z.string().trim().min(2, "Enter at least 2 characters.").max(80),
    email: z.string().trim().email("Enter a valid email address."),
    password: z.string().min(12, "Use at least 12 characters.").max(128),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type RegisterValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const { register: createAccount } = useAuth();
  const navigate = useNavigate();
  const [requestError, setRequestError] = useState<string | null>(null);
  const { formState: { errors, isSubmitting }, handleSubmit, register } = useForm<RegisterValues>({
    defaultValues: { confirmPassword: "", displayName: "", email: "", password: "" },
    resolver: zodResolver(registerSchema),
  });

  const submit = handleSubmit(async ({ confirmPassword: _confirmPassword, ...values }) => {
    void _confirmPassword;
    setRequestError(null);
    try {
      await createAccount(values);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setRequestError(error instanceof ApiError ? error.message : "Account creation is temporarily unavailable.");
    }
  });

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#cb6f3e]">Create your account</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">Start learning at the right place</h1>
      <p className="mt-3 text-sm leading-6 text-[#6b7973]">Choose a course, show what you already know, and get a learning path built around you.</p>

      {requestError && (
        <div className="mt-6 rounded-xl border border-[#efc5bb] bg-[#fff0ec] px-4 py-3 text-sm text-[#923e2f]" role="alert">
          {requestError}
        </div>
      )}

      <form className="mt-7 space-y-4" noValidate onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input autoComplete="name" id="displayName" {...register("displayName")} />
          {errors.displayName && <p className="text-xs text-[#ad4736]">{errors.displayName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input autoComplete="email" id="email" type="email" {...register("email")} />
          {errors.email && <p className="text-xs text-[#ad4736]">{errors.email.message}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input autoComplete="new-password" id="password" type="password" {...register("password")} />
            {errors.password && <p className="text-xs text-[#ad4736]">{errors.password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input autoComplete="new-password" id="confirmPassword" type="password" {...register("confirmPassword")} />
            {errors.confirmPassword && <p className="text-xs text-[#ad4736]">{errors.confirmPassword.message}</p>}
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-[#edf3eb] px-3.5 py-3 text-xs leading-5 text-[#50645b]">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#39705d]" />
          Your account and learning progress are kept secure.
        </div>
        <Button className="h-12 w-full rounded-xl" disabled={isSubmitting} type="submit">
          {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <>Create account <ArrowRight className="size-4" /></>}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[#6c7974]">
        Already registered?{" "}
        <Link className="font-semibold text-[#245b4b] underline-offset-4 hover:underline" to="/login">Sign in</Link>
      </p>
    </div>
  );
}
