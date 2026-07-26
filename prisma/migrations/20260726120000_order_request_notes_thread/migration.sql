-- Threaded notes on OrderRequest: replace the single buyerNote / reviewNote
-- strings with a JSON array of { id, from, authorName, text, at } entries.

-- 1. New column (defaults to an empty thread).
ALTER TABLE "OrderRequest" ADD COLUMN "notes" JSONB NOT NULL DEFAULT '[]';

-- 2. Backfill: fold any existing buyerNote (as a BUYER note) and reviewNote
--    (as a STAFF note) into the thread, in chronological order.
UPDATE "OrderRequest" SET "notes" =
  (
    CASE WHEN "buyerNote" IS NOT NULL AND btrim("buyerNote") <> '' THEN
      jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'from', 'BUYER',
        'authorName', NULL,
        'text', "buyerNote",
        'at', to_char(COALESCE("submittedAt", "createdAt") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ))
    ELSE '[]'::jsonb END
  )
  ||
  (
    CASE WHEN "reviewNote" IS NOT NULL AND btrim("reviewNote") <> '' THEN
      jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'from', 'STAFF',
        'authorName', NULL,
        'text', "reviewNote",
        'at', to_char(COALESCE("decidedAt", "updatedAt") AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ))
    ELSE '[]'::jsonb END
  );

-- 3. Drop the superseded columns.
ALTER TABLE "OrderRequest" DROP COLUMN "buyerNote";
ALTER TABLE "OrderRequest" DROP COLUMN "reviewNote";
