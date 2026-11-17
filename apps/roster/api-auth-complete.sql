-- PRODUCTION STEP: roster.api_auth gains ONE branch, p_bucket = 'complete' (the second step of a two-step signup, its own allowance). Every other bucket and every
-- answer is the production body, unchanged; nothing sends 'complete' until the Worker that does is deployed.
create or replace function roster.api_auth(p_key_hash text, p_required_kind text, p_origin text, p_ip_hash text, p_bucket text)
returns jsonb language plpgsql security definer set search_path = roster, public as $fn$
declare
  k roster.api_keys;
  need text := coalesce(nullif(p_required_kind, ''), 'any');
  origin text := lower(nullif(btrim(coalesce(p_origin, '')), ''));
  iph text := nullif(p_ip_hash, '');
  r1 int := 0; r2 int := 0;
begin
  k := roster.api_key_of(p_key_hash);
  if k.id is null then
    if iph is not null then
      r1 := roster.rate_take('badkey:' || iph, 10, 60);
      if r1 > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_after', r1); end if;
    end if;
    return jsonb_build_object('error', 'invalid_key');
  end if;
  if need in ('public', 'secret') and k.kind <> need then return jsonb_build_object('error', 'wrong_key_kind'); end if;
  if k.kind = 'secret' and origin is not null then return jsonb_build_object('error', 'secret_key_in_browser'); end if;
  if k.kind = 'public' and coalesce(cardinality(k.allowed_origins), 0) > 0 and (origin is null or not origin = any (k.allowed_origins)) then
    return jsonb_build_object('error', 'origin_not_allowed');
  end if;

  if k.kind = 'secret' then
    r1 := roster.rate_take('secret:' || k.id, 1, 600);
    if r1 > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_after', r1); end if;
  elsif p_bucket = 'signup' then
    if iph is not null then
      r1 := roster.rate_take('signup:ip:' || iph, 10, 6);
      if r1 > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_after', r1); end if;
    end if;
    r2 := roster.rate_take('signup:key:' || k.id, 60, 120);
    if r2 > 0 then
      if iph is not null then perform roster.rate_give_back('signup:ip:' || iph); end if;
      return jsonb_build_object('error', 'rate_limited', 'retry_after', r2);
    end if;
  elsif p_bucket = 'complete' then   -- the second step of a two-step signup (the details, by token): its own allowance, so the first step does not eat it
    if iph is not null then
      r1 := roster.rate_take('complete:ip:' || iph, 10, 20);
      if r1 > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_after', r1); end if;
    end if;
  elsif p_bucket = 'click' then
    if iph is not null then
      r1 := roster.rate_take('click:ip:' || iph, 10, 30);
      if r1 > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_after', r1); end if;
    end if;
  else
    if iph is not null then
      r1 := roster.rate_take('read:ip:' || k.id || ':' || iph, 1, 120);
      if r1 > 0 then return jsonb_build_object('error', 'rate_limited', 'retry_after', r1); end if;
    end if;
    r2 := roster.rate_take('read:key:' || k.id, 1, 300);
    if r2 > 0 then
      if iph is not null then perform roster.rate_give_back('read:ip:' || k.id || ':' || iph); end if;
      return jsonb_build_object('error', 'rate_limited', 'retry_after', r2);
    end if;
  end if;

  if random() < 0.02 then perform roster.rate_cleanup(); end if;
  update roster.api_keys set last_used_at = now() where id = k.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return jsonb_build_object('ok', true, 'kind', k.kind);
end $fn$;
revoke all on function roster.api_auth(text, text, text, text, text) from public, anon, authenticated;
grant execute on function roster.api_auth(text, text, text, text, text) to service_role;
