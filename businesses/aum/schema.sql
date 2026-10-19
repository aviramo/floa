-- ==========================================================================
-- AUM: משתתפים, מפגשים והרשמות, בדאטהבייס של הדומיין.
--
-- להריץ פעם אחת, כולו: node scripts/sql.mjs < businesses/aum/schema.sql
-- אפשר להריץ שוב בלי נזק. הטבלאות כולן `aum_*`: טבלה שייכת לעסק אחד.
--
-- מי רואה מה:
--   * מנהל מחובר (מייל ב-aum_admins, כניסה עם גוגל של floa): הכול.
--   * מבקר באתר (anon): שום טבלה. שתי פונקציות בלבד:
--       aum_next()    המפגש הקרוב ומספר הנרשמים, בלי אף שם
--       aum_signup()  הרשמה מהטופס: שם, טלפון, גיל ומגדר (נכתבת ל-aum_participants)
-- ==========================================================================

-- 1. טבלאות
create table if not exists public.aum_events (
  id          uuid primary key default gen_random_uuid(),
  event_date  date not null,
  start_time  time not null default '09:00',
  end_time    time not null default '16:00',
  title       text not null default 'ריטריט AUM',
  location    text not null default 'גדרה',
  price       int,                              -- ב-₪; ריק = המחיר לא מוצג
  price_pair  int,                              -- ב-₪, לשניים שבאים יחד; ריק = לא מוצג
  capacity    int,                              -- ריק = בלי הגבלה
  created_at  timestamptz not null default now()
);
create unique index if not exists aum_events_dt_uq on public.aum_events (event_date, start_time);

create table if not exists public.aum_participants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null default '',
  phone_norm  text not null default '',
  first_time  boolean not null default false,   -- היה בטופס הישן. נשאר בטבלה, כבר לא נאסף
  gender      text check (gender in ('male', 'female')),
  age         int,                              -- הגיל כפי שהוקלד. המוצג = age + שנים מלאות מאז age_set_at
  age_set_at  date not null default current_date,
  source      text not null default '',
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.aum_registrations (
  participant_id  uuid not null references public.aum_participants(id) on delete cascade,
  event_id        uuid not null references public.aum_events(id) on delete cascade,
  status          text not null default 'new' check (status in ('new', 'confirmed', 'waitlist', 'cancelled')),
  paid            boolean not null default false,
  pay_requested_at timestamptz,                  -- נשלחה בקשת תשלום (סטטוס "בבדיקה")
  exempt          boolean not null default false, -- לא משלם (נרשם בחינם ביודעין)
  created_at      timestamptz not null default now(),
  primary key (participant_id, event_id)
);

-- נוספו אחרי הגרסה הראשונה. בטוח להרצה חוזרת
alter table public.aum_events        add column if not exists price_pair int;
alter table public.aum_participants  add column if not exists gender text check (gender in ('male', 'female'));
alter table public.aum_participants  add column if not exists age int;
alter table public.aum_participants  add column if not exists age_set_at date not null default current_date;
alter table public.aum_registrations add column if not exists pay_requested_at timestamptz;
alter table public.aum_registrations add column if not exists exempt boolean not null default false;

-- הערות על משתתפים (כמו CRM): כמה הערות לכל משתתף, עם מי כתב ומתי
create table if not exists public.aum_notes (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.aum_participants(id) on delete cascade,
  body           text not null,
  author_email   text,
  author_name    text,
  created_at     timestamptz not null default now()
);
create index if not exists aum_notes_participant_idx on public.aum_notes (participant_id, created_at desc);
alter table public.aum_notes enable row level security;

-- הערה היא טקסט או צילום מסך (תמונה דחוסה ב-image כ-data URL), אחד מהשניים
alter table public.aum_notes add column if not exists image text;
alter table public.aum_notes alter column body set default '';
alter table public.aum_notes add column if not exists has_image boolean generated always as (image is not null) stored;
do $$ begin
  alter table public.aum_notes add constraint aum_notes_content check (coalesce(btrim(body), '') <> '' or image is not null);
exception when duplicate_object then null;
end $$;

-- העברת ההערה הקצרה הישנה (aum_participants.note) להערה ראשונה, פעם אחת בלבד
insert into public.aum_notes (participant_id, body, author_name)
select p.id, trim(p.note), 'מערכת'
from public.aum_participants p
where coalesce(trim(p.note), '') <> ''
  and not exists (select 1 from public.aum_notes n where n.participant_id = p.id);

alter table public.aum_events        enable row level security;
alter table public.aum_participants  enable row level security;
alter table public.aum_registrations enable row level security;

-- 2. נרמול טלפונים (E.164). אותה לוגיקה בדיוק כמו normPhone ב-public/index.html
create or replace function public.aum_normalize_phone(p text)
returns text language plpgsql immutable as $$
declare
  raw  text := trim(coalesce(p, ''));
  plus boolean;
  d    text;
begin
  if raw = '' then return ''; end if;
  plus := left(raw, 1) = '+';
  d := regexp_replace(raw, '\D', '', 'g');
  if d = '' then return ''; end if;
  if left(d, 2) = '00' then plus := true; d := substr(d, 3); end if;
  if plus then
    if left(d, 4) = '9720' then d := '972' || substr(d, 5); end if;
    if length(d) < 8 or length(d) > 15 or left(d, 1) = '0' then return ''; end if;
    if left(d, 3) = '972' and substr(d, 4) !~ '^(5\d{8}|7\d{8}|[23489]\d{7})$' then return ''; end if;
    return '+' || d;
  end if;
  if left(d, 1) = '0' then
    if d ~ '^0(5\d{8}|7\d{8}|[23489]\d{7})$' then return '+972' || substr(d, 2); end if;
    return '';
  end if;
  return '';
end $$;

create or replace function public.aum_participants_phone_trg()
returns trigger language plpgsql as $$
begin
  new.phone_norm := public.aum_normalize_phone(new.phone);
  return new;
end $$;

drop trigger if exists aum_participants_phone on public.aum_participants;
create trigger aum_participants_phone
  before insert or update of phone on public.aum_participants
  for each row execute function public.aum_participants_phone_trg();

create unique index if not exists aum_participants_phone_norm_uq
  on public.aum_participants (phone_norm) where phone_norm <> '';

-- 3. מנהלים
create table if not exists public.aum_admins (email text primary key);
alter table public.aum_admins enable row level security;      -- בלי מדיניות: אף אחד לא קורא ישירות
revoke all on public.aum_admins from anon, authenticated;
insert into public.aum_admins (email) values ('ofir.aviram@gmail.com'), ('tal.amitai1@gmail.com') on conflict do nothing;
-- להוספת מנהל/ת: insert into public.aum_admins (email) values ('name@gmail.com');

create or replace function public.aum_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.aum_admins a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.aum_is_admin() from public;
grant execute on function public.aum_is_admin() to anon, authenticated;

-- 4. מדיניות: מנהלים הכול, מבקרים כלום
drop policy if exists "aum admin all" on public.aum_events;
drop policy if exists "aum admin all" on public.aum_participants;
drop policy if exists "aum admin all" on public.aum_registrations;
create policy "aum admin all" on public.aum_events        for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin());
create policy "aum admin all" on public.aum_participants  for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin());
create policy "aum admin all" on public.aum_registrations for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin());
drop policy if exists "aum admin all" on public.aum_notes;
create policy "aum admin all" on public.aum_notes         for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin());

revoke all on public.aum_events, public.aum_participants, public.aum_registrations, public.aum_notes from anon;
grant select, insert, update, delete on public.aum_events, public.aum_participants, public.aum_registrations, public.aum_notes to authenticated;

-- 5. המפגש הקרוב, לבאנר: תאריך, מקום, מחיר ומקומות, בלי אף פרט של אדם.
--    "הקרוב" = התאריך הקרוב ביותר שעוד לא עבר, בשעון ישראל.
--    taken סופר את מי שלא ביטל (רשימת המתנה לא נספרת כמקום תפוס).
create or replace function public.aum_next()
returns json language sql stable security definer set search_path = public as $$
  select coalesce((
    select json_build_object(
      'date', e.event_date, 'from', to_char(e.start_time, 'HH24:MI'), 'to', to_char(e.end_time, 'HH24:MI'),
      'title', e.title, 'location', e.location, 'price', e.price, 'price_pair', e.price_pair, 'capacity', e.capacity,
      'taken', (select count(*) from public.aum_registrations r
                where r.event_id = e.id and r.status in ('new', 'confirmed')))
    from public.aum_events e
    where e.event_date >= (now() at time zone 'Asia/Jerusalem')::date
    order by e.event_date, e.start_time limit 1
  ), 'null'::json);
$$;
revoke all on function public.aum_next() from public;
grant execute on function public.aum_next() to anon, authenticated;

-- 5ב. התראת מייל לטל על כל הרשמה חדשה מהטופס, באותו אופן כמו ביוצאים להרפתקה:
--     pg_net קורא ל-Google Apps Script (notify-apps-script.gs) שמייצר מייל אחד.
--     ההגדרה (URL וטוקן) בטבלת aum_settings. בלי הגדרה: אין מייל, וההרשמה עוברת כרגיל.
--     המייל נשלח רק כשנוצר משתתף חדש (לא על כפילות של אותו טלפון), וכשל בו לא מפיל את ההרשמה.
create extension if not exists pg_net;

create table if not exists public.aum_settings (key text primary key, value text not null default '');
alter table public.aum_settings enable row level security;          -- בלי מדיניות: רק פונקציות security definer קוראות
revoke all on public.aum_settings from anon, authenticated;

create or replace function public.aum_notify_signup(p_name text, p_phone text, p_age int, p_gender text, p_edate date, p_etime time, p_pid uuid, p_eid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare u text; tok text;
begin
  select value into u   from public.aum_settings where key = 'notify_url';
  select value into tok from public.aum_settings where key = 'notify_token';
  if coalesce(u, '') = '' then return; end if;
  perform net.http_post(
    url     := u,
    body    := jsonb_build_object('token', tok, 'name', p_name, 'phone', p_phone, 'age', p_age, 'gender', p_gender,
                                  'meeting_date', p_edate, 'meeting_time', to_char(p_etime, 'HH24:MI'), 'created_at', now(),
                                  'participant_id', p_pid, 'meeting_id', p_eid),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 30000
  );
exception when others then
  null;   -- התראה שנכשלה לא מפילה את ההרשמה
end $$;
revoke all on function public.aum_notify_signup(text, text, int, text, date, time, uuid, uuid) from public, anon, authenticated;

-- 6. הרשמה מהאתר (הטופס שנפתח מ"אני רוצה לחוות"). מחזירה:
--    created | exists | invalid_name | invalid_phone | invalid_age | invalid_gender
--    נקשרת למפגש הקרוב. מפגש מלא (capacity) מכניס לרשימת המתנה, והמבקר לא
--    צריך לדעת: בשני המקרים טל חוזרת אליו. מספר שכבר קיים לא נחשף ("exists").
--    p_src = 'p' מסמן הגעה ממודעה בתשלום (?s=p בכתובת): source = 'site-ad'.
drop function if exists public.aum_signup(text, text, boolean);   -- הגרסה הישנה
create or replace function public.aum_signup(p_name text, p_phone text, p_age int, p_gender text, p_src text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  n    text := public.aum_normalize_phone(p_phone);
  nm   text := trim(coalesce(p_name, ''));
  src  text := case when p_src = 'p' then 'site-ad' else 'site' end;
  pid  uuid;
  ev   public.aum_events;
  res  text := 'created';
  st   text := 'new';
begin
  if char_length(nm) < 2 or char_length(nm) > 60 then return 'invalid_name'; end if;
  if n = '' then return 'invalid_phone'; end if;
  if p_age is null or p_age < 18 or p_age > 99 then return 'invalid_age'; end if;
  if p_gender is null or p_gender not in ('male', 'female') then return 'invalid_gender'; end if;

  select * into ev from public.aum_events
    where event_date >= (now() at time zone 'Asia/Jerusalem')::date
    order by event_date, start_time limit 1;

  select id into pid from public.aum_participants where phone_norm = n limit 1;
  if pid is not null then
    res := 'exists';
    update public.aum_participants set age = p_age, age_set_at = current_date where id = pid and age is null;
    update public.aum_participants set gender = p_gender where id = pid and gender is null;
  else
    begin
      insert into public.aum_participants (name, phone, age, age_set_at, gender, source)
        values (nm, n, p_age, current_date, p_gender, src)   -- phone_norm נקבע בטריגר
        returning id into pid;
    exception when unique_violation then
      select id into pid from public.aum_participants where phone_norm = n limit 1;
      res := 'exists';
    end;
  end if;

  if ev.id is not null and pid is not null then
    if ev.capacity is not null and (select count(*) from public.aum_registrations r
         where r.event_id = ev.id and r.status in ('new', 'confirmed')) >= ev.capacity then
      st := 'waitlist';
    end if;
    insert into public.aum_registrations (participant_id, event_id, status) values (pid, ev.id, st)
      on conflict (participant_id, event_id) do nothing;
  end if;

  if res = 'created' then
    perform public.aum_notify_signup(nm, n, p_age, p_gender, ev.event_date, ev.start_time, pid, ev.id);
  end if;
  return res;
end $$;
revoke all on function public.aum_signup(text, text, int, text, text) from public;
grant execute on function public.aum_signup(text, text, int, text, text) to anon, authenticated;

-- 7. זמן אמת בדף הניהול (Realtime מכבד RLS: רק מנהל מחובר מקבל שינויים)
do $$
declare t text;
begin
  foreach t in array array['aum_events', 'aum_participants', 'aum_registrations', 'aum_notes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 8. הריטריט הראשון: שבת 10.10.2026, 9:00 עד 16:00, 300 ₪ ליום.
--    on conflict: הרצה חוזרת של הקובץ לא דורסת מחיר או קיבולת שעודכנו בדף הניהול.
insert into public.aum_events (event_date, start_time, end_time, title, location, price)
  values ('2026-10-10', '09:00', '16:00', 'ריטריט AUM', 'בית כאן ועכשיו, פינס 44, גדרה', 300)
  on conflict do nothing;

notify pgrst, 'reload schema';

-- ==========================================================================
-- אחרי שפרסמת את ה-Apps Script (notify-apps-script.gs): להריץ שורה אחת (עם הערכים שלך):
--
--   insert into public.aum_settings (key, value) values
--     ('notify_url',   'https://script.google.com/macros/s/XXXXXXXX/exec'),
--     ('notify_token', 'סיסמה-אקראית-ארוכה')
--   on conflict (key) do update set value = excluded.value;
--
-- הטוקן חייב להיות זהה ל-NOTIFY_TOKEN ב-Script Properties של ה-Apps Script.
-- לכיבוי ההתראות: delete from public.aum_settings where key = 'notify_url';
-- ==========================================================================
