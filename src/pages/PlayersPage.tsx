// =========================================================
// Сторінка "Гравці" — ростер гільдії. Бали гравця = сума
// activity.points за відвідані активності + премії; бали, фільтр за
// період і календар видно всім (на відміну від /newbies). Клік на гравця
// відкриває місячний календар відвідуваності (галочки з /activity,
// player_activity_checks); редагування — лише адмінам: премії і
// ретро-галочки в календарі, список гравців — у /admin.
// =========================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageMeta from '../app/PageMeta';
import ClassBadge from '../components/ClassBadge';
import { ClassFilterChips, classOrder, sortByClass, useClassFilter } from '../components/ClassFilter';
import AttendanceCalendar, { MONTH_NOM, dateKey } from '../components/AttendanceCalendar';
import { IcoCal, IcoChevL, IcoChevR, IcoTrophy, IcoUsers } from '../components/Icons';
import { SortHeader, useColumnSort } from '../app/useColumnSort';
import { useAuth } from '../app/useAuth';
import { fetchClasses } from '../data/classes';
import { fetchActivities } from '../data/activities';
import { fetchPlayers, fetchPlayerTotals } from '../data/players';
import { fetchPlayerChecksRange, setPlayerCheckOnDate, subscribeToPlayerActivityChecks } from '../data/playerActivityChecks';
import { deletePlayerBonus, fetchPlayerBonusesRange, setPlayerBonus } from '../data/playerBonuses';
import { kyivDateString } from '../data/types';
import type { Activity, ClassRow, Player, PlayerBonus } from '../data/types';

type Period = 'all' | 'thisMonth' | 'prevMonth';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'Весь час' },
  { key: 'thisMonth', label: 'Цей місяць' },
  { key: 'prevMonth', label: 'Минулий' },
];

/** Межі періоду для fetchPlayerTotals — місяці рахуємо за Києвом, як і
 * check_date/bonus_date у БД. */
function periodRange(period: Period): { from: string; to: string } | undefined {
  if (period === 'all') return undefined;
  const [y, m] = kyivDateString().split('-').map(Number);
  const shift = period === 'thisMonth' ? 0 : -1;
  const first = new Date(y, m - 1 + shift, 1);
  return {
    from: dateKey(first.getFullYear(), first.getMonth(), 1),
    to: dateKey(first.getFullYear(), first.getMonth(), new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()),
  };
}

const COLS = '44px minmax(150px, 1fr) 150px 90px';

export default function PlayersPage() {
  const { session, isAdmin } = useAuth();
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [totals, setTotals] = useState<Map<string, number>>(new Map());
  const [period, setPeriod] = useState<Period>('all');
  const [err, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const [monthData, setMonthData] = useState<{ checks: Map<string, Set<string>>; bonuses: Map<string, PlayerBonus> } | null>(null);

  const reloadTotals = useCallback(
    () => fetchPlayerTotals(periodRange(period)).then((t) => setTotals(new Map(t.map((x) => [x.playerId, x.totalPoints])))),
    [period],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPlayers(), fetchClasses(), fetchActivities()])
      .then(([p, c, a]) => {
        if (cancelled) return;
        setPlayers(p);
        setClasses(c);
        setActivities(a);
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : 'Не вдалося завантажити гравців.'));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    reloadTotals().catch(() => {});
  }, [reloadTotals]);

  const loadMonth = useCallback(() => {
    if (!selectedId) return Promise.resolve();
    const from = dateKey(anchor.y, anchor.m, 1);
    const to = dateKey(anchor.y, anchor.m, new Date(anchor.y, anchor.m + 1, 0).getDate());
    return Promise.all([fetchPlayerChecksRange(selectedId, from, to), fetchPlayerBonusesRange(selectedId, from, to)])
      .then(([checks, bonuses]) => setMonthData({ checks, bonuses }))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Не вдалося завантажити відвідуваність.'));
  }, [selectedId, anchor]);

  // Галочки й премії вибраного гравця за видимий місяць + realtime на
  // галочки (якщо адмін ставить їх на /activity, календар підхопить без релоаду).
  useEffect(() => {
    if (!selectedId) {
      setMonthData(null);
      return;
    }
    setMonthData(null);
    loadMonth();
    const unsubscribe = subscribeToPlayerActivityChecks(() => {
      loadMonth();
      reloadTotals().catch(() => {});
    });
    return unsubscribe;
  }, [selectedId, loadMonth, reloadTotals]);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const classFilter = useClassFilter(players ?? [], classById);
  const { sort, toggle: toggleSort } = useColumnSort();

  // Дефолтний порядок — групування за класом, як на /activity; клік по
  // заголовку колонки тимчасово пересортовує (three-state, див. useColumnSort).
  let list = sortByClass(players ?? [], classById);
  if (sort) {
    const mul = sort.dir === 'asc' ? 1 : -1;
    list = list.slice().sort((a, b) => {
      if (sort.col === 'points') return mul * ((totals.get(a.id) ?? 0) - (totals.get(b.id) ?? 0)) || a.nickname.localeCompare(b.nickname);
      if (sort.col === 'class') return mul * (classOrder(a, classById) - classOrder(b, classById)) || a.nickname.localeCompare(b.nickname);
      return mul * a.nickname.localeCompare(b.nickname);
    });
  }
  const visible = classFilter.visible(list);
  const selected = selectedId ? players?.find((p) => p.id === selectedId) ?? null : null;

  // Місце за балами (1 — найбільше) — для медалей у списку й п'єдесталу.
  const rankById = useMemo(() => {
    const ranked = (players ?? []).slice().sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0) || a.nickname.localeCompare(b.nickname));
    return new Map(ranked.map((p, i) => [p.id, i + 1]));
  }, [players, totals]);
  const top3 = useMemo(
    () => (players ?? []).filter((p) => (totals.get(p.id) ?? 0) > 0).sort((a, b) => (rankById.get(a.id) ?? 0) - (rankById.get(b.id) ?? 0)).slice(0, 3),
    [players, totals, rankById],
  );

  const stepMonth = (dir: 1 | -1) =>
    setAnchor(({ y, m }) => {
      const d = new Date(y, m + dir, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const afterCalendarChange = () => Promise.all([loadMonth(), reloadTotals()]).then(() => undefined);
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? '';

  const calendar = selected && (
    <div className="panel sticky">
      <div className="panel-head">
        <h3><IcoCal /> Відвідуваність</h3>
        <span className="panel-sub" style={{ color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>{selected.nickname}</span>
        <div className="panel-actions">
          <div className="cal-nav">
            <button type="button" className="btn btn-ghost btn-xs btn-ico" aria-label="Попередній місяць" onClick={() => stepMonth(-1)}><IcoChevL /></button>
            <b>{MONTH_NOM[anchor.m]} {anchor.y}</b>
            <button type="button" className="btn btn-ghost btn-xs btn-ico" aria-label="Наступний місяць" onClick={() => stepMonth(1)}><IcoChevR /></button>
          </div>
          <button type="button" className="btn btn-quiet btn-xs" title="Закрити" onClick={() => setSelectedId(null)}>✕</button>
        </div>
      </div>
      <div className="panel-body">
        {!monthData ? (
          <p className="loading"><span className="spinner" /> Завантаження…</p>
        ) : (
          <AttendanceCalendar
            year={anchor.y}
            month={anchor.m}
            activities={activities}
            checksByDate={monthData.checks}
            bonusByDate={monthData.bonuses}
            showPoints
            onSaveBonus={
              isAdmin ? (d, points, note) => setPlayerBonus(selected.id, d, points, note, session?.user.id).then(afterCalendarChange) : undefined
            }
            onDeleteBonus={isAdmin ? (d) => deletePlayerBonus(selected.id, d).then(afterCalendarChange) : undefined}
            onToggleCheck={
              isAdmin
                ? (d, activityId, next) => setPlayerCheckOnDate(activityId, selected.id, d, next, session?.user.id).then(afterCalendarChange)
                : undefined
            }
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="page">
      <PageMeta title="Гравці — Thunder" description="Ростер гравців гільдії Thunder і календар відвідуваності активностей." />
      <div className="page-head">
        <div className="page-head-text">
          <span className="eyebrow">Гільдія</span>
          <h1>Гравці</h1>
          <p>Бали за відвідані активності та премії. Клікни на гравця, щоб побачити календар відвідуваності.</p>
        </div>
        {players && (
          <div className="page-head-actions">
            <span className="toolbar-label">бали за</span>
            <div className="seg" role="group" aria-label="Період балів">
              {PERIODS.map((p) => (
                <button key={p.key} type="button" className={period === p.key ? 'is-on' : ''} onClick={() => setPeriod(p.key)}>{p.label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {err && <p className="form-err">{err}</p>}
      {!players && !err && <p className="loading"><span className="spinner" /> Завантаження…</p>}

      {players && top3.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h3><IcoTrophy /> Лідери</h3>
            <span className="panel-sub">{periodLabel.toLowerCase()}</span>
          </div>
          <div className="panel-body tight">
            <div className="podium">
              {top3.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className={`podium-cell p${i + 1}` + (p.id === selectedId ? ' on' : '')}
                  onClick={() => setSelectedId((cur) => (cur === p.id ? null : p.id))}
                  title="Відкрити календар відвідуваності"
                >
                  <span className={`medal ${i === 0 ? 'lg ' : ''}m${i + 1}`}>{i + 1}</span>
                  <span className="podium-text">
                    <span className="podium-name">{p.nickname}</span>
                    <span className="podium-meta"><ClassBadge cls={p.classId ? classById.get(p.classId) ?? null : null} /></span>
                  </span>
                  <span className="podium-pts">{totals.get(p.id) ?? 0}<small>бал.</small></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {players && (
        <div className={'split' + (selected ? ' main-side' : '')}>
          <div className="panel">
            <div className="panel-head">
              <h3><IcoUsers /> Ростер</h3>
              <span className="badge mute">{visible.length}{visible.length !== players.length ? ` з ${players.length}` : ''}</span>
              <div className="panel-actions">
                <ClassFilterChips filter={classFilter} />
              </div>
            </div>
            <div className="panel-body flush">
              <div className="rowlist">
                <div className="rowlist-head" style={{ gridTemplateColumns: COLS }}>
                  <span>#</span>
                  <span><SortHeader label="Нікнейм" col="nickname" sort={sort} onToggle={toggleSort} /></span>
                  <span><SortHeader label="Клас" col="class" sort={sort} onToggle={toggleSort} /></span>
                  <span className="cell-right"><SortHeader label="Бали" col="points" sort={sort} onToggle={toggleSort} firstDir="desc" /></span>
                </div>
                {players.length === 0 ? (
                  <p className="rowlist-empty">Гравців ще немає.</p>
                ) : visible.length === 0 ? (
                  <p className="rowlist-empty">Під вибраний фільтр не потрапив жоден гравець.</p>
                ) : (
                  visible.map((p) => {
                    const rank = rankById.get(p.id) ?? 0;
                    const pts = totals.get(p.id) ?? 0;
                    return (
                      <div
                        key={p.id}
                        className={'rowlist-row row-click' + (p.id === selectedId ? ' selected' : '')}
                        style={{ gridTemplateColumns: COLS }}
                        onClick={() => setSelectedId((cur) => (cur === p.id ? null : p.id))}
                      >
                        <span className="cell-rank">
                          <span className={'medal' + (pts > 0 && rank <= 3 ? ` m${rank}` : '')}>{rank}</span>
                        </span>
                        <span className="cell-nick">
                          <b>{p.nickname}</b>
                          {p.note && <small className="hint">{p.note}</small>}
                        </span>
                        <span><ClassBadge cls={p.classId ? classById.get(p.classId) ?? null : null} /></span>
                        <span className="cell-pts cell-right">{pts}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          {calendar}
        </div>
      )}
    </div>
  );
}
