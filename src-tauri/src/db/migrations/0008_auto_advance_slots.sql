-- 0008_auto_advance_slots.sql
-- Adds the auto_advance_slots boolean to app_settings.
-- When true, the player automatically loads the next slot when the last cut ends.

ALTER TABLE app_settings ADD COLUMN auto_advance_slots INTEGER NOT NULL DEFAULT 1;
