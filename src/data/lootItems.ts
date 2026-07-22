import { supabase } from '../app/supabaseClient';
import type { LootItem } from './types';

interface LootItemDbRow {
  id: string; name: string; price: number; is_gear_stone: boolean; pwdb_url: string | null;
  kh_chance_pct: number | null; kh_c1_min: number | null; kh_c1_max: number | null;
  kh_c2_min: number | null; kh_c2_max: number | null;
}

function fromDb(r: LootItemDbRow): LootItem {
  return {
    id: r.id,
    name: r.name,
    price: Number(r.price),
    isGearStone: r.is_gear_stone,
    pwdbUrl: r.pwdb_url,
    khChancePct: r.kh_chance_pct === null ? null : Number(r.kh_chance_pct),
    khC1Min: r.kh_c1_min,
    khC1Max: r.kh_c1_max,
    khC2Min: r.kh_c2_min,
    khC2Max: r.kh_c2_max,
  };
}

export async function fetchLootItems(): Promise<LootItem[]> {
  const { data, error } = await supabase.from('loot_items').select('*').order('name', { ascending: true });
  if (error) throw error;
  return (data as LootItemDbRow[]).map(fromDb);
}

export async function createLootItem(input: { name: string; price: number; isGearStone: boolean; pwdbUrl?: string | null }): Promise<void> {
  const { error } = await supabase.from('loot_items').insert({
    name: input.name.trim(),
    price: input.price,
    is_gear_stone: input.isGearStone,
    pwdb_url: input.pwdbUrl?.trim() || null,
  });
  if (error) throw error;
}

export async function updateLootItem(id: string, patch: Partial<{ name: string; price: number; isGearStone: boolean; pwdbUrl: string | null }>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name.trim();
  if (patch.price !== undefined) dbPatch.price = patch.price;
  if (patch.isGearStone !== undefined) dbPatch.is_gear_stone = patch.isGearStone;
  if (patch.pwdbUrl !== undefined) dbPatch.pwdb_url = patch.pwdbUrl?.trim() || null;
  const { error } = await supabase.from('loot_items').update(dbPatch).eq('id', id);
  if (error) throw error;
}

export async function deleteLootItem(id: string): Promise<void> {
  const { error } = await supabase.from('loot_items').delete().eq('id', id);
  if (error) throw error;
}
