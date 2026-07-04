-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "comps" JSONB,
ALTER COLUMN "templateId" DROP NOT NULL,
ALTER COLUMN "templateVersionId" DROP NOT NULL,
ALTER COLUMN "brassWeight" SET DEFAULT 0;
