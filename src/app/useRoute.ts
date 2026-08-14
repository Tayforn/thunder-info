// =========================================================
// Роутинг thunder-info: History API, лише статичні шляхи (без
// динамічних сегментів) — 6 фіксованих сторінок, тож простий парсинг
// першого сегмента шляху, без бібліотеки роутера (той самий підхід, що в
// pw-pvp useRoute.ts).
// =========================================================

import { useCallback, useEffect, useState } from 'react';

export const APP_BASE: string = (() => {
  const b = import.meta.env.BASE_URL || '/';
  return b.endsWith('/') ? b : b + '/';
})();

export type Route =
  | { name: 'home' }
  | { name: 'farm' }
  | { name: 'newbies' }
  | { name: 'players' }
  | { name: 'activity' }
  | { name: 'r8' }
  | { name: 'admin' };

/** Єдине джерело списку маршрутів — використовується і тут (парсинг URL),
 * і в Layout для делегованих [data-goto]-кліків. */
export const ROUTE_NAMES: Route['name'][] = ['home', 'farm', 'newbies', 'players', 'activity', 'r8', 'admin'];

function parsePath(): Route {
  let p = location.pathname;
  if (p.startsWith(APP_BASE)) p = p.slice(APP_BASE.length);
  const segs = p.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const [a] = segs;
  if (!a) return { name: 'home' };
  const found = ROUTE_NAMES.find((n) => n === a);
  return found ? { name: found } : { name: 'home' };
}

export function routeUrl(route: Route): string {
  return route.name === 'home' ? APP_BASE : APP_BASE + route.name;
}

function samePath(a: Route, b: Route): boolean {
  return routeUrl(a) === routeUrl(b);
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRouteState] = useState<Route>(parsePath);

  useEffect(() => {
    const onPop = () => setRouteState(parsePath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: Route) => {
    setRouteState((cur) => {
      if (!samePath(cur, next)) history.pushState(null, '', routeUrl(next));
      return next;
    });
  }, []);

  return [route, navigate];
}
