import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "./prisma";
import { tenantDb } from "./tenant";
import type { Role } from "@prisma/client";

export interface SessionContext {
  userId: string;
  companyId: string;
  role: Role;
  // Set only for BUYER sessions — the Customer org the buyer acts for.
  customerId: string | null;
  name: string | null;
  email: string;
  db: ReturnType<typeof tenantDb>;
}

/** Get the current tenant context, or redirect to login. Use in server code. */
export async function requireSession(): Promise<SessionContext> {
  const session = await auth();
  if (!session?.user?.companyId) redirect("/login");

  return {
    userId: session.user.id,
    companyId: session.user.companyId,
    role: session.user.role,
    customerId: session.user.customerId ?? null,
    name: session.user.name ?? null,
    email: session.user.email ?? "",
    db: tenantDb(session.user.companyId),
  };
}

/**
 * Staff-only context (the internal ops app). A BUYER hitting a staff route is
 * bounced to their portal instead of the login screen.
 */
export async function requireStaff(): Promise<SessionContext> {
  const ctx = await requireSession();
  if (ctx.role === "BUYER") redirect("/portal");
  return ctx;
}

/**
 * Buyer-only context (the external portal). Guarantees `customerId` is set, so
 * portal code can rely on it. Staff are bounced to the ops dashboard.
 */
export async function requireBuyer(): Promise<SessionContext & { customerId: string }> {
  const ctx = await requireSession();
  if (ctx.role !== "BUYER" || !ctx.customerId) redirect("/dashboard");

  // Live access check — staff can disable the portal or archive the customer at
  // any time; this takes effect on the buyer's very next request (no cookie
  // mutation here, so it is safe to call during a Server Component render).
  const customer = await prisma.customer.findUnique({
    where: { id: ctx.customerId },
    select: { portalEnabled: true, archived: true },
  });
  if (!customer || !customer.portalEnabled || customer.archived) redirect("/portal-disabled");

  return { ...ctx, customerId: ctx.customerId };
}

const WRITE_ROLES: Role[] = ["ADMIN", "COST_MANAGER"];

export function canEdit(role: Role): boolean {
  return WRITE_ROLES.includes(role);
}

export function isAdmin(role: Role): boolean {
  return role === "ADMIN";
}

export function isBuyer(role: Role): boolean {
  return role === "BUYER";
}

/** Throw if the current user can't perform write operations (Viewer). */
export function assertCanEdit(role: Role) {
  if (!canEdit(role)) {
    throw new Error("You don't have permission to make changes.");
  }
}
