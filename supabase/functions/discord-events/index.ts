// =========================================================
// Edge Function discord-events — API евентів на сьогодні + ведення
// одного поста в Discord через вебхук.
//
//   GET  /discord-events          → JSON: актуальний список на сьогодні
//                                   (за Києвом; час — якщо вказано).
//   GET  /discord-events/preview  → payload, який піде у вебхук (дебаг).
//   POST /discord-events/sync     → оновити пост (створити, якщо нема),
//                                   надіслати пінги за N хв до евентів,
//                                   прибрати вчорашні пінги з каналу.
//   POST /discord-events/clean    → прибрати з каналу ВСІ надіслані пінги
//                                   (і сьогоднішні); пост лишається.
//
// З ботом (DISCORD_BOT_TOKEN + DISCORD_GUILD_ID) sync ще й веде «Події»
// сервера (Scheduled Events): по одній на кожен евент з часом на найближчі
// DISCORD_EVENTS_DAYS днів (7), оновлює при змінах, прибирає, якщо евент
// вимкнули, і переводить у «активна», коли настав час.
//
// Авторизація (будь-який варіант):
//   * заголовок  x-api-key: <EVENTS_API_KEY>   — крон/скрипти;
//   * Authorization: Bearer <EVENTS_API_KEY>   — те саме;
//   * Authorization: Bearer <JWT адміна>       — кнопка "Оновити зараз"
//     в адмінці (користувач має бути в allow-list admins).
//
// Секрети (supabase secrets set …): DISCORD_WEBHOOK_URL (обов'язково),
// EVENTS_API_KEY (обов'язково), DISCORD_PING_ROLE_ID (роль за замовчуванням
// для пінгів; без неї і без ролі в евенті — @here), DISCORD_BOT_TOKEN
// (необов'язково: закріпити пост у каналі — вебхук цього не вміє).
// Для «Подій»: DISCORD_GUILD_ID (ID сервера), DISCORD_EVENT_LOCATION (текст
// «місця» події, напр. "#евенти"; Discord не вміє прив'язати подію до
// текстового каналу, тож це просто напис), DISCORD_EVENTS_DAYS (горизонт,
// за замовчуванням 7). SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY Supabase підставляє сам.
//
// Деплой: supabase functions deploy discord-events --no-verify-jwt
// (повна інструкція — supabase/DISCORD.md).
// =========================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const TZ = 'Europe/Kyiv';
const WEEKDAYS_FULL = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота'];
const WEEKDAYS_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const EMBED_COLOR = 0xd81f1f; // --accent сайту

const env = (name: string): string => Deno.env.get(name)?.trim() ?? '';
const SUPABASE_URL = env('SUPABASE_URL');
const SUPABASE_ANON_KEY = env('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const EVENTS_API_KEY = env('EVENTS_API_KEY');
const DISCORD_WEBHOOK_URL = env('DISCORD_WEBHOOK_URL');
const DISCORD_PING_ROLE_ID = env('DISCORD_PING_ROLE_ID');
const DISCORD_BOT_TOKEN = env('DISCORD_BOT_TOKEN');
const DISCORD_GUILD_ID = env('DISCORD_GUILD_ID');
const DISCORD_EVENT_LOCATION = env('DISCORD_EVENT_LOCATION') || 'Thunder';
const DISCORD_EVENTS_DAYS = Math.min(30, Math.max(1, Number(env('DISCORD_EVENTS_DAYS')) || 7));
const DEFAULT_DURATION_MIN = 60;
const DISCORD_API = 'https://discord.com/api/v10';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface EventRow {
  id: string;
  name: string;
  start_time: string | null; // "HH:MM:SS"
  note: string | null;
  duration_minutes: number | null;
  ping_minutes_before: number | null;
  ping_role_id: string | null;
  sort_order: number;
}

/** events_in_range(): той самий рядок + дата, на яку він випадає. */
interface RangeRow extends EventRow {
  event_date: string;
}

interface ScheduledRow {
  event_id: string;
  event_date: string;
  discord_event_id: string;
  content_hash: string | null;
  starts_at: string;
  ends_at: string;
  started: boolean;
}

interface PostState {
  message_id: string;
  channel_id: string | null;
  post_date: string;
  content_hash: string | null;
}

interface PingRow {
  event_id: string;
  ping_date: string;
  message_id: string | null;
}

// ---------------------------------------------------------
// Час за Києвом.
// ---------------------------------------------------------

interface KyivNow {
  date: string; // YYYY-MM-DD
  weekday: number; // 0=нд..6=сб
  minutes: number; // хвилин від півночі
  hhmm: string;
}

function kyivNow(at: Date = new Date()): KyivNow {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
  const [h, m] = hhmm.split(':').map(Number);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { date, weekday, minutes: h * 60 + m, hhmm };
}

function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function dateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Київський локальний час (дата + "HH:MM") → момент UTC, з урахуванням
 * літнього/зимового часу на ту дату. */
function kyivToUtc(date: string, time: string): Date {
  const guess = new Date(`${date}T${time.slice(0, 5)}:00Z`);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess.getTime() - (wall - guess.getTime()));
}

// ---------------------------------------------------------
// Supabase (service_role — RLS обходить, тому функція сама вирішує, кому
// що віддавати; див. authorize()).
// ---------------------------------------------------------

function serviceClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new HttpError(500, 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не задані.');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function loadToday(db: SupabaseClient, date: string): Promise<EventRow[]> {
  const { data, error } = await db.rpc('events_today', { p_date: date });
  if (error) throw new HttpError(500, `events_today: ${error.message}`);
  return (data ?? []) as EventRow[];
}

// ---------------------------------------------------------
// Авторизація.
// ---------------------------------------------------------

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorize(req: Request, db: SupabaseClient): Promise<'api-key' | 'admin'> {
  const token = bearer(req);
  const apiKey = req.headers.get('x-api-key')?.trim() || token;
  if (EVENTS_API_KEY && apiKey && safeEqual(apiKey, EVENTS_API_KEY)) return 'api-key';

  // JWT адміна з адмінки (supabase-js підставляє сесію в Authorization).
  if (token && SUPABASE_URL && SUPABASE_ANON_KEY) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await userClient.auth.getUser(token);
    const userId = data?.user?.id;
    if (userId) {
      const { data: admin } = await db.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
      if (admin) return 'admin';
    }
  }
  throw new HttpError(401, 'Немає доступу: потрібен x-api-key (EVENTS_API_KEY) або сесія адміна.');
}

// ---------------------------------------------------------
// Discord.
// ---------------------------------------------------------

function webhookBase(): URL {
  if (!DISCORD_WEBHOOK_URL) throw new HttpError(500, 'DISCORD_WEBHOOK_URL не заданий (supabase secrets set DISCORD_WEBHOOK_URL=…).');
  return new URL(DISCORD_WEBHOOK_URL);
}

/** POST …?wait=true — повертає створене повідомлення (треба його id). */
function createUrl(): string {
  const u = webhookBase();
  u.searchParams.set('wait', 'true');
  return u.toString();
}

/** …/messages/{id} — редагування/видалення свого повідомлення вебхуком.
 * thread_id (якщо вебхук веде в гілку) переноситься. */
function messageUrl(messageId: string): string {
  const base = webhookBase();
  const u = new URL(base.origin + base.pathname.replace(/\/+$/, '') + `/messages/${messageId}`);
  const thread = base.searchParams.get('thread_id');
  if (thread) u.searchParams.set('thread_id', thread);
  return u.toString();
}

async function discord(method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', url: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function discordError(prefix: string, r: Response): Promise<HttpError> {
  const text = await r.text().catch(() => '');
  return new HttpError(502, `${prefix}: Discord відповів ${r.status}${text ? ` — ${text.slice(0, 300)}` : ''}`);
}

interface WebhookPayload {
  content?: string;
  embeds?: unknown[];
  allowed_mentions: { parse?: string[]; roles?: string[] };
}

/** Текст щоденного поста. Детермінований (без "оновлено о …"), щоб хеш
 * мінявся лише коли реально змінився список. */
function buildPost(now: KyivNow, events: EventRow[]): WebhookPayload {
  const title = `📅 Евенти на сьогодні — ${WEEKDAYS_FULL[now.weekday]}, ${dateLabel(now.date)}`;
  const lines = events.map((e) => {
    const time = hhmm(e.start_time);
    const head = time ? `🕒 **${time}** — ${e.name}` : `▫️ ${e.name}`;
    const note = e.note?.trim() ? `\n⠀⠀_${e.note.trim()}_` : '';
    return head + note;
  });
  const description = lines.length ? lines.join('\n') : 'Сьогодні евентів немає 😴';
  return {
    embeds: [
      {
        title,
        description: description.slice(0, 4000),
        color: EMBED_COLOR,
        footer: { text: 'Час київський · оновлюється автоматично' },
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

function buildPing(e: EventRow, minutesLeft: number): WebhookPayload {
  const roleId = e.ping_role_id?.trim() || DISCORD_PING_ROLE_ID || '';
  const mention = roleId ? `<@&${roleId}>` : '@here';
  const time = hhmm(e.start_time) ?? '';
  const when = minutesLeft <= 0 ? 'зараз' : `через ${minutesLeft} хв`;
  const note = e.note?.trim() ? `\n_${e.note.trim()}_` : '';
  return {
    content: `${mention} ⏰ ${when} — **${e.name}** (${time})${note}`,
    allowed_mentions: roleId ? { roles: [roleId] } : { parse: ['everyone'] },
  };
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Закріпити пост — лише з ботом (вебхук не має прав на pin). Помилки не
 * фатальні: пост уже створений, закріпити можна й руками. */
async function pinMessage(channelId: string, messageId: string): Promise<string | null> {
  if (!DISCORD_BOT_TOKEN) return null;
  const r = await discord('PUT', `${DISCORD_API}/channels/${channelId}/messages/pins/${messageId}`, undefined, botHeaders());
  if (r.ok || r.status === 204) return null;
  return `pin: Discord відповів ${r.status} — ${(await r.text().catch(() => '')).slice(0, 200)}`;
}

// ---------------------------------------------------------
// Пінги: видалення повідомлень вебхуком (404 = уже видалено руками).
// ---------------------------------------------------------

async function deletePingMessages(rows: PingRow[]): Promise<{ cleaned: number; warnings: string[] }> {
  let cleaned = 0;
  const warnings: string[] = [];
  for (const p of rows) {
    if (!p.message_id) continue;
    const r = await discord('DELETE', messageUrl(p.message_id));
    if (r.ok || r.status === 404) cleaned++;
    else warnings.push(`Не вдалося прибрати пінг ${p.message_id}: ${r.status}`);
  }
  return { cleaned, warnings };
}

interface CleanResult {
  ok: true;
  cleaned: number;
  warnings: string[];
}

/** Кнопка «Почистити пінги» в адмінці: прибрати з каналу всі нагадування,
 * включно з сьогоднішніми. Сьогоднішні рядки лишаються (без message_id),
 * щоб наступний sync не надіслав той самий пінг удруге. */
async function cleanPings(db: SupabaseClient): Promise<CleanResult> {
  const now = kyivNow();
  const { data, error } = await db.from('discord_event_pings').select('event_id, ping_date, message_id');
  if (error) throw new HttpError(500, `discord_event_pings: ${error.message}`);
  const rows = (data ?? []) as PingRow[];
  const del = await deletePingMessages(rows);
  await db.from('discord_event_pings').delete().lt('ping_date', now.date);
  await db.from('discord_event_pings').update({ message_id: null }).eq('ping_date', now.date).not('message_id', 'is', null);
  return { ok: true, cleaned: del.cleaned, warnings: del.warnings };
}

// ---------------------------------------------------------
// «Події» сервера (Guild Scheduled Events) — лише з ботом.
// Discord не вміє подію «в текстовому каналі»: тип EXTERNAL з текстовим
// «місцем» (DISCORD_EVENT_LOCATION), час початку = евент, завершення =
// + duration_minutes (60). Евенти без часу сюди не потрапляють.
// ---------------------------------------------------------

function botHeaders(): Record<string, string> {
  return { Authorization: `Bot ${DISCORD_BOT_TOKEN}` };
}

function guildEventsUrl(id?: string): string {
  return `${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/scheduled-events${id ? `/${id}` : ''}`;
}

interface ScheduleResult {
  created: number;
  updated: number;
  deleted: number;
  started: number;
}

interface DesiredEvent {
  key: string;
  eventId: string;
  date: string;
  startMs: number;
  endMs: number;
  payload: Record<string, unknown>;
  hash: string;
}

async function syncScheduledEvents(db: SupabaseClient, now: KyivNow, warnings: string[]): Promise<ScheduleResult | null> {
  if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) return null;
  const res: ScheduleResult = { created: 0, updated: 0, deleted: 0, started: 0 };
  const nowMs = Date.now();
  const warn = (m: string) => warnings.push(`Події: ${m}`);

  // Що має бути: евенти з часом на найближчі N днів, які ще не завершились.
  const { data, error } = await db.rpc('events_in_range', { p_from: now.date, p_to: addDays(now.date, DISCORD_EVENTS_DAYS - 1) });
  if (error) {
    warn(`events_in_range: ${error.message}`);
    return res;
  }
  const desired = new Map<string, DesiredEvent>();
  for (const r of (data ?? []) as RangeRow[]) {
    if (!r.start_time) continue;
    const start = kyivToUtc(r.event_date, r.start_time);
    const end = new Date(start.getTime() + (r.duration_minutes ?? DEFAULT_DURATION_MIN) * 60_000);
    if (end.getTime() <= nowMs) continue;
    const payload: Record<string, unknown> = {
      name: r.name.slice(0, 100),
      privacy_level: 2,
      entity_type: 3,
      entity_metadata: { location: DISCORD_EVENT_LOCATION.slice(0, 100) },
      scheduled_start_time: start.toISOString(),
      scheduled_end_time: end.toISOString(),
      description: (r.note?.trim() ?? '').slice(0, 1000),
    };
    const key = `${r.id}|${r.event_date}`;
    desired.set(key, { key, eventId: r.id, date: r.event_date, startMs: start.getTime(), endMs: end.getTime(), payload, hash: await sha256(JSON.stringify(payload)) });
  }

  const { data: rowsData, error: rowsErr } = await db.from('discord_scheduled_events').select('*');
  if (rowsErr) {
    warn(`discord_scheduled_events: ${rowsErr.message}`);
    return res;
  }
  const existing = new Map<string, ScheduledRow>();
  for (const row of (rowsData ?? []) as ScheduledRow[]) existing.set(`${row.event_id}|${row.event_date}`, row);

  const removeRow = (row: ScheduledRow) => db.from('discord_scheduled_events').delete().match({ event_id: row.event_id, event_date: row.event_date });

  // 1. Зайве: евент вимкнули/видалили/перенесли — прибираємо подію; минулі —
  //    лише рядок (Discord сам завершує події за scheduled_end_time).
  for (const [key, row] of existing) {
    if (desired.has(key)) continue;
    if (new Date(row.ends_at).getTime() > nowMs) {
      const r = await discord('DELETE', guildEventsUrl(row.discord_event_id), undefined, botHeaders());
      if (r.status === 429) {
        warn('ліміт запитів Discord, решта — на наступному запуску');
        return res;
      }
      if (!r.ok && r.status !== 404) {
        warn(`не вдалося видалити подію ${row.discord_event_id} (${r.status})`);
        continue;
      }
      res.deleted++;
    }
    await removeRow(row);
    existing.delete(key);
  }

  // 2. Створити нові / оновити змінені.
  for (const d of desired.values()) {
    let row = existing.get(d.key);
    const startPassed = d.startMs <= nowMs;

    if (row && row.content_hash !== d.hash && !startPassed) {
      const r = await discord('PATCH', guildEventsUrl(row.discord_event_id), d.payload, botHeaders());
      if (r.status === 429) {
        warn('ліміт запитів Discord, решта — на наступному запуску');
        return res;
      }
      if (r.status === 404) {
        await removeRow(row); // видалили руками — створимо знову
        existing.delete(d.key);
        row = undefined;
      } else {
        if (r.ok) res.updated++;
        else warn(`«${d.payload.name}» ${dateLabel(d.date)}: не вдалося оновити (${r.status} ${(await r.text().catch(() => '')).slice(0, 150)})`);
        // хеш зберігаємо і при помилці — інакше та сама невдала правка
        // повторюватиметься кожні 5 хв.
        await db.from('discord_scheduled_events')
          .update({ content_hash: d.hash, starts_at: new Date(d.startMs).toISOString(), ends_at: new Date(d.endMs).toISOString(), updated_at: new Date().toISOString() })
          .match({ event_id: d.eventId, event_date: d.date });
      }
    }

    if (!row) {
      if (startPassed) continue; // Discord не створює подію з початком у минулому
      const r = await discord('POST', guildEventsUrl(), d.payload, botHeaders());
      if (r.status === 429) {
        warn('ліміт запитів Discord, решта — на наступному запуску');
        return res;
      }
      if (!r.ok) {
        warn(`«${d.payload.name}» ${dateLabel(d.date)}: не вдалося створити (${r.status} ${(await r.text().catch(() => '')).slice(0, 150)})`);
        continue;
      }
      const ev = (await r.json()) as { id: string };
      const fresh: ScheduledRow = {
        event_id: d.eventId,
        event_date: d.date,
        discord_event_id: ev.id,
        content_hash: d.hash,
        starts_at: new Date(d.startMs).toISOString(),
        ends_at: new Date(d.endMs).toISOString(),
        started: false,
      };
      await db.from('discord_scheduled_events').upsert({ ...fresh, updated_at: new Date().toISOString() });
      existing.set(d.key, fresh);
      res.created++;
    }
  }

  // 3. Час настав — переводимо подію в «активна» (один раз). 400 = Discord
  //    уже сам її стартував/завершив — теж вважаємо зробленим.
  for (const [key, row] of existing) {
    const d = desired.get(key);
    if (!d || row.started || d.startMs > nowMs || d.endMs <= nowMs) continue;
    const r = await discord('PATCH', guildEventsUrl(row.discord_event_id), { status: 2 }, botHeaders());
    if (r.status === 429) {
      warn('ліміт запитів Discord, решта — на наступному запуску');
      return res;
    }
    if (r.ok || r.status === 400 || r.status === 404) {
      if (r.ok) res.started++;
      await db.from('discord_scheduled_events').update({ started: true, updated_at: new Date().toISOString() }).match({ event_id: row.event_id, event_date: row.event_date });
    } else {
      warn(`«${d.payload.name}»: не вдалося стартувати подію (${r.status})`);
    }
  }

  return res;
}

// ---------------------------------------------------------
// Синхронізація.
// ---------------------------------------------------------

interface SyncResult {
  ok: true;
  date: string;
  time: string;
  events: number;
  post: 'created' | 'edited' | 'unchanged';
  messageId: string;
  pings: string[];
  cleaned: number;
  /** null — бот/сервер не налаштовані, «Події» не ведуться. */
  scheduled: ScheduleResult | null;
  warnings: string[];
}

async function sync(db: SupabaseClient): Promise<SyncResult> {
  const now = kyivNow();
  const events = await loadToday(db, now.date);
  const warnings: string[] = [];

  // 1. Пост: один на весь час; щодня (і при кожній зміні списку) редагується.
  const payload = buildPost(now, events);
  const hash = await sha256(JSON.stringify(payload));
  const { data: stateRow, error: stateErr } = await db.from('discord_event_post').select('message_id, channel_id, post_date, content_hash').eq('id', 1).maybeSingle();
  if (stateErr) throw new HttpError(500, `discord_event_post: ${stateErr.message}`);
  const state = (stateRow ?? null) as PostState | null;

  let messageId = state?.message_id ?? null;
  let channelId = state?.channel_id ?? null;
  let post: SyncResult['post'] = 'unchanged';

  if (messageId && state?.content_hash === hash) {
    // нічого не змінилось — Discord не смикаємо
  } else if (messageId) {
    const r = await discord('PATCH', messageUrl(messageId), payload);
    if (r.status === 404) {
      messageId = null; // пост видалили руками — створимо новий
    } else if (!r.ok) {
      throw await discordError('Оновлення поста', r);
    } else {
      post = 'edited';
    }
  }

  if (!messageId) {
    const r = await discord('POST', createUrl(), payload);
    if (!r.ok) throw await discordError('Створення поста', r);
    const msg = (await r.json()) as { id: string; channel_id?: string };
    messageId = msg.id;
    channelId = msg.channel_id ?? null;
    post = 'created';
    if (channelId) {
      const pinWarn = await pinMessage(channelId, messageId);
      if (pinWarn) warnings.push(pinWarn);
    }
  }

  if (post !== 'unchanged') {
    const { error } = await db.from('discord_event_post').upsert({
      id: 1,
      message_id: messageId,
      channel_id: channelId,
      post_date: now.date,
      content_hash: hash,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new HttpError(500, `discord_event_post upsert: ${error.message}`);
  }

  // 2. Прибрати вчорашні нагадування, щоб у каналі лишався лише пост.
  const { data: oldPings } = await db.from('discord_event_pings').select('event_id, ping_date, message_id').lt('ping_date', now.date);
  const old = (oldPings ?? []) as PingRow[];
  const del = await deletePingMessages(old);
  const cleaned = del.cleaned;
  warnings.push(...del.warnings);
  if (old.length > 0) await db.from('discord_event_pings').delete().lt('ping_date', now.date);

  // 3. Пінги за N хв до початку (вікно [start - N, start)); один на евент
  //    на день — рядок вставляємо ДО запиту в Discord, щоб паралельний
  //    запуск (крон + кнопка в адмінці) не продублював.
  const pings: string[] = [];
  const { data: sentRows } = await db.from('discord_event_pings').select('event_id').eq('ping_date', now.date);
  const sent = new Set(((sentRows ?? []) as { event_id: string }[]).map((r) => r.event_id));

  for (const e of events) {
    if (!e.start_time || !e.ping_minutes_before || sent.has(e.id)) continue;
    const start = toMinutes(e.start_time);
    if (now.minutes < start - e.ping_minutes_before || now.minutes >= start) continue;

    const { error: reserveErr } = await db.from('discord_event_pings').insert({ event_id: e.id, ping_date: now.date });
    if (reserveErr) continue; // уже зарезервовано іншим запуском

    const r = await discord('POST', createUrl(), buildPing(e, start - now.minutes));
    if (r.ok) {
      const msg = (await r.json()) as { id: string };
      await db.from('discord_event_pings').update({ message_id: msg.id }).match({ event_id: e.id, ping_date: now.date });
      pings.push(e.name);
    } else {
      // знімаємо резерв — спробуємо на наступному запуску, поки евент не почався
      await db.from('discord_event_pings').delete().match({ event_id: e.id, ping_date: now.date });
      warnings.push(`Пінг «${e.name}»: Discord відповів ${r.status}`);
    }
  }

  // 4. «Події» сервера — якщо є бот і ID сервера.
  const scheduled = await syncScheduledEvents(db, now, warnings);

  return { ok: true, date: now.date, time: now.hhmm, events: events.length, post, messageId: messageId!, pings, cleaned, scheduled, warnings };
}

// ---------------------------------------------------------
// HTTP.
// ---------------------------------------------------------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' } });
}

function todayJson(now: KyivNow, events: EventRow[]) {
  return {
    ok: true,
    date: now.date,
    weekday: now.weekday,
    weekdayLabel: WEEKDAYS_FULL[now.weekday],
    weekdayShort: WEEKDAYS_SHORT[now.weekday],
    timezone: TZ,
    now: now.hhmm,
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      time: hhmm(e.start_time),
      note: e.note,
      durationMinutes: e.start_time ? e.duration_minutes ?? DEFAULT_DURATION_MIN : null,
      pingMinutesBefore: e.start_time ? e.ping_minutes_before : null,
      pingRoleId: e.ping_role_id,
    })),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const db = serviceClient();
    await authorize(req, db);

    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    const action = path.endsWith('/sync') ? 'sync' : path.endsWith('/clean') ? 'clean' : path.endsWith('/preview') ? 'preview' : 'today';

    if (action === 'sync' || action === 'clean') {
      if (req.method !== 'POST') throw new HttpError(405, `${action} — лише POST.`);
      return json(action === 'sync' ? await sync(db) : await cleanPings(db));
    }

    const now = kyivNow();
    const events = await loadToday(db, now.date);
    if (action === 'preview') return json({ ok: true, date: now.date, webhook: buildPost(now, events) });
    return json(todayJson(now, events));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[discord-events] ${status}: ${message}`);
    return json({ ok: false, error: message }, status);
  }
});
