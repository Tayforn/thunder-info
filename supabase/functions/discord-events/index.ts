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
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY Supabase
// підставляє сам.
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
  ping_minutes_before: number | null;
  ping_role_id: string | null;
  sort_order: number;
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
  const r = await discord('PUT', `https://discord.com/api/v10/channels/${channelId}/messages/pins/${messageId}`, undefined, {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  });
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

  return { ok: true, date: now.date, time: now.hhmm, events: events.length, post, messageId: messageId!, pings, cleaned, warnings };
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
