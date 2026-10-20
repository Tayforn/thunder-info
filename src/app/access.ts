// =========================================================
// Рівні доступу до розділів:
//
//  * public — бачать усі (головна й фарм: це вітрина);
//  * member — учасник клану, який увійшов через Discord і має потрібну роль;
//    лише перегляд, без редагування;
//  * admin  — адміністратор (окремий вхід Supabase), усе як було: перегляд
//    і редагування. Адмін з роллю 'events' (міграція 0008) з адмінських
//    розділів бачить лише /events («ДС Евенти»).
//
// Це UI-частина; самі дані закритих розділів недоступні без сесії й на
// сервері (бекенд-проксі /api/sb + відкликані права anon у базі).
// =========================================================

import type { Route } from './useRoute';

export type AccessLevel = 'public' | 'member' | 'admin';

export const ROUTE_ACCESS: Record<Route['name'], AccessLevel> = {
  home: 'public',
  farm: 'public',
  newbies: 'member',
  players: 'member',
  activity: 'admin',
  r8: 'admin',
  rb: 'admin',
  events: 'admin',
  admin: 'admin',
};

export interface Viewer {
  /** Увійшов через Discord і має клан-роль. */
  member: boolean;
  /** Повний адміністратор (сесія Supabase, role = 'admin'). */
  admin: boolean;
  /** Адмін лише евентів (role = 'events'). */
  eventsAdmin: boolean;
}

export function canOpen(name: Route['name'], v: Viewer): boolean {
  const need = ROUTE_ACCESS[name];
  if (need === 'public') return true;
  if (need === 'admin') return v.admin || (v.eventsAdmin && name === 'events');
  return v.member || v.admin;
}
