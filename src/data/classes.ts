import { supabase } from '../app/supabaseClient';
import type { ClassRow } from './types';

interface ClassDbRow { id: string; name: string; coef: number; sort_order: number }

function fromDb(r: ClassDbRow): ClassRow {
  return { id: r.id, name: r.name, coef: Number(r.coef), sortOrder: r.sort_order };
}

export async function fetchClasses(): Promise<ClassRow[]> {
  const { data, error } = await supabase.from('classes').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as ClassDbRow[]).map(fromDb);
}

export async function createClass(input: { name: string; coef: number }): Promise<void> {
  const { error } = await supabase.from('classes').insert({ name: input.name.trim(), coef: input.coef });
  if (error) throw error;
}

export async function updateClass(id: string, patch: Partial<{ name: string; coef: number; sortOrder: number }>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name.trim();
  if (patch.coef !== undefined) dbPatch.coef = patch.coef;
  if (patch.sortOrder !== undefined) dbPatch.sort_order = patch.sortOrder;
  const { error } = await supabase.from('classes').update(dbPatch).eq('id', id);
  if (error) throw error;
}

export async function deleteClass(id: string): Promise<void> {
  const { error } = await supabase.from('classes').delete().eq('id', id);
  if (error) throw error;
}
