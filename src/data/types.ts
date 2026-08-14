// =========================================================
// thunder-info: типи даних (дзеркалять Supabase-схему з
// supabase/migrations/0001_init.sql).
// =========================================================

export interface ClassRow {
  id: string;
  name: string;
  /** Коефіцієнт пріоритетності класу — множиться на бали активності при
   * нарахуванні (award_daily_points). За замовчуванням 1. */
  coef: number;
  sortOrder: number;
}

export interface Newbie {
  id: string;
  nickname: string;
  classId: string | null;
  note: string | null;
  createdAt: string;
}

/** Гравець — як новачок, але з простішою системою балів: сума
 * activity.points за відвідані активності (без множення на coef класу,
 * без крон-снапшотів) + ручні премії (player_bonuses). */
export interface Player {
  id: string;
  nickname: string;
  classId: string | null;
  note: string | null;
  createdAt: string;
}

/** Ручна премія гравцю за конкретний день — одна на гравця на день,
 * повторна видача перезаписує (upsert по unique(player_id, bonus_date)). */
export interface PlayerBonus {
  id: string;
  playerId: string;
  bonusDate: string;
  points: number;
  note: string | null;
}

export interface LootItem {
  id: string;
  name: string;
  price: number;
  /** "камінь в шмот" — false лише для 5 стартових валютних айтемів КХ;
   * усе інше, що додає адмін, за замовчуванням true (камінь). */
  isGearStone: boolean;
  pwdbUrl: string | null;
  /** Шанс дропу за етап КХ, % (null — не валютний айтем КХ, звичайний камінь). */
  khChancePct: number | null;
  khC1Min: number | null;
  khC1Max: number | null;
  khC2Min: number | null;
  khC2Max: number | null;
}

export interface Activity {
  id: string;
  name: string;
  points: number;
  /** 0=неділя..6=субота (Postgres extract(dow)) — дні, коли ця активність відбувається. */
  weekdays: number[];
  sortOrder: number;
}

export interface GearItem {
  id: string;
  name: string;
  note: string | null;
}

export interface GearItemComponent {
  id: string;
  gearItemId: string;
  lootItemId: string;
  quantity: number;
}

export const WEEKDAY_LABELS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;
export const WEEKDAY_LABELS_FULL = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота'] as const;

/** Поточна дата за Києвом (YYYY-MM-DD) — той самий часовий пояс, що й
 * `check_date`/`award_date` default у БД (`now() at time zone 'Europe/Kyiv'`).
 * Рахуємо на клієнті тим самим поясом, а не браузерним локальним, інакше
 * адмін в іншому TZ бачив би "сьогоднішні" активності не в ті дні. */
export function kyivDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(d);
}

/** Поточний день тижня за Києвом, у тій самій системі, що й weekdays (0=нд..6=сб). */
export function todayWeekday(): number {
  return new Date(kyivDateString() + 'T12:00:00').getDay();
}

/** Пороги підсвітки класу за коефіцієнтом — власне рішення (користувач
 * делегував вибір "якою буде підсвітка"): >1.2 — пріоритетний (яскравий
 * glow), <0.8 — приглушений, інакше — нейтральний. */
export function classBadgeVariant(coef: number): 'priority' | 'mute' | 'neutral' {
  if (coef > 1.2) return 'priority';
  if (coef < 0.8) return 'mute';
  return 'neutral';
}
