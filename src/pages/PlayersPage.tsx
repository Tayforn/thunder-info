// =========================================================
// Публічна сторінка "Гравці" — ростер гільдії. Бали гравця = сума
// activity.points за відвідані активності + премії; колонку балів, як і
// на /newbies, бачать лише адміни (з фільтром за період). Клік на гравця
// відкриває місячний календар відвідуваності (галочки з /activity,
// player_activity_checks); адмін звідти ж видає премії і ретро-виправляє
// галочки минулих днів. Редагування списку гравців — у /admin.
// =========================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageMeta from '../app/PageMeta';
import ClassBadge from '../components/ClassBadge';
import AttendanceCalendar, { MONTH_NOM, dateKey } from '../components/AttendanceCalendar';
import { useAuth } from '../app/useAuth';
import { fetchClasses } from '../data/classes';
import { fetchActivities } from '../data/activities';
import { fetchPlayers, fetchPlayerTotals } from '../data/players';
import { fetchPlayerChecksRange, setPlayerCheckOnDate, subscribeToPlayerActivityChecks } from '../data/playerActivityChecks';
import { deletePlayerBonus, fetchPlayerBonusesRange, setPlayerBonus } from '../data/playerBonuses';
import { kyivDateString } from '../data/types';
import type { Activity, ClassRow, Player, PlayerBonus } from '../data/types';

type Period = 'all' | 'thisMonth' | 'prevMonth';

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

  const columns = isAdmin ? 'minmax(150px, 1fr) 160px 120px' : 'minmax(150px, 1fr) 160px';

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
  const sorted = useMemo(
    () => (players ?? []).slice().sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0) || a.nickname.localeCompare(b.nickname)),
    [players, totals],
  );
  const selected = selectedId ? players?.find((p) => p.id === selectedId) ?? null : null;

  const stepMonth = (dir: 1 | -1) =>
    setAnchor(({ y, m }) => {
      const d = new Date(y, m + dir, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const afterCalendarChange = () => Promise.all([loadMonth(), reloadTotals()]).then(() => undefined);

  return (
    <div>
      <PageMeta title="Гравці — Thunder" description="Ростер гравців гільдії Thunder і календар відвідуваності активностей." />
      <div className="section-head">
        <span className="eyebrow">Гільдія</span>
        <h2>Гравці</h2>
        <p>Клікни на гравця, щоб побачити календар відвідуваності активностей.</p>
      </div>

      {err && <p className="form-err">{err}</p>}
      {!players && !err && <p className="hint">Завантаження…</p>}

      {isAdmin && players && (
        <label className="field" style={{ maxWidth: 220, marginBottom: 12 }}>
          <span>Бали за період</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="all">Весь час</option>
            <option value="thisMonth">Поточний місяць</option>
            <option value="prevMonth">Минулий місяць</option>
          </select>
        </label>
      )}

      {players && (
        <div className="rowlist">
          <div className="rowlist-head" style={{ gridTemplateColumns: columns }}>
            <span>Нікнейм</span>
            <span>Клас</span>
            {isAdmin && <span>Бали</span>}
          </div>
          {sorted.length === 0 ? (
            <p className="rowlist-empty hint">Гравців ще немає.</p>
          ) : (
            sorted.map((p) => (
              <div
                key={p.id}
                className={'rowlist-row rowlist-row-click' + (p.id === selectedId ? ' selected' : '')}
                style={{ gridTemplateColumns: columns, cursor: 'pointer' }}
                onClick={() => setSelectedId((cur) => (cur === p.id ? null : p.id))}
              >
                <span>
                  {p.nickname}
                  {p.note && <small className="hint">{p.note}</small>}
                </span>
                <span><ClassBadge cls={p.classId ? classById.get(p.classId) ?? null : null} /></span>
                {isAdmin && <span style={{ fontWeight: 700 }}>{totals.get(p.id) ?? 0}</span>}
              </div>
            ))
          )}
        </div>
      )}

      {selected && (
        <div className="card" style={{ padding: 16, marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>Відвідуваність: {selected.nickname}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => stepMonth(-1)}>←</button>
              <b style={{ minWidth: 130, textAlign: 'center' }}>{MONTH_NOM[anchor.m]} {anchor.y}</b>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => stepMonth(1)}>→</button>
            </div>
          </div>
          {!monthData ? (
            <p className="hint">Завантаження…</p>
          ) : (
            <AttendanceCalendar
              year={anchor.y}
              month={anchor.m}
              activities={activities}
              checksByDate={monthData.checks}
              bonusByDate={monthData.bonuses}
              admin={isAdmin}
              onSaveBonus={(d, points, note) => setPlayerBonus(selected.id, d, points, note, session?.user.id).then(afterCalendarChange)}
              onDeleteBonus={(d) => deletePlayerBonus(selected.id, d).then(afterCalendarChange)}
              onToggleCheck={
                isAdmin
                  ? (d, activityId, next) => setPlayerCheckOnDate(activityId, selected.id, d, next, session?.user.id).then(afterCalendarChange)
                  : undefined
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
