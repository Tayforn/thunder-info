// =========================================================
// Премії гравцям — ручне нарахування балів за конкретний день (адмін
// видає з календаря на /players). Одна премія на гравця на день:
// повторне збереження = upsert по unique(player_id, bonus_date).
// =========================================================

import { readClient, supabase } from '../app/supabaseClient';
import type { PlayerBonus } from './types';

interface BonusDbRow { id: string; player_id: string; bonus_date: string; points: number; note: string | null }

function fromDb(r: BonusDbRow): PlayerBonus {
  return { id: r.id, playerId: r.player_id, bonusDate: r.bonus_date, points: Number(r.points), note: r.note };
}

/** Премії одного гравця за діапазон дат (включно) — для календаря.
 * Ключ мапи — YYYY-MM-DD. */
export async function fetchPlayerBonusesRange(playerId: string, fromDate: string, toDate: string): Promise<Map<string, PlayerBonus>> {
  const { data, error } = await readClient()
    .from('player_bonuses')
    .select('*')
    .eq('player_id', playerId)
    .gte('bonus_date', fromDate)
    .lte('bonus_date', toDate);
  if (error) throw error;
  return new Map((data as BonusDbRow[]).map((r) => [r.bonus_date, fromDb(r)]));
}

/** Премії всіх гравців за один день — для колонки "Премія" на /activity.
 * Ключ мапи — player_id. */
export async function fetchBonusesOnDate(bonusDate: string): Promise<Map<string, PlayerBonus>> {
  const { data, error } = await readClient().from('player_bonuses').select('*').eq('bonus_date', bonusDate);
  if (error) throw error;
  return new Map((data as BonusDbRow[]).map((r) => [r.player_id, fromDb(r)]));
}

export async function setPlayerBonus(playerId: string, bonusDate: string, points: number, note: string | null, createdBy: string | undefined): Promise<void> {
  const { error } = await supabase
    .from('player_bonuses')
    .upsert(
      { player_id: playerId, bonus_date: bonusDate, points, note: note?.trim() || null, created_by: createdBy ?? null },
      { onConflict: 'player_id,bonus_date' },
    );
  if (error) throw error;
}

export async function deletePlayerBonus(playerId: string, bonusDate: string): Promise<void> {
  const { error } = await supabase.from('player_bonuses').delete().eq('player_id', playerId).eq('bonus_date', bonusDate);
  if (error) throw error;
}

let subscriberSeq = 0;

/** Спрацьовує лише якщо player_bonuses додано до realtime-публікації
 * (міграція 0003); інакше підписка мовчки не отримує подій — не помилка. */
export function subscribeToPlayerBonuses(onChange: () => void): () => void {
  const channel = supabase
    .channel(`player-bonuses-${++subscriberSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'player_bonuses' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
