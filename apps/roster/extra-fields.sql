-- Extra signup fields (owner approved the exact contract 2026-11-22): POST /signup may carry an optional list
--   "extra_fields": [ { "key": "diet", "label": "העדפת אוכל", "value": "צמחוני" }, ... ]
-- Additive only. api_signup, api_signup_phone and api_signup_complete are NOT replaced; nothing changes for a call without the field.
-- Applied to the schema "roster" and, with `roster.` -> `"roster-test".`, to "roster-test".
--
--   participants.extra_fields jsonb        null for everybody who has none; else the cleaned list (at most 20 entries)
--   api_signup_extra(key, payload, ip)     checks the list, then runs api_signup unchanged (the list is handed over in a
--                                          transaction-local setting). Only a call that carries the field reaches it.
--   a BEFORE INSERT trigger                writes the list on a participant that THIS public signup creates. A participant
--                                          that already exists is never changed by a public call (same promise as api_signup).
--   an AFTER INSERT trigger                one system note on the new participant ("label: value" lines), so the admin
--                                          page shows it in the participant's card without any new element.
--   participant_json                       adds "extra_fields" only when the participant has some, so every answer and event
--                                          about a participant without them is byte for byte what it was.
-- Never returned by a public key, never shown on the public pages or in the personal area's own data except as the
-- participant_json already travels (secret API, webhooks, admin).

alter table roster.participants add column if not exists extra_fields jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'roster_participants_extra_fields_shape' and conrelid = 'roster.participants'::regclass) then
    alter table roster.participants add constraint roster_participants_extra_fields_shape
      check (extra_fields is null or (jsonb_typeof(extra_fields) = 'array' and jsonb_array_length(extra_fields) between 1 and 20));
  end if;
end $$;

-- the cleaned list, or null when it is not a valid list (shape, sizes, control characters, duplicate keys)
create or replace function roster.clean_extra_fields(p jsonb)
returns jsonb language plpgsql immutable as $fn$
declare e jsonb; k text; l text; v text; out jsonb := '[]'::jsonb; seen text[] := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 or jsonb_array_length(p) > 20 then return null; end if;
  for e in select x from jsonb_array_elements(p) x loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'key') is distinct from 'string' or jsonb_typeof(e->'label') is distinct from 'string'
       or jsonb_typeof(e->'value') is distinct from 'string' then return null; end if;
    k := e->>'key'; l := btrim(e->>'label'); v := btrim(e->>'value');
    if k !~ '^[a-z0-9_]{1,40}$' or k = any (seen) then return null; end if;
    if l = '' or char_length(l) > 100 or l ~ '[[:cntrl:]]' then return null; end if;
    if char_length(v) > 500 or v ~ '[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]' then return null; end if;
    seen := seen || k;
    if v <> '' then out := out || jsonb_build_array(jsonb_build_object('key', k, 'label', l, 'value', v)); end if;   -- an empty value is simply not sent
  end loop;
  return case when jsonb_array_length(out) = 0 then '[]'::jsonb else out end;
end $fn$;

create or replace function roster.api_signup_extra(p_key_hash text, p_payload jsonb, p_ip_hash text default null)
returns jsonb language plpgsql security definer set search_path = roster, public as $fn$
declare k roster.api_keys; pl jsonb; clean jsonb; r jsonb;
begin
  k := roster.api_key_of(p_key_hash);
  if k.id is null then return jsonb_build_object('error', 'invalid_key'); end if;   -- the key first: a bad key learns nothing about the field
  pl := case when jsonb_typeof(p_payload) = 'object' then p_payload else '{}'::jsonb end;
  clean := roster.clean_extra_fields(pl->'extra_fields');
  if clean is null then return jsonb_build_object('error', 'validation', 'field', 'extra_fields'); end if;
  perform set_config('roster.extra_fields', case when jsonb_array_length(clean) > 0 then clean::text else '' end, true);
  r := roster.api_signup(p_key_hash, pl - 'extra_fields', p_ip_hash);
  perform set_config('roster.extra_fields', '', true);
  return r;
end $fn$;

create or replace function roster.participant_extra_fields()
returns trigger language plpgsql security definer set search_path = roster, public as $fn$
declare x text := nullif(current_setting('roster.extra_fields', true), '');
begin
  if x is not null and coalesce(current_setting('roster.source', true), '') = 'api' then
    new.extra_fields := x::jsonb;
  end if;
  return new;
end $fn$;
drop trigger if exists roster_participants_extra_fields on roster.participants;
create trigger roster_participants_extra_fields before insert on roster.participants
  for each row execute function roster.participant_extra_fields();

create or replace function roster.participant_extra_note()
returns trigger language plpgsql security definer set search_path = roster, public as $fn$
begin
  if new.extra_fields is not null then
    perform roster.sys_note(new.business_id, new.id,
      (select string_agg((e->>'label') || ': ' || (e->>'value'), E'\n') from jsonb_array_elements(new.extra_fields) e));
  end if;
  return new;
end $fn$;
drop trigger if exists roster_participants_extra_note on roster.participants;
create trigger roster_participants_extra_note after insert on roster.participants
  for each row execute function roster.participant_extra_note();

create or replace function roster.participant_json(p roster.participants)
returns jsonb language sql stable as $fn$
  select jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'phone', p.phone, 'email', p.email, 'address', p.address,
    'age', roster.current_age(p.age, p.age_set_at), 'gender', p.gender)
    || case when p.extra_fields is null then '{}'::jsonb else jsonb_build_object('extra_fields', p.extra_fields) end;
$fn$;

revoke all on function roster.clean_extra_fields(jsonb)                    from public, anon, authenticated;
revoke all on function roster.api_signup_extra(text, jsonb, text)          from public, anon, authenticated;
revoke all on function roster.participant_extra_fields()                   from public, anon, authenticated;
revoke all on function roster.participant_extra_note()                     from public, anon, authenticated;
grant execute on function roster.api_signup_extra(text, jsonb, text)       to service_role;
