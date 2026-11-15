/* Moves one app's database objects out of a shared schema into a schema of its own, dropping the app's
   prefix from every name:  public.roster_participants  ->  roster.participants.

     node scripts/db-split.mjs <from-schema> <to-schema> <prefix> [--run]

   Without --run it only prints the SQL. With --run it sends it, as ONE transaction (all or nothing), through
   scripts/sql.mjs. Moves tables (data, indexes, policies, triggers and realtime membership go with them, they
   are bound by id, not by name) and functions (the bodies are text, so every old name inside them is
   rewritten, and each function gets search_path = <to-schema>, public). Then grants the schema to the API
   roles. Exposing the schema to the REST API is a separate step (see scripts/db-expose.mjs). */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const [src, dst, pfx] = process.argv.slice(2);
if (!src || !dst || !pfx) { console.error("usage: db-split.mjs <from> <to> <prefix> [--run]"); process.exit(1); }
const BS = String.fromCharCode(92);
const q = (s) => "'" + s.replace(/'/g, "''") + "'";
/* new names that would shadow a built-in or another schema's function */
const OVERRIDE = { [pfx + "email"]: "email_of", [pfx + "money"]: "money_text", [pfx + "sha256"]: "sha256_hex" };
const sql = `
do $mig$
declare
  src text := ${q(src)}; dst text := ${q(dst)}; pfx text := ${q(pfx)};
  ren jsonb := ${q(JSON.stringify(OVERRIDE))}::jsonb;
  r record; def text;
begin
  create temp table _m(old text, new text, kind text) on commit drop;
  insert into _m select c.relname, coalesce(ren->>c.relname, substr(c.relname, length(pfx)+1)), 'table'
    from pg_class c where c.relnamespace = src::regnamespace and c.relkind = 'r' and left(c.relname, length(pfx)) = pfx;
  create temp table _f(oid oid, old text, new text) on commit drop;
  insert into _f select p.oid, p.proname, coalesce(ren->>p.proname, substr(p.proname, length(pfx)+1))
    from pg_proc p where p.pronamespace = src::regnamespace and p.prokind = 'f' and left(p.proname, length(pfx)) = pfx;
  insert into _m select distinct old, new, 'function' from _f;
  if exists (select 1 from _m group by new having count(distinct kind) > 1) then raise exception 'a table and a function would share a name'; end if;

  execute format('create schema %I', dst);
  execute format('grant usage on schema %I to anon, authenticated, service_role', dst);

  for r in select old, new from _m where kind = 'table' loop
    execute format('alter table %I.%I set schema %I', src, r.old, dst);
    execute format('alter table %I.%I rename to %I', dst, r.old, r.new);
  end loop;
  for r in select f.oid, f.old, f.new, pg_get_function_identity_arguments(f.oid) a from _f f loop
    execute format('alter function %I.%I(%s) set schema %I', src, r.old, r.a, dst);
    execute format('alter function %I.%I(%s) rename to %I', dst, r.old, r.a, r.new);
  end loop;

  /* the bodies are text: rewrite every old name (with or without its schema) to the new one */
  perform set_config('search_path', quote_ident(dst) || ', public', true);
  for r in select oid from _f loop
    def := pg_get_functiondef(r.oid);
    declare m record; begin
      for m in select old, new from _m order by length(old) desc loop
        def := regexp_replace(def, '${BS}m(?:' || src || '${BS}.)?' || m.old || '${BS}M', m.new, 'g');
      end loop;
    end;
    /* dynamic SQL names the schema in the text of its format strings */
    def := regexp_replace(def, src || '${BS}.%I', replace(quote_ident(dst), '${BS}', '${BS}${BS}') || '.%I', 'g');
    def := replace(def, 'table_schema = ''' || src || '''', 'table_schema = ''' || dst || '''');
    def := regexp_replace(def, 'SET search_path TO [^${BS}n]*', 'SET search_path TO ' || quote_ident(dst) || ', public');
    execute def;
    execute format('alter function %s set search_path = %I, public', r.oid::regprocedure, dst);
  end loop;
end
$mig$;
select 'done' as result;
`;
if (!process.argv.includes("--run")) { console.log(sql); process.exit(0); }
const r = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "sql.mjs")], { input: sql, stdio: ["pipe", "inherit", "inherit"] });
process.exit(r.status || 0);
