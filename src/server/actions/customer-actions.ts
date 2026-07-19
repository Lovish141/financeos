"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff, assertCanEdit } from "@/lib/session";
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
  const { db, role, companyId } = await requireStaff();
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
  const { db, role } = await requireStaff();
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
  const { db, role } = await requireStaff();
  assertCanEdit(role);
  await db.customer.updateMany({ where: { id }, data: { archived: true } });
  revalidatePath("/customers");
  revalidatePath("/sales");
}

export async function restoreCustomer(id: string) {
  const { db, role } = await requireStaff();
  assertCanEdit(role);
  await db.customer.updateMany({ where: { id }, data: { archived: false } });
  revalidatePath("/customers");
  revalidatePath("/sales");
}

// ---------------------------------------------------------------------------
// Match by name — used by the sales CSV import to link a sale row to an existing
// customer master record. It deliberately does NOT create customers: a typo in a
// spreadsheet must never silently pollute the master list. Unmatched or ambiguous
// (duplicate-name) rows are surfaced by the caller. Tenant scoping via `db`.
// ---------------------------------------------------------------------------

export interface CustomerNameMatch {
  byName: Map<string, string>; // lowercased name -> id, only for unambiguous matches
  ambiguous: Set<string>;      // lowercased names matching more than one customer
}

export async function matchCustomerIds(db: TenantDb, names: string[]): Promise<CustomerNameMatch> {
  const wanted = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return { byName: new Map(), ambiguous: new Set() };

  const existing = await db.customer.findMany({
    where: { name: { in: wanted, mode: "insensitive" } },
    select: { id: true, name: true },
  });

  const idsByName = new Map<string, string[]>();
  for (const c of existing) {
    const key = c.name.toLowerCase();
    const list = idsByName.get(key) ?? [];
    list.push(c.id);
    idsByName.set(key, list);
  }

  const byName = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const [key, ids] of idsByName) {
    if (ids.length === 1) byName.set(key, ids[0]);
    else ambiguous.add(key);
  }
  return { byName, ambiguous };
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
  const { db } = await requireStaff();

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
    include: { orders: { select: { items: { select: { quantity: true, unitPrice: true } } } } },
  });

  return rows.map((c) => {
    const lines = c.orders.flatMap((o) => o.items);
    const orders = c.orders.length;
    const unitsSold = lines.reduce((s, x) => s + x.quantity, 0);
    const revenue = lines.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
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
  const { db } = await requireStaff();
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
  const { db, companyId } = await requireStaff();

  const c = await db.customer.findFirst({
    where: { id },
    include: {
      orders: {
        orderBy: { soldAt: "desc" },
        include: { items: { include: { product: { select: { name: true, sku: true } } } } },
      },
    },
  });
  if (!c) return { ok: false, error: "Customer not found." };

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { baseCurrency: true } });

  // Flatten line items across the customer's orders (newest order first), each
  // carrying its parent order's date, for the profile rollup + recent list.
  const lines = c.orders.flatMap((o) =>
    o.items.map((it) => ({
      id: it.id,
      productName: it.product.name,
      sku: it.product.sku,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      revenue: it.quantity * it.unitPrice,
      soldAt: o.soldAt.toISOString(),
    })),
  );
  const unitsSold = lines.reduce((s, x) => s + x.quantity, 0);
  const revenue = lines.reduce((s, x) => s + x.revenue, 0);

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
    orders: c.orders.length,
    unitsSold,
    revenue,
    recent: lines.slice(0, 12),
  };
}
