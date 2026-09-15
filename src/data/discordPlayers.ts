// =========================================================
// Люди, що входили через Discord (спільна таблиця ladder_players). Тут лише
// перегляд списку і прапорець бану: він перевіряється на кожному запиті
// бекенда, тож бан/розбан діє миттєво — і на ладдері, і на закритих
// розділах гільдії.
//
// Читаємо/пишемо НАПРЯМУ через supabase: таба адмінська, у адміна є сесія
// Supabase (RLS: select для authenticated, update(banned) для адмінів).
// =========================================================

import { supabase } from '../app/supabaseClient';

export interface DiscordPlayer {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  banned: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

interface Row {
  id: string;
  nickname: string;
  avatar_url: string | null;
  banned: boolean;
  last_login_at: string | null;
  created_at: string | null;
}

export async function fetchDiscordPlayers(): Promise<DiscordPlayer[]> {
  const { data, error } = await supabase
    .from('ladder_players')
    .select('id, nickname, avatar_url, banned, last_login_at, created_at')
    .order('last_login_at', { ascending: false });
  if (error) throw error;
  return (data as Row[] | null ?? []).map((r) => ({
    id: r.id,
    nickname: r.nickname,
    avatarUrl: r.avatar_url,
    banned: r.banned,
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
  }));
}

export async function setPlayerBanned(id: string, banned: boolean): Promise<void> {
  const { error } = await supabase.from('ladder_players').update({ banned }).eq('id', id);
  if (error) throw error;
}
