// =========================================================
// Два клієнти до тих самих даних:
//
//  * `supabase` — прямий, з публічним anon-ключем. Ним читаються ПУБЛІЧНІ
//    таблиці (склади/лут для головної та /farm) і працює адмін: у нього є
//    сесія Supabase, тож RLS пускає його і на читання, і на запис.
//  * `gated` — той самий API, але через наш бекенд (/api/sb), який пускає
//    лише з дійсною Discord-сесією (а вона є тільки в учасника сервера
//    клану з потрібною роллю). Ним читаються закриті таблиці гільдії.
//
// readClient() обирає потрібний: адмін читає напряму, решта — через гейт.
// =========================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

/** Проксі на нашому ж домені: ключ service_role лишається на сервері. */
const gated = createClient(
  `${window.location.origin}/api/sb`,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

let direct = false;

/** Адмін (сесія Supabase) читає напряму — Discord йому не потрібен. */
export function setDirectReads(on: boolean): void {
  direct = on;
}

/** Клієнт для читання ЗАКРИТИХ таблиць гільдії. */
export function readClient(): SupabaseClient {
  return direct ? supabase : gated;
}
