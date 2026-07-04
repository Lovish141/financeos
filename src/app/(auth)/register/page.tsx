"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { registerAction, type FormState } from "@/server/actions/auth-actions";
import { SubmitButton } from "@/components/submit-button";
import { AuthShell } from "@/components/auth-shell";

export default function RegisterPage() {
  const [state, action] = useActionState<FormState, FormData>(registerAction, undefined);

  return (
    <AuthShell title="Create your workspace" subtitle="Start costing your products in minutes">
      <form action={action} className="space-y-4">
        <div>
          <label className="label" htmlFor="companyName">Company name</label>
          <input className="input" id="companyName" name="companyName" required autoFocus placeholder="Acme Manufacturing" />
        </div>
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input className="input" id="name" name="name" required placeholder="Jane Doe" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required placeholder="you@company.com" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" required minLength={8} placeholder="At least 8 characters" />
        </div>
        {state?.error && (
          <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600 ring-1 ring-inset ring-red-100">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {state.error}
          </p>
        )}
        <SubmitButton variant="primary" className="mt-1 w-full" pendingText="Creating…">
          Create workspace
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-ink-400">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
