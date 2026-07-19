import { AuthShell } from "@/components/auth-shell";
import { signOutAction } from "@/server/actions/auth-actions";
import { SubmitButton } from "@/components/submit-button";

// Where requireBuyer() sends a buyer whose portal access has been switched off
// (customer disabled or archived). Deliberately calls no role guard, so it can't
// loop. Signing out is a Server Action, the only safe place to clear the cookie.
export default function PortalDisabledPage() {
  return (
    <AuthShell title="Access unavailable" subtitle="Your ordering portal access is turned off">
      <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-700 ring-1 ring-inset ring-amber-100">
        Your supplier has paused portal access for your account. If you think this is a mistake,
        please contact them directly.
      </p>
      <form action={signOutAction} className="mt-6">
        <SubmitButton variant="primary" className="w-full" pendingText="Signing out…">
          Sign out
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
