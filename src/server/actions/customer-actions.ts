"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, assertCanEdit } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SALES_CHANNELS } from "@/lib/csv";
import { validateCustomerFields } from "@/lib/validation";
import type { TenantDb } from "@/lib/tenant";
import type { ActionResult } from "./cost-actions";
import type { Prisma, SalesChannel } from "@prisma/client";

// ---------------------------------------------------------------------------
// Create / update / archive / restore
// ---------------------------------------------------------------------------

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().optional(),
  phone: z.string().optional(),
  channel: z.enum(SALES_CHANNELS).optional().or(z.literal("")),
  gstin: z.string().optional(),
  city: z.string().optional(),
  notes: z.string().optional(),
});

function clean(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t || null;
}

// True when another (optionally excluding `id`) customer already uses this name,
// case-insensitively, within the tenant scope of `db`.
async function nameTaken(db: TenantDb, name: string, excludeId?: string): Promise<boolean> {
  const match = await db.customer.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return !!match;
}

export async function createCustomer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { db, role, companyId } = await requireSession();
  assertCanEdit(role);

  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const data = parsed.data;

  const name = data.name.trim();
  if (!name) return { error: "Name is required." };

  const fieldError = validateCustomerFields(data);
  if (fieldError) return { error: fieldError };

  if (await nameTaken(db, name)) return { error: `A customer named “${name}” already exists.` };

  await db.customer.create({
    data: {
      companyId,
      name,
      email: clean(data.email),
      phone: clean(data.phone),
      channel: data.channel ? (data.channel as SalesChannel) : null,
      gstin: clean(data.gstin)?.toUpperCase() ?? null,
      city: clean(data.city),
      notes: clean(data.notes),
    },
  });

  revalidatePath("/customers");
  revalidatePath("/sales");
  return { ok: true };
}

export async function updateCustomer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { db, role } = await requireSession();
  assertCanEdit(role);

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing customer id." };
  const parsed = customerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.errors[0]?.message };
  const data = parsed.data;

  const name = data.name.trim();
  if (!name) return { error: "Name is required." };

  const fieldError = validateCustomerFields(data);
  if (fieldError) return { error: fieldError };

  const existing = await db.customer.findFirst({ where: { id }, select: { id: true } });
  if (!existing) return { error: "Customer not found." };

  if (await nameTaken(db, name, id)) return { error: `A customer named “${name}” already exists.` };

  await db.customer.update({
    where: { id },
    data: {
      name,
      email: clean(data.email),
      phone: clean(data.phone),
      channel: data.channel ? (data.channel as SalesChannel) : null,
      gstin: clean(data.gstin)?.toUpperCase() ?? null,
      city: clean(data.city),
      notes: clean(data.notes),
    },
  });

  revalidatePath("/customers");
  revalidatePath("/sales");
  return { ok: true };
}

export async function archiveCustomer(id: string) {
  const { db, role } = await requireSession();
  assertCanEdit(role);
  await db.customer.updateMany({ where: { id }, data: { archived: true } });
  revalidatePath("/customers");
  revalidatePath("/sales");
}

export async function restoreCustomer(id: string) {
  const { db, role } = await requireSession();
  assertCanEdit(role);
  await db.customer.updateMany({ where: { id }, data: { archived: false } });
  revalidatePath("/customers");
  revalidatePath("/sales");
}

// ---------------------------------------------------------------------------
// Find-or-create by name — used by the sales CSV import + inline "add" flow so a
// customer named on a sale row is linked to a master record (created if new).
// Tenant scoping is applied by the passed `db`.
// ---------------------------------------------------------------------------

export async function resolveCustomerIds(
  db: TenantDb,
  companyId: string,
  names: string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (wanted.length === 0) return new Map();

  const existing = await db.customer.findMany({
    where: { name: { in: wanted, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  const byLower = new Map(existing.map((c) => [c.name.toLowerCase(), c.id]));

  const toCreate = wanted.filter((n) => !byLower.has(n.toLowerCase()));
  for (const name of toCreate) {
    const created = await db.customer.create({ data: { companyId, name } });
    byLower.set(name.toLowerCase(), created.id);
  }

  // Return keyed by the original (trimmed) name for the caller's lookup.
  const out = new Map<string, string>();
  for (const n of wanted) {
    const id = byLower.get(n.toLowerCase());
    if (id) out.set(n, id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Live search — filtered customer rows (with a sales rollup) for the table.
// ---------------------------------------------------------------------------

export interface CustomerListItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  channel: SalesChannel | null;
  city: string | null;
  gstin: string | null;
  notes: string | null;
  orders: number;
  unitsSold: number;
  revenue: number;
}

export async function searchCustomers(input: { q?: string; archived?: boolean }): Promise<CustomerListItem[]> {
  const { db } = await requireSession();

  const where: Prisma.CustomerWhereInput = { archived: input.archived ?? false };
  if (input.q) {
    where.OR = [
      { name: { contains: input.q, mode: "insensitive" } },
      { email: { contains: input.q, mode: "insensitive" } },
      { city: { contains: input.q, mode: "insensitive" } },
      { gstin: { contains: input.q, mode: "insensitive" } },
    ];
  }

  const rows = await db.customer.findMany({
    where,
    orderBy: { name: "asc" },
    include: { sales: { select: { quantity: true, unitPrice: true } } },
  });

  return rows.map((c) => {
    const orders = c.sales.length;
    const unitsSold = c.sales.reduce((s, x) => s + x.quantity, 0);
    const revenue = c.sales.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      channel: c.channel,
      city: c.city,
      gstin: c.gstin,
      notes: c.notes,
      orders,
      unitsSold,
      revenue,
    };
  });
}

// ---------------------------------------------------------------------------
// Options for the sale-form picker (active customers only).
// ---------------------------------------------------------------------------

export interface CustomerOption {
  id: string;
  name: string;
  channel: SalesChannel | null;
}

export async function customerOptions(): Promise<CustomerOption[]> {
  const { db } = await requireSession();
  const rows = await db.customer.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, channel: true },
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Detail — customer profile + recent sales history.
// ---------------------------------------------------------------------------

export interface CustomerDetail {
  ok: true;
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  channel: SalesChannel | null;
  gstin: string | null;
  city: string | null;
  notes: string | null;
  archived: boolean;
  currency: string;
  orders: number;
  unitsSold: number;
  revenue: number;
  recent: { id: string; productName: string; sku: string; quantity: number; unitPrice: number; revenue: number; soldAt: string }[];
}

export async function getCustomerDetail(id: string): Promise<CustomerDetail | { ok: false; error: string }> {
  const { db, companyId } = await requireSession();

  const c = await db.customer.findFirst({
    where: { id },
    include: {
      sales: {
        orderBy: { soldAt: "desc" },
        include: { product: { select: { name: true, sku: true } } },
      },
    },
  });
  if (!c) return { ok: false, error: "Customer not found." };

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { baseCurrency: true } });

  const unitsSold = c.sales.reduce((s, x) => s + x.quantity, 0);
  const revenue = c.sales.reduce((s, x) => s + x.quantity * x.unitPrice, 0);

  return {
    ok: true,
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    channel: c.channel,
    gstin: c.gstin,
    city: c.city,
    notes: c.notes,
    archived: c.archived,
    currency: company?.baseCurrency ?? "INR",
    orders: c.sales.length,
    unitsSold,
    revenue,
    recent: c.sales.slice(0, 12).map((s) => ({
      id: s.id,
      productName: s.product.name,
      sku: s.product.sku,
      quantity: s.quantity,
      unitPrice: s.unitPrice,
      revenue: s.quantity * s.unitPrice,
      soldAt: s.soldAt.toISOString(),
    })),
  };
}
