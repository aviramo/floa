-- site_meetings: the public meetings of one business, for its own site, read straight from the database (apps/roster/SITE.md).
-- The SAME answer as GET /roster/v1/meetings?limit=&past= with that business's public key: it calls api_meetings_past with the
-- newest unrevoked public key of the business and keeps only the public keys of a meeting, exactly like the Worker (PUBLIC_MEETING_KEYS).
-- NOT part of the /roster/v1/ API. Unknown slug, or a business without a public key: not_found.
-- Adds one function only: no existing function is replaced, and no answer of the API changes.
-- Written for the schema roster; every name is schema-qualified on purpose (the roster-test copy is made by text substitution):
--   sed -E "s/([^'\"a-z_])roster\./\1\"roster-test\"./g; s/search_path = roster, public/search_path = \"roster-test\", public/g" apps/roster/site-meetings.sql
-- Order: roster-test first (and apps/roster/site-meetings.check.sql passes), the schema roster only with the owner's explicit approval.
create or replace function roster.site_meetings(p_slug text, p_limit int default 20, p_past int default 0)
returns jsonb language plpgsql stable security definer set search_path = roster, public as $fn$
declare bz roster.businesses; kh text; r jsonb;
begin
  select * into bz from roster.businesses where slug = lower(btrim(coalesce(p_slug, '')));
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select k.key_hash into kh from roster.api_keys k
   where k.business_id = bz.id and k.kind <> 'secret' and k.revoked_at is null
   order by k.created_at desc limit 1;
  if kh is null then return jsonb_build_object('error', 'not_found'); end if;
  r := roster.api_meetings_past(kh, p_limit, p_past);
  if r ? 'error' or jsonb_typeof(r -> 'meetings') is distinct from 'array' then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object(
    'business', jsonb_build_object('name', r -> 'business' ->> 'name', 'id', bz.id),
    'meetings', coalesce((
      select jsonb_agg((select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(x.m) e
                         where e.key in ('id', 'date', 'time', 'name', 'city', 'place', 'capacity', 'spots_left', 'full', 'price', 'price_tiers', 'image'))
                       order by x.n)
        from jsonb_array_elements(r -> 'meetings') with ordinality x(m, n)), '[]'::jsonb));
end $fn$;
-- EXECUTE for anon and authenticated only. service_role is revoked too, in case default privileges of the schema handed it out: the Worker never calls this.
revoke all on function roster.site_meetings(text, int, int) from public, anon, authenticated, service_role;
grant execute on function roster.site_meetings(text, int, int) to anon, authenticated;
notify pgrst, 'reload schema';
