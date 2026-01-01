-- Forțează adăugarea coloanelor pentru seeLess (dacă nu există deja)
DO $$ 
BEGIN
    -- Adaugă seeLessHideFromPC dacă nu există
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'SpecificationTemplate' 
        AND column_name = 'seeLessHideFromPC'
    ) THEN
        ALTER TABLE "SpecificationTemplate"
        ADD COLUMN "seeLessHideFromPC" BOOLEAN NOT NULL DEFAULT false;
        RAISE NOTICE 'Coloana seeLessHideFromPC a fost adăugată';
    ELSE
        RAISE NOTICE 'Coloana seeLessHideFromPC există deja';
    END IF;

    -- Adaugă seeLessHideFromMobile dacă nu există
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'SpecificationTemplate' 
        AND column_name = 'seeLessHideFromMobile'
    ) THEN
        ALTER TABLE "SpecificationTemplate"
        ADD COLUMN "seeLessHideFromMobile" BOOLEAN NOT NULL DEFAULT false;
        RAISE NOTICE 'Coloana seeLessHideFromMobile a fost adăugată';
    ELSE
        RAISE NOTICE 'Coloana seeLessHideFromMobile există deja';
    END IF;
END $$;

