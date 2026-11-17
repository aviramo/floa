-- READ-ONLY. Run on production BEFORE email-unique-index-prod.sql. One row per business; every duplicate_emails must be 0, otherwise do NOT create the index.
select b.slug,
       count(p.id) filter (where btrim(coalesce(p.email, '')) <> '') as participants_with_email,
       (select count(*) from (select lower(btrim(q.email)) from roster.participants q
                               where q.business_id = b.id and btrim(coalesce(q.email, '')) <> ''
                               group by 1 having count(*) > 1) d) as duplicate_emails
  from roster.businesses b
  left join roster.participants p on p.business_id = b.id
 group by b.id, b.slug
 order by b.slug;
