// =========================================================
// Шапка сайту: тогл меню, лого Thunder, сусідні сайти, Discord-сесія, тема.
// =========================================================

import { routeUrl } from '../app/useRoute';
import { IcoMoon, IcoSun } from './Icons';

interface Props {
  navOpen: boolean;
  onNavToggle: () => void;
  /** Discord-сесія (спільна на піддомени) — показуємо нік і вихід. */
  me?: { nickname: string; avatarUrl?: string | null } | null;
  onLogin?: () => void;
  onLogout?: () => void;
}

function toggleTheme(): void {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('thunder-theme', next);
  } catch {
    /* ignore */
  }
}

export default function Header({ navOpen, onNavToggle, me, onLogin, onLogout }: Props) {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <button
          type="button"
          className="icon-btn"
          aria-label="Показати або сховати меню"
          aria-expanded={navOpen}
          aria-controls="appSidebar"
          title="Меню"
          onClick={onNavToggle}
        >
          <span className="nav-toggle-bars"></span>
        </button>
        <a href={routeUrl({ name: 'home' })} data-goto="home" className="logo" title="Гільдія Thunder">
          <span className="logo-crest" aria-hidden="true">
            <img src={import.meta.env.BASE_URL + 'assets/favicon-180.png'} alt="" width={180} height={180} />
          </span>
          <span className="logo-text">Thunder</span>
        </a>
        <span className="logo-sub">гільдія</span>

        <nav className="hdr-links" aria-label="Сусідні сайти">
          <a href="https://ladder.thunderpw.fun/" title="Ладдер страждання">Ладдер</a>
          <a href="https://calc.thunderpw.fun/" title="PW Хелпер — калькулятори">Хелпер</a>
          <a href="https://pvp.thunderpw.fun/" title="PvP — турніри сервера">PvP</a>
        </nav>

        {onLogin && (me ? (
          <button type="button" className="me-chip" onClick={onLogout} title="Вийти з Discord">
            {me.avatarUrl ? (
              <img src={me.avatarUrl} alt="" />
            ) : (
              <span className="me-chip-ph" aria-hidden="true">{me.nickname.slice(0, 1).toUpperCase()}</span>
            )}
            <span className="me-chip-name">{me.nickname}</span>
            <span className="me-chip-x" aria-hidden="true">✕</span>
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLogin} title="Вхід для учасників клану">
            Увійти
          </button>
        ))}
        <button type="button" className="icon-btn" aria-label="Перемкнути тему" title="Світла / темна тема" onClick={toggleTheme}>
          <IcoSun className="theme-ico-sun" />
          <IcoMoon className="theme-ico-moon" />
        </button>
      </div>
    </header>
  );
}
