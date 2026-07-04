"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession, assertCanEdit } from "@/lib/session";
import { computeProductCost, type TemplateSnapshot } from "@/lib/costing";
import { getLiveCosts } from "@/server/costing-service";
import { toSkuToken } from "@/lib/utils";
import type { ActionResult } from "./cost-actions";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().optional(),
  templateId: z.string().min(1, "Choose a template"),
  brassWeight: z.coerce.number().nonnegative("Weight must be ≥ 0"),
  sellingPrice: z.coerce.number().nonnegative("Price must be ≥ 0"),
});

async function latestVersion(
  db: Awaited<ReturnType<typeof requireSession>>["db"],
  templateId: string,
) {
  const template = await db.template.findFirst({
    where: { id: templateId },
    select: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  return template?.versions[0] ?? null;
}

async function computeFields(
  db: Awaited<ReturnType<typeof requireSession>>["db"],
  snapshot: TemplateSnapshot,
  brassWeight: number,
  sellingPrice: number,
) {
  const liveCosts = await getLiveCosts(db, snapshot.lines.map((l) => l.masterCostId));
  const result = computeProductCost({ brassWeight, sellingPrice, snapshot, liveCosts });
  return {
    totalCost: result.totalCost,
    grossMarginAmount: result.grossMarginAmount,
    grossMarginPct: result.grossMarginPct,
    costComputedAt: new Date(),
  };
}

async function uniqueSku(
  db: Awaited<ReturnType<typeof requireSession>>["db"],
  base: string,
): Promise<string> {
  const root = base || "SKU";
  let candidate = root;
  let n = 1;
  // Scoped count — collisions are per-company.
  while ((await db.product.count({ where: { sku: candidate } })) > 0) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
}

export async function createProduct(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { db, role, companyId } = await requireSession();
  assertCanEdit(role);

  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const data = parsed.data;

  const version = await latestVersion(db, data.templateId);
  if (!version) {
    return { error: "This template has no saved recipe yet. Open the template and save its recipe first." };
  }

  const snapshot = version.snapshot as unknown as TemplateSnapshot;
  const fields = await computeFields(db, snapshot, data.brassWeight, data.sellingPrice);
  const sku = await uniqueSku(db, data.sku?.trim() || toSkuToken(data.name));

  const created = await db.product.create({
    data: {
      companyId,
      name: data.name,
      sku,
      templateId: data.templateId,
      templateVersionId: version.id,
      brassWeight: data.brassWeight,
      sellingPrice: data.sellingPrice,
      ...fields,
    },
  });

  revalidatePath("/products");
  revalidatePath("/dashboard");
  redirect(`/products/${created.id}?flash=${encodeURIComponent("Product created")}`);
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  brassWeight: z.coerce.number().nonnegative(),
  sellingPrice: z.coerce.number().nonnegative(),
  status: z.enum(["DRAFT", "ACTIVE", "DISCONTINUED"]).optional(),
});

export async function updateProduct(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { db, role } = await requireSession();
  assertCanEdit(role);

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const data = parsed.data;

  const product = await db.product.findFirst({
    where: { id: data.id },
    include: { templateVersion: true },
  });
  if (!product) return { error: "Product not found." };

  const snapshot = product.templateVersion.snapshot as unknown as TemplateSnapshot;
  const fields = await computeFields(db, snapshot, data.brassWeight, data.sellingPrice);

  await db.product.update({
    where: { id: data.id },
    data: {
      name: data.name,
      brassWeight: data.brassWeight,
      sellingPrice: data.sellingPrice,
      status: data.status,
      ...fields,
    },
  });

  revalidatePath("/products");
  revalidatePath(`/products/${data.id}`);
  revalidatePath("/dashboard");
  redirect(`/products/${data.id}?flash=${encodeURIComponent("Product updated")}`);
}

export async function cloneProduct(id: string) {
  const { db, role, companyId } = await requireSession();
  assertCanEdit(role);

  const source = await db.product.findFirst({ where: { id } });
  if (!source) throw new Error("Product not found");

  const sku = await uniqueSku(db, `${source.sku}-COPY`);
  const clone = await db.product.create({
    data: {
      companyId,
      name: `${source.name} (copy)`,
      sku,
      templateId: source.templateId,
      templateVersionId: source.templateVersionId,
      brassWeight: source.brassWeight,
      sellingPrice: source.sellingPrice,
      totalCost: source.totalCost,
      grossMarginAmount: source.grossMarginAmount,
      grossMarginPct: source.grossMarginPct,
      status: "DRAFT",
    },
  });
  revalidatePath("/products");
  redirect(`/products/${clone.id}?flash=${encodeURIComponent("Product duplicated")}`);
}

export async function deleteProduct(id: string) {
  const { db, role } = await requireSession();
  assertCanEdit(role);
  await db.product.deleteMany({ where: { id } });
  revalidatePath("/products");
  revalidatePath("/dashboard");
  redirect(`/products?flash=${encodeURIComponent("Product deleted")}`);
}
