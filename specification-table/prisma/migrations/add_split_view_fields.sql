-- Add splitViewPerSection and splitViewPerMetafield columns to SpecificationTemplate table
ALTER TABLE "SpecificationTemplate" 
ADD COLUMN IF NOT EXISTS "splitViewPerSection" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SpecificationTemplate" 
ADD COLUMN IF NOT EXISTS "splitViewPerMetafield" BOOLEAN NOT NULL DEFAULT false;





