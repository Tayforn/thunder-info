// =========================================================
// Набір інлайн-іконок (stroke, 24×24) — спільний для навігації, панелей і
// порожніх станів. Кольори — currentColor, розмір задає CSS контейнера.
// =========================================================

import type { SVGProps } from 'react';

const S = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

type P = SVGProps<SVGSVGElement>;

export const IcoHome = (p: P) => <svg {...S} {...p}><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /></svg>;
export const IcoList = (p: P) => <svg {...S} {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>;
export const IcoBolt = (p: P) => <svg {...S} {...p}><path d="M13 3 5 14h6l-1 7 9-12h-6l1-6z" /></svg>;
export const IcoSword = (p: P) => <svg {...S} {...p}><path d="M14.5 3.5 20.5 9.5 10 20 4 20 4 14 14.5 3.5Z" /><path d="M4 20 9 15" /><path d="M17 6.5 19.5 9" /></svg>;
export const IcoAdmin = (p: P) => <svg {...S} {...p}><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /></svg>;
export const IcoUsers = (p: P) => <svg {...S} {...p}><circle cx="9" cy="8.5" r="2.8" /><path d="M3.5 19c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" /><circle cx="16.5" cy="9.5" r="2.2" /><path d="M16 13.7c2.6.3 4.5 2.5 4.5 5.3" /></svg>;
export const IcoCal = (p: P) => <svg {...S} {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8 3v4M16 3v4" /><path d="M9 14h2M13 14h2M9 17h2" /></svg>;
export const IcoCoins = (p: P) => <svg {...S} {...p}><ellipse cx="9" cy="7" rx="5.5" ry="3" /><path d="M3.5 7v5c0 1.66 2.46 3 5.5 3s5.5-1.34 5.5-3V7" /><path d="M9.5 13.6v3.4c0 1.66 2.46 3 5.5 3s5.5-1.34 5.5-3v-5c0-1.14-1.16-2.14-2.87-2.64" /></svg>;
export const IcoCheck = (p: P) => <svg {...S} strokeWidth={2.4} {...p}><path d="M5 12.5 10 17 19 7" /></svg>;
export const IcoX = (p: P) => <svg {...S} {...p}><path d="M6 6 18 18M18 6 6 18" /></svg>;
export const IcoChevL = (p: P) => <svg {...S} {...p}><path d="m14 6-6 6 6 6" /></svg>;
export const IcoChevR = (p: P) => <svg {...S} {...p}><path d="m10 6 6 6-6 6" /></svg>;
export const IcoSun = (p: P) => <svg {...S} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
export const IcoMoon = (p: P) => <svg {...S} {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>;
export const IcoLock = (p: P) => <svg {...S} {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
export const IcoShield = (p: P) => <svg {...S} {...p}><path d="M12 3 5 6v5c0 4.5 3 8.3 7 9.5 4-1.2 7-5 7-9.5V6l-7-3Z" /></svg>;
export const IcoBook = (p: P) => <svg {...S} {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></svg>;
export const IcoClock = (p: P) => <svg {...S} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
export const IcoDiscord = (p: P) => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}><path d="M19.6 5.3A17 17 0 0 0 15.4 4l-.2.4a15.7 15.7 0 0 1 3.8 1.9 13.5 13.5 0 0 0-14 0A15.7 15.7 0 0 1 8.8 4.4L8.6 4a17 17 0 0 0-4.2 1.3C1.7 9.3 1 13.2 1.4 17a17 17 0 0 0 5.2 2.6l1.1-1.8a11 11 0 0 1-1.7-.8l.4-.3a12.2 12.2 0 0 0 11.2 0l.4.3-1.7.8 1.1 1.8a17 17 0 0 0 5.2-2.6c.5-4.4-.8-8.3-3-11.7ZM8.7 14.7c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm6.6 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Z" /></svg>;
export const IcoStar = (p: P) => <svg {...S} {...p}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>;
export const IcoRefresh = (p: P) => <svg {...S} {...p}><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></svg>;
export const IcoSearch = (p: P) => <svg {...S} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></svg>;
export const IcoPlus = (p: P) => <svg {...S} {...p}><path d="M12 5v14M5 12h14" /></svg>;
export const IcoTrash = (p: P) => <svg {...S} {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
export const IcoEdit = (p: P) => <svg {...S} {...p}><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="m13.5 6.5 3 3" /></svg>;
export const IcoInbox = (p: P) => <svg {...S} {...p}><path d="M4 13h4l1.5 2.5h5L16 13h4" /><path d="M4 13V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12H4v-6Z" /></svg>;
export const IcoImage = (p: P) => <svg {...S} {...p}><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m20 16-4.5-4.5L8 19" /></svg>;
export const IcoTarget = (p: P) => <svg {...S} {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.3" /><path d="M12 2v3.2M12 18.8V22M2 12h3.2M18.8 12H22" /></svg>;
export const IcoCopy = (p: P) => <svg {...S} {...p}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg>;
export const IcoDownload = (p: P) => <svg {...S} {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
export const IcoSettings = (p: P) => <svg {...S} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>;
export const IcoShuffle = (p: P) => <svg {...S} {...p}><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>;
export const IcoMegaphone = (p: P) => <svg {...S} {...p}><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z" /><path d="M15 9a3.5 3.5 0 0 1 0 6M18 6a7 7 0 0 1 0 12" /></svg>;
export const IcoTrophy =(p: P) => <svg {...S} {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5v1.5A3.5 3.5 0 0 0 8.5 11M16 6h3v1.5a3.5 3.5 0 0 1-3.5 5" /><path d="M12 13v4M9 21h6M10 17h4v4" /></svg>;
