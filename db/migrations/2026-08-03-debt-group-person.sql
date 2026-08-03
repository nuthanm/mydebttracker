-- Add optional group person label to debts.
-- Run once in Neon SQL editor.

ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS group_person_name TEXT;
