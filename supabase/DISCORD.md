# Discord — пост «Евенти на сьогодні»

Один пост у каналі Discord, який сам оновлюється: новий день — новий список, змінив
евент в адмінці — пост підтягнув зміни за ≤5 хв. Якщо в евента вказаний час — за N хв
до початку в канал прилітає окреме нагадування з пінгом ролі.

Як це влаштовано:

| Шар | Де | Що робить |
|---|---|---|
| Таб **«Евенти»** в адмінці | `/admin` → Евенти | Список евентів: назва, дні тижня або дата, час, примітка, пінг за N хв, роль. Нові активності потрапляють сюди самі (тригер у БД), далі редагуються незалежно. |
| Таблиці `events`, `discord_event_post`, `discord_event_pings` + функція `events_today()` | `migrations/0005_events_discord.sql` | Дані + «актуальний список на сьогодні» за Києвом. |
| Edge Function **`discord-events`** | `functions/discord-events/index.ts` | API: `GET` — список на сьогодні (JSON); `POST …/sync` — оновити пост у Discord, надіслати пінги, прибрати вчорашні. |
| Крон `discord-events-sync` (pg_cron + pg_net) | та сама міграція | Кожні 5 хв смикає `POST …/sync`. |

**Бот Discord не потрібен.** Усе робить вебхук: він уміє створювати, редагувати й
видаляти свої повідомлення і пінгувати ролі. Бот потрібен лише для одного — закріпити
пост у каналі (крок 5, необов'язково).

---

## Крок 1. Міграція

Dashboard → **SQL Editor** → New query → встав увесь `migrations/0005_events_discord.sql` → **Run**.
Потім так само `migrations/0006_stable_sort_order.sql` (стабільний порядок рядків у табі).

Міграція ідемпотентна. Якщо впаде рядок `create extension if not exists pg_net`
(або `pg_cron`) — увімкни їх руками через **Database → Extensions** і запусти файл ще раз.

Після цього в адмінці з'явиться таб «Евенти» з усіма активностями (без часу — час,
пінг і примітку додаєш там).

## Крок 2. Вебхук Discord

1. **Канал.** Зроби окремий канал, напр. `#евенти`. У правах каналу для `@everyone`
   забери «Надсилати повідомлення» — тоді пост завжди буде єдиним і останнім у каналі.
2. **Вебхук.** Налаштування каналу (шестерня) → **Інтеграції** → **Вебхуки** →
   **Новий вебхук**. Дай ім'я (напр. `Thunder Евенти`) та аватар — так виглядатиме
   автор поста. Натисни **Копіювати URL вебхука**. URL має вигляд
   `https://discord.com/api/webhooks/1234567890/AbCdEf…` — це секрет, не публікуй.
3. **Роль для пінгів** (інакше нагадування йтимуть як `@here`).
   - Налаштування сервера → **Ролі** → створи (напр. `Евенти`) або візьми наявну.
   - У ролі увімкни **«Дозволити всім згадувати цю роль»** — без цього вебхук
     не зможе її пінгнути.
   - Скопіюй ID ролі: Налаштування користувача → **Додатково** → **Режим розробника**
     (увімкни), потім у списку ролей ПКМ по ролі → **Копіювати ID ролі**.
   - Роль можна задати глобально (секрет `DISCORD_PING_ROLE_ID`) і/або окремо для
     евента в табі «Евенти» (поле «ID ролі для пінгу»).

## Крок 3. Edge Function

Потрібен [Supabase CLI](https://supabase.com/docs/guides/cli): `npm i -g supabase`
(або `brew install supabase/tap/supabase`, або `scoop install supabase`).

```bash
# у корені репозиторію
supabase login
supabase link --project-ref <ref>   # <ref> — із URL проєкту: https://<ref>.supabase.co

# секрети функції (замість значень — свої)
supabase secrets set \
  DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/…" \
  EVENTS_API_KEY="$(openssl rand -hex 32)" \
  DISCORD_PING_ROLE_ID="123456789012345678"

supabase secrets list                 # перевір, що є всі три

# деплой
supabase functions deploy discord-events --no-verify-jwt
```

- `EVENTS_API_KEY` — твій власний ключ до API (будь-який довгий випадковий рядок;
  без `openssl` — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
  Збережи його: він потрібен для крону (крок 4) і для своїх скриптів.
- `--no-verify-jwt` обов'язково: інакше шлюз Supabase пускатиме лише запити з JWT
  Supabase, а крон і сторонні скрипти ходять із `x-api-key`. Авторизацію функція
  перевіряє сама (ключ або сесія адміна з адмінки).
- Секрети можна задати й через Dashboard → **Edge Functions** → **Secrets**.
  Нові значення функція бачить без повторного деплою.

Перевірка:

```bash
REF=<ref>; KEY=<EVENTS_API_KEY>

# список на сьогодні
curl -s -H "x-api-key: $KEY" "https://$REF.supabase.co/functions/v1/discord-events"

# створити/оновити пост у Discord прямо зараз
curl -s -X POST -H "x-api-key: $KEY" "https://$REF.supabase.co/functions/v1/discord-events/sync"
```

Після `sync` у каналі має з'явитись пост. Те саме робить кнопка **«Оновити зараз»**
у табі «Евенти».

## Крок 4. Автооновлення (крон)

Крон-джоб `discord-events-sync` (кожні 5 хв) уже створений міграцією, але він нічого
не робить, поки не знає URL функції та ключ. Додай їх у Vault — SQL Editor:

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/discord-events/sync', 'discord_events_sync_url');
select vault.create_secret('<EVENTS_API_KEY>', 'discord_events_api_key');
```

Перевірка (через ~5 хв):

```sql
select jobname, schedule, active from cron.job;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
select status_code, content, created from net._http_response order by created desc limit 5;
```

У `net._http_response` має бути `status_code = 200` і JSON з `"ok":true`.

Хочеш точніші пінги — переведи крон на щохвилини (з лідом 15 хв пінг тоді прилітатиме
рівно за 15 хв, а не «за 10–15»):

```sql
select cron.schedule('discord-events-sync', '* * * * *', 'select discord_events_sync();');
```

Якщо треба змінити ключ/URL — спочатку `delete from vault.secrets where name in ('discord_events_sync_url','discord_events_api_key');`, потім `vault.create_secret` знову.

> Альтернатива без Vault: Dashboard → **Integrations** → **Cron** → **Create job** →
> тип *Supabase Edge Function*, метод POST, URL функції `/sync`, заголовок
> `x-api-key: <EVENTS_API_KEY>`. Тоді джоб з міграції можна прибрати:
> `select cron.unschedule('discord-events-sync');`.

## Крок 5 (необов'язково). Бот — закріпити пост

Вебхук не вміє закріплювати повідомлення. Якщо канал окремий (крок 2.1), закріплення
не потрібне. Якщо все ж хочеться:

1. https://discord.com/developers/applications → **New Application** → назва.
2. Вкладка **Bot** → **Reset Token** → скопіюй токен (показується один раз).
   Privileged Gateway Intents вмикати не треба.
3. Вкладка **OAuth2** → **URL Generator**: scope `bot`; permissions
   **View Channels** і **Manage Messages**. Відкрий згенерований URL і додай бота на сервер.
4. У правах каналу переконайся, що бот бачить канал і має «Керувати повідомленнями».
5. `supabase secrets set DISCORD_BOT_TOKEN="<токен>"`.

Функція закріплює пост у момент його створення. Щоб закріпити вже наявний — просто
закріпи руками, або видали пост у Discord і запусти `sync` (створиться й закріпиться новий).

---

## API

Базовий URL: `https://<ref>.supabase.co/functions/v1/discord-events`.
Авторизація — один із варіантів:

- заголовок `x-api-key: <EVENTS_API_KEY>`;
- `Authorization: Bearer <EVENTS_API_KEY>`;
- `Authorization: Bearer <JWT сесії Supabase>` користувача з таблиці `admins` (так ходить адмінка).

| Метод і шлях | Що повертає |
|---|---|
| `GET /discord-events` | Актуальний список на сьогодні (за Києвом). |
| `GET /discord-events/preview` | Payload, який піде у вебхук (щоб глянути текст поста без відправки). |
| `POST /discord-events/sync` | Оновлює пост (створює, якщо нема), шле пінги, прибирає вчорашні нагадування. |

`GET /discord-events`:

```json
{
  "ok": true,
  "date": "2026-10-10",
  "weekday": 6,
  "weekdayLabel": "Субота",
  "weekdayShort": "Сб",
  "timezone": "Europe/Kyiv",
  "now": "12:40",
  "events": [
    { "id": "…", "name": "ТВ", "time": "20:00", "note": "збір біля Міста Драконів", "pingMinutesBefore": 15, "pingRoleId": null },
    { "id": "…", "name": "КХ", "time": null, "note": null, "pingMinutesBefore": null, "pingRoleId": null }
  ]
}
```

Порядок: спочатку евенти з часом (за часом), потім без часу. `time` — `"HH:MM"` або `null`.

`POST /discord-events/sync`:

```json
{ "ok": true, "date": "2026-10-10", "time": "19:47", "events": 2, "post": "edited", "messageId": "…", "pings": ["ТВ"], "cleaned": 0, "warnings": [] }
```

`post` — `created` / `edited` / `unchanged`. Помилка — `{ "ok": false, "error": "…" }` зі
статусом 401/405/500/502.

## Як саме працює пост

- **Один пост на весь час.** Перший `sync` створює повідомлення і запам'ятовує його id
  (`discord_event_post`). Далі воно лише редагується — і щодня опівночі (перший крон
  нового дня), і при будь-якій зміні списку. Якщо пост видалити в Discord — наступний
  `sync` створить новий.
- **Discord не смикається даремно:** текст поста хешується, `PATCH` іде лише коли список
  реально змінився.
- **Пінги.** Для евента з часом і «пінг за N хв» у вікні `[час − N; час)` відправляється
  одне повідомлення `@роль ⏰ через N хв — Назва (20:00)`; один пінг на евент на день
  (`discord_event_pings`). Наступного дня ці повідомлення видаляються з каналу, щоб
  там лишався тільки пост. Пінг без ролі (ні в евенті, ні в `DISCORD_PING_ROLE_ID`) — `@here`.
- **«Сьогодні»** всюди за Києвом (`Europe/Kyiv`), як і решта сайту.
- Запити функції до бази рахуються як активність проєкту, тож безкоштовний проєкт із
  працюючим кроном, скоріш за все, не паузитиметься за неактивність.

## Якщо щось не так

| Симптом | Що перевірити |
|---|---|
| `401 Немає доступу` | Ключ у `x-api-key` ≠ `EVENTS_API_KEY` у секретах; або функцію задеплоєно без `--no-verify-jwt`. |
| `500 DISCORD_WEBHOOK_URL не заданий` | `supabase secrets list` — секрет є? Назва точна? |
| `502 … Discord відповів 401/404` | Вебхук видалили або URL неповний — створи новий (крок 2) і онови секрет. |
| Пост є, пінги не приходять | В евента є час **і** число в «пінг за … хв»; крон працює (`cron.job_run_details`); у ролі увімкнено «Дозволити всім згадувати». |
| Крон є, але `net._http_response` порожня | Секрети Vault не створені або з іншими назвами: `select name from vault.secrets;`. |
| Кнопка «Оновити зараз» каже «Failed to send a request» | Функція ще не задеплоєна, або `VITE_SUPABASE_URL` вказує на інший проєкт. |
