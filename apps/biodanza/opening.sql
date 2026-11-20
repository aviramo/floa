-- the opening of the evening: a name and a free text, per vivencia (what is said before the first exercise)
alter table biodanza.vivencias add column if not exists opening_name text;
alter table biodanza.vivencias add column if not exists opening_text text;
