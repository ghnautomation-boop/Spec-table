SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'SpecificationTemplate'
AND column_name IN ('seeLessHideFromPC', 'seeLessHideFromMobile')
ORDER BY column_name;

