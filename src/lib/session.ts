import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { tenantDb } from "./tenant";
import type { Role } from "@prisma/client";

export interface SessionContext {
  userId: string;
  companyId: string;
  role: Role;
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
    name: session.user.name ?? null,
    email: session.user.email ?? "",
    db: tenantDb(session.user.companyId),
  };
}

const WRITE_ROLES: Role[] = ["ADMIN", "COST_MANAGER"];

export function canEdit(role: Role): boolean {
  return WRITE_ROLES.includes(role);
}

export function isAdmin(role: Role): boolean {
  return role === "ADMIN";
}

/** Throw if the current user can't perform write operations (Viewer). */
export function assertCanEdit(role: Role) {
  if (!canEdit(role)) {
    throw new Error("You don't have permission to make changes.");
  }
}
