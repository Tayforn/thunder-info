# Supabase — налаштування Thunder

Окремий Supabase-проєкт (не спільний з pw-pvp/pw-events).

1. Зареєструйся на [supabase.com](https://supabase.com) (безкоштовно) і створи новий проєкт (напр. `thunder-info`).
2. У проєкті: **SQL Editor → New query**, встав увесь вміст `migrations/0001_init.sql`, натисни **Run**.
   - Якщо рядок `create extension if not exists pg_cron;` впаде через права доступу — увімкни pg_cron вручну через
     **Dashboard → Database → Extensions**, потім запусти міграцію ще раз (вона ідемпотентна, `create table if not exists` і `on conflict do nothing` не зашкодять).
3. **Project Settings → API** — скопіюй `Project URL` і `anon public` ключ у `.env.local`:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. Створи свій адмін-акаунт:
   - **Authentication → Users → Add user** (email + пароль).
   - У SQL Editor виконай (підставивши свій email):
     ```sql
     insert into admins (user_id, email)
     select id, email from auth.users where email = 'you@example.com';
     ```
   - Так само додай усіх інших адмінів гільдії (усі рівноправні — без ролей superadmin/gm).
5. Проставте ціни в Адмінці (`/admin` → «Ціна лута») — 5 стартових валютних айтемів КХ додані з ціною 0, решту (камені) додавайте самі.

**Важливо:** безкоштовний проєкт автоматично паузиться після ~7 днів без запитів до API — якщо трафік малий, раз на тиждень заходь у дашборд і тисни "Restore project".

## Щоденне нарахування балів

`award_daily_points()` рахує бали за сьогоднішні галочки з `/activity` і пише їх у `point_awards` після 23:00 за Києвом (крон-джоб `award-daily-points` перевіряє це щогодини — без точного разового запуску, щоб не залежати від переходу на літній/зимовий час). Побачити нараховане можна в `/newbies` (сума балів) або прямим запитом:

```sql
select n.nickname, pa.award_date, pa.points, pa.breakdown
from point_awards pa join newbies n on n.id = pa.newbie_id
order by pa.award_date desc, pa.points desc;
```
