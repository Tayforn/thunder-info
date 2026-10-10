-- Thunder — міграція 0008: роль адміна — повний доступ або лише «Евенти».
-- Виконати після 0007: Dashboard → SQL Editor → New query → вставити весь файл → Run.
--
-- Досі всі адміни були рівноправні. Тепер у admins є role:
--   * 'admin'  — усе, як і було (усі наявні адміни отримують саме її);
--   * 'events' — лише таб «Евенти» в адмінці (пост у Discord, пінги, «Події»);
--     решта адмінки, /activity і /r8 закриті, редагувати новачків/гравців/
--     лут/активності не може. Читати закриті розділи гільдії може, як
--     будь-який authenticated (RLS select там і так для всіх, крім anon).
--
-- is_admin() тепер = лише 'admin' — усі наявні політики запису автоматично
-- стають "лише повні адміни". Для евентів — окрема can_manage_events().

alter table admins
  add column if not exists role text not null default 'admin'
  check (role in ('admin', 'events'));

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and role = 'admin');
$$;

create or replace function can_manage_events() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and role in ('admin', 'events'));
$$;

-- Кожен бачить свій рядок (UI читає роль), повний адмін — усі.
drop policy if exists admins_select on admins;
create policy admins_select on admins for select using (user_id = auth.uid() or is_admin());

-- Евенти та стан поста — повні адміни й адміни евентів.
drop policy if exists events_write on events;
create policy events_write on events for all using (can_manage_events()) with check (can_manage_events());

drop policy if exists discord_event_post_select on discord_event_post;
create policy discord_event_post_select on discord_event_post for select using (can_manage_events());

-- =========================================================
-- Як додати адміна евентів (після Authentication → Users → Add user):
--   insert into admins (user_id, email, role)
--   select id, email, 'events' from auth.users where email = 'events@example.com';
-- Змінити роль наявному:
--   update admins set role = 'events' where email = 'someone@example.com';
-- =========================================================
