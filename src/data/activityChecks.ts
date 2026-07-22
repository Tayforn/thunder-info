// =========================================================
// Галочки активності — спільні для всіх адмінів, лише "сьогодні"
// (за Києвом, див. kyivDateString). Наявність рядка в activity_checks =
// галочка стоїть; toggle = insert/delete, без окремого boolean-прапорця
// (той самий підхід, що registrations в pw-pvp: unique-рядок як джерело
// правди).
// =========================================================

import { supabase } from '../app/supabaseClient';
import { kyivDateString } from './types';

export interface ActivityCheck {
  activityId: string;
  newbieId: string;
}

interface ActivityCheckDbRow { activity_id: string; newbie_id: string }

export async function fetchTodayChecks(): Promise<ActivityCheck[]> {
  const { data, error } = await supabase
    .from('activity_checks')
    .select('activity_id, newbie_id')
    .eq('check_date', kyivDateString());
  if (error) throw error;
  return (data as ActivityCheckDbRow[]).map((r) => ({ activityId: r.activity_id, newbieId: r.newbie_id }));
}

export async function setCheck(activityId: string, newbieId: string, checked: boolean, checkedBy: string | undefined): Promise<void> {
  if (checked) {
    const { error } = await supabase
      .from('activity_checks')
      .insert({ activity_id: activityId, newbie_id: newbieId, check_date: kyivDateString(), checked_by: checkedBy ?? null });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('activity_checks')
      .delete()
      .eq('activity_id', activityId)
      .eq('newbie_id', newbieId)
      .eq('check_date', kyivDateString());
    if (error) throw error;
  }
}

let subscriberSeq = 0;

export function subscribeToActivityChecks(onChange: () => void): () => void {
  const channel = supabase
    .channel(`activity-checks-${++subscriberSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_checks' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
