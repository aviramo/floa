-- PRODUCTION STEP, run first. Additive only, safe to re-run. Nothing here changes what an existing business sees or does.
--  * participants.source, participants.source_code, promoters.code, promoters.codes: attribution columns that roster-test already has and production lacks
--    (used by api-phone-signup.sql and me-source.sql). Nullable, no default: every existing row stays as it is.
--  * business_settings.email_link and business_settings.realtime: per-business switches, boolean not null. email_link defaults to true (production
--    has it on for every business); realtime defaults to false. A business with a switch off never reaches the new branches of me-email-prod.sql,
--    member-email-prod.sql, email-unique-prod.sql and realtime-prod.sql.
alter table roster.participants add column if not exists source text;
alter table roster.participants add column if not exists source_code text;
alter table roster.promoters add column if not exists code text;
alter table roster.promoters add column if not exists codes text[];
alter table roster.business_settings add column if not exists email_link boolean not null default true;
alter table roster.business_settings add column if not exists realtime boolean not null default false;
