-- Harpatka gap file 1 (additions only, run on production roster; safe to re-run).
-- Two new nullable text columns for the picture of a meeting and of a meeting type. No default, no constraint, no existing
-- function changes with them (a function that reads them is prod-harpatka-meeting-json.sql, a separate step).
-- For every business that has no picture nothing changes: the columns are empty and nothing reads them yet.
alter table roster.meetings      add column if not exists image_url text;
alter table roster.meeting_types add column if not exists image_url text;
