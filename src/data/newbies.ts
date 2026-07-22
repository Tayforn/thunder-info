import { supabase } from '../app/supabaseClient';
import type { Newbie } from './types';

interface NewbieDbRow { id: string; nickname: string; class_id: string | null; note: string | null; created_at: string }

function fromDb(r: NewbieDbRow): Newbie {
  return { id: r.id, nickname: r.nickname, classId: r.class_id, note: r.note, createdAt: r.created_at };
}

export async function fetchNewbies(): Promise<Newbie[]> {
  const { data, error } = await supabase.from('newbies').select('*').order('nickname', { ascending: true });
  if (error) throw error;
  return (data as NewbieDbRow[]).map(fromDb);
}

export async function createNewbie(input: { nickname: string; classId: string | null; note?: string | null }): Promise<void> {
  const { error } = await supabase.from('newbies').insert({
    nickname: input.nickname.trim(),
    class_id: input.classId,
    note: input.note?.trim() || null,
  });
  if (error) throw error;
}

export async function updateNewbie(id: string, patch: Partial<{ nickname: string; classId: string | null; note: string | null }>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.nickname !== undefined) dbPatch.nickname = patch.nickname.trim();
  if (patch.classId !== undefined) dbPatch.class_id = patch.classId;
  if (patch.note !== undefined) dbPatch.note = patch.note?.trim() || null;
  const { error } = await supabase.from('newbies').update(dbPatch).eq('id', id);
  if (error) throw error;
}

export async function deleteNewbie(id: string): Promise<void> {
  const { error } = await supabase.from('newbies').delete().eq('id', id);
  if (error) throw error;
}

export interface NewbieTotal { newbieId: string; totalPoints: number }

/** Сума фіналізованих балів (point_awards) по кожному новачку — попередні
 * дні; бали "за сьогодні" (ще не нараховані крон-джобом) рахуються окремо
 * на клієнті з activity_checks, див. src/data/activityChecks.ts. */
export async function fetchNewbieTotals(): Promise<NewbieTotal[]> {
  const { data, error } = await supabase.from('point_awards').select('newbie_id, points');
  if (error) throw error;
  const totals = new Map<string, number>();
  for (const row of data as { newbie_id: string; points: number }[]) {
    totals.set(row.newbie_id, (totals.get(row.newbie_id) ?? 0) + Number(row.points));
  }
  return Array.from(totals, ([newbieId, totalPoints]) => ({ newbieId, totalPoints }));
}
