// =========================================================
// Сайдбар: статичні пункти (Головна/Р8 фарм/Новачки) + сторінки, що потребують
// адмінських прав (Активність/Р8/Адмінка) — видимі в меню лише коли
// isAdmin, хоча самі роути й так гейтяться через AdminGate незалежно
// від видимості в меню.
// =========================================================

import type { ReactNode } from 'react';
import type { Route } from '../app/useRoute';

interface NavEntry {
  route: Route;
  label: string;
  ico: ReactNode;
  adminOnly?: boolean;
}

const S = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const homeIco = <svg {...S}><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /></svg>;
const listIco = <svg {...S}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>;
const boltIco = <svg {...S}><path d="M13 3 5 14h6l-1 7 9-12h-6l1-6z" /></svg>;
const swordIco = <svg {...S}><path d="M14.5 3.5 20.5 9.5 10 20 4 20 4 14 14.5 3.5Z" /><path d="M4 20 9 15" /><path d="M17 6.5 19.5 9" /></svg>;
const adminIco = <svg {...S}><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /></svg>;
const usersIco = <svg {...S}><circle cx="9" cy="8.5" r="2.8" /><path d="M3.5 19c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" /><circle cx="16.5" cy="9.5" r="2.2" /><path d="M16 13.7c2.6.3 4.5 2.5 4.5 5.3" /></svg>;
const coinsIco = <svg {...S}><ellipse cx="9" cy="7" rx="5.5" ry="3" /><path d="M3.5 7v5c0 1.66 2.46 3 5.5 3s5.5-1.34 5.5-3V7" /><path d="M9.5 13.6v3.4c0 1.66 2.46 3 5.5 3s5.5-1.34 5.5-3v-5c0-1.14-1.16-2.14-2.87-2.64" /></svg>;

function routeKey(r: Route): string {
  return r.name;
}

interface Props {
  route: Route;
  isAdmin: boolean;
  onNavigate: (route: Route) => void;
}

export default function Sidebar({ route, isAdmin, onNavigate }: Props) {
  const allItems: NavEntry[] = [
    { route: { name: 'home' }, label: 'Головна', ico: homeIco },
    { route: { name: 'farm' }, label: 'Р8 фарм', ico: coinsIco },
    { route: { name: 'newbies' }, label: 'Новачки', ico: listIco },
    { route: { name: 'players' }, label: 'Гравці', ico: usersIco },
    { route: { name: 'activity' }, label: 'Активність', ico: boltIco, adminOnly: true },
    { route: { name: 'r8' }, label: 'Р8', ico: swordIco, adminOnly: true },
    { route: { name: 'admin' }, label: 'Адмінка', ico: adminIco, adminOnly: true },
  ];
  const items = allItems.filter((n) => !n.adminOnly || isAdmin);

  const activeKey = routeKey(route);

  return (
    <aside className="sidebar" id="appSidebar">
      <nav className="nav-primary" role="tablist" aria-label="Розділи">
        {items.map((n) => (
          <button
            key={routeKey(n.route)}
            className={'tab' + (routeKey(n.route) === activeKey ? ' active' : '')}
            role="tab"
            aria-selected={routeKey(n.route) === activeKey}
            onClick={() => onNavigate(n.route)}
          >
            <span className="tab-ico">{n.ico}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
