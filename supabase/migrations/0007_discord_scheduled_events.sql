-- Thunder — міграція 0007: «Події» Discord (Scheduled Events) + тривалість евента.
-- Виконати після 0006: Dashboard → SQL Editor → New query → вставити весь файл → Run.
--
-- Edge Function discord-events (з ботом і DISCORD_GUILD_ID) створює в розділі
-- «Події» сервера подію для кожного евента з часом на найближчі N днів
-- (за замовчуванням 7), оновлює при змінах і прибирає, якщо евент вимкнули.
-- Тут — тривалість (Discord вимагає час завершення; null = 60 хв), таблиця
-- відповідності евент+дата → id події в Discord і вибірка на діапазон дат.

alter table events
  add column if not exists duration_minutes int
  check (duration_minutes is null or duration_minutes between 5 and 1440);

create table if not exists discord_scheduled_events (
  event_id uuid not null,
  event_date date not null,
  discord_event_id text not null,
  content_hash text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  started boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (event_id, event_date)
);

-- Службова таблиця: клієнт її не читає й не пише (лише Edge Function через
-- service_role, який RLS обходить).
alter table discord_scheduled_events enable row level security;
revoke all on discord_scheduled_events from anon, authenticated;

-- Евенти на діапазон дат (включно) — та сама логіка, що events_today():
-- разова дата має пріоритет над днями тижня, лише увімкнені.
create or replace function events_in_range(p_from date, p_to date)
returns table (
  event_date date,
  id uuid,
  name text,
  start_time time,
  note text,
  duration_minutes int,
  ping_minutes_before int,
  ping_role_id text,
  sort_order int
)
language sql stable set search_path = public as $$
  select d::date as event_date, e.id, e.name, e.start_time, e.note, e.duration_minutes,
         e.ping_minutes_before, e.ping_role_id, e.sort_order
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as d
  join events e
    on e.enabled
   and (e.event_date = d::date
        or (e.event_date is null and extract(dow from d)::int = any (e.weekdays)))
  order by d asc, e.start_time asc nulls last, e.sort_order asc, e.name asc;
$$;

revoke execute on function events_in_range(date, date) from public, anon;
grant execute on function events_in_range(date, date) to authenticated, service_role;

-- events_today() тепер віддає й тривалість (зміна набору колонок вимагає drop).
drop function if exists events_today(date);
create or replace function events_today(p_date date default null)
returns table (
  id uuid,
  name text,
  start_time time,
  note text,
  duration_minutes int,
  ping_minutes_before int,
  ping_role_id text,
  sort_order int
)
language sql stable set search_path = public as $$
  select r.id, r.name, r.start_time, r.note, r.duration_minutes, r.ping_minutes_before, r.ping_role_id, r.sort_order
  from events_in_range(
    coalesce(p_date, (now() at time zone 'Europe/Kyiv')::date),
    coalesce(p_date, (now() at time zone 'Europe/Kyiv')::date)
  ) r;
$$;

revoke execute on function events_today(date) from public, anon;
grant execute on function events_today(date) to authenticated, service_role;
