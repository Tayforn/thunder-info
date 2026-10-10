-- Thunder — міграція 0006: стабільний порядок рядків в «Активностях» і «Евентах».
-- Виконати після 0005: Dashboard → SQL Editor → New query → вставити весь файл → Run.
--
-- Проблема: усі активності мали sort_order = 0, а евенти, імпортовані в 0005,
-- ще й однаковий created_at. Postgres повертав їх у довільному порядку, який
-- змінювався після кожного update (оновлений рядок переїжджає в heap) —
-- рядки «стрибали» в адмінці після кожної правки.
--
-- Рішення: наявні рядки пронумеровані (у тому порядку, в якому вони були),
-- кожен новий отримує наступний номер (before-insert тригер), а клієнт
-- додатково сортує за created_at та id — порядок стабільний навіть при
-- однакових номерах.

create or replace function assign_next_sort_order() returns trigger
language plpgsql as $$
declare next_order int;
begin
  if new.sort_order is null or new.sort_order = 0 then
    execute format('select coalesce(max(sort_order), 0) + 1 from %I', tg_table_name) into next_order;
    new.sort_order := next_order;
  end if;
  return new;
end;
$$;

drop trigger if exists activities_sort_order on activities;
create trigger activities_sort_order
  before insert on activities
  for each row execute function assign_next_sort_order();

drop trigger if exists events_sort_order on events;
create trigger events_sort_order
  before insert on events
  for each row execute function assign_next_sort_order();

-- Евент із нової активності більше не копіює її sort_order — отримує свій
-- наступний номер у events (тригер вище).
create or replace function create_event_from_activity() returns trigger
language plpgsql as $$
begin
  insert into events (activity_id, name, weekdays)
  values (new.id, new.name, coalesce(new.weekdays, '{}'));
  return new;
end;
$$;

-- Разова нумерація наявних рядків (повторний запуск лише перенумерує в
-- тому ж порядку).
with ranked as (
  select id, row_number() over (order by sort_order, created_at, name, id) as rn
  from activities
)
update activities a set sort_order = r.rn from ranked r where r.id = a.id and a.sort_order is distinct from r.rn;

with ranked as (
  select id, row_number() over (order by sort_order, created_at, name, id) as rn
  from events
)
update events e set sort_order = r.rn from ranked r where r.id = e.id and e.sort_order is distinct from r.rn;
