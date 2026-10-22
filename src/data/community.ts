// =========================================================
// Сталі дані сусідніх проєктів сервера (ladder.thunderpw.fun,
// calc.thunderpw.fun) і набору для блоків на Головній. Турніри й зал
// слави з pvp.thunderpw.fun раніше були статичним знімком тут — тепер вони
// тягнуться наживо з Supabase-проєкту pw-pvp (data/pvp.ts). Підсумки
// ладдера — статичний знімок минулого розіграшу (LADDER_LAST_DRAW).
// =========================================================

export const PVP_URL = 'https://pvp.thunderpw.fun/';
export const LADDER_URL = 'https://ladder.thunderpw.fun/';
export const CALC_REFINE_URL = 'https://calc.thunderpw.fun/refine';

/** Минулий одноразовий турнір з призовим фондом 600 скринь. */
export const PAST_TOURNAMENT_600 = {
  bracketUrl: 'https://pvp.thunderpw.fun/t/aac8bca6-79ac-46ae-ad85-9c8ee4db0c17/bracket',
  prizeChests: 600,
};

/** Фонд минулого розіграшу ладдера (розподілений між топ-10 місць). */
export const LADDER_PRIZE_CHESTS = 1000;

export interface LadderDrawResult {
  nickname: string;
  /** Рівень заточки, на який підняли шмотку. */
  level: number;
  /** Виграш за місце, скринь (таблиця нагород на ladder.thunderpw.fun). */
  prizeChests: number;
}

/** Підсумки минулого розіграшу ладдера — топ-10 і виграш кожного місця. */
export const LADDER_LAST_DRAW: LadderDrawResult[] = [
  { nickname: 'DdCL (Ілля)', level: 12, prizeChests: 200 },
  { nickname: 'МініСвиня (ОлекThunder) Шаман', level: 11, prizeChests: 160 },
  { nickname: 'Abberath', level: 11, prizeChests: 125 },
  { nickname: 'DudeIsFine', level: 10, prizeChests: 100 },
  { nickname: 'Fye', level: 10, prizeChests: 90 },
  { nickname: 'Infernoman(Арсен)', level: 10, prizeChests: 80 },
  { nickname: '~FreeKill~', level: 10, prizeChests: 70 },
  { nickname: 'Baguto', level: 10, prizeChests: 65 },
  { nickname: 'mwNERO', level: 10, prizeChests: 60 },
  { nickname: 'gIGAcHAD', level: 9, prizeChests: 50 },
];

export interface RecruitmentOfficer {
  nickname: string;
}

export const RECRUITMENT_OFFICERS: RecruitmentOfficer[] = [
  { nickname: 'Bubochka' },
  { nickname: 'Pomponchyk' },
  { nickname: '☆★Eddie★☆' },
  { nickname: 'abrams' },
];
