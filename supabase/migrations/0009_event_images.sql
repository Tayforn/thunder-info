-- Thunder — міграція 0009: картинка евента (поле «Картинка» на «ДС Евенти»).
-- Виконати після 0008 (потрібна can_manage_events()): Dashboard → SQL Editor →
-- New query → вставити весь файл → Run. ВАЖЛИВО: спершу ця міграція, потім
-- деплой функції discord-events.
--
-- Картинка, вставлена на сторінці (Ctrl+V / перетягнути / вибрати файл),
-- вантажиться в публічний бакет Storage `event-images` — посилання постійне
-- (на відміну від cdn.discordapp.com/attachments, які спливають за добу).
-- Функція discord-events показує її в щоденному пості під списком, у пінгу
-- і ставить обкладинкою «Події» Discord.

alter table events
  add column if not exists image_url text
  check (image_url is null or image_url ~ '^https?://');

-- Яка картинка зараз стоїть обкладинкою «Події» — щоб функція заливала її
-- в Discord лише при зміні, а не кожні 5 хв.
alter table discord_scheduled_events add column if not exists image_url text;

-- events_in_range / events_today віддають image_url (зміна набору колонок → drop).
drop function if exists events_today(date);
drop function if exists events_in_range(date, date);

create function events_in_range(p_from date, p_to date)
returns table (
  event_date date,
  id uuid,
  name text,
  start_time time,
  note text,
  duration_minutes int,
  ping_minutes_before int,
  ping_role_id text,
  image_url text,
  sort_order int
)
language sql stable set search_path = public as $$
  select d::date as event_date, e.id, e.name, e.start_time, e.note, e.duration_minutes,
         e.ping_minutes_before, e.ping_role_id, e.image_url, e.sort_order
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as d
  join events e
    on e.enabled
   and (e.event_date = d::date
        or (e.event_date is null and extract(dow from d)::int = any (e.weekdays)))
  order by d asc, e.start_time asc nulls last, e.sort_order asc, e.name asc;
$$;

create function events_today(p_date date default null)
returns table (
  id uuid,
  name text,
  start_time time,
  note text,
  duration_minutes int,
  ping_minutes_before int,
  ping_role_id text,
  image_url text,
  sort_order int
)
language sql stable set search_path = public as $$
  select r.id, r.name, r.start_time, r.note, r.duration_minutes, r.ping_minutes_before,
         r.ping_role_id, r.image_url, r.sort_order
  from events_in_range(
    coalesce(p_date, (now() at time zone 'Europe/Kyiv')::date),
    coalesce(p_date, (now() at time zone 'Europe/Kyiv')::date)
  ) r;
$$;

revoke execute on function events_in_range(date, date) from public, anon;
grant execute on function events_in_range(date, date) to authenticated, service_role;
revoke execute on function events_today(date) from public, anon;
grant execute on function events_today(date) to authenticated, service_role;

-- =========================================================
-- Storage: публічний бакет для картинок евентів (читати може будь-хто за
-- посиланням — інакше Discord їх не покаже), вантажити/видаляти — лише
-- повні адміни й адміни евентів. До 5 МБ, лише картинки.
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists event_images_select on storage.objects;
drop policy if exists event_images_insert on storage.objects;
drop policy if exists event_images_delete on storage.objects;

create policy event_images_select on storage.objects for select to authenticated
  using (bucket_id = 'event-images' and public.can_manage_events());
create policy event_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'event-images' and public.can_manage_events());
create policy event_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-images' and public.can_manage_events());
