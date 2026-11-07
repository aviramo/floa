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
-- "מחיקת משתתף" בדף הניהול היא active=false: מוסתר מכל המסכים, והנתונים נשמרים ויחזרו אם יירשם שוב עם אותו טלפון
alter table public.aum_participants  add column if not exists active boolean not null default true;
alter table public.aum_participants  add column if not exists no_pay boolean not null default false;   -- מארגן, אורח או פטור: לא משלם על מפגשים
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
      'title', e.title, 'name', e.name, 'location', e.location,
      -- מדרגות מחיר לכל מפגש (price_tiers = { base, steps: [{ days, price }] }): המחיר הנוכחי לפי כמה ימים נשארו.
      -- שלב חל כשנשארו עד days ימים; בין כמה שלבים חל זה שמתחיל הכי קרוב למפגש. בלי מדרגות: המחיר של המפגש עצמו
      'price', coalesce((select (st ->> 'price')::int from jsonb_array_elements(coalesce(e.price_tiers -> 'steps', '[]'::jsonb)) st
                         where (e.event_date - (now() at time zone 'Asia/Jerusalem')::date) <= (st ->> 'days')::int
                         order by (st ->> 'days')::int asc limit 1),
                        (e.price_tiers ->> 'base')::int, e.price),
      'tiers', e.price_tiers,
      'price_pair', e.price_pair, 'capacity', e.capacity,
      'taken', (select count(*) from public.aum_registrations r
                where r.event_id = e.id and r.status in ('new', 'confirmed')))
    from public.aum_events e
    where e.event_date >= (now() at time zone 'Asia/Jerusalem')::date
    order by e.event_date, e.start_time limit 1
  ), 'null'::json);
$$;
revoke all on function public.aum_next() from public;
grant execute on function public.aum_next() to anon, authenticated;

-- 5ב. התראת דפדפן (Web Push) למנהלים על כל הרשמה חדשה מהטופס.
--     המנהל לוחץ על פעמון בדף הניהול ומאשר התראות, והדפדפן שלו נשמר ב-aum_push_subs.
--     ההרשמה קוראת (pg_net) ל-Worker ב-/aum-push עם הכתובות האלה, וה-Worker דוחף.
--     ההגדרה (כתובת ה-Worker, טוקן, מפתח VAPID ציבורי) בטבלת aum_settings.
--     בלי הגדרה: אין התראה, וההרשמה עוברת כרגיל. התראה שנכשלה לא מפילה את ההרשמה.
--     ההתראה נשלחת רק כשנוצר משתתף חדש (לא על כפילות של אותו טלפון).
create extension if not exists pg_net;

create table if not exists public.aum_settings (key text primary key, value text not null default '');
alter table public.aum_settings enable row level security;          -- בלי מדיניות: רק פונקציות security definer קוראות
revoke all on public.aum_settings from anon, authenticated;

create table if not exists public.aum_push_subs (
  endpoint   text primary key,
  p256dh     text not null default '',
  auth       text not null default '',
  email      text not null default '',
  created_at timestamptz not null default now()
);
alter table public.aum_push_subs enable row level security;
drop policy if exists "aum admin all" on public.aum_push_subs;
create policy "aum admin all" on public.aum_push_subs for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin());
revoke all on public.aum_push_subs from anon;
grant select, insert, update, delete on public.aum_push_subs to authenticated;

-- המפתח הציבורי שהדפדפן נרשם מולו. רק מנהל מקבל אותו.
create or replace function public.aum_push_key()
returns text language sql stable security definer set search_path = public as $$
  select case when public.aum_is_admin() then (select value from public.aum_settings where key = 'vapid_public') end;
$$;
revoke all on function public.aum_push_key() from public;
grant execute on function public.aum_push_key() to authenticated;

drop function if exists public.aum_notify_signup(text, text, int, text, date, time, uuid, uuid);
create or replace function public.aum_notify_signup()
returns void language plpgsql security definer set search_path = public as $$
declare u text; tok text; eps jsonb;
begin
  select value into u   from public.aum_settings where key = 'notify_url';
  select value into tok from public.aum_settings where key = 'notify_token';
  if coalesce(u, '') = '' then return; end if;
  select coalesce(jsonb_agg(endpoint), '[]'::jsonb) into eps from public.aum_push_subs;
  if eps = '[]'::jsonb then return; end if;
  perform net.http_post(
    url     := u,
    body    := jsonb_build_object('token', tok, 'endpoints', eps),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 30000
  );
exception when others then
  null;   -- התראה שנכשלה לא מפילה את ההרשמה
end $$;
revoke all on function public.aum_notify_signup() from public, anon, authenticated;

-- 6. הרשמה מהאתר (הטופס שנפתח מ"אני רוצה לחוות"). מחזירה:
--    created | exists | invalid_name | invalid_phone | invalid_age | invalid_gender
--    נקשרת למפגש הקרוב. מפגש מלא (capacity) מכניס לרשימת המתנה, והמבקר לא
--    צריך לדעת: בשני המקרים טל חוזרת אליו. מספר שכבר קיים לא נחשף ("exists").
--    p_src = 'p' מסמן הגעה ממודעה בתשלום (?s=p בכתובת): source = 'site-ad'.
drop function if exists public.aum_signup(text, text, boolean);   -- הגרסה הישנה
-- 22: שם פרטי ושם משפחה בנפרד (p_first, p_last). p_name נשאר לתאימות עם דפים שבמטמון של הדפדפן
drop function if exists public.aum_signup(text, text, int, text, text);
create or replace function public.aum_signup(p_name text default null, p_phone text default null, p_age int default null, p_gender text default null, p_src text default null, p_first text default null, p_last text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  n    text := public.aum_normalize_phone(p_phone);
  nm   text := coalesce(nullif(trim(concat_ws(' ', regexp_replace(trim(coalesce(p_first, '')), '\s+', ' ', 'g'), regexp_replace(trim(coalesce(p_last, '')), '\s+', ' ', 'g'))), ''), regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
  src  text := case when p_src = 'p' then 'site-ad' else 'site' end;
  code text := nullif(lower(left(regexp_replace(coalesce(p_src, ''), '[^a-zA-Z0-9_-]', '', 'g'), 20)), '');   -- קוד דרך ההגעה מהקישור ?s=קוד
  pid  uuid;
  ev   public.aum_events;
  act  boolean;
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

  select id, active into pid, act from public.aum_participants where phone_norm = n limit 1;
  if pid is not null then
    -- הטלפון הוא המפתח: משתתף לא פעיל (הוסר) חוזר להיות פעיל בלי לעדכן את שאר השדות
    if act then
      res := 'exists';
      update public.aum_participants set age = p_age, age_set_at = current_date where id = pid and age is null;
      update public.aum_participants set gender = p_gender where id = pid and gender is null;
    else
      update public.aum_participants set active = true where id = pid;
    end if;
  else
    begin
      insert into public.aum_participants (name, phone, age, age_set_at, gender, source, source_code)
        values (nm, n, p_age, current_date, p_gender, src, code)   -- phone_norm נקבע בטריגר
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
    perform public.aum_notify_signup();
  end if;
  return res;
end $$;
revoke all on function public.aum_signup(text, text, int, text, text, text, text) from public;
grant execute on function public.aum_signup(text, text, int, text, text, text, text) to anon, authenticated;

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

-- 9. יחצנים, תשלומים והגעה: אותה מערכת ניהול כמו ביוצאים להרפתקה, על הטבלאות של AUM.
--    תשלום הוא שורה ביומן (payment / refund / credit), לא רק סימון "שולם".
create table if not exists public.aum_promoters (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  rate_type  text not null default 'fixed' check (rate_type in ('fixed', 'percent')),   -- fixed = סכום קבוע בשקלים, percent = אחוז מהתשלום
  rate       numeric not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.aum_promoter_payments (
  id          uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references public.aum_promoters(id) on delete cascade,
  amount      numeric not null check (amount > 0),
  paid_at     date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists aum_promoter_payments_idx on public.aum_promoter_payments (promoter_id, paid_at desc);

alter table public.aum_participants  add column if not exists promoter_id uuid references public.aum_promoters(id) on delete set null;
alter table public.aum_registrations add column if not exists paid_amount numeric;
alter table public.aum_registrations add column if not exists promoter_id uuid references public.aum_promoters(id) on delete set null;
alter table public.aum_registrations add column if not exists commission numeric;
alter table public.aum_registrations add column if not exists paid_at timestamptz;
alter table public.aum_registrations add column if not exists attended boolean not null default false;
alter table public.aum_registrations add column if not exists attended_at timestamptz;

create table if not exists public.aum_payments (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.aum_participants(id) on delete cascade,
  meeting_id     uuid references public.aum_events(id) on delete set null,
  kind           text not null check (kind in ('payment', 'refund', 'credit')),
  amount         numeric not null default 0,   -- תמיד חיובי; החזר = כסף שחזר למשתתף
  from_credit    boolean not null default false,
  promoter_id    uuid references public.aum_promoters(id) on delete set null,
  commission     numeric,                      -- תמיד חיובי; בהחזר = העמלה שמבוטלת
  author_name    text,
  created_at     timestamptz not null default now()
);
create index if not exists aum_payments_p_idx  on public.aum_payments (participant_id, created_at desc);
create index if not exists aum_payments_pr_idx on public.aum_payments (promoter_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['aum_promoters', 'aum_promoter_payments', 'aum_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "aum admin all" on public.%I', t);
    execute format('create policy "aum admin all" on public.%I for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- תשלומים שכבר סומנו "שולם" לפני יומן התשלומים נכנסים אליו פעם אחת, במחיר הריטריט שלהם
insert into public.aum_payments (participant_id, meeting_id, kind, amount, promoter_id, commission, author_name, created_at)
select r.participant_id, r.event_id, 'payment', coalesce(r.paid_amount, e.price, 0), r.promoter_id, r.commission, 'מערכת', coalesce(r.paid_at, r.created_at, now())
from public.aum_registrations r join public.aum_events e on e.id = r.event_id
where r.paid = true and r.exempt = false
  and not exists (select 1 from public.aum_payments);

-- 10. כספים: הוצאות והכנסות שאינן תשלומי משתתפים (חד פעמיות או מחזוריות), עם יומן שינויים.
--     כל התנועות נרשמות על טל (by_email), המנהלת היחידה בכספים. הוספה בלבד: שום טבלה קיימת לא משתנה.
create table if not exists public.aum_finance (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('expense', 'income')),
  amount     numeric(10, 2) not null check (amount > 0),
  entry_date date not null default current_date,
  title      text not null,
  meeting_id uuid references public.aum_events(id) on delete set null,
  by_email   text not null default 'tal.amitai1@gmail.com',
  created_at timestamptz not null default now()
);
create table if not exists public.aum_finance_recurring (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('expense', 'income')),
  amount     numeric(10, 2) not null check (amount > 0),
  title      text not null,
  period     text not null check (period in ('weekly', 'monthly', 'yearly')),
  start_date date not null default current_date,
  end_date   date,
  active     boolean not null default true,
  by_email   text not null default 'tal.amitai1@gmail.com',
  created_at timestamptz not null default now()
);
create table if not exists public.aum_finance_log (
  id        uuid primary key default gen_random_uuid(),
  at        timestamptz not null default now(),
  actor     text,
  action    text not null,
  entity    text not null,
  entity_id uuid,
  summary   text not null
);

do $$
declare t text;
begin
  foreach t in array array['aum_finance', 'aum_finance_recurring'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "aum admin all" on public.%I', t);
    execute format('create policy "aum admin all" on public.%I for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
alter table public.aum_finance_log enable row level security;
drop policy if exists "aum admin read" on public.aum_finance_log;
create policy "aum admin read" on public.aum_finance_log for select to authenticated using (public.aum_is_admin());
revoke all on public.aum_finance_log from anon;
grant select on public.aum_finance_log to authenticated;

create or replace function public.aum_finance_log_fn() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec boolean := (tg_table_name = 'aum_finance_recurring');
  o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  word text := (case when r->>'kind' = 'income' then 'הכנסה' else 'הוצאה' end) || (case when rec then ' מחזורית' else '' end);
  per text := case r->>'period' when 'weekly' then 'כל שבוע' when 'monthly' then 'כל חודש' when 'yearly' then 'כל שנה' else '' end;
  who text := coalesce(auth.jwt()->>'email', 'מערכת');
  base text := '₪' || trim(to_char((r->>'amount')::numeric, 'FM999999990.##')) || ' · ' || (r->>'title') || (case when rec then ' · ' || per else '' end);
  diff text := '';
  k text;
  lab jsonb := '{"amount":"סכום","title":"תיאור","entry_date":"תאריך","start_date":"תאריך התחלה","end_date":"תאריך סיום","period":"חזרתיות","active":"פעיל","kind":"סוג","meeting_id":"שיוך למפגש"}';
  txt text;
begin
  if tg_op = 'INSERT' then
    txt := 'נוספה ' || word || ': ' || base;
  elsif tg_op = 'DELETE' then
    txt := 'נמחקה ' || word || ': ' || base;
  else
    for k in select jsonb_object_keys(lab) loop
      if (o->k) is distinct from (n->k) then
        diff := diff || (case when diff = '' then '' else ', ' end) || (lab->>k) || ' ' || coalesce(o->>k, '-') || ' ← ' || coalesce(n->>k, '-');
      end if;
    end loop;
    if diff = '' then return null; end if;
    txt := 'עודכנה ' || word || ' "' || (n->>'title') || '": ' || diff;
  end if;
  insert into public.aum_finance_log (actor, action, entity, entity_id, summary)
  values (who, lower(tg_op), case when rec then 'recurring' else 'entry' end, (r->>'id')::uuid, txt);
  return null;
end $$;
drop trigger if exists aum_finance_log_t on public.aum_finance;
create trigger aum_finance_log_t after insert or update or delete on public.aum_finance for each row execute function public.aum_finance_log_fn();
drop trigger if exists aum_finance_log_t on public.aum_finance_recurring;
create trigger aum_finance_log_t after insert or update or delete on public.aum_finance_recurring for each row execute function public.aum_finance_log_fn();

-- 11. דרכי תשלום (פייבוקס, ביט, מזומן...): רשימה שאפשר להגדיר בדף הניהול, ושדה "דרך העברה" בכל תשלום.
create table if not exists public.aum_pay_methods (
  key  text primary key,
  name text not null,
  sort int not null default 0
);
alter table public.aum_pay_methods enable row level security;
drop policy if exists "aum admin all" on public.aum_pay_methods;
create policy "aum admin all" on public.aum_pay_methods for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin());
revoke all on public.aum_pay_methods from anon;
grant select, insert, update, delete on public.aum_pay_methods to authenticated;
insert into public.aum_pay_methods (key, name, sort) values ('paybox', 'פייבוקס', 1), ('bit', 'ביט', 2), ('cash', 'מזומן', 3), ('bank', 'בנק', 4) on conflict (key) do nothing;
alter table public.aum_registrations add column if not exists pay_method text;
alter table public.aum_registrations add column if not exists pay_method_note text;
alter table public.aum_payments      add column if not exists method text;
alter table public.aum_payments      add column if not exists method_note text;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aum_pay_methods') then
    alter publication supabase_realtime add table public.aum_pay_methods;
  end if;
end $$;

-- 12. מדרגות מחיר: המחיר חל מ"days" ימים לפני המפגש, ועובר למדרגה הבאה ככל שהמפגש מתקרב.
--     בלי מדרגות המחיר הוא זה של המפגש עצמו. aum_next() מחזירה את המחיר הנוכחי לדף הבית.
create table if not exists public.aum_price_tiers (
  days  int primary key check (days >= 0),
  price int not null check (price >= 0)
);
alter table public.aum_price_tiers enable row level security;
drop policy if exists "aum admin all" on public.aum_price_tiers;
create policy "aum admin all" on public.aum_price_tiers for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin());
revoke all on public.aum_price_tiers from anon;
grant select, insert, update, delete on public.aum_price_tiers to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aum_price_tiers') then
    alter publication supabase_realtime add table public.aum_price_tiers;
  end if;
end $$;

-- 13. הפקדה: כסף שהמשתתף נתן בלי שיוך למפגש, ונכנס ליתרה שלו (קרדיט) לשימוש במפגשים. הרחבת הרשימה בלבד.
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'public.aum_payments'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' loop
    execute format('alter table public.aum_payments drop constraint %I', c);
  end loop;
  alter table public.aum_payments add constraint aum_payments_kind_check check (kind in ('payment', 'refund', 'credit', 'deposit'));
end $$;

-- 14. תגיות על משתתפים (ובהמשך סטטוסים על מפגשים): שם, צבע וסדר, ומערך תגיות לכל משתתף.
create table if not exists public.aum_statuses (
  key   text primary key,
  label text not null,
  color text not null default 'sky',
  sort  int not null default 0,
  scope text not null default 'participant' check (scope in ('participant', 'meeting')),
  phase text not null default 'before' check (phase in ('before', 'after'))
);
alter table public.aum_statuses enable row level security;
drop policy if exists "aum admin all" on public.aum_statuses;
create policy "aum admin all" on public.aum_statuses for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin());
revoke all on public.aum_statuses from anon;
grant select, insert, update, delete on public.aum_statuses to authenticated;
alter table public.aum_participants  add column if not exists tags text[] not null default '{}';
alter table public.aum_registrations add column if not exists status_key text;
alter table public.aum_registrations add column if not exists after_key text;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aum_statuses') then
    alter publication supabase_realtime add table public.aum_statuses;
  end if;
end $$;

-- 15. הערות מערכת: כל שיוך, שינוי סטטוס תשלום, הגעה ותשלום נרשמים אוטומטית כהערה על המשתתף (יומן אירועים).
--     הוספה בלבד: הערות קיימות לא משתנות, והטריגרים כותבים רק על אירועים חדשים. הערה שנכשלה לא מפילה את הפעולה.
alter table public.aum_notes add column if not exists system     boolean not null default false;
alter table public.aum_notes add column if not exists event_type text;
alter table public.aum_notes add column if not exists meeting_id uuid;

create or replace function public.aum_meeting_label(p_event uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select to_char(e.event_date, 'DD.MM') from public.aum_events e where e.id = p_event), 'לא ידוע');
$$;
create or replace function public.aum_method_label(p_method text, p_note text) returns text
language sql stable security definer set search_path = public as $$
  select case when p_method is null or p_method = '' then ''
    when p_method = 'other' then 'אחר' || coalesce(': ' || nullif(btrim(p_note), ''), '')
    else coalesce((select m.name from public.aum_pay_methods m where m.key = p_method), p_method) end;
$$;
create or replace function public.aum_pay_status(p_paid boolean, p_exempt boolean, p_req timestamptz) returns text
language sql immutable as $$
  select case when p_exempt then 'חינם' when p_paid then 'שילם' when p_req is not null then 'בטיפול' else 'טרם טופל' end;
$$;
drop function if exists public.aum_sys_note(uuid, text, text, uuid);
create or replace function public.aum_sys_note(p_pid uuid, p_body text, p_event text, p_meeting uuid, p_old text default null, p_new text default null, p_amount numeric default null, p_method text default null) returns void
language plpgsql security definer set search_path = public as $$
declare mail text := auth.jwt() ->> 'email';
begin
  if current_setting('aum.skip_note', true) = '1' then return; end if;
  insert into public.aum_notes (participant_id, body, author_email, author_name, system, event_type, meeting_id, old_status, new_status, amount, method)
  values (p_pid, p_body, mail, case when mail is null then 'מערכת' else 'טל' end, true, p_event, p_meeting, p_old, p_new, p_amount, p_method);   -- בלי מנהל מחובר (הרשמה מהאתר): בלי מייל, והשם "מערכת"
exception when others then null;
end $$;
revoke all on function public.aum_sys_note(uuid, text, text, uuid, text, text, numeric, text) from public, anon, authenticated;

create or replace function public.aum_pay_code(p_paid boolean, p_exempt boolean, p_req timestamptz, p_will boolean default false, p_maybe boolean default false) returns text
language sql immutable as $$
  select case when coalesce(p_exempt, false) then 'exempt' when coalesce(p_paid, false) then 'paid' when coalesce(p_will, false) then 'willpay' when coalesce(p_maybe, false) then 'maybe' when p_req is not null then 'requested' else 'unpaid' end;
$$;
-- שם הסטטוס לפי מפתח: מהטבלה (כולל שמות ששונו בהגדרות), ואם אין (נמחק) שם ברירת המחדל
create or replace function public.aum_status_label(k text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select s.label from public.aum_statuses s where s.key = k),
    case k when 'paid' then 'שילם' when 'willpay' then 'ישלם' when 'exempt' then 'חינם' when 'maybe' then 'ספונטני' when 'requested' then 'בטיפול' when 'unpaid' then 'משויך' else null end);
$$;

create or replace function public.aum_reg_notes() returns trigger
language plpgsql security definer set search_path = public as $$
declare lbl text; ok text; nk text;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.attended, false) then
      perform public.aum_sys_note(new.participant_id, 'הגיע/ה למפגש ' || public.aum_meeting_label(new.event_id) || ' (ללא הרשמה מראש)', 'walk_in', new.event_id);
    else
      perform public.aum_sys_note(new.participant_id, case when auth.jwt() ->> 'email' is null then 'נרשם/ה מהאתר למפגש ' else 'שויך/ה למפגש ' end || public.aum_meeting_label(new.event_id), 'meeting_linked', new.event_id);
    end if;
  elsif tg_op = 'UPDATE' then
    lbl := public.aum_meeting_label(new.event_id);
    ok := coalesce(old.status_key, public.aum_pay_code(old.paid, old.exempt, old.pay_requested_at, old.will_pay, old.maybe));
    nk := coalesce(new.status_key, public.aum_pay_code(new.paid, new.exempt, new.pay_requested_at, new.will_pay, new.maybe));
    if ok <> nk then
      perform public.aum_sys_note(new.participant_id, 'סטטוס למפגש ' || lbl || ': ' || coalesce(public.aum_status_label(nk), nk)
        || case when nk = 'paid' and new.paid_amount is not null then ' ₪' || trim(to_char(new.paid_amount, 'FM999990.##')) else '' end
        || case when nk = 'paid' and new.pay_method is not null then ' ב' || public.aum_method_label(new.pay_method, new.pay_method_note) else '' end
        || ' (היה: ' || coalesce(public.aum_status_label(ok), ok) || ')',
        'status_changed', new.event_id, ok, nk, case when nk = 'paid' then new.paid_amount end, case when nk = 'paid' then new.pay_method end);
    end if;
    if new.after_key is distinct from old.after_key then
      perform public.aum_sys_note(new.participant_id, 'סטטוס אחרי המפגש ' || lbl || ': ' || coalesce(public.aum_status_label(new.after_key), 'ללא') || ' (היה: ' || coalesce(public.aum_status_label(old.after_key), 'ללא') || ')',
        'after_status_changed', new.event_id, old.after_key, new.after_key);
    end if;
    if coalesce(old.attended, false) <> coalesce(new.attended, false) then
      perform public.aum_sys_note(new.participant_id, case when new.attended then 'הגיע/ה למפגש ' else 'סימון ההגעה בוטל למפגש ' end || lbl, case when new.attended then 'attended' else 'attendance_cancelled' end, new.event_id);
    end if;
    if coalesce(old.no_pay, false) <> coalesce(new.no_pay, false) then   -- סימון "חינם" במסך ההקצאה
      perform public.aum_sys_note(new.participant_id, case when coalesce(new.no_pay, false) then 'המפגש ' || lbl || ' סומן כחינם' else 'החינם בוטל למפגש ' || lbl end,
        case when coalesce(new.no_pay, false) then 'free_on' else 'free_off' end, new.event_id);
    end if;
    if (old.details_sent_at is null) <> (new.details_sent_at is null) then
      perform public.aum_sys_note(new.participant_id, case when new.details_sent_at is not null then 'נשלחו פרטי המפגש (וואטסאפ) למפגש ' else 'סימון שליחת פרטי המפגש בוטל למפגש ' end || lbl,
        case when new.details_sent_at is not null then 'details_sent' else 'details_unsent' end, new.event_id);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.aum_sys_note(old.participant_id, 'הוסר/ה מהמפגש ' || public.aum_meeting_label(old.event_id), 'meeting_removed', old.event_id);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists aum_reg_notes_t on public.aum_registrations;
create trigger aum_reg_notes_t after insert or update or delete on public.aum_registrations for each row execute function public.aum_reg_notes();

-- הערות על תשלומים: קבלת תשלום (הפקדה או תשלום ישיר), החזר כסף, והקצאות למפגש (kind = 'payment' עם מפגש): הקצאה חדשה, שינוי סכום והסרה.
-- הפקדה שנוצרה ממחיקת הקצאה (reason alloc_removed) לא מקבלת הערת קבלה.
create or replace function public.aum_pay_notes()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.aum_payments; src text; lbl text;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  if r.kind = 'deposit' then
    if tg_op = 'INSERT' and coalesce(r.reason, '') not like 'alloc_removed%' then
      perform public.aum_sys_note(r.participant_id, 'התקבל תשלום ₪' || trim(to_char(r.amount, 'FM999990.##')) || coalesce(' ב' || public.aum_method_label(r.method, r.method_note), ''), 'payment_received', null, null, null, r.amount, null);
    end if;
    return null;
  end if;
  if r.kind = 'refund' then
    if tg_op = 'INSERT' then
      perform public.aum_sys_note(r.participant_id, 'הוחזרו ₪' || trim(to_char(r.amount, 'FM999990.##')) || ' למשתתף' || case when r.meeting_id is not null then ' (למפגש ' || public.aum_meeting_label(r.meeting_id) || ')' else '' end || coalesce(' ב' || public.aum_method_label(r.method, r.method_note), ''), 'refund', r.meeting_id, null, null, r.amount, null);
    end if;
    return null;
  end if;
  if r.kind <> 'payment' or r.meeting_id is null then return null; end if;
  src := case when coalesce(r.from_credit, false) then 'מהיתרה' else coalesce('ב' || public.aum_method_label(r.method, r.method_note), 'ישירות') end;
  lbl := public.aum_meeting_label(r.meeting_id);
  if tg_op = 'INSERT' then
    if not coalesce(r.from_credit, false) then perform public.aum_sys_note(r.participant_id, 'התקבל תשלום ₪' || trim(to_char(r.amount, 'FM999990.##')) || coalesce(' ב' || public.aum_method_label(r.method, r.method_note), ''), 'payment_received', null, null, null, r.amount, null); end if;
    perform public.aum_sys_note(r.participant_id, 'הוקצו ₪' || trim(to_char(r.amount, 'FM999990.##')) || ' למפגש ' || lbl, 'alloc_added', r.meeting_id, null, null, r.amount, null);
  elsif tg_op = 'UPDATE' then
    if new.amount is distinct from old.amount then
      perform public.aum_sys_note(r.participant_id, 'הקצאה למפגש ' || lbl || ' שונתה מ-₪' || trim(to_char(old.amount, 'FM999990.##')) || ' ל-₪' || trim(to_char(new.amount, 'FM999990.##')), 'alloc_changed', r.meeting_id, null, null, new.amount, null);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.aum_sys_note(r.participant_id, 'הוסרה הקצאה של ₪' || trim(to_char(r.amount, 'FM999990.##')) || ' למפגש ' || lbl, 'alloc_removed', r.meeting_id, null, null, r.amount, null);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists aum_pay_notes_t on public.aum_payments;
create trigger aum_pay_notes_t after insert or update or delete on public.aum_payments for each row execute function public.aum_pay_notes();


-- 16. פרטי המפגש ביום המפגש: הודעת וואטסאפ מוכנה לכל משתתף (נוסח ושעת פתיחה ניתנים להגדרה), וסימון מי קיבל.
create table if not exists public.aum_admin_prefs (
  email      text primary key,
  event_msg  text,
  event_open text
);
alter table public.aum_admin_prefs add column if not exists att_lead text;   -- מתי נפתח סימון ההגעה (דקות לפני, day או always)
alter table public.aum_admin_prefs enable row level security;
drop policy if exists "aum admin all" on public.aum_admin_prefs;
create policy "aum admin all" on public.aum_admin_prefs for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin());
revoke all on public.aum_admin_prefs from anon;
grant select, insert, update, delete on public.aum_admin_prefs to authenticated;
alter table public.aum_registrations add column if not exists details_sent_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aum_admin_prefs') then
    alter publication supabase_realtime add table public.aum_admin_prefs;
  end if;
end $$;

-- 17. התאמה לדף הניהול המלא (אותו דף כמו יוצאים להרפתקה): עמודות נוספות בלבד, בלי לשנות שורות קיימות.
alter table public.aum_participants  add column if not exists source_code text;
alter table public.aum_participants  add column if not exists status_key  text;
alter table public.aum_registrations add column if not exists will_pay boolean not null default false;
alter table public.aum_registrations add column if not exists maybe    boolean not null default false;
alter table public.aum_registrations add column if not exists no_pay   boolean;
alter table public.aum_registrations add column if not exists pay_reported_at     timestamptz;   -- דיווח תשלום של המשתתף (אזור אישי, אם יהיה)
alter table public.aum_registrations add column if not exists pay_reported_amount numeric;
alter table public.aum_notes add column if not exists amount     numeric;
alter table public.aum_notes add column if not exists method     text;
alter table public.aum_notes add column if not exists old_status text;
alter table public.aum_notes add column if not exists new_status text;
alter table public.aum_notes add column if not exists source     text;
alter table public.aum_promoters add column if not exists code text;
alter table public.aum_promoters add column if not exists color text not null default 'red';
alter table public.aum_promoters add column if not exists cost_from_payment boolean not null default false;
alter table public.aum_promoters add column if not exists cost_on_lead boolean not null default false;
alter table public.aum_promoter_payments add column if not exists by_email text;
alter table public.aum_payments add column if not exists pkg boolean not null default false;
alter table public.aum_payments add column if not exists pkg_n int;
alter table public.aum_payments add column if not exists reason text;   -- סיבת הרישום (למשל alloc_removed: כסף שחזר ליתרה במחיקת הקצאה)
alter table public.aum_price_tiers add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists aum_price_tiers_id_uq on public.aum_price_tiers (id);
alter table public.aum_pay_methods add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists aum_pay_methods_id_uq on public.aum_pay_methods (id);
alter table public.aum_pay_methods add column if not exists owner_email text;
alter table public.aum_admin_prefs add column if not exists sender_name text;
alter table public.aum_admin_prefs add column if not exists wa_intro text;
alter table public.aum_events add column if not exists directions text not null default '';   -- הוראות הגעה למפגש (כתובת, חנייה), טקסט חופשי
-- העדפות תצוגה לכל מנהל: תגיות ותשלום (true/false), שליחה והגעה (ריק = אוטומטי לפי התזמונים)
alter table public.aum_admin_prefs add column if not exists view_tags boolean;
alter table public.aum_admin_prefs add column if not exists view_pay  boolean;
alter table public.aum_admin_prefs add column if not exists view_sent boolean;
alter table public.aum_admin_prefs add column if not exists view_att  boolean;
alter table public.aum_admin_prefs add column if not exists view_scopes jsonb;   -- העדפות תצוגה לפי מפגש ולמצב הכללי ("all")

-- 18. שם למפגש ומדרגות מחיר לכל מפגש (במקום ההגדרה הגלובלית aum_price_tiers, שנשארת בלי שימוש).
--     price_tiers = { "base": 300, "steps": [{ "days": 3, "price": 350 }] }: base = המחיר הרגיל, וכל שלב חל כשנשארו עד days ימים.
alter table public.aum_events add column if not exists name text;
alter table public.aum_events add column if not exists price_tiers jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'aum_events_name_chk') then
    alter table public.aum_events add constraint aum_events_name_chk check (name is null or char_length(name) <= 80);
  end if;
end $$;
-- מפגש קיים בלי מדרגות מקבל מדרגה אחת: המחיר שלו (העמודה החדשה בלבד, שום ערך קיים לא משתנה)
update public.aum_events set price_tiers = jsonb_build_object('base', price, 'steps', '[]'::jsonb) where price_tiers is null and price is not null;

-- 19. עיר ותמונה למפגש, הגדרות ציבוריות (שם ותמונת ברירת מחדל למפגש), ודלי תמונות למפגשים.
--     הנתונים נשמרים כאן ומוכנים לשימוש בעתיד; דף הבית של AUM לא קורא אותם. הוספה בלבד.
alter table public.aum_events add column if not exists city text;
alter table public.aum_events add column if not exists image_url text;
create table if not exists public.aum_public_settings (key text primary key, value text, updated_at timestamptz not null default now());
alter table public.aum_public_settings enable row level security;
drop policy if exists "aum admin all" on public.aum_public_settings;
create policy "aum admin all" on public.aum_public_settings for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin());
drop policy if exists "aum public read" on public.aum_public_settings;
create policy "aum public read" on public.aum_public_settings for select to anon, authenticated using (true);
grant select on public.aum_public_settings to anon;
grant select, insert, update, delete on public.aum_public_settings to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aum_public_settings') then
    alter publication supabase_realtime add table public.aum_public_settings;
  end if;
end $$;
insert into storage.buckets (id, name, public) values ('aum-meeting-images', 'aum-meeting-images', true) on conflict (id) do nothing;
drop policy if exists "aum meeting images insert" on storage.objects;
create policy "aum meeting images insert" on storage.objects for insert to authenticated with check (bucket_id = 'aum-meeting-images' and public.aum_is_admin());
drop policy if exists "aum meeting images update" on storage.objects;
create policy "aum meeting images update" on storage.objects for update to authenticated using (bucket_id = 'aum-meeting-images' and public.aum_is_admin());
drop policy if exists "aum meeting images delete" on storage.objects;
create policy "aum meeting images delete" on storage.objects for delete to authenticated using (bucket_id = 'aum-meeting-images' and public.aum_is_admin());

notify pgrst, 'reload schema';

-- ==========================================================================
-- הקמת ההתראות (פעם אחת):
--   1. node scripts/vapid.mjs                  מדפיס זוג מפתחות
--   2. cd worker && npx wrangler secret put VAPID_PRIVATE   (ואותו דבר ל-VAPID_PUBLIC ול-AUM_PUSH_TOKEN, סיסמה אקראית ארוכה)
--      npx wrangler deploy
--   3. להריץ כאן שורה אחת, עם הערכים שלך:
--
--   insert into public.aum_settings (key, value) values
--     ('notify_url',   'https://floa-lead.floa-il.workers.dev/aum-push'),
--     ('notify_token', 'אותו AUM_PUSH_TOKEN'),
--     ('vapid_public', 'ה-VAPID_PUBLIC')
--   on conflict (key) do update set value = excluded.value;
--
--   4. בדף הניהול (/aum/admin/): ללחוץ על הפעמון ולאשר התראות, בכל מכשיר ודפדפן שרוצים.
-- לכיבוי ההתראות: delete from public.aum_settings where key = 'notify_url';
-- ==========================================================================

-- 20: דחיית דיווח תשלום
alter table public.aum_registrations add column if not exists pay_rejected_at timestamptz;

-- 21: סוגי מפגשים (מהרפתקה). לכל מפגש סוג, ולכל סוג: ברירות מחדל למפגש חדש, הגדרות סימון הגעה והודעה לפני המפגש, וסטטוסים משלו.
-- מפגש יורש שדה שנשאר ריק ("כמו בסוג"): הערך נשמר בעמודות המפגש עצמן, כך שדף הבית וה-RPC קוראים כרגיל. הכול תוספתי.
create table if not exists public.aum_meeting_types (
  id uuid primary key default gen_random_uuid(),
  name text not null default '' check (char_length(name) <= 80),
  sort int not null default 0,
  meeting_time time,
  place text,
  city text check (city is null or char_length(city) <= 40),
  max_participants int,
  directions text check (directions is null or char_length(directions) <= 800),
  price_tiers jsonb,
  image_url text,
  att_lead text,
  event_open text,
  event_msg text,
  created_at timestamptz not null default now()
);
alter table public.aum_meeting_types enable row level security;
drop policy if exists "aum admin all" on public.aum_meeting_types;
create policy "aum admin all" on public.aum_meeting_types for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin());
grant all on public.aum_meeting_types to authenticated, service_role;
do $$ begin alter publication supabase_realtime add table public.aum_meeting_types; exception when duplicate_object then null; when undefined_object then null; end $$;

alter table public.aum_events add column if not exists type_id uuid references public.aum_meeting_types(id) on delete restrict;
alter table public.aum_events add column if not exists inherit text[] not null default '{}';
alter table public.aum_statuses add column if not exists type_id uuid references public.aum_meeting_types(id) on delete cascade;

create or replace function public.aum_meeting_inherit() returns trigger
language plpgsql as $fn$
declare t public.aum_meeting_types%rowtype;
begin
  if new.type_id is not null and coalesce(cardinality(new.inherit), 0) > 0 then
    select * into t from public.aum_meeting_types where id = new.type_id;
    if t.id is not null then
      if 'name' = any(new.inherit) then new.name := nullif(btrim(coalesce(t.name, '')), ''); end if;
      if 'meeting_time' = any(new.inherit) then new.start_time := coalesce(t.meeting_time, new.start_time, '09:00'); end if;
      if 'place' = any(new.inherit) then new.location := t.place; end if;
      if 'city' = any(new.inherit) then new.city := t.city; end if;
      if 'max_participants' = any(new.inherit) then new.capacity := t.max_participants; end if;
      if 'directions' = any(new.inherit) then new.directions := coalesce(t.directions, ''); end if;
      if 'price_tiers' = any(new.inherit) then new.price_tiers := t.price_tiers; end if;
      if 'image_url' = any(new.inherit) then new.image_url := t.image_url; end if;
    end if;
  end if;
  if new.location is null then new.location := 'גדרה'; end if;
  if new.price_tiers is not null and (new.price_tiers->>'base') ~ '^[0-9]+(\.[0-9]+)?$' then new.price := round((new.price_tiers->>'base')::numeric)::int; end if;
  return new;
end $fn$;
drop trigger if exists aum_meeting_inherit on public.aum_events;
create trigger aum_meeting_inherit before insert or update on public.aum_events
  for each row execute function public.aum_meeting_inherit();

create or replace function public.aum_type_propagate() returns trigger
language plpgsql security definer set search_path to 'public' as $fn$
begin
  if (new.name, new.meeting_time, new.place, new.city, new.max_participants, new.directions, new.price_tiers::text, new.image_url)
     is not distinct from (old.name, old.meeting_time, old.place, old.city, old.max_participants, old.directions, old.price_tiers::text, old.image_url) then return new; end if;
  update public.aum_events set inherit = inherit
   where type_id = new.id and cardinality(inherit) > 0 and event_date >= (now() at time zone 'Asia/Jerusalem')::date;
  return new;
end $fn$;
drop trigger if exists aum_type_propagate on public.aum_meeting_types;
create trigger aum_type_propagate after update on public.aum_meeting_types
  for each row execute function public.aum_type_propagate();

-- הסוג הראשון, מהמפגש האחרון (פעם אחת, רק כשעוד אין אף סוג). מפגשים וסטטוסי מפגש קיימים משויכים אליו; הנתונים של המפגשים לא משתנים.
do $$
declare v_id uuid; v_al text; v_eo text; v_em text;
begin
  if exists (select 1 from public.aum_meeting_types) then return; end if;
  select att_lead, event_open, event_msg into v_al, v_eo, v_em from public.aum_admin_prefs
   where att_lead is not null or event_open is not null or event_msg is not null order by (lower(email) = 'tal.amitai1@gmail.com') desc, email limit 1;
  insert into public.aum_meeting_types (name, sort, meeting_time, place, city, max_participants, directions, price_tiers, image_url, att_lead, event_open, event_msg)
  select 'מפגש AUM', 1, start_time, location, city, capacity, directions, price_tiers, image_url, v_al, v_eo, nullif(btrim(coalesce(v_em, '')), '')
    from public.aum_events order by event_date desc, start_time desc limit 1;
  if not found then
    insert into public.aum_meeting_types (name, sort, meeting_time, att_lead, event_open, event_msg) values ('מפגש AUM', 1, '09:00', v_al, v_eo, nullif(btrim(coalesce(v_em, '')), ''));
  end if;
  select id into v_id from public.aum_meeting_types order by sort, created_at limit 1;
  update public.aum_events set type_id = v_id where type_id is null;
  update public.aum_statuses set type_id = v_id where type_id is null and coalesce(scope, 'meeting') <> 'participant' and key <> 'unpaid';
end $$;
notify pgrst, 'reload schema';


-- 23: סטטוס "במפגש" (הגיע), ציון התמדה לסטטוס, ותבניות הודעה לוואטסאפ (מהרפתקה). הכול תוספתי.
alter table public.aum_statuses drop constraint if exists aum_statuses_phase_check;
alter table public.aum_statuses add constraint aum_statuses_phase_check check (phase in ('before','during','after'));
alter table public.aum_registrations add column if not exists during_key text;
alter table public.aum_statuses add column if not exists points integer not null default 0;
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'aum_statuses_points_range' and conrelid = 'public.aum_statuses'::regclass) then
    alter table public.aum_statuses add constraint aum_statuses_points_range check (points between -5 and 5);
  end if;
end $c$;
insert into public.aum_statuses (key, label, color, sort, scope, phase, points, type_id)
select 'arrived', 'הגיע', 'green', 0, 'meeting', 'during', 1, (select id from public.aum_meeting_types order by sort, created_at limit 1)
on conflict (key) do nothing;

create or replace function public.aum_att_during_mirror() returns trigger language plpgsql as $f$
begin
  if tg_op = 'UPDATE' and new.during_key is not distinct from old.during_key and coalesce(new.attended, false) is distinct from coalesce(old.attended, false) then
    if new.attended then new.during_key := 'arrived'; elsif new.during_key = 'arrived' then new.during_key := null; end if;
  elsif tg_op = 'INSERT' and coalesce(new.attended, false) and new.during_key is null then
    new.during_key := 'arrived';
  end if;
  new.attended := coalesce(new.during_key = 'arrived', false);
  if new.attended then
    new.attended_at := case when tg_op = 'UPDATE' and coalesce(old.attended, false) then coalesce(old.attended_at, now()) else coalesce(new.attended_at, now()) end;
  else
    new.attended_at := null;
  end if;
  return new;
end $f$;
drop trigger if exists aum_att_during_mirror on public.aum_registrations;
create trigger aum_att_during_mirror before insert or update on public.aum_registrations for each row execute function public.aum_att_during_mirror();

CREATE OR REPLACE FUNCTION public.aum_reg_notes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare lbl text; ok text; nk text;
begin
  if current_setting('aum.skip_note', true) = '1' then return null; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.attended, false) then
      perform public.aum_sys_note(new.participant_id, 'הגיע/ה למפגש ' || public.aum_meeting_label(new.event_id) || ' (ללא הרשמה מראש)', 'walk_in', new.event_id);
    else
      perform public.aum_sys_note(new.participant_id, case when auth.jwt() ->> 'email' is null then 'נרשם/ה מהאתר למפגש ' else 'שויך/ה למפגש ' end || public.aum_meeting_label(new.event_id), 'meeting_linked', new.event_id);
    end if;
  elsif tg_op = 'UPDATE' then
    lbl := public.aum_meeting_label(new.event_id);
    ok := coalesce(old.status_key, public.aum_pay_code(old.paid, old.exempt, old.pay_requested_at, old.will_pay, old.maybe));
    nk := coalesce(new.status_key, public.aum_pay_code(new.paid, new.exempt, new.pay_requested_at, new.will_pay, new.maybe));
    if ok <> nk then
      perform public.aum_sys_note(new.participant_id, 'סטטוס למפגש ' || lbl || ': ' || coalesce(public.aum_status_label(nk), nk)
        || case when nk = 'paid' and new.paid_amount is not null then ' ₪' || trim(to_char(new.paid_amount, 'FM999990.##')) else '' end
        || case when nk = 'paid' and new.pay_method is not null then ' ב' || public.aum_method_label(new.pay_method, new.pay_method_note) else '' end
        || ' (היה: ' || coalesce(public.aum_status_label(ok), ok) || ')',
        'status_changed', new.event_id, ok, nk, case when nk = 'paid' then new.paid_amount end, case when nk = 'paid' then new.pay_method end);
    end if;
    if new.after_key is distinct from old.after_key then
      perform public.aum_sys_note(new.participant_id, 'סטטוס אחרי המפגש ' || lbl || ': ' || coalesce(public.aum_status_label(new.after_key), 'ללא') || ' (היה: ' || coalesce(public.aum_status_label(old.after_key), 'ללא') || ')',
        'after_status_changed', new.event_id, old.after_key, new.after_key);
    end if;
    if new.during_key is distinct from old.during_key and not ((old.during_key is null and new.during_key = 'arrived') or (old.during_key = 'arrived' and new.during_key is null)) then
      perform public.aum_sys_note(new.participant_id, 'סטטוס במפגש ' || lbl || ': ' || coalesce(public.aum_status_label(new.during_key), 'ללא') || ' (היה: ' || coalesce(public.aum_status_label(old.during_key), 'ללא') || ')',
        'during_status_changed', new.event_id, old.during_key, new.during_key);
    end if;
    if coalesce(old.attended, false) <> coalesce(new.attended, false) then
      perform public.aum_sys_note(new.participant_id, case when new.attended then 'הגיע/ה למפגש ' else 'סימון ההגעה בוטל למפגש ' end || lbl, case when new.attended then 'attended' else 'attendance_cancelled' end, new.event_id);
    end if;
    if coalesce(old.no_pay, false) <> coalesce(new.no_pay, false) then   -- סימון "חינם" במסך ההקצאה
      perform public.aum_sys_note(new.participant_id, case when coalesce(new.no_pay, false) then 'המפגש ' || lbl || ' סומן כחינם' else 'החינם בוטל למפגש ' || lbl end,
        case when coalesce(new.no_pay, false) then 'free_on' else 'free_off' end, new.event_id);
    end if;
    if (old.details_sent_at is null) <> (new.details_sent_at is null) then
      perform public.aum_sys_note(new.participant_id, case when new.details_sent_at is not null then 'נשלחו פרטי המפגש (וואטסאפ) למפגש ' else 'סימון שליחת פרטי המפגש בוטל למפגש ' end || lbl,
        case when new.details_sent_at is not null then 'details_sent' else 'details_unsent' end, new.event_id);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.aum_sys_note(old.participant_id, 'הוסר/ה מהמפגש ' || public.aum_meeting_label(old.event_id), 'meeting_removed', old.event_id);
  end if;
  return null;
exception when others then return null;
end $function$
;
drop trigger if exists aum_reg_notes_t on public.aum_registrations;
create trigger aum_reg_notes_t after insert or delete or update of paid, exempt, pay_requested_at, will_pay, maybe, status_key, after_key, during_key, attended, details_sent_at, no_pay on public.aum_registrations for each row execute function public.aum_reg_notes();

do $m$ begin
  perform set_config('aum.skip_note', '1', true);
  update public.aum_registrations set during_key = 'arrived' where attended and during_key is distinct from 'arrived';
  perform set_config('aum.skip_note', '', true);
end $m$;

create table if not exists public.aum_msg_templates (
  id uuid primary key default gen_random_uuid(),
  type_id uuid references public.aum_meeting_types(id) on delete cascade,
  meeting_id uuid references public.aum_events(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 60),
  body text not null default '' check (char_length(body) <= 2000),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  check ((type_id is null) <> (meeting_id is null))
);
create index if not exists aum_msg_templates_type on public.aum_msg_templates (type_id);
create index if not exists aum_msg_templates_meeting on public.aum_msg_templates (meeting_id);
alter table public.aum_msg_templates enable row level security;
drop policy if exists "aum admin all" on public.aum_msg_templates;
create policy "aum admin all" on public.aum_msg_templates for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin());
grant all on public.aum_msg_templates to authenticated, service_role;
do $$ begin alter publication supabase_realtime add table public.aum_msg_templates; exception when duplicate_object then null; when undefined_object then null; end $$;

insert into public.aum_msg_templates (type_id, name, body, sort)
select mt.id, 'הודעה לפני המפגש',
  coalesce(nullif(btrim(mt.event_msg), ''), E'היום זה קורה!\nנפגשים היום ב{מקום}.\n{הוראות הגעה}\nהתכנסות: {התכנסות}, מתחילים ב-{התחלה} ועד {סיום}.\n\nמומלץ להגיע בבגדים נוחים ובקבוק מים.\nמחכה לכם, טל'),
  0
from public.aum_meeting_types mt
where not exists (select 1 from public.aum_msg_templates x where x.type_id = mt.id);

create table if not exists public.aum_msg_sent (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.aum_participants(id) on delete cascade,
  meeting_id uuid not null references public.aum_events(id) on delete cascade,
  tpl_key text not null,
  sent_at timestamptz not null default now(),
  sent_by text,
  unique (participant_id, meeting_id, tpl_key)
);
create index if not exists aum_msg_sent_meeting on public.aum_msg_sent (meeting_id);
alter table public.aum_msg_sent enable row level security;
drop policy if exists "aum admin all" on public.aum_msg_sent;
create policy "aum admin all" on public.aum_msg_sent for all to authenticated using (public.aum_is_admin()) with check (public.aum_is_admin());
grant all on public.aum_msg_sent to authenticated, service_role;
do $$ begin alter publication supabase_realtime add table public.aum_msg_sent; exception when duplicate_object then null; when undefined_object then null; end $$;
notify pgrst, 'reload schema';


-- 24: סטטוס מפגש אחד (איחוד "במפגש" ו"אחרי המפגש"), "הגיע" כסטטוס רגיל (מהרפתקה). העמודות הישנות נשארות כהיסטוריה.
drop trigger if exists aum_reg_notes_t on public.aum_registrations;
drop trigger if exists aum_att_during_mirror on public.aum_registrations;
drop function if exists public.aum_att_during_mirror();
alter table public.aum_registrations add column if not exists meeting_key text;
do $m$ begin
  perform set_config('aum.skip_note', '1', true);
  update public.aum_registrations set meeting_key = coalesce(after_key, during_key) where meeting_key is null and (during_key is not null or after_key is not null);
  perform set_config('aum.skip_note', '', true);
end $m$;
alter table public.aum_statuses drop constraint if exists aum_statuses_phase_check;
alter table public.aum_statuses add constraint aum_statuses_phase_check check (phase in ('before','during','after','meeting'));
with ord as (
  select key, row_number() over (partition by coalesce(type_id, '00000000-0000-0000-0000-000000000000'::uuid) order by case phase when 'during' then 0 else 1 end, sort, key) as rn
    from public.aum_statuses where scope <> 'participant' and phase in ('during', 'after')
)
update public.aum_statuses s set phase = 'meeting', sort = ord.rn from ord where s.key = ord.key;
CREATE OR REPLACE FUNCTION public.aum_reg_notes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare lbl text; ok text; nk text;
begin
  if current_setting('aum.skip_note', true) = '1' then return null; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.attended, false) then
      perform public.aum_sys_note(new.participant_id, 'הגיע/ה למפגש ' || public.aum_meeting_label(new.event_id) || ' (ללא הרשמה מראש)', 'walk_in', new.event_id);
    else
      perform public.aum_sys_note(new.participant_id, case when auth.jwt() ->> 'email' is null then 'נרשם/ה מהאתר למפגש ' else 'שויך/ה למפגש ' end || public.aum_meeting_label(new.event_id), 'meeting_linked', new.event_id);
    end if;
    if new.meeting_key is not null then
      perform public.aum_sys_note(new.participant_id, 'סטטוס מפגש ' || public.aum_meeting_label(new.event_id) || ': ' || coalesce(public.aum_status_label(new.meeting_key), new.meeting_key) || ' (היה: ללא)', 'meeting_status_changed', new.event_id, null, new.meeting_key);
    end if;
  elsif tg_op = 'UPDATE' then
    lbl := public.aum_meeting_label(new.event_id);
    ok := coalesce(old.status_key, public.aum_pay_code(old.paid, old.exempt, old.pay_requested_at, old.will_pay, old.maybe));
    nk := coalesce(new.status_key, public.aum_pay_code(new.paid, new.exempt, new.pay_requested_at, new.will_pay, new.maybe));
    if ok <> nk then
      perform public.aum_sys_note(new.participant_id, 'סטטוס למפגש ' || lbl || ': ' || coalesce(public.aum_status_label(nk), nk)
        || case when nk = 'paid' and new.paid_amount is not null then ' ₪' || trim(to_char(new.paid_amount, 'FM999990.##')) else '' end
        || case when nk = 'paid' and new.pay_method is not null then ' ב' || public.aum_method_label(new.pay_method, new.pay_method_note) else '' end
        || ' (היה: ' || coalesce(public.aum_status_label(ok), ok) || ')',
        'status_changed', new.event_id, ok, nk, case when nk = 'paid' then new.paid_amount end, case when nk = 'paid' then new.pay_method end);
    end if;
    if new.meeting_key is distinct from old.meeting_key then
      perform public.aum_sys_note(new.participant_id, 'סטטוס מפגש ' || lbl || ': ' || coalesce(public.aum_status_label(new.meeting_key), 'ללא') || ' (היה: ' || coalesce(public.aum_status_label(old.meeting_key), 'ללא') || ')',
        'meeting_status_changed', new.event_id, old.meeting_key, new.meeting_key);
    end if;
    if coalesce(old.attended, false) <> coalesce(new.attended, false) then
      perform public.aum_sys_note(new.participant_id, case when new.attended then 'הגיע/ה למפגש ' else 'סימון ההגעה בוטל למפגש ' end || lbl, case when new.attended then 'attended' else 'attendance_cancelled' end, new.event_id);
    end if;
    if coalesce(old.no_pay, false) <> coalesce(new.no_pay, false) then   -- סימון "חינם" במסך ההקצאה
      perform public.aum_sys_note(new.participant_id, case when coalesce(new.no_pay, false) then 'המפגש ' || lbl || ' סומן כחינם' else 'החינם בוטל למפגש ' || lbl end,
        case when coalesce(new.no_pay, false) then 'free_on' else 'free_off' end, new.event_id);
    end if;
    if (old.details_sent_at is null) <> (new.details_sent_at is null) then
      perform public.aum_sys_note(new.participant_id, case when new.details_sent_at is not null then 'נשלחו פרטי המפגש (וואטסאפ) למפגש ' else 'סימון שליחת פרטי המפגש בוטל למפגש ' end || lbl,
        case when new.details_sent_at is not null then 'details_sent' else 'details_unsent' end, new.event_id);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.aum_sys_note(old.participant_id, 'הוסר/ה מהמפגש ' || public.aum_meeting_label(old.event_id), 'meeting_removed', old.event_id);
  end if;
  return null;
exception when others then return null;
end $function$
;
create trigger aum_reg_notes_t after insert or delete or update of paid, exempt, pay_requested_at, will_pay, maybe, status_key, meeting_key, attended, details_sent_at, no_pay on public.aum_registrations for each row execute function public.aum_reg_notes();
notify pgrst, 'reload schema';

-- 25: שורה לסטטוס המערכת "משויך" (unpaid). בלי שורה, שינוי שם או צבע נשמר בדף ולא בדאטהבייס, ונעלם בטעינה הבאה.
insert into public.aum_statuses (key, label, color, sort, scope, phase)
values ('unpaid', 'משויך', 'red', 99, 'meeting', 'before')
on conflict (key) do nothing;

-- 26: תגיות לפי סוג מפגש, ותמונה או סרטון בהוראות ההגעה (דלי aum-meeting-media). תוספתי.
update public.aum_statuses set type_id = (select id from public.aum_meeting_types order by sort, created_at limit 1)
 where scope = 'participant' and type_id is null;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aum-meeting-media', 'aum-meeting-media', true, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
drop policy if exists "aum meeting media read" on storage.objects;
create policy "aum meeting media read" on storage.objects for select to anon, authenticated using (bucket_id = 'aum-meeting-media');
drop policy if exists "aum meeting media admin insert" on storage.objects;
create policy "aum meeting media admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'aum-meeting-media' and public.aum_is_admin());
drop policy if exists "aum meeting media admin update" on storage.objects;
create policy "aum meeting media admin update" on storage.objects for update to authenticated using (bucket_id = 'aum-meeting-media' and public.aum_is_admin());
drop policy if exists "aum meeting media admin delete" on storage.objects;
create policy "aum meeting media admin delete" on storage.objects for delete to authenticated using (bucket_id = 'aum-meeting-media' and public.aum_is_admin());

-- 27: תשלום חלקי שמנהל רושם ("נשאר לשלם"): ההקצאה נרשמת עם reason = 'partial_due:<סכום>', הסכום נשמר בהרשמה, והמשתתף נשאר עם שארית. תשלום רגיל אחר כך מנקה אותה. תוספתי.
alter table public.aum_registrations add column if not exists pay_due_amount numeric;
create or replace function public.aum_clear_pay_reported() returns trigger
language plpgsql security definer set search_path = public as $function$
declare rem numeric;
begin
  if new.meeting_id is not null and new.kind = 'payment' then
    rem := nullif(substring(coalesce(new.reason, '') from '^partial_due:([0-9.]+)$'), '')::numeric;
    update public.aum_registrations set pay_reported_at = null, pay_rejected_at = null, pay_due_amount = rem
      where participant_id = new.participant_id and event_id = new.meeting_id and (rem is not null or pay_reported_at is not null or pay_rejected_at is not null or pay_due_amount is not null);
    if rem is not null then
      begin
        perform public.aum_sys_note(new.participant_id, 'נשאר לשלם ₪' || trim_scale(rem)::text || ' למפגש ' || public.aum_meeting_label(new.meeting_id), 'payment_due', new.meeting_id);
      exception when others then null;
      end;
    end if;
  end if;
  return new;
end $function$;
drop trigger if exists aum_clear_pay_reported_t on public.aum_payments;
create trigger aum_clear_pay_reported_t after insert on public.aum_payments for each row execute function public.aum_clear_pay_reported();
notify pgrst, 'reload schema';

-- 28: סגירת תשלום בלי שום תשלום: נשמר כ-no_pay, ו-pay_closed_at מבדיל בתצוגה בין "נסגר" ל"חינם". תוספתי.
alter table public.aum_registrations add column if not exists pay_closed_at timestamptz;
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'aum_reg_notes' and p.pronamespace = 'public'::regnamespace;
  if d not like '%pay_closed_at%' then
    d := replace(d, 'if coalesce(old.no_pay, false) <> coalesce(new.no_pay, false) then', 'if coalesce(old.no_pay, false) <> coalesce(new.no_pay, false) and new.pay_closed_at is null and old.pay_closed_at is null then');
    if d not like '%pay_closed_at%' then raise exception 'aum_reg_notes patch did not apply'; end if;
    execute d;
  end if;
end $$;
notify pgrst, 'reload schema';

-- 29: בלי המושג "חינם": מפגש בלי תשלום נקרא "לא לתשלום". כאן רק הניסוח בפונקציות שכותבות הערות; הנתונים לא משתנים.
do $do$
declare r record; d text;
begin
  for r in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('aum_reg_notes', 'aum_pay_status', 'aum_status_label')
  loop
    d := pg_get_functiondef(r.oid);
    if d like '%חינם%' then
      d := replace(d, $q$' סומן כחינם'$q$, $q$' סומן לא לתשלום'$q$);
      d := replace(d, $q$'החינם בוטל למפגש '$q$, $q$'חזרה לתשלום למפגש '$q$);
      d := replace(d, $q$'חינם'$q$, $q$'לא לתשלום'$q$);
      d := replace(d, 'סימון "חינם"', 'סימון "לא לתשלום"');
      if d like '%חינם%' then raise exception 'wording left in %', r.oid; end if;
      execute d;
    end if;
  end loop;
end $do$;
notify pgrst, 'reload schema';

-- 30: עמודות הערה למעקב מייל למשתתף (מהרפתקה). לאום אין מיילים למשתתפים, והעמודות נשארות ריקות; הדף קורא אותן בטעינה.
alter table public.aum_notes add column if not exists mail_id uuid;
alter table public.aum_notes add column if not exists mail_failed boolean not null default false;
notify pgrst, 'reload schema';

-- 31: מה שנכתב בהערה לא משתנה: בכל הערת מערכת נשמרים השם והצבע של הסטטוס ותאריך המפגש ברגע היצירה. וגם: מתי סטטוסי המפגש זמינים לכל סוג (status_lead). תוספתי.
alter table public.aum_notes add column if not exists meeting_short text, add column if not exists status_label text, add column if not exists status_color text, add column if not exists mail_noaddr boolean not null default false;
alter table public.aum_meeting_types add column if not exists status_lead text not null default '60';

create or replace function public.aum_note_freeze() returns trigger
language plpgsql security definer set search_path = public as $f$
declare lb text; cl text;
begin
  if new.system then
    new.meeting_short := coalesce(new.meeting_short, substring(new.body from 'מפגש\s+(?:יום\s+\S+\s+)?(\d{1,2}\.\d{1,2})'),
      case when new.meeting_id is not null then public.aum_meeting_label(new.meeting_id) end);
    if new.new_status is not null then
      select t.label, t.color into lb, cl from public.aum_statuses t where t.key = new.new_status limit 1;
      new.status_label := coalesce(new.status_label, lb, public.aum_status_label(new.new_status));
      new.status_color := coalesce(new.status_color, cl);
    end if;
  end if;
  return new;
exception when others then return new;
end $f$;
revoke all on function public.aum_note_freeze() from public, anon, authenticated;
drop trigger if exists aum_note_freeze_t on public.aum_notes;
create trigger aum_note_freeze_t before insert on public.aum_notes for each row execute function public.aum_note_freeze();

-- הערת השיוך שומרת את הסטטוס שבו נוצר השיוך
do $do$
declare d text; a text := $x$'meeting_linked', new.event_id);$x$;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'aum_reg_notes';
  if position(a in d) > 0 then
    execute replace(d, a, $x$'meeting_linked', new.event_id, null, coalesce(new.status_key, public.aum_pay_code(new.paid, new.exempt, new.pay_requested_at, new.will_pay, new.maybe)));$x$);
  elsif position($x$'meeting_linked', new.event_id, null,$x$ in d) = 0 then
    raise exception 'aum_reg_notes: meeting_linked call not found';
  end if;
end $do$;

-- הערות קיימות: תאריך המפגש, ושם וצבע הסטטוס כפי שנכתב
update public.aum_notes n set meeting_short = coalesce(substring(n.body from 'מפגש\s+(?:יום\s+\S+\s+)?(\d{1,2}\.\d{1,2})'), case when n.meeting_id is not null then public.aum_meeting_label(n.meeting_id) end)
  where n.system and n.meeting_short is null;
update public.aum_notes n set status_label = coalesce(n.status_label, t.label), status_color = coalesce(n.status_color, t.color)
  from public.aum_statuses t where t.key = n.new_status and (n.status_label is null or n.status_color is null);
update public.aum_notes n set status_label = substring(n.body from ':\s*([^(₪]+?)\s*(?:₪|\(היה:)')
  where n.system and n.event_type in ('status_changed', 'meeting_status_changed', 'during_status_changed', 'after_status_changed')
    and substring(n.body from ':\s*([^(₪]+?)\s*(?:₪|\(היה:)') is not null
    and n.status_label is distinct from substring(n.body from ':\s*([^(₪]+?)\s*(?:₪|\(היה:)');
notify pgrst, 'reload schema';

-- 32: מחיקת דרך הגעה והעברת כל מה שמקושר אליה לדרך הגעה אחרת, בטרנזקציה אחת (מהרפתקה). רץ בהרשאות המשתמש, ולכן ה-RLS (מנהלים בלבד) חל עליו.
create or replace function public.aum_promoter_replace(p_from uuid, p_to uuid default null)
returns text language plpgsql set search_path = public as $$
declare f public.aum_promoters; t public.aum_promoters;
begin
  select * into f from public.aum_promoters where id = p_from;
  if not found then return 'not_found'; end if;
  if p_to is null then
    if exists (select 1 from public.aum_participants where promoter_id = p_from or (f.code is not null and source_code = f.code) or (f.code = 'p' and source = 'site-ad' and source_code is null and promoter_id is null))
      or exists (select 1 from public.aum_registrations where promoter_id = p_from)
      or exists (select 1 from public.aum_payments where promoter_id = p_from)
      or exists (select 1 from public.aum_promoter_payments where promoter_id = p_from) then
      return 'has_links';
    end if;
  else
    if p_to = p_from then return 'same'; end if;
    select * into t from public.aum_promoters where id = p_to;
    if not found then return 'no_target'; end if;
    update public.aum_participants
      set promoter_id = p_to, source_code = case when source_code = f.code then t.code else source_code end
      where promoter_id = p_from or (f.code is not null and source_code = f.code) or (f.code = 'p' and source = 'site-ad' and source_code is null and promoter_id is null);
    update public.aum_registrations set promoter_id = p_to where promoter_id = p_from;
    update public.aum_payments set promoter_id = p_to where promoter_id = p_from;
    update public.aum_promoter_payments set promoter_id = p_to where promoter_id = p_from;
  end if;
  delete from public.aum_promoters where id = p_from;
  return 'ok';
end $$;
revoke all on function public.aum_promoter_replace(uuid, uuid) from public, anon;
grant execute on function public.aum_promoter_replace(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';

-- 33: תגיות במקום סטטוסים, סימון הגעה בשדה נפרד, תשלום בהמשך, ודרך הגעה לכל הרשמה (מהרפתקה). תוספתי בלבד: שום סטטוס ושום עמודה ישנה לא נמחקים, והעמודות הישנות (paid, exempt, meeting_key וכו') נשארות בלי שימוש.
alter table public.aum_registrations add column if not exists pay_later_at timestamptz;
alter table public.aum_registrations add column if not exists source_promoter_id uuid references public.aum_promoters(id) on delete set null;
alter table public.aum_promoters add column if not exists cost_total boolean not null default false;
alter table public.aum_promoter_payments add column if not exists method text;

-- מי שסומן "הגיע" (סטטוס מפגש) נחשב שהגיע, בלי הערות מערכת
do $m$ begin
  perform set_config('aum.skip_note', '1', true);
  update public.aum_registrations set attended = true, attended_at = coalesce(attended_at, now()) where meeting_key = 'arrived' and not coalesce(attended, false);
  perform set_config('aum.skip_note', '', true);
end $m$;

-- הערות מערכת: תגית אחת, הגעה בנפרד, ותשלום בהמשך
create or replace function public.aum_reg_notes() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare lbl text;
begin
  if current_setting('aum.skip_note', true) = '1' then return null; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.attended, false) then
      perform public.aum_sys_note(new.participant_id, 'הגיע/ה למפגש ' || public.aum_meeting_label(new.event_id) || ' (ללא הרשמה מראש)', 'walk_in', new.event_id);
    else
      perform public.aum_sys_note(new.participant_id, case when auth.jwt() ->> 'email' is null then 'נרשם/ה מהאתר למפגש ' else 'שויך/ה למפגש ' end || public.aum_meeting_label(new.event_id), 'meeting_linked', new.event_id, null, new.status_key);
    end if;
  elsif tg_op = 'UPDATE' then
    lbl := public.aum_meeting_label(new.event_id);
    if new.status_key is distinct from old.status_key then
      perform public.aum_sys_note(new.participant_id, 'תגית למפגש ' || lbl || ': ' || coalesce(public.aum_status_label(new.status_key), 'בלי תגית') || ' (היה: ' || coalesce(public.aum_status_label(old.status_key), 'בלי תגית') || ')',
        'status_changed', new.event_id, old.status_key, new.status_key);
    end if;
    if coalesce(old.attended, false) <> coalesce(new.attended, false) then
      perform public.aum_sys_note(new.participant_id, case when new.attended then 'הגיע/ה למפגש ' else 'סימון ההגעה בוטל למפגש ' end || lbl, case when new.attended then 'attended' else 'attendance_cancelled' end, new.event_id);
    end if;
    if coalesce(old.no_pay, false) <> coalesce(new.no_pay, false) and new.pay_closed_at is null and old.pay_closed_at is null then
      perform public.aum_sys_note(new.participant_id, case when coalesce(new.no_pay, false) then 'המפגש ' || lbl || ' סומן לא לתשלום' else 'חזרה לתשלום למפגש ' || lbl end,
        case when coalesce(new.no_pay, false) then 'free_on' else 'free_off' end, new.event_id);
    end if;
    if (old.pay_later_at is null) <> (new.pay_later_at is null) and not (new.pay_later_at is null and coalesce(new.no_pay, false)) then
      perform public.aum_sys_note(new.participant_id, case when new.pay_later_at is not null then 'המפגש ' || lbl || ' סומן תשלום בהמשך' else 'בוטל תשלום בהמשך למפגש ' || lbl end,
        case when new.pay_later_at is not null then 'pay_later_on' else 'pay_later_off' end, new.event_id);
    end if;
    if (old.details_sent_at is null) <> (new.details_sent_at is null) then
      perform public.aum_sys_note(new.participant_id, case when new.details_sent_at is not null then 'נשלחו פרטי המפגש (וואטסאפ) למפגש ' else 'סימון שליחת פרטי המפגש בוטל למפגש ' end || lbl,
        case when new.details_sent_at is not null then 'details_sent' else 'details_unsent' end, new.event_id);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.aum_sys_note(old.participant_id, 'הוסר/ה מהמפגש ' || public.aum_meeting_label(old.event_id), 'meeting_removed', old.event_id);
  end if;
  return null;
exception when others then return null;
end $function$;
drop trigger if exists aum_reg_notes_t on public.aum_registrations;
create trigger aum_reg_notes_t after insert or delete or update of status_key, attended, details_sent_at, no_pay, pay_later_at on public.aum_registrations for each row execute function public.aum_reg_notes();

-- דרך ההגעה לכל הרשמה למפגש: ההרשמה הראשונה מקבלת את דרך ההגעה של המשתתף, הרשמה נוספת לפי הקישור שממנו נרשם (?s=)
create or replace function public.aum_channel_of(p_pid uuid) returns uuid language sql stable set search_path = public as $$
  select coalesce(
    (select pr.id from public.aum_promoters pr where pr.id = p.promoter_id),
    (select pr.id from public.aum_promoters pr where pr.code = coalesce(p.source_code, case when p.source = 'site-ad' then 'p' end) limit 1))
  from public.aum_participants p where p.id = p_pid
$$;
create or replace function public.aum_att_source() returns trigger language plpgsql security definer set search_path = public as $$
declare c text := nullif(current_setting('aum.src', true), '');
begin
  if new.source_promoter_id is not null then return new; end if;
  if c is not null then select id into new.source_promoter_id from public.aum_promoters where code = c limit 1; end if;
  if new.source_promoter_id is null and not exists (select 1 from public.aum_registrations where participant_id = new.participant_id) then
    new.source_promoter_id := public.aum_channel_of(new.participant_id);
  end if;
  return new;
end $$;
drop trigger if exists aum_att_source_t on public.aum_registrations;
create trigger aum_att_source_t before insert on public.aum_registrations for each row execute function public.aum_att_source();

create or replace function public.aum_participant_source_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.aum_registrations a set source_promoter_id = public.aum_channel_of(new.id)
    where a.participant_id = new.id and a.event_id = (select a2.event_id from public.aum_registrations a2 where a2.participant_id = new.id order by a2.created_at, a2.event_id limit 1);
  return new;
end $$;
drop trigger if exists aum_participant_source_sync_t on public.aum_participants;
create trigger aum_participant_source_sync_t after update of promoter_id, source, source_code on public.aum_participants for each row
  when (old.promoter_id is distinct from new.promoter_id or old.source is distinct from new.source or old.source_code is distinct from new.source_code)
  execute function public.aum_participant_source_sync();

update public.aum_registrations a set source_promoter_id = public.aum_channel_of(a.participant_id)
  where a.source_promoter_id is null
    and not exists (select 1 from public.aum_registrations b where b.participant_id = a.participant_id and (b.created_at, b.event_id) < (a.created_at, a.event_id));

-- ההרשמה מהאתר: הקישור שממנו נרשמו (p_src) עובר לטריגר
CREATE OR REPLACE FUNCTION public.aum_signup(p_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_age integer DEFAULT NULL::integer, p_gender text DEFAULT NULL::text, p_src text DEFAULT NULL::text, p_first text DEFAULT NULL::text, p_last text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n    text := public.aum_normalize_phone(p_phone);
  nm   text := coalesce(nullif(trim(concat_ws(' ', regexp_replace(trim(coalesce(p_first, '')), '\s+', ' ', 'g'), regexp_replace(trim(coalesce(p_last, '')), '\s+', ' ', 'g'))), ''), regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
  src  text := case when p_src = 'p' then 'site-ad' else 'site' end;
  code text := nullif(lower(left(regexp_replace(coalesce(p_src, ''), '[^a-zA-Z0-9_-]', '', 'g'), 20)), '');   -- קוד דרך ההגעה מהקישור ?s=קוד
  pid  uuid;
  ev   public.aum_events;
  act  boolean;
  res  text := 'created';
  st   text := 'new';
begin
  if p_src is not null then perform set_config('aum.src', p_src, true); end if;
  if char_length(nm) < 2 or char_length(nm) > 60 then return 'invalid_name'; end if;
  if n = '' then return 'invalid_phone'; end if;
  if p_age is null or p_age < 18 or p_age > 99 then return 'invalid_age'; end if;
  if p_gender is null or p_gender not in ('male', 'female') then return 'invalid_gender'; end if;

  select * into ev from public.aum_events
    where event_date >= (now() at time zone 'Asia/Jerusalem')::date
    order by event_date, start_time limit 1;

  select id, active into pid, act from public.aum_participants where phone_norm = n limit 1;
  if pid is not null then
    -- הטלפון הוא המפתח: משתתף לא פעיל (הוסר) חוזר להיות פעיל בלי לעדכן את שאר השדות
    if act then
      res := 'exists';
      update public.aum_participants set age = p_age, age_set_at = current_date where id = pid and age is null;
      update public.aum_participants set gender = p_gender where id = pid and gender is null;
    else
      update public.aum_participants set active = true where id = pid;
    end if;
  else
    begin
      insert into public.aum_participants (name, phone, age, age_set_at, gender, source, source_code)
        values (nm, n, p_age, current_date, p_gender, src, code)   -- phone_norm נקבע בטריגר
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
    perform public.aum_notify_signup();
  end if;
  return res;
end $function$;
-- ==========================================================================
-- "אישור מקום" (7.11.26, סנכרון מהרפתקה): הודעת ברירת מחדל של המערכת, אחת לכל המפגשים,
-- שאפשר לערוך. היא מופיעה בתפריט הוואטסאפ של הרשימה ובכרטיס המשתתף, ובה השדות {תשלום},
-- {פרטי המפגש} ו-{איך מגיעים} שדף הניהול ממלא. שורה בטבלת תבניות ההודעה בלי סוג ובלי מפגש,
-- עם system_key = 'confirm'. default_body הוא הנוסח לשחזור. תוספתי ואידמפוטנטי: לא נוגע
-- בתבניות הקיימות, ובנוסח שכבר נערך (על conflict מתעדכן רק default_body).
-- ==========================================================================
alter table public.aum_msg_templates add column if not exists system_key text;
alter table public.aum_msg_templates add column if not exists default_body text;
create unique index if not exists aum_msg_templates_system on public.aum_msg_templates (system_key) where system_key is not null;
alter table public.aum_msg_templates drop constraint if exists aum_msg_templates_check;
alter table public.aum_msg_templates add constraint aum_msg_templates_check check (
  (system_key is not null and type_id is null and meeting_id is null) or (system_key is null and (type_id is null) <> (meeting_id is null)));

insert into public.aum_msg_templates (name, body, default_body, sort, system_key)
values ('אישור מקום', E'שלום {שם} 🙂\n{תשלום}\n\n{פרטי המפגש}\n\n{איך מגיעים}\n\nנתראה,\nטל', E'שלום {שם} 🙂\n{תשלום}\n\n{פרטי המפגש}\n\n{איך מגיעים}\n\nנתראה,\nטל', 0, 'confirm')
on conflict (system_key) where system_key is not null do update set default_body = excluded.default_body;

notify pgrst, 'reload schema';
