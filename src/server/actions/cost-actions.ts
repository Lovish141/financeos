"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession, assertCanEdit } from "@/lib/session";
import { recomputeForMasterCost } from "@/server/costing-service";
import { validTypeUnit, TYPE_LABELS, parseMasterCostCsv } from "@/lib/csv";

export type ActionResult = { error?: string; ok?: boolean } | undefined;

const costSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().optional(),
  type: z.enum(["RAW_MATERIAL", "COMPONENT", "SERVICE"]),
  unit: z.string().min(1, "Unit is required"),
  currentCost: z.coerce.number().nonnegative("Cost must be ≥ 0"),
});

export async function createMasterCost(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { db, role, userId, companyId } = await requireSession();
  assertCanEdit(role);

  const parsed = costSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const data = parsed.data;

  if (!validTypeUnit(data.type, data.unit)) {
    return { error: `Unit "${data.unit}" isn't valid for a ${TYPE_LABELS[data.type]}.` };
  }

  const created = await db.masterCost.create({
    data: {
      companyId,
      name: data.name,
      category: data.category || null,
      type: data.type,
      unit: data.unit.toLowerCase(),
      currentCost: data.currentCost,
      history: {
        create: { oldValue: null, newValue: data.currentCost, changedById: userId },
      },
    },
  });

  revalidatePath("/costs");
  redirect(`/costs/${created.id}?flash=${encodeURIComponent("Cost item added")}`);
}

export async function updateMasterCost(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { db, role, userId } = await requireSession();
  assertCanEdit(role);

  const id = String(formData.get("id"));
  const parsed = costSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const data = parsed.data;

  if (!validTypeUnit(data.type, data.unit)) {
    return { error: `Unit "${data.unit}" isn't valid for a ${TYPE_LABELS[data.type]}.` };
  }

  const existing = await db.masterCost.findFirst({
    where: { id },
    select: { currentCost: true },
  });
  if (!existing) return { error: "Cost item not found." };

  const priceChanged = existing.currentCost !== data.currentCost;

  // Price change + history row happen in one transaction — never a separate
  // uncommitted step (Module 1 technical note / acceptance).
  await db.$transaction(async (tx) => {
    await tx.masterCost.update({
      where: { id },
      data: {
        name: data.name,
        category: data.category || null,
        type: data.type,
        unit: data.unit.toLowerCase(),
        currentCost: data.currentCost,
      },
    });
    if (priceChanged) {
      await tx.costHistory.create({
        data: {
          masterCostId: id,
          oldValue: existing.currentCost,
          newValue: data.currentCost,
          changedById: userId,
        },
      });
    }
  });

  // A real price change cascades to every affected product (Module 5 real path).
  if (priceChanged) await recomputeForMasterCost(db, id);

  revalidatePath("/costs");
  revalidatePath(`/costs/${id}`);
  revalidatePath("/dashboard");
  redirect(`/costs/${id}?flash=${encodeURIComponent("Cost item updated")}`);
}

export async function archiveMasterCost(id: string) {
  const { db, role } = await requireSession();
  assertCanEdit(role);
  await db.masterCost.updateMany({ where: { id }, data: { archived: true } });
  revalidatePath("/costs");
}

export async function restoreMasterCost(id: string) {
  const { db, role } = await requireSession();
  assertCanEdit(role);
  await db.masterCost.updateMany({ where: { id }, data: { archived: false } });
  revalidatePath("/costs");
}

// --- CSV bulk import (Module 1) --------------------------------------------

export interface ImportResult {
  imported: number;
  errors: { line: number; error: string }[];
  ok?: boolean;
}

export async function importMasterCostsCsv(
  _prev: ImportResult | undefined,
  formData: FormData,
): Promise<ImportResult> {
  const { db, role, userId, companyId } = await requireSession();
  assertCanEdit(role);

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { imported: 0, errors: [{ line: 0, error: "No file uploaded." }] };

  const { valid, errors, fatal } = parseMasterCostCsv(await file.text());
  if (fatal) return { imported: 0, errors: [{ line: 1, error: fatal }] };

  // Insert valid rows (with seed history) even if some rows failed. One
  // transaction so a mid-import failure doesn't leave a partial set.
  if (valid.length > 0) {
    await db.$transaction(async (tx) => {
      for (const v of valid) {
        await tx.masterCost.create({
          data: { companyId, ...v, history: { create: { oldValue: null, newValue: v.currentCost, changedById: userId } } },
        });
      }
    });
  }

  revalidatePath("/costs");
  return { imported: valid.length, errors, ok: true };
}
