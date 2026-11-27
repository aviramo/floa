-- Checks for site-meetings.sql on the TEST schema, all in one transaction that is rolled back (nothing stays). From the repo root, in Git Bash:
--   (echo "begin;"; sed -E "s/([^'\"a-z_])roster\./\1\"roster-test\"./g; s/search_path = roster, public/search_path = \"roster-test\", public/g" apps/roster/site-meetings.sql; cat apps/roster/site-meetings.check.sql) | node scripts/sql.mjs --table
-- Expected: got = want on every row ("0 meetings to compare" only needs to be more than 0, or checks 1 to 3 say nothing).
-- Never on the schema roster as it is: check 10 writes (rolled back here). A production check keeps only the reading checks (1 to 5, 7, 9).
create temp table res(t text, got text, want text) on commit drop;
grant all on res to anon;

-- the newest unrevoked key of harpatka that is not secret: the one site_meetings picks
create temp table k(h text) on commit drop;
insert into k select a.key_hash from "roster-test".api_keys a join "roster-test".businesses b on b.id = a.business_id
 where b.slug = 'harpatka' and a.kind <> 'secret' and a.revoked_at is null order by a.created_at desc limit 1;

create temp table s(r jsonb) on commit drop; insert into s select "roster-test".site_meetings('harpatka', 100, 10);
create temp table a(r jsonb) on commit drop; insert into a select "roster-test".api_meetings_past((select h from k), 100, 10);
create temp table sm(n bigint, m jsonb) on commit drop; insert into sm select x.n, x.m from s, jsonb_array_elements(s.r -> 'meetings') with ordinality x(m, n);
create temp table am(n bigint, m jsonb) on commit drop; insert into am select x.n, x.m from a, jsonb_array_elements(a.r -> 'meetings') with ordinality x(m, n);

insert into res select '0 meetings to compare', (select count(*) from am)::text, '> 0';

-- 1. the same meetings in the same order as the API
insert into res select '1 same ids, same order as api_meetings_past',
  (coalesce((select string_agg(m ->> 'id', ',' order by n) from sm), '') = coalesce((select string_agg(m ->> 'id', ',' order by n) from am), ''))::text, 'true';

-- 2. the same value in each of the 12 public keys
insert into res select '2 values that differ in the 12 keys', count(*)::text, '0'
  from sm join am using (n)
  cross join unnest(array['id', 'date', 'time', 'name', 'city', 'place', 'capacity', 'spots_left', 'full', 'price', 'price_tiers', 'image']) kk(k)
 where sm.m -> kk.k is distinct from am.m -> kk.k;

-- 3. nothing outside the 12 public keys
insert into res select '3 keys outside the 12', count(*)::text, '0'
  from sm cross join lateral jsonb_object_keys(sm.m) j(k)
 where j.k <> all (array['id', 'date', 'time', 'name', 'city', 'place', 'capacity', 'spots_left', 'full', 'price', 'price_tiers', 'image']);

-- 4. business: exactly id and name, the name as the API gives it
insert into res select '4 business keys', (select string_agg(j.k, ',' order by j.k) from s cross join lateral jsonb_object_keys(s.r -> 'business') j(k)), 'id,name';
insert into res select '4 business name as the API', ((select r -> 'business' ->> 'name' from s) = (select r -> 'business' ->> 'name' from a))::text, 'true';

-- 5. an unknown slug
insert into res select '5 unknown slug', "roster-test".site_meetings('no-such-business-zz') ->> 'error', 'not_found';

-- 6. anon may call it
set local role anon;
insert into res select '6 called as anon', (select string_agg(j.k, ',' order by j.k) from jsonb_object_keys("roster-test".site_meetings('harpatka')) j(k)), 'business,meetings';
reset role;

-- 7. who may execute it
insert into res select '7 execute granted to',
  (select string_agg(distinct coalesce(r.rolname, 'PUBLIC'), ',' order by coalesce(r.rolname, 'PUBLIC'))
     from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     cross join lateral aclexplode(p.proacl) x
     left join pg_roles r on r.oid = x.grantee
    where ns.nspname = 'roster-test' and p.proname = 'site_meetings' and x.privilege_type = 'EXECUTE'), 'anon,authenticated,postgres';

-- 8. the copy reads its own schema
insert into res select '8 search_path of the copy',
  (select array_to_string(p.proconfig, ';') from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'roster-test' and p.proname = 'site_meetings'),
  'search_path="roster-test", public';

-- 9. the limits are the API's (limit 1..100, past 0..10)
insert into res select '9 at most 110 meetings', (jsonb_array_length("roster-test".site_meetings('harpatka', 1000, 50) -> 'meetings') <= 110)::text, 'true';

-- 10. LAST, because it writes (rolled back): no public key left, not_found
update "roster-test".api_keys set revoked_at = now()
 where business_id = (select id from "roster-test".businesses where slug = 'harpatka') and kind <> 'secret' and revoked_at is null;
insert into res select '10 every public key revoked', "roster-test".site_meetings('harpatka') ->> 'error', 'not_found';

select * from res;
rollback;
