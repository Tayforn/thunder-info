// =========================================================
// Турніри з сусіднього сайту PvP (pvp.thunderpw.fun) — для блоку на
// Головній: останній зіграний турнір із п'єдесталом, зал слави, найближчі
// та минулі турніри. Читаємо напряму з Supabase-проєкту pw-pvp (окремий
// проєкт, свій anon-ключ — VITE_PVP_SUPABASE_*; таблиці tournaments,
// tournament_series, bracket_matches, registrations відкриті на читання).
// Логіка п'єдесталу й статусів — дзеркало pw-pvp (data/bracket.ts,
// data/types.ts, HomePage.tsx), лише читання, без запису.
// Без ключів модуль нічого не вантажить — блок на Головній просто не
// показується (pvpConfigured = false).
// =========================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const PVP_SITE = 'https://pvp.thunderpw.fun/';
export const pvpTournamentUrl = (id: string) => `${PVP_SITE}t/${id}`;
export const pvpRegisterUrl = (id?: string | null) => `${PVP_SITE}register${id ? '?t=' + id : ''}`;

const url = (import.meta.env.VITE_PVP_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_PVP_SUPABASE_ANON_KEY as string | undefined)?.trim();
export const pvpConfigured = !!url && !!key;

let client: SupabaseClient | null = null;
function pvp(): SupabaseClient {
  if (!client) client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}

export type PvpStatus = 'draft' | 'registration_open' | 'registration_closed' | 'in_progress' | 'completed' | 'cancelled';

export interface PvpTournament {
  id: string;
  seriesId: string | null;
  seriesName: string | null;
  name: string;
  /** YYYY-MM-DD */
  eventDate: string;
  status: PvpStatus;
  teamSize: number | null;
}

export interface PvpPodium {
  first: string;
  second: string | null;
  third: string | null;
  /** Склади згенерованих команд фул-рандому; null для соло / готових команд. */
  members: { first: string[] | null; second: string[] | null; third: string[] | null };
}

export interface WinStat { nickname: string; count: number }

export const PVP_STATUS_LABELS: Record<PvpStatus, string> = {
  draft: 'Чернетка',
  registration_open: 'Реєстрація відкрита',
  registration_closed: 'Реєстрація закрита',
  in_progress: 'Триває',
  completed: 'Завершено',
  cancelled: 'Скасовано',
};

/** Сьогодні за місцевим часом у форматі event_date — як у pw-pvp. */
export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function isRegistrationOpen(t: Pick<PvpTournament, 'status' | 'eventDate'>): boolean {
  return t.status === 'registration_open' && t.eventDate >= localToday();
}

export function isPastTournament(t: Pick<PvpTournament, 'status' | 'eventDate'>): boolean {
  if (t.status === 'completed' || t.status === 'cancelled') return true;
  if (t.status === 'in_progress') return false;
  return t.eventDate < localToday();
}

export function effectiveStatus(t: Pick<PvpTournament, 'status' | 'eventDate'>): PvpStatus {
  if (t.status === 'registration_open' && !isRegistrationOpen(t)) return 'registration_closed';
  return t.status;
}

/** «2026-09-25» → «25 вересня 2026». */
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
export function eventDateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS_GEN[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

/** Українська форма слова «перемога» (1 / 2–4 / 5+, 11–14 — «перемог»). */
export function winsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'перемога';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'перемоги';
  return 'перемог';
}

interface TournamentRow { id: string; series_id: string | null; name: string; event_date: string; status: PvpStatus; team_size: number | null; visibility: 'public' | 'unlisted' }
interface SeriesRow { id: string; name: string }
interface MatchRow {
  tournament_id: string; bracket_side: 'winners' | 'losers' | 'final' | 'third_place'; round: number;
  participant1_id: string | null; participant2_id: string | null; winner_id: string | null;
}

/** Публічні турніри (visibility='public'), найновіші першими, з назвою серії. */
export async function fetchPvpTournaments(): Promise<PvpTournament[]> {
  const [{ data, error }, { data: sData }] = await Promise.all([
    pvp().from('tournaments').select('id, series_id, name, event_date, status, team_size, visibility').eq('visibility', 'public').order('event_date', { ascending: false }),
    pvp().from('tournament_series').select('id, name'),
  ]);
  if (error) throw error;
  const seriesName = new Map(((sData ?? []) as SeriesRow[]).map((s) => [s.id, s.name]));
  return (data as TournamentRow[]).map((r) => ({
    id: r.id, seriesId: r.series_id, seriesName: r.series_id ? seriesName.get(r.series_id) ?? null : null,
    name: r.name, eventDate: r.event_date, status: r.status, teamSize: r.team_size,
  }));
}

/** Матч, що визначає чемпіона: гранд-фінал (double_elim) або найвищий раунд
 * winners-сітки (single_elim). */
function decisive(matches: MatchRow[]): MatchRow | undefined {
  const grandFinal = matches.find((m) => m.bracket_side === 'final');
  if (grandFinal) return grandFinal;
  const winners = matches.filter((m) => m.bracket_side === 'winners');
  if (!winners.length) return undefined;
  const maxRound = Math.max(...winners.map((m) => m.round));
  return winners.find((m) => m.round === maxRound);
}

/** 3-тє в подвійній елімінації — програний фіналу нижньої сітки. */
function thirdFromLosersFinal(matches: MatchRow[]): string | null {
  const losers = matches.filter((m) => m.bracket_side === 'losers');
  if (!losers.length) return null;
  const maxRound = Math.max(...losers.map((m) => m.round));
  const final = losers.filter((m) => m.round === maxRound);
  if (final.length !== 1 || !final[0].winner_id) return null;
  const { participant1_id, participant2_id, winner_id } = final[0];
  return (participant1_id === winner_id ? participant2_id : participant1_id) ?? null;
}

/** П'єдестали одразу для кількох турнірів — трьома запитами замість
 * N×3 (сітки всіх турнірів, заявки топ-3, склади команд). Турнір без
 * визначеного переможця у мапу не потрапляє. */
export async function fetchPvpPodiums(tournamentIds: readonly string[]): Promise<Map<string, PvpPodium>> {
  const result = new Map<string, PvpPodium>();
  if (tournamentIds.length === 0) return result;

  const { data, error } = await pvp()
    .from('bracket_matches')
    .select('tournament_id, bracket_side, round, participant1_id, participant2_id, winner_id')
    .in('tournament_id', tournamentIds as string[]);
  if (error) throw error;

  const byTournament = new Map<string, MatchRow[]>();
  for (const m of data as MatchRow[]) {
    const list = byTournament.get(m.tournament_id) ?? [];
    list.push(m);
    byTournament.set(m.tournament_id, list);
  }

  const places = new Map<string, { first: string; second: string | null; third: string | null }>();
  for (const [tid, matches] of byTournament) {
    const d = decisive(matches);
    if (!d?.winner_id) continue;
    const first = d.winner_id;
    const second = d.participant1_id === first ? d.participant2_id : d.participant1_id;
    const third = matches.find((m) => m.bracket_side === 'third_place')?.winner_id ?? thirdFromLosersFinal(matches);
    places.set(tid, { first, second, third });
  }
  if (places.size === 0) return result;

  const regIds = Array.from(new Set(Array.from(places.values()).flatMap((p) => [p.first, p.second, p.third]).filter((x): x is string => !!x)));
  const { data: regs, error: rErr } = await pvp().from('registrations').select('id, nickname, kind').in('id', regIds);
  if (rErr) throw rErr;
  const rows = regs as { id: string; nickname: string; kind?: 'player' | 'team' | null }[];
  const nickOf = (id: string | null) => (id ? rows.find((r) => r.id === id)?.nickname ?? null : null);

  const teamIds = rows.filter((r) => r.kind === 'team').map((r) => r.id);
  const membersOf = new Map<string, string[]>();
  if (teamIds.length) {
    const { data: mData, error: mErr } = await pvp()
      .from('registrations')
      .select('nickname, team_registration_id')
      .in('team_registration_id', teamIds)
      .order('created_at', { ascending: true });
    if (mErr) throw mErr;
    for (const m of mData as { nickname: string; team_registration_id: string }[]) {
      const list = membersOf.get(m.team_registration_id) ?? [];
      list.push(m.nickname);
      membersOf.set(m.team_registration_id, list);
    }
  }
  const membersFor = (id: string | null) => (id && membersOf.has(id) ? membersOf.get(id)! : null);

  for (const [tid, p] of places) {
    const first = nickOf(p.first);
    if (!first) continue;
    result.set(tid, {
      first, second: nickOf(p.second), third: nickOf(p.third),
      members: { first: membersFor(p.first), second: membersFor(p.second), third: membersFor(p.third) },
    });
  }
  return result;
}

/** Зал слави: нік → кількість чемпіонств. Згенерованій команді фул-рандому
 * перемога зараховується кожному гравцю зі складу. */
export function winStats(podiums: Iterable<PvpPodium>): WinStat[] {
  const wins = new Map<string, number>();
  for (const pd of podiums) {
    const credited = pd.members.first && pd.members.first.length > 0 ? pd.members.first : [pd.first];
    for (const n of credited) wins.set(n, (wins.get(n) ?? 0) + 1);
  }
  return Array.from(wins, ([nickname, count]) => ({ nickname, count })).sort((a, b) => b.count - a.count || a.nickname.localeCompare(b.nickname));
}
