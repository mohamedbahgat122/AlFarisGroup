-- Alter driver_resignations rating from numeric to enum character (A, B, C, D)
-- We drop the existing check constraint on rating (if it existed)
ALTER TABLE public.driver_resignations
  DROP CONSTRAINT IF EXISTS driver_resignations_rating_check;

-- Change the type and safely cast the existing numeric values to strings A/B/C/D
ALTER TABLE public.driver_resignations
  ALTER COLUMN rating TYPE text USING (
    CASE 
      WHEN rating IS NULL THEN NULL
      WHEN rating >= 4 THEN 'A'
      WHEN rating >= 3 THEN 'B'
      WHEN rating >= 2 THEN 'C'
      ELSE 'D'
    END
  );

-- Add a check constraint to enforce the allowed values
ALTER TABLE public.driver_resignations
  ADD CONSTRAINT driver_resignations_rating_check CHECK (rating IN ('A', 'B', 'C', 'D'));
