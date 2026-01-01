-- Add seeLessHideFromPC and seeLessHideFromMobile columns to SpecificationTemplate table
ALTER TABLE "SpecificationTemplate"
ADD COLUMN IF NOT EXISTS "seeLessHideFromPC" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SpecificationTemplate"
ADD COLUMN IF NOT EXISTS "seeLessHideFromMobile" BOOLEAN NOT NULL DEFAULT false;

