// =========================================================
// Каркас застосунку: шапка, сайдбар-drawer, одна активна сторінка.
// Фіксовані сторінки (без динамічних сегментів) — рендеримо рівно
// одну сторінку за route.name.
// =========================================================

import { useCallback, useEffect, useState } from 'react';
import { useRoute, ROUTE_NAMES, type Route } from '../app/useRoute';
import { useAuth } from '../app/useAuth';
import { useMe } from '../app/useMe';
import { ROUTE_ACCESS } from '../app/access';
import { setDirectReads } from '../app/supabaseClient';
import MemberNotice from './MemberNotice';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

import HomePage from '../pages/HomePage';
import R8FarmPage from '../pages/R8FarmPage';
import NewbiesPage from '../pages/NewbiesPage';
import PlayersPage from '../pages/PlayersPage';
import ActivityPage from '../pages/ActivityPage';
import R8Page from '../pages/R8Page';
import AdminPage from '../pages/AdminPage';

const isMobile = () => window.matchMedia('(max-width: 880px)').matches;

export default function Layout() {
  const [route, navigate] = useRoute();
  const { session, isAdmin, loading: adminLoading } = useAuth();
  const { me, loading: meLoading, login, logout } = useMe();
  const viewer = { member: !!me, admin: isAdmin };

  // Адмін має сесію Supabase — читає дані напряму, Discord йому не потрібен.
  useEffect(() => {
    setDirectReads(!!session);
  }, [session]);
  const [navOpen, setNavOpen] = useState(() => document.documentElement.classList.contains('nav-open'));

  const setOpen = useCallback((on: boolean) => {
    document.documentElement.classList.toggle('nav-open', on);
    setNavOpen(on);
  }, []);

  const go = useCallback(
    (r: Route) => {
      navigate(r);
      if (isMobile()) setOpen(false);
    },
    [navigate, setOpen],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [route]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobile() && document.documentElement.classList.contains('nav-open')) setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-goto]');
      const name = a?.dataset.goto;
      if (name && (ROUTE_NAMES as string[]).includes(name)) {
        e.preventDefault();
        go({ name } as Route);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [setOpen, go]);

  let page;
  if (route.name === 'home') page = <HomePage />;
  else if (route.name === 'farm') page = <R8FarmPage />;
  else if (route.name === 'newbies') page = <NewbiesPage />;
  else if (route.name === 'players') page = <PlayersPage />;
  else if (route.name === 'activity') page = <ActivityPage />;
  else if (route.name === 'r8') page = <R8Page />;
  else if (route.name === 'admin') page = <AdminPage />;

  // Розділи для учасників клану: поки авторизація перевіряється — нічого не
  // вантажимо (запити однаково впертись би в 401), далі або сторінка, або
  // запрошення увійти. Адмінські розділи мають власний AdminGate із формою
  // входу, тож їх не перехоплюємо.
  if (ROUTE_ACCESS[route.name] === 'member' && !viewer.member && !viewer.admin) {
    page = adminLoading || meLoading
      ? <p className="hint" style={{ padding: 24 }}>Перевірка доступу…</p>
      : <MemberNotice onLogin={login} />;
  }

  return (
    <>
      <Header
        navOpen={navOpen}
        onNavToggle={() => setOpen(!document.documentElement.classList.contains('nav-open'))}
        me={me}
        onLogin={login}
        onLogout={logout}
      />
      <div className="nav-backdrop" aria-hidden="true" onClick={() => setOpen(false)}></div>
      <div className="app-shell container">
        <Sidebar route={route} viewer={viewer} onNavigate={go} />
        <div className="content">
          <main>{page}</main>
        </div>
      </div>
      <Footer />
    </>
  );
}
