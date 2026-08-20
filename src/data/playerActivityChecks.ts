// =========================================================
// Галочки відвідуваності гравців — та сама модель, що activityChecks.ts
// у новачків (unique-рядок = галочка, toggle = insert/delete), але без
// нарахування балів. Грід на /activity працює з довільною датою
// (сьогодні й минулі дні), календар на /players — з діапазоном за місяць.
// =========================================================

import { supabase } from '../app/supabaseClient';

export interface PlayerActivityCheck {
  activityId: string;
  playerId: string;
}

interface PlayerCheckDbRow { activity_id: string; player_id: string; check_date: string }

export async function fetchPlayerChecksOnDate(checkDate: string): Promise<PlayerActivityCheck[]> {
  const { data, error } = await supabase
    .from('player_activity_checks')
    .select('activity_id, player_id')
    .eq('check_date', checkDate);
  if (error) throw error;
  return (data as PlayerCheckDbRow[]).map((r) => ({ activityId: r.activity_id, playerId: r.player_id }));
}

/** Toggle галочки за довільний день — грід на /activity (з навігацією по
 * датах) і ретро-редагування з календаря на /players. */
export async function setPlayerCheckOnDate(activityId: string, playerId: string, checkDate: string, checked: boolean, checkedBy: string | undefined): Promise<void> {
  if (checked) {
    const { error } = await supabase
      .from('player_activity_checks')
      .insert({ activity_id: activityId, player_id: playerId, check_date: checkDate, checked_by: checkedBy ?? null });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('player_activity_checks')
      .delete()
      .eq('activity_id', activityId)
      .eq('player_id', playerId)
      .eq('check_date', checkDate);
    if (error) throw error;
  }
}

/** Галочки одного гравця за діапазон дат (включно) — для місячного
 * календаря відвідуваності. Ключ мапи — YYYY-MM-DD, значення — set
 * activity_id, відвіданих у той день. */
export async function fetchPlayerChecksRange(playerId: string, fromDate: string, toDate: string): Promise<Map<string, Set<string>>> {
  const { data, error } = await supabase
    .from('player_activity_checks')
    .select('activity_id, check_date')
    .eq('player_id', playerId)
    .gte('check_date', fromDate)
    .lte('check_date', toDate);
  if (error) throw error;
  const byDate = new Map<string, Set<string>>();
  for (const r of data as { activity_id: string; check_date: string }[]) {
    const set = byDate.get(r.check_date) ?? new Set<string>();
    set.add(r.activity_id);
    byDate.set(r.check_date, set);
  }
  return byDate;
}

let subscriberSeq = 0;

export function subscribeToPlayerActivityChecks(onChange: () => void): () => void {
  const channel = supabase
    .channel(`player-activity-checks-${++subscriberSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'player_activity_checks' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
