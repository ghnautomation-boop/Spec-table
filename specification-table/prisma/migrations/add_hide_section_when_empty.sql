-- Add hideSectionWhenEmpty column to TemplateSection table
ALTER TABLE "TemplateSection" 
ADD COLUMN IF NOT EXISTS "hideSectionWhenEmpty" BOOLEAN NOT NULL DEFAULT true;


