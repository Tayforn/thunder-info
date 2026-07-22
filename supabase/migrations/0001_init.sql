-- Thunder — Supabase-схема (окремий проєкт від pw-pvp/pw-events).
-- Виконати один раз: Dashboard → SQL Editor → New query → вставити весь файл → Run.

-- =========================================================
-- Адмін allow-list. На відміну від pw-pvp тут немає ролей
-- (superadmin/gm) — усі адміни Thunder рівноправні: будь-хто з admins
-- може редагувати новачків/лут/активності/класи і ставити галочки на
-- сторінці "Активність".
-- =========================================================
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

alter table admins enable row level security;
create policy admins_select on admins for select using (is_admin());
-- без insert/update/delete policy: керування allow-list лише з SQL Editor / service-role.

-- =========================================================
-- Класи персонажів і їх пріоритетність ("Приоритетність класів").
-- coef множиться на бали активності при щоденному нарахуванні.
-- =========================================================
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  coef numeric not null default 1 check (coef > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into classes (name, coef, sort_order) values
  ('Танк', 1, 0), ('Дру', 1, 1), ('Вар', 1, 2), ('Маг', 1, 3), ('Пріст', 1, 4),
  ('Лук', 1, 5), ('Сін', 1, 6), ('Шаман', 1, 7), ('Сікер', 1, 8), ('Містик', 1, 9)
on conflict (name) do nothing;

-- =========================================================
-- Новачки ("Новачки").
-- =========================================================
create table if not exists newbies (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(trim(nickname)) between 1 and 40),
  class_id uuid references classes(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- Лут і його ціна ("Ціна лута"). is_gear_stone=false лише для 5 стартових
-- валютних айтемів КХ (монета/медаль/емблема/2 мішки) — усе, що адмін
-- додає далі, за замовчуванням true ("камінь в шмот"), як просив користувач.
-- kh_* поля — статистика дропу з КХ (лише для валютних айтемів, інакше null).
-- =========================================================
create table if not exists loot_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0 check (price >= 0),
  is_gear_stone boolean not null default true,
  pwdb_url text,
  kh_chance_pct numeric check (kh_chance_pct is null or kh_chance_pct between 0 and 100),
  kh_c1_min int, kh_c1_max int,
  kh_c2_min int, kh_c2_max int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into loot_items (name, price, is_gear_stone, pwdb_url, kh_chance_pct, kh_c1_min, kh_c1_max, kh_c2_min, kh_c2_max) values
  ('Колекційна монета', 0, false, 'https://www.pwdatabase.com/ru/items/32911', 81.45, 12, 16, 12, 16),
  ('Медаль у вигляді щита', 0, false, 'https://www.pwdatabase.com/ru/items/32912', 10, 12, 16, 12, 16),
  ('Емблема ножа', 0, false, 'https://www.pwdatabase.com/ru/items/32913', 6, 0, 0, 9, 9),
  ('Мішок з каменем великого майстра', 0, false, 'https://www.pwdatabase.com/ru/items/32927', 0.75, 3, 4, 3, 4),
  ('Мішок з каменем укриття', 0, false, 'https://www.pwdatabase.com/ru/items/32928', 1.8, 3, 4, 3, 4)
on conflict do nothing;

-- =========================================================
-- Активності ("Активності") — власна к-сть балів і дні тижня, коли
-- відбуваються (0=неділя..6=субота, як Postgres extract(dow)).
-- =========================================================
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  points numeric not null default 0 check (points >= 0),
  weekdays int[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- =========================================================
-- Галочки за сьогоднішні активності ("Активність"). Наявність рядка =
-- галочка стоїть; toggle = insert/delete (без окремого boolean-прапорця,
-- як registrations в pw-pvp — unique-рядок як джерело правди).
-- =========================================================
create table if not exists activity_checks (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  newbie_id uuid not null references newbies(id) on delete cascade,
  check_date date not null default ((now() at time zone 'Europe/Kyiv')::date),
  checked_by uuid references admins(user_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (activity_id, newbie_id, check_date)
);

-- =========================================================
-- Щоденне нарахування балів (фіналізовані дні, для сортування на
-- /newbies). award_date і breakdown — за Києвом.
-- =========================================================
create table if not exists point_awards (
  id uuid primary key default gen_random_uuid(),
  newbie_id uuid not null references newbies(id) on delete cascade,
  award_date date not null,
  points numeric not null default 0,
  breakdown jsonb,
  created_at timestamptz not null default now(),
  unique (newbie_id, award_date)
);

-- =========================================================
-- Шмотки Р8 ("Р8") і їх склад — лише валютні айтеми (is_gear_stone=false).
-- =========================================================
create table if not exists gear_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gear_item_components (
  id uuid primary key default gen_random_uuid(),
  gear_item_id uuid not null references gear_items(id) on delete cascade,
  loot_item_id uuid not null references loot_items(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  unique (gear_item_id, loot_item_id)
);

-- Компоненти шмотки Р8 — лише не-камінні (валютні) айтеми; захист на
-- рівні БД, бо кілька адмінів редагують паралельно, а UI-фільтр можна
-- обійти прямим запитом.
create or replace function check_gear_component_not_stone() returns trigger
language plpgsql as $$
declare is_stone boolean;
begin
  select is_gear_stone into is_stone from loot_items where id = new.loot_item_id;
  if is_stone then
    raise exception 'Компонент шмотки Р8 має бути валютним айтемом (не "камінь в шмот").';
  end if;
  return new;
end;
$$;

drop trigger if exists gear_item_components_not_stone on gear_item_components;
create trigger gear_item_components_not_stone
  before insert or update on gear_item_components
  for each row execute function check_gear_component_not_stone();

-- =========================================================
-- RLS: публічне читання всюди (той самий підхід, що pw-pvp — anon-ключ і
-- так публічний, гранулярність тут не додає реального захисту), запис —
-- лише адмінам.
-- =========================================================
alter table classes enable row level security;
alter table newbies enable row level security;
alter table loot_items enable row level security;
alter table activities enable row level security;
alter table activity_checks enable row level security;
alter table point_awards enable row level security;
alter table gear_items enable row level security;
alter table gear_item_components enable row level security;

create policy classes_select on classes for select using (true);
create policy classes_write on classes for all using (is_admin()) with check (is_admin());

create policy newbies_select on newbies for select using (true);
create policy newbies_write on newbies for all using (is_admin()) with check (is_admin());

create policy loot_items_select on loot_items for select using (true);
create policy loot_items_write on loot_items for all using (is_admin()) with check (is_admin());

create policy activities_select on activities for select using (true);
create policy activities_write on activities for all using (is_admin()) with check (is_admin());

create policy activity_checks_select on activity_checks for select using (true);
create policy activity_checks_write on activity_checks for all using (is_admin()) with check (is_admin());

create policy point_awards_select on point_awards for select using (true);
-- без write policy: point_awards пише лише award_daily_points() (security definer), не клієнти.

create policy gear_items_select on gear_items for select using (true);
create policy gear_items_write on gear_items for all using (is_admin()) with check (is_admin());

create policy gear_item_components_select on gear_item_components for select using (true);
create policy gear_item_components_write on gear_item_components for all using (is_admin()) with check (is_admin());

-- =========================================================
-- Realtime — потрібно для /activity (спільні галочки, оновлення без
-- релоаду в інших адмінів). Створення таблиці НЕ вмикає Realtime
-- автоматично, треба явно додати до публікації.
-- =========================================================
alter publication supabase_realtime add table activity_checks;

-- =========================================================
-- Щоденне нарахування балів о 23:00+ за Києвом. Через DST/UTC-зсув
-- pg_cron (без вбудованої підтримки таймзони в cron.schedule) джоб
-- запускається щогодини й ідемпотентно перевіряє, чи вже пізніше 23:00
-- за Києвом і чи ще не нараховано на сьогодні — той самий підхід, що
-- create_due_series_tournaments/close_past_tournament_registrations в
-- pw-pvp (крон раз на 2 години замість точного разового запуску).
-- =========================================================
create or replace function award_daily_points() returns void
language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Europe/Kyiv')::date;
begin
  if (now() at time zone 'Europe/Kyiv')::time < '23:00' then
    return;
  end if;

  insert into point_awards (newbie_id, award_date, points, breakdown)
  select
    ac.newbie_id,
    today,
    sum(a.points * coalesce(c.coef, 1)),
    jsonb_agg(jsonb_build_object('activity_id', a.id, 'name', a.name, 'points', a.points, 'coef', coalesce(c.coef, 1)))
  from activity_checks ac
  join activities a on a.id = ac.activity_id
  left join newbies n on n.id = ac.newbie_id
  left join classes c on c.id = n.class_id
  where ac.check_date = today
  group by ac.newbie_id
  on conflict (newbie_id, award_date) do update
    set points = excluded.points, breakdown = excluded.breakdown;
end;
$$;

-- Якщо цей рядок впаде з правами доступу — увімкни pg_cron вручну через
-- Dashboard → Database → Extensions замість цього рядка, решта міграції
-- відпрацює однаково.
create extension if not exists pg_cron;

select cron.schedule('award-daily-points', '0 * * * *', 'select award_daily_points();');

-- =========================================================
-- Після виконання цієї міграції: зроби собі адмін-акаунт.
-- 1. Зареєструйся один раз через Supabase Auth (Dashboard → Authentication
--    → Users → Add user).
-- 2. Виконай, підставивши свій email:
--      insert into admins (user_id, email)
--      select id, email from auth.users where email = 'you@example.com';
-- =========================================================
