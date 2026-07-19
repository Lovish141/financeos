import type { PrismaClient, CostType, LineType, SalesChannel } from "@prisma/client";
import type { TemplateSnapshot, SnapshotLine } from "../lib/costing";

// Gupta Brass Fittings Pvt. Ltd. — realistic brass sanitary fittings dataset.
// Shared by `prisma/seed.ts` (standalone demo tenant) and the in-app
// "load demo data" onboarding action (seeds the current company).

type CostDef = {
  name: string;
  type: CostType;
  unit: string;
  category: string;
  cost: number;
  // Optional richer history to make the price-history view feel alive.
  history?: { old: number | null; new: number; daysAgo: number }[];
};

const MASTER_COSTS: CostDef[] = [
  { name: "Brass Ingot", type: "RAW_MATERIAL", unit: "kg", category: "Metal", cost: 720,
    history: [{ old: null, new: 690, daysAgo: 60 }, { old: 690, new: 705, daysAgo: 28 }, { old: 705, new: 720, daysAgo: 9 }] },
  { name: "Zinc Alloy", type: "RAW_MATERIAL", unit: "kg", category: "Metal", cost: 240 },
  { name: "Chrome Plating", type: "SERVICE", unit: "piece", category: "Finishing", cost: 45 },
  { name: "Nickel Plating", type: "SERVICE", unit: "piece", category: "Finishing", cost: 60 },
  { name: "Aerator", type: "COMPONENT", unit: "piece", category: "Fittings", cost: 12 },
  { name: "Cartridge 40mm", type: "COMPONENT", unit: "piece", category: "Fittings", cost: 85 },
  { name: "Cartridge 35mm", type: "COMPONENT", unit: "piece", category: "Fittings", cost: 78 },
  { name: "Flange", type: "COMPONENT", unit: "piece", category: "Fittings", cost: 15 },
  { name: "Handle Lever", type: "COMPONENT", unit: "piece", category: "Fittings", cost: 22 },
  { name: "Rubber Washer", type: "COMPONENT", unit: "piece", category: "Fittings", cost: 2 },
  { name: "Machining Labour", type: "SERVICE", unit: "piece", category: "Labour", cost: 35 },
  { name: "Assembly Labour", type: "SERVICE", unit: "piece", category: "Labour", cost: 18 },
  { name: "Packaging Box", type: "COMPONENT", unit: "piece", category: "Packaging", cost: 8 },
];

type LineDef = { name: string; lineType: LineType; quantity: number | null };

type TemplateDef = {
  name: string;
  category: string;
  lines: LineDef[];
  products: { name: string; sku: string; weight: number; price: number }[];
};

const TEMPLATES: TemplateDef[] = [
  {
    name: "Basin Mixer", category: "Mixers",
    lines: [
      { name: "Brass Ingot", lineType: "WEIGHT", quantity: null },
      { name: "Cartridge 40mm", lineType: "FIXED", quantity: 1 },
      { name: "Aerator", lineType: "FIXED", quantity: 1 },
      { name: "Handle Lever", lineType: "FIXED", quantity: 1 },
      { name: "Chrome Plating", lineType: "FIXED", quantity: 1 },
      { name: "Machining Labour", lineType: "FIXED", quantity: 1 },
      { name: "Assembly Labour", lineType: "FIXED", quantity: 1 },
      { name: "Packaging Box", lineType: "FIXED", quantity: 1 },
    ],
    products: [
      { name: "Elegant Basin Mixer", sku: "MIX-BASIN-EL", weight: 0.55, price: 1450 },
      { name: "Premium Basin Mixer", sku: "MIX-BASIN-PR", weight: 0.7, price: 1850 },
      { name: "Economy Basin Mixer", sku: "MIX-BASIN-EC", weight: 0.42, price: 1050 },
    ],
  },
  {
    name: "Wall Mixer", category: "Mixers",
    lines: [
      { name: "Brass Ingot", lineType: "WEIGHT", quantity: null },
      { name: "Cartridge 35mm", lineType: "FIXED", quantity: 1 },
      { name: "Handle Lever", lineType: "FIXED", quantity: 2 },
      { name: "Chrome Plating", lineType: "FIXED", quantity: 1 },
      { name: "Machining Labour", lineType: "FIXED", quantity: 1 },
      { name: "Assembly Labour", lineType: "FIXED", quantity: 1 },
      { name: "Packaging Box", lineType: "FIXED", quantity: 1 },
    ],
    products: [
      { name: "Classic Wall Mixer", sku: "MIX-WALL-CL", weight: 0.6, price: 1350 },
      { name: "Deluxe Wall Mixer", sku: "MIX-WALL-DX", weight: 0.75, price: 1750 },
    ],
  },
  {
    name: "Pillar Cock", category: "Taps",
    lines: [
      { name: "Brass Ingot", lineType: "WEIGHT", quantity: null },
      { name: "Aerator", lineType: "FIXED", quantity: 1 },
      { name: "Handle Lever", lineType: "FIXED", quantity: 1 },
      { name: "Chrome Plating", lineType: "FIXED", quantity: 1 },
      { name: "Machining Labour", lineType: "FIXED", quantity: 1 },
      { name: "Packaging Box", lineType: "FIXED", quantity: 1 },
    ],
    products: [
      { name: "Standard Pillar Cock", sku: "TAP-PILLAR-ST", weight: 0.35, price: 780 },
      { name: "Heavy Pillar Cock", sku: "TAP-PILLAR-HV", weight: 0.5, price: 1050 },
    ],
  },
  {
    name: "Angle Valve", category: "Valves",
    lines: [
      { name: "Brass Ingot", lineType: "WEIGHT", quantity: null },
      { name: "Flange", lineType: "FIXED", quantity: 1 },
      { name: "Rubber Washer", lineType: "FIXED", quantity: 2 },
      { name: "Chrome Plating", lineType: "FIXED", quantity: 1 },
      { name: "Assembly Labour", lineType: "FIXED", quantity: 1 },
      { name: "Packaging Box", lineType: "FIXED", quantity: 1 },
    ],
    products: [
      { name: "Angle Valve 1/2in", sku: "VAL-ANGLE-12", weight: 0.18, price: 320 },
      { name: "Angle Valve Premium", sku: "VAL-ANGLE-PR", weight: 0.25, price: 480 },
    ],
  },
];

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/**
 * Populate a company with the full Gupta Brass demo dataset. Idempotent-safe to
 * the extent that it only runs when the company has no master costs.
 */
export async function seedCompanyDemo(prisma: PrismaClient, companyId: string): Promise<void> {
  const existing = await prisma.masterCost.count({ where: { companyId } });
  if (existing > 0) return; // don't double-seed

  // 1. Master costs (+ history).
  const costByName = new Map<string, { id: string; cost: number; unit: string }>();
  for (const def of MASTER_COSTS) {
    const hist = def.history ?? [{ old: null, new: def.cost, daysAgo: 30 }];
    const current = hist[hist.length - 1].new;
    const mc = await prisma.masterCost.create({
      data: {
        companyId,
        name: def.name,
        category: def.category,
        type: def.type,
        unit: def.unit,
        currentCost: current,
        updatedAt: daysAgo(hist[hist.length - 1].daysAgo),
        history: {
          create: hist.map((h) => ({ oldValue: h.old, newValue: h.new, createdAt: daysAgo(h.daysAgo) })),
        },
      },
    });
    costByName.set(def.name, { id: mc.id, cost: current, unit: def.unit });
  }

  // 2. Templates + version snapshots + 3. Products.
  const seededProducts: { id: string; sku: string; price: number }[] = [];
  for (const t of TEMPLATES) {
    const template = await prisma.template.create({
      data: { companyId, name: t.name, category: t.category },
    });

    await prisma.templateComponent.createMany({
      data: t.lines.map((l, i) => {
        const mc = costByName.get(l.name)!;
        return {
          templateId: template.id,
          masterCostId: mc.id,
          lineType: l.lineType,
          quantity: l.lineType === "WEIGHT" ? null : l.quantity,
          sortOrder: i,
        };
      }),
    });

    // Structure-only snapshot (IDs + quantities) — costs resolve live.
    const snapshotLines: SnapshotLine[] = t.lines.map((l) => {
      const mc = costByName.get(l.name)!;
      return {
        masterCostId: mc.id,
        lineType: l.lineType,
        quantity: l.lineType === "WEIGHT" ? null : l.quantity,
      };
    });
    const snapshot: TemplateSnapshot = { version: 1, templateName: t.name, category: t.category, lines: snapshotLines };

    const version = await prisma.templateVersion.create({
      data: { templateId: template.id, version: 1, snapshot: snapshot as object },
    });

    for (const p of t.products) {
      // Per-product comps: raw-material (WEIGHT) lines take this SKU's weight.
      // No cached cost columns — cost/margin compute live from the price book.
      const comps: SnapshotLine[] = snapshotLines.map((l) => ({
        ...l,
        quantity: l.lineType === "WEIGHT" ? p.weight : l.quantity,
      }));
      const created = await prisma.product.create({
        data: {
          companyId,
          name: p.name,
          sku: p.sku,
          templateId: template.id,
          templateVersionId: version.id,
          comps: comps as object,
          sellingPrice: p.price,
          status: "ACTIVE",
        },
      });
      seededProducts.push({ id: created.id, sku: created.sku, price: p.price });
    }
  }

  // 4. Customers (Module 9) — the master accounts sales are booked against.
  const CUSTOMER_DEFS: { name: string; channel: SalesChannel; city: string; email: string }[] = [
    { name: "Sharma Traders", channel: "RETAIL", city: "Delhi", email: "orders@sharmatraders.in" },
    { name: "Metro Sanitary", channel: "WHOLESALE", city: "Mumbai", email: "purchase@metrosanitary.com" },
    { name: "Gulf Imports FZE", channel: "EXPORT", city: "Dubai", email: "buy@gulfimports.ae" },
    { name: "BuildMart Online", channel: "ONLINE", city: "Bengaluru", email: "vendors@buildmart.in" },
    { name: "Kohli & Sons", channel: "DISTRIBUTOR", city: "Ludhiana", email: "kohlisons@gmail.com" },
    { name: "Prime Fittings", channel: "WHOLESALE", city: "Ahmedabad", email: "sales@primefittings.in" },
  ];
  const seededCustomers: { id: string; channel: SalesChannel }[] = [];
  for (const c of CUSTOMER_DEFS) {
    const created = await prisma.customer.create({
      data: { companyId, name: c.name, channel: c.channel, city: c.city, email: c.email },
    });
    seededCustomers.push({ id: created.id, channel: c.channel });
  }

  // 5. Sales (Module 8) — a few months of realized transactions per product, at
  // prices near (but often below) catalog so realized margin diverges from the
  // theoretical catalog margin. Each links to a customer whose channel it uses.
  // Deterministic pseudo-random for a stable demo.
  let seed = 20260708;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // A realized-price line for one product within an order.
  const priceLine = (p: { id: string; price: number }, bulk: boolean) => {
    const quantity = bulk ? 40 + Math.floor(rand() * 260) : 5 + Math.floor(rand() * 45);
    const discount = (bulk ? 0.06 : 0.0) + rand() * 0.12; // 0–18% off catalog
    return { companyId, productId: p.id, quantity, unitPrice: Math.round(p.price * (1 - discount)) };
  };

  // Build orders (invoices): each is booked against one customer/date/channel and
  // carries 1–3 product line items, so the demo shows realistic multi-product sales.
  for (const p of seededProducts) {
    const orderCount = 4 + Math.floor(rand() * 5); // 4–8 orders featuring this product
    for (let i = 0; i < orderCount; i++) {
      const customer = seededCustomers[Math.floor(rand() * seededCustomers.length)];
      const channel = customer.channel;
      const bulk = channel === "WHOLESALE" || channel === "DISTRIBUTOR" || channel === "EXPORT";

      // Always include p; sometimes add 1–2 more distinct products to the invoice.
      const lineProducts = [p];
      const extra = Math.floor(rand() * 3); // 0–2 extra lines
      for (let e = 0; e < extra; e++) {
        const other = seededProducts[Math.floor(rand() * seededProducts.length)];
        if (!lineProducts.some((lp) => lp.id === other.id)) lineProducts.push(other);
      }

      await prisma.order.create({
        data: {
          companyId,
          customerId: customer.id,
          soldAt: daysAgo(Math.floor(rand() * 120)),
          channel,
          items: { create: lineProducts.map((lp) => priceLine(lp, bulk)) },
        },
      });
    }
  }
}
