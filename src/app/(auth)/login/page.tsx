"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { loginAction, type FormState } from "@/server/actions/auth-actions";
import { SubmitButton } from "@/components/submit-button";
import { AuthShell } from "@/components/auth-shell";

export default function LoginPage() {
  const [state, action] = useActionState<FormState, FormData>(loginAction, undefined);

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your FinanceOS workspace">
      <form action={action} className="space-y-5">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoFocus placeholder="you@company.com" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required placeholder="••••••••" />
        </div>
        {state?.error && (
          <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600 ring-1 ring-inset ring-red-100">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {state.error}
          </p>
        )}
        <SubmitButton variant="primary" className="w-full" pendingText="Signing in…">
          Sign in
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-ink-400">
        No account?{" "}
        <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}
