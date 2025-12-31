-- Add product specifications support to TemplateSectionMetafield
-- This allows storing both metafields and product specifications in the same table

-- Step 1: Make metafieldDefinitionId nullable
ALTER TABLE "TemplateSectionMetafield" 
ALTER COLUMN "metafieldDefinitionId" DROP NOT NULL;

-- Step 2: Add type column with default 'metafield'
ALTER TABLE "TemplateSectionMetafield" 
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'metafield';

-- Step 3: Add productSpecType column (nullable)
ALTER TABLE "TemplateSectionMetafield" 
ADD COLUMN "productSpecType" TEXT;

-- Step 4: Make the foreign key constraint optional (it's already optional in Prisma, but we need to ensure DB allows nulls)
-- The foreign key should already allow nulls since we made the column nullable

-- Step 5: Add unique constraint for product specifications (sectionId + productSpecType)
-- Note: This will allow multiple nulls (for metafields), but enforce uniqueness for product specs
CREATE UNIQUE INDEX IF NOT EXISTS "TemplateSectionMetafield_sectionId_productSpecType_key" 
ON "TemplateSectionMetafield" ("sectionId", "productSpecType") 
WHERE "productSpecType" IS NOT NULL;

-- Step 6: Update existing records to ensure they have type = 'metafield'
UPDATE "TemplateSectionMetafield" 
SET "type" = 'metafield' 
WHERE "type" IS NULL OR "type" = '';




