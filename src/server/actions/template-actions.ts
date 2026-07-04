"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession, assertCanEdit } from "@/lib/session";
import { buildSnapshot } from "@/server/costing-service";
import type { ActionResult } from "./cost-actions";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().optional(),
});

export async function createTemplate(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { db, role, companyId } = await requireSession();
  assertCanEdit(role);

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };

  const created = await db.template.create({
    data: { companyId, name: parsed.data.name, category: parsed.data.category || null },
  });
  revalidatePath("/templates");
  redirect(`/templates/${created.id}?flash=${encodeURIComponent("Template created")}`);
}

const lineSchema = z.object({
  masterCostId: z.string().min(1),
  lineType: z.enum(["WEIGHT", "FIXED"]),
  quantity: z.number().nullable(),
});

const saveSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  category: z.string().optional(),
  lines: z.array(lineSchema),
});

/**
 * Persist a template's recipe and snapshot a new immutable version. Existing
 * products keep their pinned version, so their costs don't silently change
 * (Module 2 acceptance).
 */
export async function saveTemplate(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { db, role } = await requireSession();
  assertCanEdit(role);

  let payload: unknown;
  try {
    payload = {
      id: formData.get("id"),
      name: formData.get("name"),
      category: formData.get("category") || undefined,
      lines: JSON.parse(String(formData.get("lines") || "[]")),
    };
  } catch {
    return { error: "Could not read recipe lines." };
  }

  const parsed = saveSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid recipe" };
  const { id, name, category, lines } = parsed.data;

  const weightLines = lines.filter((l) => l.lineType === "WEIGHT");
  if (weightLines.length > 1) {
    return { error: "A template can have at most one weight-based (raw material) line." };
  }
  for (const l of lines) {
    if (l.lineType === "FIXED" && (l.quantity == null || l.quantity <= 0)) {
      return { error: "Fixed lines need a quantity greater than 0." };
    }
  }

  // Confirm ownership (scoped) before mutating child rows.
  const template = await db.template.findFirst({ where: { id }, select: { id: true } });
  if (!template) return { error: "Template not found." };

  const lastVersion = await db.template
    .findFirst({ where: { id }, select: { versions: { orderBy: { version: "desc" }, take: 1 } } })
    .then((t) => t?.versions[0]?.version ?? 0);
  const nextVersion = lastVersion + 1;

  await db.$transaction(async (tx) => {
    await tx.template.update({ where: { id }, data: { name, category: category || null } });
    await tx.templateComponent.deleteMany({ where: { templateId: id } });
    if (lines.length > 0) {
      await tx.templateComponent.createMany({
        data: lines.map((l, i) => ({
          templateId: id,
          masterCostId: l.masterCostId,
          lineType: l.lineType,
          quantity: l.lineType === "WEIGHT" ? null : l.quantity,
          sortOrder: i,
        })),
      });
    }
  });

  // Snapshot after components are written so it captures the saved recipe.
  const snapshot = await buildSnapshot(db, id, nextVersion);
  await db.templateVersion.create({
    data: { templateId: id, version: nextVersion, snapshot: snapshot as object },
  });

  revalidatePath("/templates");
  revalidatePath(`/templates/${id}`);
  return { ok: true };
}

export async function cloneTemplate(id: string) {
  const { db, role, companyId } = await requireSession();
  assertCanEdit(role);

  const source = await db.template.findFirst({
    where: { id },
    include: { components: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) throw new Error("Template not found");

  const clone = await db.template.create({
    data: { companyId, name: `${source.name} (copy)`, category: source.category },
  });

  if (source.components.length > 0) {
    await db.templateComponent.createMany({
      data: source.components.map((c) => ({
        templateId: clone.id,
        masterCostId: c.masterCostId,
        lineType: c.lineType,
        quantity: c.quantity,
        sortOrder: c.sortOrder,
      })),
    });
    const snapshot = await buildSnapshot(db, clone.id, 1);
    await db.templateVersion.create({
      data: { templateId: clone.id, version: 1, snapshot: snapshot as object },
    });
  }

  revalidatePath("/templates");
  redirect(`/templates/${clone.id}?flash=${encodeURIComponent("Template duplicated")}`);
}

/**
 * Delete a template. Matches the design's cascade: any products built on this
 * template are deleted too (the confirm dialog warns about this up-front). We
 * remove products first because Product → Template is `onDelete: Restrict`;
 * TemplateVersion/TemplateComponent then cascade from the template row.
 */
export async function deleteTemplate(id: string) {
  const { db, role } = await requireSession();
  assertCanEdit(role);

  // Confirm the template is ours (scoped) before deleting by id in the tx,
  // whose client isn't tenant-scoped.
  const owned = await db.template.findFirst({ where: { id }, select: { id: true } });
  if (!owned) redirect(`/templates?flash=${encodeURIComponent("Template not found")}`);

  await db.$transaction(async (tx) => {
    await tx.product.deleteMany({ where: { templateId: id } });
    await tx.template.deleteMany({ where: { id } });
  });

  revalidatePath("/templates");
  revalidatePath("/products");
  revalidatePath("/dashboard");
  redirect(`/templates?flash=${encodeURIComponent("Template deleted")}`);
}
