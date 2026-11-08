-- ==========================================================================
-- AUM עובר ל-roster (9.11.26): מעתיק את כל הנתונים של AUM (טבלאות aum_*) לעסק "aum" ב-roster.
--
-- חד פעמי, ובטוח להריץ שוב: ההרצה הראשונה פותחת את העסק ב-roster ומעתיקה הכול,
-- והרצה נוספת (לפני המעבר עצמו) מעדכנת רק מה שהשתנה ב-AUM בינתיים. אחרי המעבר
-- roster הוא מקור האמת ולא מריצים את זה יותר.
--
--   node scripts/sql.mjs < businesses/aum/move-to-roster.sql
--
-- מה שהסקריפט לא עושה:
--   * לא נוגע בשום טבלה של AUM (קריאה בלבד משם).
--   * לא יוצר אירועים, מיילים או הערות מערכת: הטריגרים של roster כבויים בזמן ההעתקה,
--     אחרת כל משתתף שמועתק היה שולח לטל מייל "הרשמה חדשה".
--   * לא מעתיק שיווק ממומן, כספים וסטטוסים. אם יש שם נתונים הוא נעצר ואומר מה חסר,
--     במקום להשמיט אותם בשקט.
--
-- הבדלים בין שני המבנים, ומה נעשה בהם:
--   * שם המשתתף: ב-AUM עמודה אחת, ב-roster שם פרטי ושם משפחה. המילה הראשונה היא השם הפרטי.
--   * "נמחק" ב-AUM הוא active=false, וזה עובר כמו שהוא: המשתתף נשאר ברשימת הלא פעילים עם ההיסטוריה.
--   * שעת סיום: ל-roster אין עמודה כזאת והוא מחשב {סיום} כשעתיים מההתחלה. ב-AUM זה 16:00. לכן {סיום} בתבניות
--     ובהודעת יום המפגש מוחלף בשעה עצמה.
--   * הודעת יום המפגש: ב-AUM הנוסח של טל חי בקוד הדף. ב-roster הוא נשמר בסוג המפגש, כדי שלא יוחלף בנוסח הכללי.
--   * רשימת המתנה (status=waitlist) לא קיימת ב-roster, ולכן הסקריפט נעצר אם יש כזאת.
-- ==========================================================================

create or replace function pg_temp.roster_move_aum() returns jsonb
language plpgsql as $fn$
declare
  b        uuid;
  fresh    boolean := false;
  endlit   text;
  evmsg    text := E'היום זה קורה!\nנפגשים היום ב{מקום}.\n{הוראות הגעה}\nהתכנסות: {התכנסות}, מתחילים ב-{התחלה} ועד {סיום}.\n\nמומלץ להגיע בבגדים נוחים ובקבוק מים.\nמחכה לכם, טל';
  n_p int; n_pa int; n_m int; n_a int; n_pay int; n_n int; n_t int; n_ev int;
begin
  -- 1. נתונים שהסקריפט לא יודע להעתיק: עוצרים, לא משמיטים
  if exists (select 1 from public.aum_promoters)         then raise exception 'move-aum: aum_promoters is not empty, this script does not copy paid-marketing sources'; end if;
  if exists (select 1 from public.aum_promoter_payments) then raise exception 'move-aum: aum_promoter_payments is not empty'; end if;
  if exists (select 1 from public.aum_finance)           then raise exception 'move-aum: aum_finance is not empty'; end if;
  if exists (select 1 from public.aum_finance_recurring) then raise exception 'move-aum: aum_finance_recurring is not empty'; end if;
  if exists (select 1 from public.aum_statuses)          then raise exception 'move-aum: aum_statuses is not empty'; end if;
  if exists (select 1 from public.aum_price_tiers)       then raise exception 'move-aum: aum_price_tiers is not empty'; end if;
  if exists (select 1 from public.aum_registrations where status not in ('new', 'confirmed')) then raise exception 'move-aum: a registration is on the waiting list, roster has none'; end if;
  if exists (select 1 from public.aum_registrations where will_pay or maybe or meeting_key is not null or during_key is not null or after_key is not null or status_key is not null) then raise exception 'move-aum: a registration carries a field roster has no column for (will_pay, maybe, meeting_key, during_key, after_key, status_key)'; end if;
  if exists (select 1 from public.aum_registrations where paid and coalesce(paid_amount, 0) = 0) then raise exception 'move-aum: a registration is marked paid without an amount'; end if;
  if exists (select 1 from public.aum_participants where cardinality(tags) > 0 or note <> '' or status_key is not null or no_pay) then raise exception 'move-aum: a participant carries a field roster has no column for (tags, note, status_key, no_pay)'; end if;

  -- 2. העסק
  select id into b from public.roster_businesses where slug = 'aum';
  if b is null then
    insert into public.roster_businesses (slug, name) values ('aum', 'AUM') returning id into b;   -- הטריגר פותח לו הגדרות ותבנית מערכת
    fresh := true;
  end if;
  endlit := coalesce((select to_char(end_time, 'HH24:MI') from public.aum_events order by event_date desc, start_time desc limit 1), '16:00');

  -- 3. הטריגרים של roster כבויים בזמן ההעתקה (ראו למעלה), ומופעלים שוב לפני הסיום. כל הפונקציה היא עסקה אחת
  alter table public.roster_participants   disable trigger user;
  alter table public.roster_meetings       disable trigger user;
  alter table public.roster_meeting_types  disable trigger user;
  alter table public.roster_attendance     disable trigger user;
  alter table public.roster_payments       disable trigger user;
  alter table public.roster_notes          disable trigger user;
  alter table public.roster_pay_methods    disable trigger user;
  alter table public.roster_msg_templates  disable trigger user;
  alter table public.roster_msg_sent       disable trigger user;
  alter table public.roster_admin_prefs    disable trigger user;

  -- 4. הגדרות ומנהלים: רק כשהעסק נפתח עכשיו, כדי שהרצה נוספת לא תדרוס שינוי שנעשה כבר ב-roster
  if fresh then
    insert into public.roster_business_users (business_id, email)
      select b, lower(btrim(email)) from public.aum_admins on conflict do nothing;
    update public.roster_business_settings set
        notify_emails            = array['tal.amitai1@gmail.com'],     -- במקום התראות הדפדפן: מייל לטל על כל הרשמה חדשה
        participant_mail_enabled = false,                              -- המשתתפים לא מקבלים מיילים בינתיים
        personal_area_enabled    = false,                              -- לא היה אזור אישי ב-AUM
        registration_open        = true,
        signup_required          = array['first_name', 'last_name', 'phone', 'age', 'gender']   -- כמו הטופס של טל
      where business_id = b;
  end if;

  -- 5. סוגי מפגש ומפגשים
  insert into public.roster_meeting_types (id, business_id, name, sort, meeting_time, place, city, max_participants, directions, price_tiers, event_open, event_msg, created_at)
    select t.id, b, t.name, t.sort, t.meeting_time, t.place, t.city, t.max_participants, t.directions, t.price_tiers, t.event_open,
           coalesce(t.event_msg, case when fresh then replace(evmsg, '{סיום}', endlit) end), t.created_at
      from public.aum_meeting_types t
    on conflict (id) do nothing;

  insert into public.roster_meetings (id, business_id, meeting_date, meeting_time, name, type_id, place, city, max_participants, directions, price_tiers, inherit, created_at)
    select e.id, b, e.event_date, e.start_time, coalesce(nullif(btrim(e.name), ''), nullif(btrim(e.title), '')), e.type_id, e.location, e.city, e.capacity,
           e.directions,
           coalesce(e.price_tiers, case when e.price is not null then jsonb_build_object('base', e.price, 'steps', '[]'::jsonb) end),
           e.inherit, e.created_at
      from public.aum_events e
    on conflict (id) do update set
      meeting_date = excluded.meeting_date, meeting_time = excluded.meeting_time, name = excluded.name, type_id = excluded.type_id,
      place = excluded.place, city = excluded.city, max_participants = excluded.max_participants, directions = excluded.directions,
      price_tiers = excluded.price_tiers, inherit = excluded.inherit;

  -- 6. משתתפים (גם הלא פעילים): הטלפון המנורמל מועתק כמו שהוא, וההפרדה לשם פרטי ומשפחה לפי המילה הראשונה
  insert into public.roster_participants (id, business_id, first_name, last_name, phone, phone_norm, age, age_set_at, gender, active, created_at)
    select p.id, b,
           split_part(btrim(p.name), ' ', 1),
           btrim(substr(btrim(p.name), length(split_part(btrim(p.name), ' ', 1)) + 1)),
           p.phone, nullif(p.phone_norm, ''), p.age, p.age_set_at, p.gender, p.active, p.created_at
      from public.aum_participants p
    on conflict (id) do update set
      first_name = excluded.first_name, last_name = excluded.last_name, phone = excluded.phone, phone_norm = excluded.phone_norm,
      age = excluded.age, age_set_at = excluded.age_set_at, gender = excluded.gender, active = excluded.active;

  -- 7. הרשמות לשיוך (מפגש), ותשלומים
  insert into public.roster_attendance (participant_id, meeting_id, business_id, pay_requested_at, created_at, attended, attended_at, paid_amount, commission, paid_at,
                                        details_sent_at, no_pay, pay_later_at, pay_due_amount, pay_closed_at, pay_method, pay_method_note, pay_reported_at, pay_reported_amount, pay_rejected_at)
    select r.participant_id, r.event_id, b, r.pay_requested_at, r.created_at, r.attended, r.attended_at, r.paid_amount, r.commission, r.paid_at,
           r.details_sent_at, coalesce(r.no_pay, r.exempt), r.pay_later_at, r.pay_due_amount, r.pay_closed_at, r.pay_method, r.pay_method_note, r.pay_reported_at, r.pay_reported_amount, r.pay_rejected_at
      from public.aum_registrations r
    on conflict (participant_id, meeting_id) do update set
      pay_requested_at = excluded.pay_requested_at, attended = excluded.attended, attended_at = excluded.attended_at, paid_amount = excluded.paid_amount,
      commission = excluded.commission, paid_at = excluded.paid_at, details_sent_at = excluded.details_sent_at, no_pay = excluded.no_pay,
      pay_later_at = excluded.pay_later_at, pay_due_amount = excluded.pay_due_amount, pay_closed_at = excluded.pay_closed_at, pay_method = excluded.pay_method,
      pay_method_note = excluded.pay_method_note, pay_reported_at = excluded.pay_reported_at, pay_reported_amount = excluded.pay_reported_amount,
      pay_rejected_at = excluded.pay_rejected_at;

  insert into public.roster_payments (id, business_id, participant_id, meeting_id, kind, amount, from_credit, method, method_note, reason, pkg_n, pkg, commission, author_name, created_at)
    select y.id, b, y.participant_id, y.meeting_id, y.kind, y.amount, y.from_credit, y.method, y.method_note, y.reason, y.pkg_n, y.pkg, y.commission, y.author_name, y.created_at
      from public.aum_payments y
    on conflict (id) do nothing;

  -- 8. הערות (גם הערות המערכת, כמו "הוסר/ה מהמפגש"): ההיסטוריה של כל משתתף
  insert into public.roster_notes (id, business_id, participant_id, body, image, author_email, author_name, system, event_type, meeting_id, meeting_short, new_status, status_label, status_color, amount, created_at, mail_failed, mail_noaddr)
    select a.id, b, a.participant_id, a.body, a.image, a.author_email, a.author_name, a.system, a.event_type, a.meeting_id, a.meeting_short, a.new_status, a.status_label, a.status_color, a.amount, a.created_at, a.mail_failed, a.mail_noaddr
      from public.aum_notes a
    on conflict (id) do nothing;

  -- 9. הגדרות של הדף: אמצעי תשלום, תבניות הודעה, העדפות. רק כשהעסק נפתח עכשיו
  if fresh then
    insert into public.roster_pay_methods (business_id, key, name, sort, owner_email)
      select b, m.key, m.name, m.sort, m.owner_email from public.aum_pay_methods m
    on conflict do nothing;

    -- תבנית המערכת ("אישור מקום") כבר נפתחה לעסק, וכאן מקבלת את הנוסח של טל. השאר מועתקות כמו שהן
    update public.roster_msg_templates t set body = replace(a.body, '{סיום}', endlit)
      from public.aum_msg_templates a where a.system_key is not null and t.business_id = b and t.system_key = a.system_key;
    insert into public.roster_msg_templates (id, business_id, type_id, meeting_id, name, body, sort, created_at)
      select a.id, b, a.type_id, a.meeting_id, a.name, replace(a.body, '{סיום}', endlit), a.sort, a.created_at
        from public.aum_msg_templates a where a.system_key is null
    on conflict (id) do nothing;

    insert into public.roster_admin_prefs (business_id, email, sender_name, view_scopes, event_open, event_msg)
      select b, lower(btrim(x.email)), x.sender_name, x.view_scopes, x.event_open, x.event_msg from public.aum_admin_prefs x
    on conflict do nothing;
  end if;

  insert into public.roster_msg_sent (id, business_id, participant_id, meeting_id, tpl_key, sent_at, sent_by)
    select s.id, b, s.participant_id, s.meeting_id, s.tpl_key, s.sent_at, s.sent_by from public.aum_msg_sent s
  on conflict (id) do nothing;

  -- בדיקות המפתחות הזרים נדחות לסוף העסקה, ובלי לבצע אותן עכשיו אי אפשר להפעיל את הטריגרים מחדש
  set constraints all immediate;

  alter table public.roster_participants   enable trigger user;
  alter table public.roster_meetings       enable trigger user;
  alter table public.roster_meeting_types  enable trigger user;
  alter table public.roster_attendance     enable trigger user;
  alter table public.roster_payments       enable trigger user;
  alter table public.roster_notes          enable trigger user;
  alter table public.roster_pay_methods    enable trigger user;
  alter table public.roster_msg_templates  enable trigger user;
  alter table public.roster_msg_sent       enable trigger user;
  alter table public.roster_admin_prefs    enable trigger user;

  select count(*) into n_p   from public.roster_participants where business_id = b;
  select count(*) into n_pa  from public.roster_participants where business_id = b and active;
  select count(*) into n_m   from public.roster_meetings     where business_id = b;
  select count(*) into n_a   from public.roster_attendance   where business_id = b;
  select count(*) into n_pay from public.roster_payments     where business_id = b;
  select count(*) into n_n   from public.roster_notes        where business_id = b;
  select count(*) into n_t   from public.roster_msg_templates where business_id = b;
  select count(*) into n_ev  from public.roster_events       where business_id = b;
  return jsonb_build_object('business_created_now', fresh, 'participants', n_p, 'participants_active', n_pa, 'meetings', n_m,
                            'registrations', n_a, 'payments', n_pay, 'notes', n_n, 'templates', n_t, 'events_created', n_ev, 'end_time_used', endlit);
end $fn$;

select pg_temp.roster_move_aum() as result;
