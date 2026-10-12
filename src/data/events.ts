// =========================================================
// Евенти для поста в Discord (таб "Евенти" в адмінці) — таблиця events
// з міграції 0005. Читаємо/пишемо напряму через supabase: таб адмінський,
// у адміна є сесія Supabase (RLS: select для authenticated, запис — is_admin()).
//
// Сам пост у Discord веде Edge Function discord-events (крон кожні 5 хв);
// звідси її можна лише смикнути вручну — triggerDiscordSync() — щоб не
// чекати крону після редагування.
// =========================================================

import { supabase } from '../app/supabaseClient';
import type { Activity, GuildEvent } from './types';
import { kyivDateString, todayWeekday } from './types';

interface EventDbRow {
  id: string;
  activity_id: string | null;
  name: string;
  weekdays: number[] | null;
  event_date: string | null;
  start_time: string | null;
  note: string | null;
  duration_minutes: number | null;
  ping_minutes_before: number | null;
  ping_role_id: string | null;
  image_url?: string | null;
  enabled: boolean;
  sort_order: number;
}

/** Postgres `time` приходить як "HH:MM:SS" — в UI тримаємо "HH:MM". */
function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

function fromDb(r: EventDbRow): GuildEvent {
  return {
    id: r.id,
    activityId: r.activity_id,
    name: r.name,
    weekdays: r.weekdays ?? [],
    eventDate: r.event_date,
    startTime: hhmm(r.start_time),
    note: r.note,
    durationMinutes: r.duration_minutes,
    pingMinutesBefore: r.ping_minutes_before,
    pingRoleId: r.ping_role_id,
    imageUrl: r.image_url ?? null,
    enabled: r.enabled,
    sortOrder: r.sort_order,
  };
}

export async function fetchEvents(): Promise<GuildEvent[]> {
  // Тайбрейкери created_at + id — щоб порядок не змінювався після update
  // (однакові sort_order/created_at Postgres віддає в довільному порядку).
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data as EventDbRow[]).map(fromDb);
}

export interface EventInput {
  name: string;
  weekdays: number[];
  eventDate: string | null;
  startTime: string | null;
  note: string | null;
  durationMinutes: number | null;
  pingMinutesBefore: number | null;
  pingRoleId: string | null;
  imageUrl: string | null;
  enabled: boolean;
  activityId: string | null;
}

function toDb(patch: Partial<EventInput>): Record<string, unknown> {
  const db: Record<string, unknown> = {};
  if (patch.name !== undefined) db.name = patch.name.trim();
  if (patch.weekdays !== undefined) db.weekdays = patch.weekdays;
  if (patch.eventDate !== undefined) db.event_date = patch.eventDate || null;
  if (patch.startTime !== undefined) db.start_time = patch.startTime || null;
  if (patch.note !== undefined) db.note = patch.note?.trim() || null;
  if (patch.durationMinutes !== undefined) db.duration_minutes = patch.durationMinutes;
  if (patch.pingMinutesBefore !== undefined) db.ping_minutes_before = patch.pingMinutesBefore;
  if (patch.pingRoleId !== undefined) db.ping_role_id = patch.pingRoleId?.trim() || null;
  if (patch.imageUrl !== undefined) db.image_url = patch.imageUrl?.trim() || null;
  if (patch.enabled !== undefined) db.enabled = patch.enabled;
  if (patch.activityId !== undefined) db.activity_id = patch.activityId;
  return db;
}

export async function createEvent(input: Partial<EventInput> & { name: string }): Promise<void> {
  const { error } = await supabase.from('events').insert(toDb(input));
  if (error) throw error;
}

export async function updateEvent(id: string, patch: Partial<EventInput>): Promise<void> {
  const { error } = await supabase.from('events').update({ ...toDb(patch), updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------
// Картинки евентів — публічний бакет Storage `event-images` (міграція 0009).
// ---------------------------------------------------------

const IMAGE_BUCKET = 'event-images';
const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Залити картинку (вставлену Ctrl+V / перетягнуту / вибрану) — повертає постійне публічне посилання. */
export async function uploadEventImage(file: Blob): Promise<string> {
  const ext = IMAGE_EXT[file.type];
  if (!ext) throw new Error('Підтримуються PNG, JPG, GIF і WebP.');
  if (file.size > IMAGE_MAX_BYTES) throw new Error('Картинка більша за 5 МБ.');
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Видалити картинку зі Storage, якщо вона наша (зовнішні посилання не чіпаємо). Помилки ігноруються. */
export async function removeEventImage(url: string | null): Promise<void> {
  if (!url) return;
  const marker = `/storage/v1/object/public/${IMAGE_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return;
  await supabase.storage.from(IMAGE_BUCKET).remove([decodeURIComponent(url.slice(i + marker.length))]).catch(() => undefined);
}

/** Чужу картинку за посиланням — спробувати перезалити до себе (постійне
 * посилання). Якщо сайт не дає її забрати (CORS) — null. */
export async function rehostImage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    if (!IMAGE_EXT[blob.type]) return null;
    return await uploadEventImage(blob);
  } catch {
    return null;
  }
}

/** Посилання з cdn.discordapp.com/attachments спливають (параметр ex — час у hex). */
export function discordLinkExpiry(url: string): Date | null {
  if (!/^https:\/\/(cdn|media)\.discordapp\.(com|net)\/attachments\//.test(url)) return null;
  const m = /[?&]ex=([0-9a-f]+)/i.exec(url);
  return m ? new Date(parseInt(m[1], 16) * 1000) : new Date();
}

/** Активності, для яких ще немає евента (нові створюються тригером у БД,
 * тож сюди потрапляють лише видалені адміном вручну). */
export function activitiesWithoutEvent(activities: Activity[], events: GuildEvent[]): Activity[] {
  const linked = new Set(events.map((e) => e.activityId).filter(Boolean));
  return activities.filter((a) => !linked.has(a.id));
}

/** Створити евенти з активностей (назва + дні тижня, без часу; sort_order
 * призначить тригер у БД — наступний номер у events). */
export async function importActivities(activities: Activity[]): Promise<void> {
  if (activities.length === 0) return;
  const rows = activities.map((a) => ({ activity_id: a.id, name: a.name, weekdays: a.weekdays }));
  const { error } = await supabase.from('events').insert(rows);
  if (error) throw error;
}

function sameWeekdays(a: number[], b: number[]): boolean {
  const x = [...a].sort().join(',');
  const y = [...b].sort().join(',');
  return x === y;
}

/** Зв'язаний евент розійшовся з активністю (назва або дні) — у табі
 * показуємо кнопку "підтягнути з активності". */
export function divergedFromActivity(e: GuildEvent, activity: Activity | undefined): boolean {
  if (!activity || e.eventDate) return false;
  return e.name !== activity.name || !sameWeekdays(e.weekdays, activity.weekdays);
}

/** Чи потрапляє евент у список "на сьогодні" (та сама логіка, що
 * events_today() у БД: дата має пріоритет над днями тижня). */
export function isEventOn(e: GuildEvent, date: string, weekday: number): boolean {
  if (!e.enabled) return false;
  if (e.eventDate) return e.eventDate === date;
  return e.weekdays.includes(weekday);
}

/** Список на сьогодні за Києвом у тому ж порядку, що в пості Discord:
 * за часом (без часу — в кінці), далі sort_order, назва. */
export function eventsForToday(events: GuildEvent[]): GuildEvent[] {
  const date = kyivDateString();
  const dow = todayWeekday();
  return events
    .filter((e) => isEventOn(e, date, dow))
    .sort((a, b) => {
      if (a.startTime !== b.startTime) {
        if (a.startTime === null) return 1;
        if (b.startTime === null) return -1;
        return a.startTime < b.startTime ? -1 : 1;
      }
      return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'uk');
    });
}

// ---------------------------------------------------------
// Стан поста в Discord + ручний запуск синхронізації.
// ---------------------------------------------------------

export interface DiscordPostState {
  messageId: string;
  channelId: string | null;
  postDate: string;
  updatedAt: string;
}

export async function fetchDiscordPostState(): Promise<DiscordPostState | null> {
  const { data, error } = await supabase
    .from('discord_event_post')
    .select('message_id, channel_id, post_date, updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as { message_id: string; channel_id: string | null; post_date: string; updated_at: string };
  return { messageId: r.message_id, channelId: r.channel_id, postDate: r.post_date, updatedAt: r.updated_at };
}

export interface SyncResult {
  date: string;
  events: number;
  post: 'created' | 'edited' | 'unchanged';
  pings: string[];
  cleaned: number;
  /** «Події» Discord; null — бот/сервер не налаштовані. */
  scheduled: { created: number; updated: number; deleted: number; started: number } | null;
  warnings: string[];
}

export interface CleanResult {
  cleaned: number;
  warnings: string[];
}

/** Смикнути Edge Function discord-events (POST …/sync) від імені адміна —
 * supabase-js сам підставляє JWT сесії в Authorization, функція перевіряє
 * його і allow-list admins. */
export function triggerDiscordSync(): Promise<SyncResult> {
  return invokeDiscord<SyncResult>('sync', 'Не вдалося оновити пост у Discord.');
}

/** Прибрати з каналу всі надіслані пінги (пост лишається). */
export function cleanDiscordPings(): Promise<CleanResult> {
  return invokeDiscord<CleanResult>('clean', 'Не вдалося почистити пінги.');
}

/** Надіслати пінг евента зараз (перевірка ролі/@everyone); справжній
 * пінг перед евентом не зачіпає. */
export function testDiscordPing(eventId: string): Promise<{ event: string; mention: string }> {
  return invokeDiscord('test-ping', 'Не вдалося надіслати тестовий пінг.', { eventId });
}

async function invokeDiscord<T>(action: 'sync' | 'clean' | 'test-ping', fallback: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(`discord-events/${action}`, { method: 'POST', body });
  if (error) {
    let message = error.message || fallback;
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const body = (await ctx.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        /* не JSON — лишаємо повідомлення supabase-js */
      }
    }
    throw new Error(message);
  }
  if (!data) throw new Error('Порожня відповідь від функції.');
  return data;
}
