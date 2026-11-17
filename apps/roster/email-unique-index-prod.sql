-- LAST production step (owner's explicit yes, 2026-11-17, knowing it applies to every business including AUM): one email per participant inside a business.
-- Per business only: the same email is allowed in two different businesses. Run email-unique-index-precheck.sql first: every duplicate_emails must be 0.
-- Rows without an email are not in the index. Needs nothing else; email-unique-prod.sql (the guard trigger) does not depend on it.
create unique index if not exists roster_participants_email_uq on roster.participants (business_id, email) where email is not null and btrim(email) <> '';
