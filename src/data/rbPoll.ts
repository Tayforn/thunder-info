// =========================================================
// Збір на РБ через Discord (сторінка /rb): пост із реакціями-класами
// (емодзі кожного класу — classes.rb_emoji, Адмінка → Приоритетність
// класів) і читання, хто відмітився. Усе робить Edge Function
// discord-events (rb-post / rb-reactions) — тут лише виклики.
// =========================================================

import { supabase } from '../app/supabaseClient';
import { invokeDiscord } from './events';

/** Той самий текст, що RB_DEFAULT_TEXT у функції — показуємо як placeholder. */
export const RB_DEFAULT_TEXT = '⚔ **Збір на РБ** — {date}\nВідміться реакцією, хто онлайн:\n{classes}';

/** Кого пінгувати в пості збору: '' — роль за замовчуванням
 * (DISCORD_PING_ROLE_ID, без неї @here); 'everyone' / 'here' / 'none';
 * інше — ID ролі. */
export interface RbSettings {
  postText: string;
  ping: string;
}

export async function fetchRbSettings(): Promise<RbSettings> {
  const { data, error } = await supabase.from('discord_rb_settings').select('post_text, ping').eq('id', 1).maybeSingle();
  if (error) throw error;
  const r = (data ?? null) as { post_text: string; ping: string } | null;
  return { postText: r?.post_text ?? '', ping: r?.ping ?? '' };
}

export async function saveRbSettings(s: RbSettings): Promise<void> {
  const { error } = await supabase.from('discord_rb_settings').upsert({ id: 1, post_text: s.postText, ping: s.ping.trim(), updated_at: new Date().toISOString() });
  if (error) throw error;
}

export interface RbReactor {
  /** Discord user id. */
  id: string;
  /** Серверний нік (або глобальне ім'я/юзернейм, якщо ніка нема). */
  name: string;
}

/** Клас із заданим емодзі + хто натиснув його реакцію. */
export interface RbGroup {
  classId: string;
  className: string;
  emoji: string;
  people: RbReactor[];
}

export interface RbReactionsResult {
  version?: string;
  /** null — поста збору ще немає (або його видалили в Discord). */
  poll: { messageId: string; channelId: string; postedAt: string; url: string } | null;
  groups: RbGroup[];
  warnings: string[];
}

export interface RbPostResult {
  version?: string;
  messageId: string;
  postedAt: string;
  warnings: string[];
}

export function createRbPoll(): Promise<RbPostResult> {
  return invokeDiscord<RbPostResult>('rb-post', 'Не вдалося створити пост збору в Discord.');
}

export function fetchRbReactions(): Promise<RbReactionsResult> {
  return invokeDiscord<RbReactionsResult>('rb-reactions', 'Не вдалося прочитати реакції з Discord.', undefined, 'GET');
}
