-- Thunder — закриття даних гільдії від анонімів.
--
-- Після цієї міграції закриті таблиці читають лише:
--   * наш бекенд (service_role) — і лише після перевірки Discord-сесії,
--     тобто членства на сервері клану + потрібної ролі (проксі /api/sb);
--   * адміністратор (роль authenticated із сесією Supabase) — як і раніше,
--     разом із правом редагувати.
--
-- Вітрина лишається публічною: gear_items, gear_item_components, loot_items
-- НЕ чіпаємо — головна та /farm мають працювати без входу.
--
-- ЗАПУСКАТИ ЛИШЕ ПІСЛЯ того, як guild.thunderpw.fun уже працює з входом
-- через Discord (інакше «Новачки»/«Гравці» перестануть відкриватись).
-- Виконати один раз: Dashboard → SQL Editor → New query → Run.

revoke select on
  players,
  player_activity_checks,
  player_bonuses,
  newbies,
  activity_checks,
  activities,
  classes,
  point_awards
from anon;

-- Політики лишаємо як є: вони стосуються і authenticated (адміна), а без
-- табличного GRANT анонім усе одно нічого не прочитає.
