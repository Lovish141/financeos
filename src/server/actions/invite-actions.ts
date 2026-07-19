"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createUserSession } from "@/lib/auth-session";
import type { FormState } from "./auth-actions";

// Thrown inside the accept transaction when the invite was claimed by a
// concurrent request (or expired between the pre-check and the write).
class InviteClaimError extends Error {}

// ---------------------------------------------------------------------------
// Public invite acceptance — a buyer redeems a tokenized invite to create their
// BUYER login. No session required (this is how a buyer first gets one).
// ---------------------------------------------------------------------------

export interface InviteInfo {
  ok: true;
  email: string;
  companyName: string;
  customerName: string;
}

/** Validate an invite token for the accept page. Never reveals why it failed. */
export async function getInvite(token: string): Promise<InviteInfo | { ok: false; error: string }> {
  const invite = await prisma.portalInvite.findUnique({
    where: { token },
    select: {
      email: true,
      expires: true,
      acceptedAt: true,
      company: { select: { name: true } },
      customer: { select: { name: true } },
    },
  });

  if (!invite || invite.acceptedAt || invite.expires < new Date()) {
    return { ok: false, error: "This invite link is invalid or has expired. Ask your supplier to send a new one." };
  }

  return {
    ok: true,
    email: invite.email,
    companyName: invite.company.name,
    customerName: invite.customer.name,
  };
}

const acceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1, "Your name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Redeem an invite: create the BUYER user (linked to the customer + tenant),
 * mark the invite accepted, and sign them in. All-or-nothing.
 */
export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = acceptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid input" };

  const invite = await prisma.portalInvite.findUnique({
    where: { token: parsed.data.token },
    select: { id: true, email: true, expires: true, acceptedAt: true, companyId: true, customerId: true },
  });
  if (!invite || invite.acceptedAt || invite.expires < new Date()) {
    return { error: "This invite link is invalid or has expired." };
  }

  const existing = await prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } });
  if (existing) return { error: "An account with that email already exists. Try signing in instead." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  let userId: string;
  try {
    const u = await prisma.$transaction(async (tx) => {
      // Atomically claim the invite; count !== 1 means someone else already did.
      const claim = await tx.portalInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, expires: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claim.count !== 1) throw new InviteClaimError();

      return tx.user.create({
        data: {
          name: parsed.data.name,
          email: invite.email,
          passwordHash,
          role: "BUYER",
          companyId: invite.companyId,
          customerId: invite.customerId,
        },
        select: { id: true },
      });
    });
    userId = u.id;
  } catch (e) {
    if (e instanceof InviteClaimError) return { error: "This invite link has already been used or expired." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "An account with that email already exists. Try signing in instead." };
    }
    throw e;
  }

  // redirect() throws NEXT_REDIRECT — must stay outside the try/catch above.
  await createUserSession(userId);
  redirect("/portal");
}
