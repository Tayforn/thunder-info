// =========================================================
// Статичний знімок даних із сусідніх проєктів сервера (pvp.thunderpw.fun,
// ladder.thunderpw.fun) для блоку "Турніри, розіграші та конкурси" на
// головній. На відміну від ladderPreview.ts (той самий Supabase-проєкт,
// тягнеться наживо), турнірний сайт сидить на ОКРЕМОМУ Supabase-проєкті
// (спільному з pw-events, див. pw-pvp/supabase/SETUP.md) — своїх ключів
// у thunder-info немає, тож це знімок, який оновлює адмін вручну, коли
// на pvp.thunderpw.fun з'являється новий турнір/зал слави.
// =========================================================

export const PVP_URL = 'https://pvp.thunderpw.fun/';
export const LADDER_URL = 'https://ladder.thunderpw.fun/';
export const CALC_REFINE_URL = 'https://calc.thunderpw.fun/refine';

export interface PodiumPlace {
  place: 1 | 2 | 3;
  nickname: string;
}

export const LATEST_TOURNAMENT = {
  name: 'Кубок Тандерів #6',
  dateLabel: '10 жовтня 2026',
  bracketUrl: 'https://pvp.thunderpw.fun/t/b9295677-4238-4ac5-b5ea-19506187a8d3/bracket',
  podium: [
    { place: 1, nickname: 'Конс' },
    { place: 2, nickname: 'Tayforn' },
    { place: 3, nickname: "mini'pig" },
  ] as PodiumPlace[],
};

export interface HallOfFameRow {
  rank: number;
  nickname: string;
  wins: number;
}

/** Зал слави — перемоги за всі турніри (pvp.thunderpw.fun). */
export const HALL_OF_FAME: HallOfFameRow[] = [
  { rank: 1, nickname: 'Меркурі', wins: 2 },
  { rank: 2, nickname: 'Infernoman(Арсен)', wins: 1 },
  { rank: 2, nickname: 'Volk', wins: 1 },
  { rank: 2, nickname: 'XenuS', wins: 1 },
  { rank: 2, nickname: 'Конс', wins: 1 },
];

/** Минулий одноразовий турнір з призовим фондом 600 скринь. */
export const PAST_TOURNAMENT_600 = {
  bracketUrl: 'https://pvp.thunderpw.fun/t/aac8bca6-79ac-46ae-ad85-9c8ee4db0c17/bracket',
  prizeChests: 600,
};

/** Розподіл фонду минулого розіграшу ладдера (1000 скринь на топ-10 місць). */
export const LADDER_PRIZE_CHESTS = 1000;

export interface RecruitmentOfficer {
  nickname: string;
}

export const RECRUITMENT_OFFICERS: RecruitmentOfficer[] = [
  { nickname: 'Bubochka' },
  { nickname: 'Pomponchyk' },
  { nickname: '☆★Eddie★☆' },
  { nickname: 'abrams' },
];
