-- ProductContent becomes a draft/published document (see schema.prisma). Existing rows were live, so they become both.
ALTER TABLE "ProductContent" ADD COLUMN "draft" JSONB, ADD COLUMN "published" JSONB, ADD COLUMN "publishedAt" TIMESTAMP(3), ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

UPDATE "ProductContent" SET "draft" = jsonb_build_object(
  'descriptionHtml',
  CASE WHEN coalesce("description", '') = '' THEN ''
       ELSE '<p>' || regexp_replace(replace(replace(replace("description", '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), E'\n+', '</p><p>', 'g') || '</p>' END,
  'gallery',
  (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x, 'alt', '', 'caption', '')), '[]'::jsonb) FROM unnest("imageIds") AS x)
);

UPDATE "ProductContent" SET "published" = "draft", "publishedAt" = "updatedAt";

ALTER TABLE "ProductContent" ALTER COLUMN "draft" SET NOT NULL;
ALTER TABLE "ProductContent" DROP COLUMN "description", DROP COLUMN "imageIds";
