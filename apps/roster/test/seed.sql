-- Fake data for the TEST schema (never public). Safe to run again: it clears the demo business first.
-- Run:  node scripts/sql.mjs < apps/roster/test/seed.sql      (it only names test.* tables)
set search_path = test, extensions;
delete from test.businesses where slug = 'demo';
with b as (insert into test.businesses (slug, name) values ('demo', 'עסק לדוגמה') returning id)
insert into test.business_users (business_id, email) select id, 'ofir.aviram@gmail.com' from b;

insert into test.meeting_types (business_id, name, sort, meeting_time, place, max_participants)
select id, t.name, t.s, t.tm::time, t.pl, 20
from test.businesses, (values ('ערב פתוח', 1, '20:00', 'סטודיו מרכז'), ('סדנה', 2, '18:00', 'חדר הסדנאות')) as t(name, s, tm, pl)
where slug = 'demo';

insert into test.meetings (business_id, meeting_date, meeting_time, name, type_id, place, max_participants)
select b.id, current_date + m.d, mt.meeting_time, m.nm, mt.id, mt.place, 20
from test.businesses b
join (values (-14, 'ערב פתוח', 'ערב ישן'), (-7, 'ערב פתוח', 'ערב אחרון'), (7, 'ערב פתוח', 'ערב קרוב'), (14, 'סדנה', 'סדנת חורף')) as m(d, ty, nm) on true
join test.meeting_types mt on mt.business_id = b.id and mt.name = m.ty
where b.slug = 'demo';

insert into test.participants (business_id, first_name, last_name, phone, phone_norm, age, gender, email)
select b.id, p.fn, p.ln, p.ph, regexp_replace(p.ph, '\D', '', 'g'), p.age, p.g, p.em
from test.businesses b,
(values ('נועה','לוי','050-0000001',42,'female','noa@example.com'), ('אורי','כהן','050-0000002',37,'male',null),
        ('מיכל','ברק','050-0000003',53,'female','michal@example.com'), ('יוסי','מזרחי','050-0000004',30,'male',null),
        ('דנה','שרון','050-0000005',28,'female',null), ('רון','אביב','050-0000006',45,'male','ron@example.com'),
        ('תמר','גולן','050-0000007',33,'female',null), ('עמית','פרידמן','050-0000008',60,'male',null)) as p(fn, ln, ph, age, g, em)
where b.slug = 'demo';

-- everyone is signed up to the upcoming evening; the first four also came to the past ones
insert into test.attendance (business_id, participant_id, meeting_id, attended, ticket_price)
select p.business_id, p.id, m.id, (m.meeting_date < current_date and p.phone <= '050-0000004'), 60
from test.participants p
join test.meetings m on m.business_id = p.business_id
where p.business_id = (select id from test.businesses where slug = 'demo')
  and (m.meeting_date >= current_date or p.phone <= '050-0000004');

insert into test.payments (business_id, participant_id, meeting_id, kind, amount, method)
select a.business_id, a.participant_id, a.meeting_id, 'payment', 60, 'cash'
from test.attendance a join test.participants p on p.id = a.participant_id
where a.attended and p.phone <= '050-0000003';
