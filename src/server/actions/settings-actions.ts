"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, isAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "./cost-actions";

const schema = z.object({
  name: z.string().min(2, "Company name is required"),
  baseCurrency: z.string().min(3).max(3),
  weightUnit: z.string().min(1),
  marginRedThreshold: z.coerce.number().min(0).max(100),
  marginYellowThreshold: z.coerce.number().min(0).max(100),
  stalenessDays: z.coerce.number().int().min(1).max(3650),
});

export async function updateCompanySettings(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { companyId, role } = await requireSession();
  if (!isAdmin(role)) return { error: "Only an Admin can change company settings." };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const data = parsed.data;

  if (data.marginRedThreshold >= data.marginYellowThreshold) {
    return { error: "Red threshold must be lower than the yellow threshold." };
  }

  await prisma.company.update({
    where: { id: companyId },
    data: {
      name: data.name,
      baseCurrency: data.baseCurrency.toUpperCase(),
      weightUnit: data.weightUnit,
      marginRedThreshold: data.marginRedThreshold,
      marginYellowThreshold: data.marginYellowThreshold,
      stalenessDays: data.stalenessDays,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
