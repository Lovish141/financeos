"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, assertCanEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "./cost-actions";

// ---------------------------------------------------------------------------
// Buyer-portal access management (staff side). Invite-only onboarding: staff
// enable a Customer for the portal and mint a tokenized invite the buyer accepts
// to create their BUYER login.
// ---------------------------------------------------------------------------

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const inviteSchema = z.object({
  customerId: z.string().min(1),
  email: z.string().email("Enter a valid email"),
});

export interface InviteResult {
  ok?: boolean;
  error?: string;
  token?: string; // the accept path is /invite/{token}; UI prepends the origin
}

/**
 * Enable the portal for a customer and create a fresh invite token. Returns the
 * token so the UI can present a shareable accept link (no email infra yet).
 */
export async function invitePortalUser(
  _prev: InviteResult | undefined,
  formData: FormData,
): Promise<InviteResult> {
  const { db, role, companyId, userId } = await requireStaff();
  assertCanEdit(role);

  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid invite." };
  const email = parsed.data.email.toLowerCase();

  const customer = await db.customer.findFirst({
    where: { id: parsed.data.customerId },
    select: { id: true, archived: true },
  });
  if (!customer) return { error: "Customer not found." };
  if (customer.archived) return { error: "Restore this customer before inviting portal users." };

  // An email already tied to any account can't be re-invited.
  const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (taken) return { error: "An account with that email already exists." };

  const token = randomBytes(24).toString("hex");

  await db.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: customer.id }, data: { portalEnabled: true } });
    // One live invite per email+customer — drop any prior unaccepted one.
    await tx.portalInvite.deleteMany({ where: { customerId: customer.id, email, acceptedAt: null } });
    await tx.portalInvite.create({
      data: {
        companyId,
        customerId: customer.id,
        email,
        token,
        invitedById: userId,
        expires: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
  });

  revalidatePath("/customers");
  return { ok: true, token };
}

export interface PortalAccess {
  portalEnabled: boolean;
  buyers: { id: string; name: string | null; email: string }[];
  invites: { id: string; email: string; token: string; expires: string; acceptedAt: string | null }[];
}

/** Portal access snapshot for one customer — buyers + outstanding invites. */
export async function getPortalAccess(customerId: string): Promise<PortalAccess | { error: string }> {
  const { db } = await requireStaff();

  const customer = await db.customer.findFirst({
    where: { id: customerId },
    select: {
      portalEnabled: true,
      buyerUsers: { select: { id: true, name: true, email: true }, orderBy: { createdAt: "asc" } },
      invites: {
        where: { acceptedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, token: true, expires: true, acceptedAt: true },
      },
    },
  });
  if (!customer) return { error: "Customer not found." };

  return {
    portalEnabled: customer.portalEnabled,
    buyers: customer.buyerUsers,
    invites: customer.invites.map((i) => ({
      id: i.id,
      email: i.email,
      token: i.token,
      expires: i.expires.toISOString(),
      acceptedAt: i.acceptedAt?.toISOString() ?? null,
    })),
  };
}

/** Revoke a pending (unaccepted) invite. */
export async function revokeInvite(id: string): Promise<ActionResult> {
  const { db, role } = await requireStaff();
  assertCanEdit(role);
  await db.portalInvite.deleteMany({ where: { id, acceptedAt: null } });
  revalidatePath("/customers");
  return { ok: true };
}

/**
 * Turn the portal on/off for a customer. Disabling kills every buyer session for
 * that customer immediately (instant revocation) and drops pending invites; the
 * requireBuyer() live check backstops any session that slips through.
 */
export async function setPortalEnabled(customerId: string, enabled: boolean): Promise<ActionResult> {
  const { db, role, companyId } = await requireStaff();
  assertCanEdit(role);

  const customer = await db.customer.findFirst({ where: { id: customerId }, select: { id: true } });
  if (!customer) return { error: "Customer not found." };

  await db.customer.update({ where: { id: customerId }, data: { portalEnabled: enabled } });

  if (!enabled) {
    const buyers = await prisma.user.findMany({
      where: { companyId, customerId, role: "BUYER" },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId: { in: buyers.map((b) => b.id) } } }),
      prisma.portalInvite.deleteMany({ where: { companyId, customerId, acceptedAt: null } }),
    ]);
  }

  revalidatePath("/customers");
  return { ok: true };
}

/** Remove a single buyer's access entirely — kills their sessions and deletes the login. */
export async function revokeBuyer(userId: string): Promise<ActionResult> {
  const { role, companyId } = await requireStaff();
  assertCanEdit(role);

  // Tenant + role guard: only a BUYER of this company can be revoked here.
  const buyer = await prisma.user.findFirst({
    where: { id: userId, companyId, role: "BUYER" },
    select: { id: true },
  });
  if (!buyer) return { error: "Buyer not found." };

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  revalidatePath("/customers");
  return { ok: true };
}
