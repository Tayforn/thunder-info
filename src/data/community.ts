// =========================================================
// Сталі дані сусідніх проєктів сервера (ladder.thunderpw.fun,
// calc.thunderpw.fun) і набору для блоків на Головній. Турніри й зал
// слави з pvp.thunderpw.fun раніше були статичним знімком тут — тепер вони
// тягнуться наживо з Supabase-проєкту pw-pvp (data/pvp.ts). Ладдер — той
// самий Supabase-проєкт, що й thunder-info (data/ladderPreview.ts).
// =========================================================

export const PVP_URL = 'https://pvp.thunderpw.fun/';
export const LADDER_URL = 'https://ladder.thunderpw.fun/';
export const CALC_REFINE_URL = 'https://calc.thunderpw.fun/refine';

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
