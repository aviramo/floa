# Production order (schema `roster`), one file at a time, each in one transaction

Iron law: no existing business (AUM) changes. Run only these repo files, never copy from roster-test.

| # | File | What it does | For a business with the switch off |
|---|------|--------------|------------------------------------|
| 0 | `storage.sql` | bucket `roster-media` + 3 policies | done in production 2026-11-17 |
| 1 | `prod-columns.sql` | participants.source, source_code; promoters.code, codes; business_settings.email_link, realtime (boolean, default false) | nothing: new nullable columns, switches off |
| 2 | `api-meetings-past.sql` | new function api_meetings_past (api_meetings untouched) | nothing: nobody calls it until the Worker is deployed |
| 3 | `api-auth-complete.sql` | api_auth + branch `p_bucket = 'complete'` | identical answers; nothing sends 'complete' yet |
| 4 | `api-phone-signup.sql` | new functions api_signup_phone / api_signup_complete | nothing: not called by existing flows |
| 5 | `me-source.sql` | new function me_source | nothing: not called by existing pages |
| 6 | `me-email-prod.sql` | member_links table, me_link_email, me (+ one guarded branch) | me answers exactly as before (branch needs email_link) |
| 7 | `member-email-prod.sql` | trigger on members (no backfill) | trigger returns at once |
| 8 | `email-unique-prod.sql` | guard trigger on participants, NO unique index | trigger returns at once (no normalising, no check) |
| 9 | `realtime-prod.sql` | rt_ping trigger on 5 tables | trigger returns before doing anything |
| 10 | `email-unique-index-precheck.sql` then `email-unique-index-prod.sql` | read-only check that no business has duplicate emails, then the unique index (business_id, email); owner approved it for every business including AUM (2026-11-17) | AUM has no emails today, so the index holds nothing; only a future duplicate email in one business is refused. LAST step, only if every duplicate_emails is 0 |
| 11 | `site-meetings.sql` | one file, adds one function only (site_meetings, EXECUTE for anon and authenticated), no existing function is replaced (apps/roster/SITE.md) | for AUM no answer of the API changes. PENDING the owner's explicit approval; roster-test first, with site-meetings.check.sql passing, and AUM's GET /meetings compared before and after |

Then, per business that should use them: `update roster.business_settings set email_link = true, realtime = true where business_id = (select id from roster.businesses where slug = '<slug>')`.

The unique index `roster_participants_email_uq` is step 10 (last), a separate file, run only after the read-only pre-check shows no duplicates anywhere. It also applies to businesses with the switch off (owner's explicit decision).

`schema.sql` keeps the unflagged originals (for a fresh install); roster-test has these flagged versions applied, with email_link and realtime on for harpatka only.
