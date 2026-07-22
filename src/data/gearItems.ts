import { supabase } from '../app/supabaseClient';
import type { GearItem, GearItemComponent } from './types';

interface GearItemDbRow { id: string; name: string; note: string | null }
interface ComponentDbRow { id: string; gear_item_id: string; loot_item_id: string; quantity: number }

export async function fetchGearItems(): Promise<GearItem[]> {
  const { data, error } = await supabase.from('gear_items').select('*').order('name', { ascending: true });
  if (error) throw error;
  return (data as GearItemDbRow[]).map((r) => ({ id: r.id, name: r.name, note: r.note }));
}

export async function fetchGearItemComponents(): Promise<GearItemComponent[]> {
  const { data, error } = await supabase.from('gear_item_components').select('*');
  if (error) throw error;
  return (data as ComponentDbRow[]).map((r) => ({ id: r.id, gearItemId: r.gear_item_id, lootItemId: r.loot_item_id, quantity: Number(r.quantity) }));
}

export async function createGearItem(input: { name: string; note?: string | null }): Promise<GearItem> {
  const { data, error } = await supabase
    .from('gear_items')
    .insert({ name: input.name.trim(), note: input.note?.trim() || null })
    .select('*')
    .single();
  if (error) throw error;
  const r = data as GearItemDbRow;
  return { id: r.id, name: r.name, note: r.note };
}

export async function updateGearItem(id: string, patch: Partial<{ name: string; note: string | null }>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name.trim();
  if (patch.note !== undefined) dbPatch.note = patch.note?.trim() || null;
  const { error } = await supabase.from('gear_items').update(dbPatch).eq('id', id);
  if (error) throw error;
}

export async function deleteGearItem(id: string): Promise<void> {
  const { error } = await supabase.from('gear_items').delete().eq('id', id);
  if (error) throw error;
}

export async function setGearItemComponents(gearItemId: string, components: { lootItemId: string; quantity: number }[]): Promise<void> {
  // Найпростіший спосіб синхронізувати склад шмотки — видалити старі
  // компоненти й вставити нові в одній операції; кількість компонентів
  // невелика (кілька валютних айтемів), тож просте delete+insert без
  // diff-логіки цілком достатнє.
  const { error: delErr } = await supabase.from('gear_item_components').delete().eq('gear_item_id', gearItemId);
  if (delErr) throw delErr;
  if (components.length === 0) return;
  const { error: insErr } = await supabase.from('gear_item_components').insert(
    components.map((c) => ({ gear_item_id: gearItemId, loot_item_id: c.lootItemId, quantity: c.quantity })),
  );
  if (insErr) throw insErr;
}
