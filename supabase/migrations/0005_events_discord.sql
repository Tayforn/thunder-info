-- Thunder — міграція 0005: евенти ("Евенти" в адмінці) + пост у Discord.
-- Виконати після 0004: Dashboard → SQL Editor → New query → вставити весь файл → Run.
-- Ідемпотентна: можна запускати повторно.
--
-- Що додає:
--   * events — евенти для поста в Discord. Стартово підтягуються з
--     activities (тригер на insert + разовий імпорт нижче), але далі живуть
--     окремо: назву/дні можна правити, додавати час початку, разові евенти
--     на конкретну дату, примітку, пінг за N хв.
--   * events_today() — "актуальний список на сьогодні" за Києвом; його
--     віддає Edge Function discord-events (supabase/functions/discord-events).
--   * discord_event_post / discord_event_pings — службовий стан: id поста,
--     який редагується щодня, і вже надіслані пінги (щоб не дублювати).
--   * discord_events_sync() + крон кожні 5 хв — смикає Edge Function, яка
--     оновлює пост і шле пінги. Без секретів у Vault крон нічого не робить
--     (див. supabase/DISCORD.md, крок 4).

-- =========================================================
-- Евенти.
-- weekdays — щотижневі дні (0=неділя..6=субота, як в activities);
-- event_date — разовий евент на конкретну дату (має пріоритет над weekdays);
-- start_time — час початку за Києвом, null = "без часу" (у пості без
--   години, пінг не шлеться);
-- ping_minutes_before — за скільки хвилин до start_time пінгувати,
--   null = не пінгувати; ping_role_id — ID ролі Discord для пінгу
--   (null → DISCORD_PING_ROLE_ID з секретів функції, або @here).
-- =========================================================
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references activities(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  weekdays int[] not null default '{}',
  event_date date,
  start_time time,
  note text,
  ping_minutes_before int default 15 check (ping_minutes_before is null or ping_minutes_before between 1 and 180),
  ping_role_id text,
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_activity_id_idx on events (activity_id);

-- Нова активність → одразу евент (без часу; час/пінг додає адмін у
-- табі "Евенти"). Редагування/видалення активності евент НЕ чіпає —
-- евент редагується незалежно, а при видаленні activity_id стає null.
create or replace function create_event_from_activity() returns trigger
language plpgsql as $$
begin
  insert into events (activity_id, name, weekdays, sort_order)
  values (new.id, new.name, coalesce(new.weekdays, '{}'), new.sort_order);
  return new;
end;
$$;

drop trigger if exists activities_create_event on activities;
create trigger activities_create_event
  after insert on activities
  for each row execute function create_event_from_activity();

-- Разовий імпорт уже наявних активностей (повторний запуск нічого не дублює).
insert into events (activity_id, name, weekdays, sort_order)
select a.id, a.name, coalesce(a.weekdays, '{}'), a.sort_order
from activities a
where not exists (select 1 from events e where e.activity_id = a.id);

-- =========================================================
-- Актуальний список на день (за замовчуванням — сьогодні за Києвом).
-- Разові евенти (event_date) мають пріоритет: якщо дата задана, weekdays
-- ігноруються. Порядок: за часом (без часу — в кінці), далі sort_order.
-- =========================================================
create or replace function events_today(p_date date default null)
returns table (
  id uuid,
  name text,
  start_time time,
  note text,
  ping_minutes_before int,
  ping_role_id text,
  sort_order int
)
language sql stable set search_path = public as $$
  with d as (
    select coalesce(p_date, (now() at time zone 'Europe/Kyiv')::date) as today
  )
  select e.id, e.name, e.start_time, e.note, e.ping_minutes_before, e.ping_role_id, e.sort_order
  from events e, d
  where e.enabled
    and (
      e.event_date = d.today
      or (e.event_date is null and extract(dow from d.today)::int = any (e.weekdays))
    )
  order by e.start_time asc nulls last, e.sort_order asc, e.name asc;
$$;

revoke execute on function events_today(date) from public, anon;
grant execute on function events_today(date) to authenticated, service_role;

-- =========================================================
-- Службовий стан поста в Discord (один рядок, id=1): id повідомлення, яке
-- редагується щодня, дата, за яку воно зараз, і хеш вмісту (щоб не
-- смикати Discord, коли нічого не змінилось).
-- =========================================================
create table if not exists discord_event_post (
  id int primary key default 1 check (id = 1),
  message_id text not null,
  channel_id text,
  post_date date not null,
  content_hash text,
  updated_at timestamptz not null default now()
);

-- Надіслані пінги: один на евент на день. Рядок вставляється ДО запиту в
-- Discord — unique-ключ не дає двом паралельним запускам продублювати
-- пінг. message_id — щоб прибрати вчорашні нагадування з каналу.
create table if not exists discord_event_pings (
  event_id uuid not null,
  ping_date date not null,
  message_id text,
  sent_at timestamptz not null default now(),
  primary key (event_id, ping_date)
);

-- =========================================================
-- RLS — як в 0001/0004: читання евентів адмінам (authenticated), запис —
-- лише адмінам, анонім не бачить нічого. Службові таблиці клієнт не
-- пише взагалі (їх веде Edge Function через service_role, який RLS
-- обходить); адмін лише бачить стан поста в табі "Евенти".
-- =========================================================
alter table events enable row level security;
alter table discord_event_post enable row level security;
alter table discord_event_pings enable row level security;

drop policy if exists events_select on events;
drop policy if exists events_write on events;
create policy events_select on events for select using (true);
create policy events_write on events for all using (is_admin()) with check (is_admin());

drop policy if exists discord_event_post_select on discord_event_post;
create policy discord_event_post_select on discord_event_post for select using (is_admin());

revoke all on events, discord_event_post, discord_event_pings from anon;
revoke insert, update, delete on discord_event_post, discord_event_pings from authenticated;

-- =========================================================
-- Крон: кожні 5 хв смикаємо Edge Function, яка оновлює пост і шле пінги
-- (з лідом 15 хв пінг прилетить за 10–15 хв до евента; хочеш точніше —
-- постав '* * * * *'). URL функції і ключ беруться з Vault — їх треба
-- додати один раз, див. supabase/DISCORD.md (крок 4). Поки їх немає,
-- функція тихо нічого не робить.
--
-- Якщо `create extension` впаде через права — увімкни pg_net (і pg_cron,
-- якщо ще не) через Dashboard → Database → Extensions і запусти файл знову.
-- =========================================================
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function discord_events_sync() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'discord_events_sync_url' limit 1;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'discord_events_api_key' limit 1;
  if v_url is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-api-key', v_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
end;
$$;

revoke execute on function discord_events_sync() from public, anon, authenticated;

select cron.schedule('discord-events-sync', '*/5 * * * *', 'select discord_events_sync();');
