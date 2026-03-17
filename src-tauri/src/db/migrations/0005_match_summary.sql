-- 0005_match_summary.sql
-- Spec 0011 — Match and Index
-- Adds per-scan match quality counters to the scan_summary singleton.

ALTER TABLE scan_summary ADD COLUMN matched_count        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_summary ADD COLUMN low_confidence_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scan_summary ADD COLUMN missing_count        INTEGER NOT NULL DEFAULT 0;
