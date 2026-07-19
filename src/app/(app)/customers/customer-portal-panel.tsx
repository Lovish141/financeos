"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Copy, Check, Trash2, UserCheck, UserX, PowerOff } from "lucide-react";
import { toast } from "@/components/toaster";
import {
  getPortalAccess,
  invitePortalUser,
  revokeInvite,
  revokeBuyer,
  setPortalEnabled,
  type PortalAccess,
} from "@/server/actions/portal-actions";

function inviteUrl(token: string) {
  if (typeof window === "undefined") return `/invite/${token}`;
  return `${window.location.origin}/invite/${token}`;
}

export function PortalAccessPanel({ customerId }: { customerId: string }) {
  const [access, setAccess] = useState<PortalAccess | null>(null);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const res = await getPortalAccess(customerId);
    if (!("error" in res)) setAccess(res);
  }

  useEffect(() => {
    setAccess(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function invite() {
    setError(null);
    if (!email.trim()) return setError("Enter an email to invite.");
    setInviting(true);
    const fd = new FormData();
    fd.set("customerId", customerId);
    fd.set("email", email.trim());
    const res = await invitePortalUser(undefined, fd);
    setInviting(false);
    if (res?.error) return setError(res.error);
    toast("Invite created");
    setEmail("");
    await load();
    if (res?.token) copy(inviteUrl(res.token));
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      toast("Invite link copied");
      setTimeout(() => setCopied((c) => (c === url ? null : c)), 2000);
    } catch {
      toast("Couldn't copy — copy the link manually");
    }
  }

  async function revoke(id: string) {
    const res = await revokeInvite(id);
    if (res?.error) return toast(res.error);
    toast("Invite revoked");
    await load();
  }

  async function removeBuyer(userId: string) {
    const res = await revokeBuyer(userId);
    if (res?.error) return toast(res.error);
    toast("Buyer access revoked");
    await load();
  }

  async function disableAll() {
    const res = await setPortalEnabled(customerId, false);
    if (res?.error) return toast(res.error);
    toast("Portal access disabled");
    await load();
  }

  const hasAccess = access != null && (access.buyers.length > 0 || access.invites.length > 0);

  return (
    <div className="mb-5 rounded-xl border border-[var(--border)] p-4">
      <div className="mb-3 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-500">
        <KeyRound className="h-3.5 w-3.5" /> Portal access
        {access?.portalEnabled && hasAccess && (
          <button
            type="button"
            onClick={disableAll}
            title="Disable portal access for this customer"
            className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400 transition-colors hover:text-risk-500"
          >
            <PowerOff className="h-3 w-3" /> Disable
          </button>
        )}
      </div>

      {access === null ? (
        <div className="h-10 animate-pulse rounded-lg bg-ink-50" />
      ) : (
        <>
          {access.buyers.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {access.buyers.map((b) => (
                <div key={b.id} className="flex items-center gap-2 text-[12.5px] text-ink-700">
                  <UserCheck className="h-3.5 w-3.5 shrink-0 text-mint-500" />
                  <span className="min-w-0 truncate">{b.name ? `${b.name} · ` : ""}{b.email}</span>
                  <span className="ml-auto shrink-0 font-mono text-[9.5px] uppercase tracking-[0.08em] text-mint-500">active</span>
                  <button type="button" title="Revoke this buyer's access" onClick={() => removeBuyer(b.id)} className="shrink-0 text-ink-300 transition-colors hover:text-risk-500">
                    <UserX className="h-[15px] w-[15px]" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {access.invites.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {access.invites.map((i) => (
                <div key={i.id} className="flex items-center gap-2 text-[12.5px] text-ink-600">
                  <span className="min-w-0 truncate">{i.email}</span>
                  <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.08em] text-watch-500">pending</span>
                  <button type="button" title="Copy invite link" onClick={() => copy(inviteUrl(i.token))} className="ml-auto shrink-0 text-ink-400 transition-colors hover:text-brand-600">
                    {copied === inviteUrl(i.token) ? <Check className="h-[15px] w-[15px]" /> : <Copy className="h-[15px] w-[15px]" />}
                  </button>
                  <button type="button" title="Revoke invite" onClick={() => revoke(i.id)} className="shrink-0 text-ink-300 transition-colors hover:text-risk-500">
                    <Trash2 className="h-[15px] w-[15px]" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {access.buyers.length === 0 && access.invites.length === 0 && (
            <p className="mb-3 text-[12.5px] text-ink-400">
              No portal access yet. Invite a contact to let them raise order requests.
            </p>
          )}

          <div className="flex gap-2">
            <input
              className="input h-9 flex-1 text-[13px]"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="buyer@company.com"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  invite();
                }
              }}
            />
            <button type="button" className="btn-primary btn-sm shrink-0" onClick={invite} disabled={inviting}>
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-[14px] w-[14px]" />}
              Invite
            </button>
          </div>
          {error && <p className="mt-1.5 text-[12px] text-risk-500">{error}</p>}
        </>
      )}
    </div>
  );
}
