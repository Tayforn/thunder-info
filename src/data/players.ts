import { readClient, supabase } from '../app/supabaseClient';
import type { Player } from './types';

interface PlayerDbRow { id: string; nickname: string; class_id: string | null; note: string | null; created_at: string }

function fromDb(r: PlayerDbRow): Player {
  return { id: r.id, nickname: r.nickname, classId: r.class_id, note: r.note, createdAt: r.created_at };
}

export async function fetchPlayers(): Promise<Player[]> {
  const { data, error } = await readClient().from('players').select('*').order('nickname', { ascending: true });
  if (error) throw error;
  return (data as PlayerDbRow[]).map(fromDb);
}

export async function createPlayer(input: { nickname: string; classId: string | null; note?: string | null }): Promise<void> {
  const { error } = await supabase.from('players').insert({
    nickname: input.nickname.trim(),
    class_id: input.classId,
    note: input.note?.trim() || null,
  });
  if (error) throw error;
}

export async function updatePlayer(id: string, patch: Partial<{ nickname: string; classId: string | null; note: string | null }>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.nickname !== undefined) dbPatch.nickname = patch.nickname.trim();
  if (patch.classId !== undefined) dbPatch.class_id = patch.classId;
  if (patch.note !== undefined) dbPatch.note = patch.note?.trim() || null;
  const { error } = await supabase.from('players').update(dbPatch).eq('id', id);
  if (error) throw error;
}

export async function deletePlayer(id: string): Promise<void> {
  const { error } = await supabase.from('players').delete().eq('id', id);
  if (error) throw error;
}

export interface PlayerTotal { playerId: string; activityPoints: number; bonusPoints: number; totalPoints: number }

/** Сума балів по кожному гравцю: activity.points за відвідані активності
 * (поточні значення балів, без снапшотів — див. коментар у міграції 0002)
 * + ручні премії (player_bonuses). range (включно, YYYY-MM-DD) — для
 * фільтра "бали за період" у ростері; без нього — за весь час. */
export async function fetchPlayerTotals(range?: { from: string; to: string }): Promise<PlayerTotal[]> {
  let checksQuery = readClient().from('player_activity_checks').select('player_id, activities(points)');
  let bonusesQuery = readClient().from('player_bonuses').select('player_id, points');
  if (range) {
    checksQuery = checksQuery.gte('check_date', range.from).lte('check_date', range.to);
    bonusesQuery = bonusesQuery.gte('bonus_date', range.from).lte('bonus_date', range.to);
  }
  const [checksRes, bonusesRes] = await Promise.all([checksQuery, bonusesQuery]);
  if (checksRes.error) throw checksRes.error;
  if (bonusesRes.error) throw bonusesRes.error;

  const activity = new Map<string, number>();
  for (const row of checksRes.data as unknown as { player_id: string; activities: { points: number } | null }[]) {
    activity.set(row.player_id, (activity.get(row.player_id) ?? 0) + Number(row.activities?.points ?? 0));
  }
  const bonus = new Map<string, number>();
  for (const row of bonusesRes.data as { player_id: string; points: number }[]) {
    bonus.set(row.player_id, (bonus.get(row.player_id) ?? 0) + Number(row.points));
  }

  const ids = new Set([...activity.keys(), ...bonus.keys()]);
  return Array.from(ids, (playerId) => {
    const a = activity.get(playerId) ?? 0;
    const b = bonus.get(playerId) ?? 0;
    return { playerId, activityPoints: a, bonusPoints: b, totalPoints: a + b };
  });
}

/** Переведення новачка в гравці: створює гравця з тими самими нікнеймом/
 * класом/нотаткою, копіює всю історію галочок (activity_checks →
 * player_activity_checks, календар збереже відвідуваність) і видаляє
 * новачка (його point_awards зникають каскадом — у гравців бали рахуються
 * інакше). Не транзакційно (клієнтські запити поспіль): якщо впаде
 * посередині — новачок лишиться, а створеного гравця видно в адмінці,
 * його можна видалити й повторити. */
export async function promoteNewbieToPlayer(newbie: { id: string; nickname: string; classId: string | null; note: string | null }): Promise<void> {
  const { data: created, error: insertErr } = await supabase
    .from('players')
    .insert({ nickname: newbie.nickname.trim(), class_id: newbie.classId, note: newbie.note })
    .select('id')
    .single();
  if (insertErr) throw insertErr;
  const playerId = (created as { id: string }).id;

  const { data: checks, error: checksErr } = await readClient()
    .from('activity_checks')
    .select('activity_id, check_date, checked_by')
    .eq('newbie_id', newbie.id);
  if (checksErr) throw checksErr;

  if (checks.length > 0) {
    const rows = (checks as { activity_id: string; check_date: string; checked_by: string | null }[]).map((c) => ({
      activity_id: c.activity_id,
      player_id: playerId,
      check_date: c.check_date,
      checked_by: c.checked_by,
    }));
    const { error: copyErr } = await supabase.from('player_activity_checks').insert(rows);
    if (copyErr) throw copyErr;
  }

  const { error: deleteErr } = await supabase.from('newbies').delete().eq('id', newbie.id);
  if (deleteErr) throw deleteErr;
}
