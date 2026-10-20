// =========================================================
// Прев'ю топ-N ладдера заточки з сусіднього проєкту ladder.thunderpw.fun —
// ТОЙ САМИЙ Supabase-проєкт, що й thunder-info (таблиця ladder_entries,
// публічне читання, див. pw-ladder/supabase/migrations/0001_init.sql), тож
// дані тягнемо напряму, без окремого бекенда чи ключів.
// =========================================================

import { supabase } from '../app/supabaseClient';

export interface LadderPreviewEntry {
  nickname: string;
  level: number;
  attempts: number;
}

interface EntryRow {
  nickname: string;
  level: number;
  attempts: number;
}

/** Той самий критерій рейтингу, що в pw-ladder: рівень → менше спроб →
 * менше платних каменів (остання колонка не вибирається, лише для order). */
export async function fetchLadderPreview(limit = 5): Promise<LadderPreviewEntry[]> {
  const { data, error } = await supabase
    .from('ladder_entries')
    .select('nickname, level, attempts')
    .order('level', { ascending: false })
    .order('attempts', { ascending: true })
    .order('paid_attempts', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data as EntryRow[]).map((r) => ({ nickname: r.nickname, level: r.level, attempts: r.attempts }));
}
