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
  ping_minutes_before: number | null;
  ping_role_id: string | null;
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
    pingMinutesBefore: r.ping_minutes_before,
    pingRoleId: r.ping_role_id,
    enabled: r.enabled,
    sortOrder: r.sort_order,
  };
}

export async function fetchEvents(): Promise<GuildEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as EventDbRow[]).map(fromDb);
}

export interface EventInput {
  name: string;
  weekdays: number[];
  eventDate: string | null;
  startTime: string | null;
  note: string | null;
  pingMinutesBefore: number | null;
  pingRoleId: string | null;
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
  if (patch.pingMinutesBefore !== undefined) db.ping_minutes_before = patch.pingMinutesBefore;
  if (patch.pingRoleId !== undefined) db.ping_role_id = patch.pingRoleId?.trim() || null;
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

/** Активності, для яких ще немає евента (нові створюються тригером у БД,
 * тож сюди потрапляють лише видалені адміном вручну). */
export function activitiesWithoutEvent(activities: Activity[], events: GuildEvent[]): Activity[] {
  const linked = new Set(events.map((e) => e.activityId).filter(Boolean));
  return activities.filter((a) => !linked.has(a.id));
}

/** Створити евенти з активностей (назва + дні тижня, без часу). */
export async function importActivities(activities: Activity[]): Promise<void> {
  if (activities.length === 0) return;
  const rows = activities.map((a) => ({ activity_id: a.id, name: a.name, weekdays: a.weekdays, sort_order: a.sortOrder }));
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
}

/** Смикнути Edge Function discord-events (POST …/sync) від імені адміна —
 * supabase-js сам підставляє JWT сесії в Authorization, функція перевіряє
 * його і allow-list admins. */
export async function triggerDiscordSync(): Promise<SyncResult> {
  const { data, error } = await supabase.functions.invoke<SyncResult>('discord-events/sync', { method: 'POST', body: {} });
  if (error) {
    let message = error.message || 'Не вдалося оновити пост у Discord.';
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
