-- Thunder — міграція 0003: Realtime для премій.
-- Колонка "Премія" на /activity редагується кількома адмінами паралельно —
-- без публікації зміни інших адмінів видно лише після релоаду (галочки
-- активностей уже realtime з 0002).
alter publication supabase_realtime add table player_bonuses;
