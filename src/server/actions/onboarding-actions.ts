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
  // Return to the wizard so the price-book / recipe / product steps now render
  // the freshly-seeded data (the review half of the onboarding flow).
  redirect("/onboarding");
}
