-- Master Cost — Live Reference Architecture.
-- Cost & margin are now computed on read from the live price book; the cached
-- per-product columns (and their margin index) are removed. Product.comps and
-- TemplateVersion.snapshot keep only IDs + quantities (slimmed by the
-- prisma/scripts/slim-comps.ts backfill) — no master-cost field copies remain.

-- Drop the margin index before the column it references.
DROP INDEX IF EXISTS "Product_companyId_grossMarginPct_idx";

ALTER TABLE "Product" DROP COLUMN IF EXISTS "totalCost";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "grossMarginAmount";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "grossMarginPct";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "costComputedAt";
