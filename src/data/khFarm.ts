// =========================================================
// Розрахунок соло-фарму КХ (Королівське Полювання): 2 круга на тиждень,
// по 9 етапів кожен — АЛЕ 9-й етап 2-го круга ніколи не проходиться
// (за словами користувача), тож реально за тиждень береться
// 9 (1-й круг) + 8 (2-й круг) = 17 етапів. За кожен пройдений етап є шанс
// дропу конкретного айтема; кількість айтема в дропі залежить від круга
// (kh_c1_min/max — 1-й круг, kh_c2_min/max — 2-й круг), шанс — той самий
// для обох кругів (kh_chance_pct).
// =========================================================

import type { LootItem } from './types';

export const STAGES_CIRCLE_1 = 9;
export const STAGES_CIRCLE_2 = 8; // 9-й етап 2-го круга не проходиться

function avg(min: number | null, max: number | null): number {
  if (min === null || max === null) return 0;
  return (min + max) / 2;
}

/** Очікувана кількість айтема за тиждень соло-фарму (2 круга КХ). */
export function weeklyExpectedYield(item: Pick<LootItem, 'khChancePct' | 'khC1Min' | 'khC1Max' | 'khC2Min' | 'khC2Max'>): number {
  if (item.khChancePct === null) return 0;
  const chance = item.khChancePct / 100;
  const c1 = STAGES_CIRCLE_1 * chance * avg(item.khC1Min, item.khC1Max);
  const c2 = STAGES_CIRCLE_2 * chance * avg(item.khC2Min, item.khC2Max);
  return c1 + c2;
}

export interface FarmNeed {
  lootItemId: string;
  name: string;
  chancePct: number | null;
  needed: number;
  /** Очікування за тиждень з УРАХУВАННЯМ кількості вікон (perWindowYield * windows). */
  weeklyYield: number;
  /** Очікування за тиждень на ОДНЕ вікно — для розбивки "X/вікно × N вікон". */
  perWindowYield: number;
  weeksNeeded: number | null; // null = дропу немає взагалі (weeklyYield=0), фарм неможливий
}

/** Для набору потрібних кількостей валютних айтемів рахує, скільки тижнів
 * соло-фарму потрібно для КОЖНОГО (фармляться паралельно за одні й ті самі
 * походи), і підсумковий час = максимум серед них (найповільніший айтем
 * визначає загальний строк). `windows` — кількість паралельних вікон КХ
 * (мультибоксинг): кожне вікно проходить свої 2 круга незалежно, тож
 * очікування за тиждень масштабується лінійно. */
export function calcFarmWeeks(
  needs: { item: LootItem; needed: number }[],
  windows = 1,
): { rows: FarmNeed[]; totalWeeks: number | null } {
  const w = Math.max(1, windows);
  const rows: FarmNeed[] = needs.map(({ item, needed }) => {
    const perWindowYield = weeklyExpectedYield(item);
    const weeklyYield = perWindowYield * w;
    const weeksNeeded = weeklyYield > 0 ? Math.ceil(needed / weeklyYield) : null;
    return { lootItemId: item.id, name: item.name, chancePct: item.khChancePct, needed, weeklyYield, perWindowYield, weeksNeeded };
  });
  const finite = rows.map((r) => r.weeksNeeded).filter((w): w is number => w !== null);
  const totalWeeks = rows.some((r) => r.weeksNeeded === null) ? null : (finite.length ? Math.max(...finite) : 0);
  return { rows, totalWeeks };
}
