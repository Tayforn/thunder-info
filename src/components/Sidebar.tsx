// =========================================================
// Сайдбар: розділи згруповано за рівнем доступу (app/access.ts) — гість
// бачить лише публічні, учасник клану ще й свої, адмін — усе. Сам доступ до
// даних гейтиться на сервері, меню лише не показує зайвого.
// =========================================================

import type { ReactNode } from 'react';
import type { Route } from '../app/useRoute';
import { canOpen, type Viewer } from '../app/access';
import { IcoAdmin, IcoBolt, IcoCal, IcoCoins, IcoHome, IcoList, IcoSword, IcoTarget, IcoUsers } from './Icons';

interface NavEntry {
  route: Route;
  label: string;
  ico: ReactNode;
}

interface NavGroup {
  title: string;
  items: NavEntry[];
}

const GROUPS: NavGroup[] = [
  {
    title: 'Відкрито',
    items: [
      { route: { name: 'home' }, label: 'Головна', ico: <IcoHome /> },
      { route: { name: 'farm' }, label: 'Р8 фарм', ico: <IcoCoins /> },
    ],
  },
  {
    title: 'Гільдія',
    items: [
      { route: { name: 'players' }, label: 'Гравці', ico: <IcoUsers /> },
      { route: { name: 'newbies' }, label: 'Новачки', ico: <IcoList /> },
    ],
  },
  {
    title: 'Керування',
    items: [
      { route: { name: 'activity' }, label: 'Активність', ico: <IcoBolt /> },
      { route: { name: 'r8' }, label: 'Шмотки Р8', ico: <IcoSword /> },
      { route: { name: 'rb' }, label: 'РБ', ico: <IcoTarget /> },
      { route: { name: 'events' }, label: 'ДС Евенти', ico: <IcoCal /> },
      { route: { name: 'admin' }, label: 'Адмінка', ico: <IcoAdmin /> },
    ],
  },
];

interface Props {
  route: Route;
  viewer: Viewer;
  onNavigate: (route: Route) => void;
}

export default function Sidebar({ route, viewer, onNavigate }: Props) {
  // Показуємо лише те, що людина реально може відкрити; порожні групи зникають.
  const groups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter((n) => canOpen(n.route.name, viewer)) }))
    .filter((g) => g.items.length > 0);

  return (
    <aside className="sidebar" id="appSidebar">
      <nav className="nav-primary" aria-label="Розділи">
        {groups.map((g) => (
          <div key={g.title} className="nav-group" role="tablist" aria-label={g.title}>
            <span className="nav-group-title">{g.title}</span>
            {g.items.map((n) => {
              const active = n.route.name === route.name;
              return (
                <button
                  key={n.route.name}
                  className={'tab' + (active ? ' active' : '')}
                  role="tab"
                  aria-selected={active}
                  onClick={() => onNavigate(n.route)}
                >
                  <span className="tab-ico">{n.ico}</span>
                  <span>{n.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
