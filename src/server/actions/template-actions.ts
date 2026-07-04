"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, assertCanEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buildSnapshot } from "@/server/costing-service";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Live search — filtered list rows for the client-rendered card grid.
// ---------------------------------------------------------------------------

export interface TemplateListItem {
  id: string;
  name: string;
  category: string | null;
  componentNames: string[];
  lineCount: number;
  fixedCost: number;
  productCount: number;
  avgMargin: number | null;
}

export async function searchTemplates(input: { q?: string }): Promise<TemplateListItem[]> {
  const { db } = await requireSession();

  const where: Prisma.TemplateWhereInput = {};
  if (input.q) {
    where.OR = [
      { name: { contains: input.q, mode: "insensitive" } },
      { category: { contains: input.q, mode: "insensitive" } },
    ];
  }

  const templates = await db.template.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      components: {
        orderBy: { sortOrder: "asc" },
        include: { masterCost: { select: { name: true, currentCost: true } } },
      },
      products: { select: { grossMarginPct: true } },
    },
  });

  return templates.map((t) => {
    const fixedCost = t.components
      .filter((c) => c.lineType === "FIXED")
      .reduce((sum, c) => sum + (c.quantity ?? 0) * c.masterCost.currentCost, 0);
    const productCount = t.products.length;
    const avgMargin = productCount
      ? t.products.reduce((sum, p) => sum + p.grossMarginPct, 0) / productCount
      : null;
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      componentNames: t.components.map((c) => c.masterCost.name),
      lineCount: t.components.length,
      fixedCost,
      productCount,
      avgMargin,
    };
  });
}

// ---------------------------------------------------------------------------
// Drawer payloads — edit draft + read-only preview detail.
// ---------------------------------------------------------------------------

export interface TemplateLineInput {
  masterCostId: string;
  lineType: "WEIGHT" | "FIXED";
  quantity: number | null;
}

export interface TemplateDraft {
  ok: true;
  id: string;
  name: string;
  category: string;
  lines: TemplateLineInput[];
}

export async function getTemplateDraft(id: string): Promise<TemplateDraft | { ok: false; error: string }> {
  const { db } = await requireSession();
  const t = await db.template.findFirst({
    where: { id },
    include: { components: { orderBy: { sortOrder: "asc" } } },
  });
  if (!t) return { ok: false, error: "Template not found." };
  return {
    ok: true,
    id: t.id,
    name: t.name,
    category: t.category ?? "",
    lines: t.components.map((c) => ({ masterCostId: c.masterCostId, lineType: c.lineType, quantity: c.quantity })),
  };
}

export interface TemplateDetail {
  ok: true;
  id: string;
  name: string;
  category: string | null;
  currency: string;
  weightUnit: string;
  productCount: number;
  lines: {
    masterCostId: string;
    name: string;
    type: "RAW_MATERIAL" | "COMPONENT" | "SERVICE";
    unit: string;
    currentCost: number;
    lineType: "WEIGHT" | "FIXED";
    quantity: number | null;
    lineCost: number;
  }[];
  fixedTotal: number;
  weightRate: number;
  versions: { version: number; at: string }[];
}

export async function getTemplateDetail(id: string): Promise<TemplateDetail | { ok: false; error: string }> {
  const { db, companyId } = await requireSession();
  const t = await db.template.findFirst({
    where: { id },
    include: {
      components: {
        orderBy: { sortOrder: "asc" },
        include: { masterCost: { select: { name: true, type: true, unit: true, currentCost: true } } },
      },
      versions: { orderBy: { version: "desc" }, select: { version: true, createdAt: true } },
      _count: { select: { products: true } },
    },
  });
  if (!t) return { ok: false, error: "Template not found." };

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { baseCurrency: true, weightUnit: true },
  });

  const lines = t.components.map((c) => ({
    masterCostId: c.masterCostId,
    name: c.masterCost.name,
    type: c.masterCost.type,
    unit: c.masterCost.unit,
    currentCost: c.masterCost.currentCost,
    lineType: c.lineType,
    quantity: c.quantity,
    lineCost: c.lineType === "FIXED" ? (c.quantity ?? 0) * c.masterCost.currentCost : c.masterCost.currentCost,
  }));
  const fixedTotal = lines.filter((l) => l.lineType === "FIXED").reduce((s, l) => s + l.lineCost, 0);
  const weightLine = lines.find((l) => l.lineType === "WEIGHT");

  return {
    ok: true,
    id: t.id,
    name: t.name,
    category: t.category,
    currency: company?.baseCurrency ?? "INR",
    weightUnit: company?.weightUnit ?? "kg",
    productCount: t._count.products,
    lines,
    fixedTotal,
    weightRate: weightLine?.currentCost ?? 0,
    versions: t.versions.map((v) => ({ version: v.version, at: v.createdAt.toISOString() })),
  };
}

// ---------------------------------------------------------------------------
// Create / edit — one action for both, snapshots a new immutable version so
// existing products keep their pinned version (Module 2 acceptance).
// ---------------------------------------------------------------------------

const lineSchema = z.object({
  masterCostId: z.string().min(1),
  lineType: z.enum(["WEIGHT", "FIXED"]),
  quantity: z.number().nullable(),
});

const formSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  category: z.string().optional(),
  lines: z.array(lineSchema),
});

export interface TemplateFormResult {
  ok?: boolean;
  error?: string;
  id?: string;
}

export async function saveTemplateForm(input: {
  id?: string;
  name: string;
  category?: string;
  lines: TemplateLineInput[];
}): Promise<TemplateFormResult> {
  const { db, role, companyId } = await requireSession();
  assertCanEdit(role);

  const parsed = formSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid template" };
  const { id, name, category, lines } = parsed.data;

  if (lines.filter((l) => l.lineType === "WEIGHT").length > 1) {
    return { error: "A template can have at most one weight-based (raw material) line." };
  }
  for (const l of lines) {
    if (l.lineType === "FIXED" && (l.quantity == null || l.quantity <= 0)) {
      return { error: "Fixed lines need a quantity greater than 0." };
    }
  }

  let templateId = id;
  if (id) {
    const owned = await db.template.findFirst({ where: { id }, select: { id: true } });
    if (!owned) return { error: "Template not found." };
  } else {
    const created = await db.template.create({ data: { companyId, name, category: category || null } });
    templateId = created.id;
  }

  const lastVersion = await db.template
    .findFirst({ where: { id: templateId }, select: { versions: { orderBy: { version: "desc" }, take: 1 } } })
    .then((t) => t?.versions[0]?.version ?? 0);
  const nextVersion = lastVersion + 1;

  await db.$transaction(async (tx) => {
    await tx.template.update({ where: { id: templateId }, data: { name, category: category || null } });
    await tx.templateComponent.deleteMany({ where: { templateId } });
    if (lines.length > 0) {
      await tx.templateComponent.createMany({
        data: lines.map((l, i) => ({
          templateId: templateId as string,
          masterCostId: l.masterCostId,
          lineType: l.lineType,
          quantity: l.lineType === "WEIGHT" ? null : l.quantity,
          sortOrder: i,
        })),
      });
    }
  });

  const snapshot = await buildSnapshot(db, templateId as string, nextVersion);
  await db.templateVersion.create({
    data: { templateId: templateId as string, version: nextVersion, snapshot: snapshot as object },
  });

  revalidatePath("/templates");
  return { ok: true, id: templateId };
}

export async function cloneTemplate(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { db, role, companyId } = await requireSession();
  assertCanEdit(role);

  const source = await db.template.findFirst({
    where: { id },
    include: { components: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) return { ok: false, error: "Template not found." };

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
  return { ok: true, id: clone.id };
}

/**
 * Delete a template. Matches the design's cascade: products built on this
 * template are deleted too (the confirm dialog warns up-front). Products go
 * first because Product → Template is `onDelete: Restrict`; the version/
 * component rows then cascade from the template.
 */
export async function deleteTemplate(id: string): Promise<void> {
  const { db, role } = await requireSession();
  assertCanEdit(role);

  const owned = await db.template.findFirst({ where: { id }, select: { id: true } });
  if (!owned) return;

  await db.$transaction(async (tx) => {
    await tx.product.deleteMany({ where: { templateId: id } });
    await tx.template.deleteMany({ where: { id } });
  });

  revalidatePath("/templates");
  revalidatePath("/products");
  revalidatePath("/dashboard");
}
