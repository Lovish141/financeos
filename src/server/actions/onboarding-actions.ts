"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, assertCanEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { seedCompanyDemo } from "@/server/demo-data";

/** One-click load of the Gupta Brass demo dataset into the current company. */
export async function loadDemoData() {
  const { companyId, role } = await requireSession();
  assertCanEdit(role);

  await seedCompanyDemo(prisma, companyId);

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  revalidatePath("/costs");
  revalidatePath("/templates");
  revalidatePath("/products");
  redirect(`/dashboard?flash=${encodeURIComponent("Demo data loaded")}`);
}
