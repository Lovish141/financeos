// One-off backfill for the Master Cost — Live Reference Architecture.
// Rewrites every Product.comps and TemplateVersion.snapshot JSON to the slim,
// IDs-only shape ({ masterCostId, lineType, quantity }), stripping the embedded
// master-cost field copies (name / unit / unitCostAtSnapshot). Safe to re-run.
//
//   node --import tsx prisma/scripts/slim-comps.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type FatLine = {
  masterCostId: string;
  lineType: "WEIGHT" | "FIXED";
  quantity: number | null;
  // Fat fields we drop:
  name?: string;
  unit?: string;
  unitCostAtSnapshot?: number;
};

const slimLine = (l: FatLine) => ({
  masterCostId: l.masterCostId,
  lineType: l.lineType,
  quantity: l.quantity ?? null,
});

async function main() {
  let products = 0;
  const productRows = await prisma.product.findMany({ select: { id: true, comps: true } });
  for (const p of productRows) {
    if (p.comps == null) continue;
    const slim = (p.comps as unknown as FatLine[]).map(slimLine);
    await prisma.product.update({ where: { id: p.id }, data: { comps: slim as object } });
    products += 1;
  }

  let versions = 0;
  const versionRows = await prisma.templateVersion.findMany({ select: { id: true, snapshot: true } });
  for (const v of versionRows) {
    const snap = v.snapshot as unknown as {
      version: number;
      templateName: string;
      category: string | null;
      lines: FatLine[];
    } | null;
    if (!snap?.lines) continue;
    const slim = {
      version: snap.version,
      templateName: snap.templateName,
      category: snap.category,
      lines: snap.lines.map(slimLine),
    };
    await prisma.templateVersion.update({ where: { id: v.id }, data: { snapshot: slim as object } });
    versions += 1;
  }

  console.log(`Slimmed ${products} product comps and ${versions} template-version snapshots.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
