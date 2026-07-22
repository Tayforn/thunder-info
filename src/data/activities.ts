import { supabase } from '../app/supabaseClient';
import type { Activity } from './types';

interface ActivityDbRow { id: string; name: string; points: number; weekdays: number[]; sort_order: number }

function fromDb(r: ActivityDbRow): Activity {
  return { id: r.id, name: r.name, points: Number(r.points), weekdays: r.weekdays, sortOrder: r.sort_order };
}

export async function fetchActivities(): Promise<Activity[]> {
  const { data, error } = await supabase.from('activities').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as ActivityDbRow[]).map(fromDb);
}

export async function createActivity(input: { name: string; points: number; weekdays: number[] }): Promise<void> {
  const { error } = await supabase.from('activities').insert({ name: input.name.trim(), points: input.points, weekdays: input.weekdays });
  if (error) throw error;
}

export async function updateActivity(id: string, patch: Partial<{ name: string; points: number; weekdays: number[] }>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name.trim();
  if (patch.points !== undefined) dbPatch.points = patch.points;
  if (patch.weekdays !== undefined) dbPatch.weekdays = patch.weekdays;
  const { error } = await supabase.from('activities').update(dbPatch).eq('id', id);
  if (error) throw error;
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from('activities').delete().eq('id', id);
  if (error) throw error;
}
