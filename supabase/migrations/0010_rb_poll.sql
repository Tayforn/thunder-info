-- Thunder — міграція 0010: пост «Збір на РБ» у Discord (сторінка /rb).
-- Виконати після 0008 (потрібна is_admin()): Dashboard → SQL Editor →
-- New query → вставити весь файл → Run. Потім — деплой функції discord-events
-- (воркфлоу Deploy Edge Functions робить це сам при пуші в main).
--
-- Емодзі реакції для класу (Адмінка → Приоритетність класів → «Емодзі РБ»):
-- `<:name:id>` кастомне з сервера або звичайний юнікод-емодзі. Клас без
-- емодзі в пості збору не бере участі.
alter table classes add column if not exists rb_emoji text;

-- Один активний пост збору: функція створює його вебхуком, бот ставить
-- реакції-класи, сторінка /rb читає, хто натиснув. Новий збір → новий пост,
-- старий прибирається. Пише сюди лише функція (service_role); адмін лише
-- читає (RLS), anon не бачить.

create table if not exists discord_rb_poll (
  id int primary key default 1 check (id = 1),
  message_id text not null,
  channel_id text not null,
  posted_at timestamptz not null default now()
);

alter table discord_rb_poll enable row level security;

drop policy if exists discord_rb_poll_select on discord_rb_poll;
create policy discord_rb_poll_select on discord_rb_poll for select using (is_admin());

revoke all on discord_rb_poll from anon;
revoke insert, update, delete on discord_rb_poll from authenticated;

-- Налаштування поста збору (редагуються на /rb): текст поста (порожньо =
-- стандартний; плейсхолдери {date} і {classes}) і кого пінгувати: '' —
-- роль за замовчуванням (DISCORD_PING_ROLE_ID, без неї @here), 'everyone',
-- 'here', 'none' — без пінгу, або ID ролі.
create table if not exists discord_rb_settings (
  id int primary key default 1 check (id = 1),
  post_text text not null default '',
  ping text not null default '',
  updated_at timestamptz not null default now()
);
insert into discord_rb_settings (id) values (1) on conflict (id) do nothing;

alter table discord_rb_settings enable row level security;

drop policy if exists discord_rb_settings_select on discord_rb_settings;
drop policy if exists discord_rb_settings_write on discord_rb_settings;
create policy discord_rb_settings_select on discord_rb_settings for select using (is_admin());
create policy discord_rb_settings_write on discord_rb_settings for all using (is_admin()) with check (is_admin());

revoke all on discord_rb_settings from anon;
