// =========================================================
// Головна: блок «PvP» із сусіднього сайту турнірів — останній зіграний
// турнір із п'єдесталом 2–1–3, зал слави (перемоги за всі турніри),
// найближчі та минулі турніри. Усе веде на pvp.thunderpw.fun; дані — з
// data/pvp.ts (той самий Supabase, що й у pw-pvp, лише читання).
// =========================================================

import { useEffect, useState } from 'react';
import {
  PVP_SITE, PVP_STATUS_LABELS, effectiveStatus, eventDateLabel, fetchPvpPodiums, fetchPvpTournaments, isPastTournament,
  isRegistrationOpen, localToday, pvpConfigured, pvpRegisterUrl, pvpTournamentUrl, winStats, winsWord,
  type PvpPodium, type PvpTournament, type WinStat,
} from '../data/pvp';
import { IcoCal, IcoSword, IcoTrophy } from './Icons';

const PLACES = [
  { key: 'second' as const, n: 2, label: '2 місце' },
  { key: 'first' as const, n: 1, label: 'Чемпіон' },
  { key: 'third' as const, n: 3, label: '3 місце' },
];
const FAME_SHOWN = 8;
const LIST_SHOWN = 5;

function statusVariant(s: ReturnType<typeof effectiveStatus>): string {
  if (s === 'registration_open') return 'good';
  if (s === 'in_progress') return 'accent';
  if (s === 'cancelled') return 'bad';
  if (s === 'completed') return 'mute';
  return 'warn';
}

function TournamentRow({ t, champion }: { t: PvpTournament; champion?: string | null }) {
  const st = effectiveStatus(t);
  return (
    <a className="pvp-row" href={pvpTournamentUrl(t.id)} target="_blank" rel="noopener">
      <span className="pvp-row-main">
        <b>{t.name}</b>
        <span className="pvp-row-meta">
          <span>{eventDateLabel(t.eventDate)}</span>
          {t.seriesName && <span className="badge mute">{t.seriesName}</span>}
          {t.teamSize && t.teamSize > 1 && <span className="badge mute">{t.teamSize}×{t.teamSize}</span>}
        </span>
      </span>
      {champion ? (
        <span className="pvp-row-champ" title="Чемпіон"><IcoTrophy /> {champion}</span>
      ) : (
        <span className={'badge ' + statusVariant(st)}>{PVP_STATUS_LABELS[st]}</span>
      )}
    </a>
  );
}

export default function PvpBlock() {
  const [tournaments, setTournaments] = useState<PvpTournament[] | null>(null);
  const [podiums, setPodiums] = useState<Map<string, PvpPodium>>(new Map());
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!pvpConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchPvpTournaments();
        if (cancelled) return;
        setTournaments(list);
        // Результати можуть бути лише в турнірів із датою не пізніше сьогодні.
        const today = localToday();
        const played = list.filter((t) => t.eventDate <= today).map((t) => t.id);
        const pods = await fetchPvpPodiums(played);
        if (!cancelled) setPodiums(pods);
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = localToday();
  const list = tournaments ?? [];

  // Останній зіграний: найсвіжіший турнір із визначеним переможцем, а якщо
  // такого нема — просто найсвіжіший із датою не пізніше сьогодні.
  // Списки гільдійного розміру — сортування на рендер дешеве, без useMemo.
  const played = list.filter((t) => t.eventDate <= today).sort((a, b) => (a.eventDate < b.eventDate ? 1 : -1));
  const latest = played.find((t) => podiums.has(t.id)) ?? played[0] ?? null;
  const podium = latest ? podiums.get(latest.id) ?? null : null;
  const stats: WinStat[] = winStats(podiums.values());

  const upcoming = list
    .filter((t) => t.status === 'in_progress' || ((t.status === 'registration_open' || t.status === 'registration_closed') && t.eventDate >= today))
    .sort((a, b) => (a.eventDate < b.eventDate ? -1 : 1))
    .slice(0, LIST_SHOWN);
  const past = list.filter(isPastTournament).sort((a, b) => (a.eventDate < b.eventDate ? 1 : -1)).slice(0, LIST_SHOWN);
  const nextOpen = list.filter(isRegistrationOpen).sort((a, b) => (a.eventDate < b.eventDate ? -1 : 1))[0];

  if (!pvpConfigured || err) return null;

  const top = stats[0]?.count ?? 0;
  const places = podium ? PLACES.filter((p) => podium[p.key]) : [];

  return (
    <>
      <div className="section-head row">
        <div>
          <span className="eyebrow">PvP</span>
          <h2>Турніри клану</h2>
        </div>
        <div className="row">
          <a className="btn btn-ghost btn-sm" href={PVP_SITE} target="_blank" rel="noopener">Сайт турнірів →</a>
          <a className="btn btn-primary btn-sm" href={pvpRegisterUrl(nextOpen?.id)} target="_blank" rel="noopener">
            <IcoSword /> Зареєструватися
          </a>
        </div>
      </div>

      {!tournaments ? (
        <p className="loading"><span className="spinner" /> Завантаження турнірів…</p>
      ) : (
        <>
          <section className="panel pvp-win" aria-label="Переможці">
            <div className="pvp-win-main">
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <span className="pvp-eyebrow">Останній турнір</span>
                  <h3 className="pvp-win-name">{latest?.name ?? 'Переможці'}</h3>
                  {latest && <span className="hint">{eventDateLabel(latest.eventDate)}</span>}
                </div>
                {latest && (
                  <a className="btn btn-ghost btn-sm" href={pvpTournamentUrl(latest.id)} target="_blank" rel="noopener">Сітка й результати →</a>
                )}
              </div>

              {!latest && <p className="hint">Ще не було жодного турніру.</p>}
              {latest && !podium && (
                <p className="hint">Переможця ще не визначено · {PVP_STATUS_LABELS[effectiveStatus(latest)].toLowerCase()}.</p>
              )}
              {podium && (
                <ol className="pvp-podium" aria-label="Пʼєдестал">
                  {places.map((p) => {
                    const team = podium[p.key]!;
                    const roster = podium.members[p.key] ?? [];
                    return (
                      <li key={p.key} className={`pvp-podium-card p${p.n}`}>
                        <span className={`medal lg m${p.n} pvp-medal`} aria-hidden="true">{p.n}</span>
                        <span className="pvp-podium-place">{p.label}</span>
                        <span className="pvp-podium-team">{team}</span>
                        {roster.length > 0 && (
                          <span className="pvp-podium-roster">
                            {roster.map((nick) => <span key={nick} className="pvp-podium-nick">{nick}</span>)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <aside className="pvp-fame" aria-label="Зал слави">
              <div>
                <span className="pvp-eyebrow">Зал слави</span>
                <span className="hint" style={{ display: 'block' }}>перемоги за всі турніри</span>
              </div>
              {stats.length === 0 ? (
                <p className="hint">Перемог ще немає.</p>
              ) : (
                <ol className="pvp-fame-list">
                  {stats.slice(0, FAME_SHOWN).map((s) => {
                    const rank = stats.findIndex((x) => x.count === s.count) + 1;
                    return (
                      <li key={s.nickname} className="pvp-fame-row">
                        <span className={'medal' + (rank <= 3 ? ` m${rank}` : '')}>{rank}</span>
                        <span className="pvp-fame-body">
                          <span className="pvp-fame-line">
                            <span className="pvp-fame-nick">{s.nickname}</span>
                            <span className="pvp-fame-count"><b>{s.count}</b> {winsWord(s.count)}</span>
                          </span>
                          <span className="pvp-fame-bar" aria-hidden="true">
                            <span style={{ width: `${top ? Math.max(6, (s.count / top) * 100) : 0}%` }} />
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
              {stats.length > FAME_SHOWN && <span className="hint">і ще {stats.length - FAME_SHOWN}</span>}
            </aside>
          </section>

          <div className="split two">
            <div className="panel">
              <div className="panel-head">
                <h3><IcoCal /> Найближчі турніри</h3>
                {upcoming.length > 0 && <span className="badge accent">{upcoming.length}</span>}
              </div>
              <div className="panel-body flush">
                {upcoming.length === 0 ? (
                  <p className="rowlist-empty">Зараз немає активних турнірів.</p>
                ) : (
                  <div className="pvp-list">{upcoming.map((t) => <TournamentRow key={t.id} t={t} />)}</div>
                )}
              </div>
            </div>
            <div className="panel">
              <div className="panel-head">
                <h3><IcoTrophy /> Минулі турніри</h3>
                <span className="panel-sub">останні {Math.min(past.length, LIST_SHOWN)} · усі — на сайті PvP</span>
              </div>
              <div className="panel-body flush">
                {past.length === 0 ? (
                  <p className="rowlist-empty">Зіграних турнірів ще немає.</p>
                ) : (
                  <div className="pvp-list">{past.map((t) => <TournamentRow key={t.id} t={t} champion={podiums.get(t.id)?.first ?? null} />)}</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
