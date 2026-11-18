-- Attribution from the personal area: the site tells which promoter code (?s=) the visitor came with.
-- me_source(p_slug, p_code): sets source / source_code / promoter_id on the signed-in participant, ONLY when it has none yet. ok | none | auth ...
create or replace function roster.me_source(p_slug text, p_code text)
returns text language plpgsql security definer set search_path = roster, public as $fn$
declare r jsonb := roster.me_resolve(p_slug, true); st text := r->>'status'; b uuid := nullif(r->>'business_id', '')::uuid; pid uuid := nullif(r->>'participant_id', '')::uuid;
  sc text := lower(btrim(coalesce(p_code, ''))); prid uuid;
begin
  if st <> 'ok' then return roster.me_text(st); end if;
  if sc = '' or char_length(sc) > 40 or sc ~ '[[:cntrl:]]' then return 'none'; end if;
  select pr.id into prid from roster.promoters pr where pr.business_id = b and (lower(pr.code) = sc or sc = any (select lower(x) from unnest(coalesce(pr.codes, '{}'::text[])) x)) limit 1;
  if prid is null then   -- an unknown code is kept as it is (no promoter, source unchanged), only when there is none yet
    update roster.participants set source_code = sc where id = pid and business_id = b and promoter_id is null and coalesce(source_code, '') = '';
    return 'none';
  end if;
  update roster.participants set source = 'site-ad', source_code = sc, promoter_id = prid
   where id = pid and business_id = b and promoter_id is null and coalesce(source_code, '') = '';
  return 'ok';
end $fn$;
revoke all on function roster.me_source(text, text) from public, anon;
grant execute on function roster.me_source(text, text) to authenticated;
notify pgrst, 'reload schema';
