"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { acceptInviteAction } from "@/server/actions/invite-actions";
import type { FormState } from "@/server/actions/auth-actions";
import { SubmitButton } from "@/components/submit-button";

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState<FormState, FormData>(acceptInviteAction, undefined);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input bg-ink-50 text-ink-500" id="email" value={email} readOnly disabled />
      </div>
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input className="input" id="name" name="name" required autoFocus placeholder="Jane Doe" />
      </div>
      <div>
        <label className="label" htmlFor="password">Create a password</label>
        <input className="input" id="password" name="password" type="password" required minLength={8} placeholder="At least 8 characters" />
      </div>
      {state?.error && (
        <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600 ring-1 ring-inset ring-red-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </p>
      )}
      <SubmitButton variant="primary" className="mt-1 w-full" pendingText="Setting up…">
        Accept invite &amp; continue
      </SubmitButton>
    </form>
  );
}
