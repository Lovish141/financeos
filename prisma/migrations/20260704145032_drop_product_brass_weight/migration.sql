-- Drop the vestigial per-product brass weight. Raw-material line quantities
-- now live on each line in `Product.comps` (WEIGHT lines included).
ALTER TABLE "Product" DROP COLUMN "brassWeight";
