-- Thunder — міграція 0002: гравці ("Гравці") та їх відвідуваність активностей.
-- Виконати після 0001_init.sql: Dashboard → SQL Editor → New query → вставити весь файл → Run.

-- =========================================================
-- Гравці — як новачки, але з простішою системою балів: бали = сума
-- activity.points за відвідані активності (без коефіцієнтів класу і без
-- крон-снапшотів point_awards — рахується напряму з галочок) + ручні
-- премії (player_bonuses). Клас лишається як довідкова інформація
-- ростера (той самий довідник classes, що й у новачків).
-- =========================================================
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(trim(nickname)) between 1 and 40),
  class_id uuid references classes(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- Відвідуваність активностей гравцями — та сама модель, що
-- activity_checks у новачків: наявність рядка = гравець був на
-- активності в цей день, toggle = insert/delete. Активності беруться зі
-- спільної таблиці activities. award_daily_points ці галочки не читає:
-- бали гравця рахуються на клієнті як сума activity.points за галочками
-- (зміна балів активності ретроактивно перераховує суму — свідомий
-- компроміс заради простоти, без снапшот-таблиці).
-- =========================================================
create table if not exists player_activity_checks (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  check_date date not null default ((now() at time zone 'Europe/Kyiv')::date),
  checked_by uuid references admins(user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (activity_id, player_id, check_date)
);

-- =========================================================
-- Премії — ручне нарахування балів конкретному гравцю в конкретний день
-- (адмін видає з календаря відвідуваності на /players). Одна премія на
-- гравця на день (unique) — повторна видача перезаписує суму (upsert).
-- =========================================================
create table if not exists player_bonuses (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  bonus_date date not null default ((now() at time zone 'Europe/Kyiv')::date),
  points numeric not null check (points > 0),
  note text,
  created_by uuid references admins(user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (player_id, bonus_date)
);

-- RLS: той самий підхід, що в 0001 — публічне читання, запис лише адмінам.
alter table players enable row level security;
alter table player_activity_checks enable row level security;
alter table player_bonuses enable row level security;

create policy players_select on players for select using (true);
create policy players_write on players for all using (is_admin()) with check (is_admin());

create policy player_activity_checks_select on player_activity_checks for select using (true);
create policy player_activity_checks_write on player_activity_checks for all using (is_admin()) with check (is_admin());

create policy player_bonuses_select on player_bonuses for select using (true);
create policy player_bonuses_write on player_bonuses for all using (is_admin()) with check (is_admin());

-- Realtime — щоб галочки гравців на /activity оновлювались в інших
-- адмінів без релоаду (як activity_checks у 0001).
alter publication supabase_realtime add table player_activity_checks;
