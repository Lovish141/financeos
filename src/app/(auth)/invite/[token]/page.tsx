import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { getInvite } from "@/server/actions/invite-actions";
import { AcceptInviteForm } from "./accept-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInvite(token);

  if (!invite.ok) {
    return (
      <AuthShell title="Invite unavailable" subtitle="This link can't be used">
        <p className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-600 ring-1 ring-inset ring-red-100">
          {invite.error}
        </p>
        <p className="mt-6 text-center text-sm text-ink-400">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Join ${invite.companyName}`}
      subtitle={`Set up portal access for ${invite.customerName}`}
    >
      <AcceptInviteForm token={token} email={invite.email} />
    </AuthShell>
  );
}
