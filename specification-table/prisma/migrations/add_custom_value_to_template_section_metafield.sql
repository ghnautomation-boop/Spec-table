-- Add customValue column to TemplateSectionMetafield for custom_spec type
ALTER TABLE "TemplateSectionMetafield" 
ADD COLUMN IF NOT EXISTS "customValue" TEXT;

-- Update type default comment to include custom_spec
COMMENT ON COLUMN "TemplateSectionMetafield"."type" IS 'metafield, product_spec, or custom_spec';
