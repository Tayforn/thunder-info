// =========================================================
// Сторінка "Новачки" — ростер гільдії: клас (з підсвіткою
// пріоритетності) + сума балів активності, сортування за спаданням балів.
// Клік на новачка відкриває read-only календар відвідуваності (без
// премій і ретро-редагування — бали новачків фіналізує крон
// award_daily_points, минулі дні він не перераховує). Редагування
// новачків/класів — лише в /admin.
// =========================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageMeta from '../app/PageMeta';
import ClassBadge from '../components/ClassBadge';
import AttendanceCalendar, { MONTH_NOM, dateKey } from '../components/AttendanceCalendar';
import { IcoCal, IcoChevL, IcoChevR, IcoList } from '../components/Icons';
import { useAuth } from '../app/useAuth';
import { fetchActivities } from '../data/activities';
import { fetchNewbieChecksRange } from '../data/activityChecks';
import { fetchClasses } from '../data/classes';
import { fetchNewbieTotals, fetchNewbies } from '../data/newbies';
import type { Activity, ClassRow, Newbie } from '../data/types';

interface Row extends Newbie {
  cls: ClassRow | null;
  totalPoints: number;
}

export default function NewbiesPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const columns = isAdmin ? '44px minmax(150px, 1fr) 150px 90px' : '44px minmax(150px, 1fr) 150px';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const [checksByDate, setChecksByDate] = useState<Map<string, Set<string>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchNewbies(), fetchClasses(), fetchNewbieTotals(), fetchActivities()])
      .then(([newbies, classes, totals, acts]) => {
        if (cancelled) return;
        const classById = new Map(classes.map((c) => [c.id, c]));
        const totalById = new Map(totals.map((t) => [t.newbieId, t.totalPoints]));
        const merged = newbies
          .map((n): Row => ({ ...n, cls: n.classId ? classById.get(n.classId) ?? null : null, totalPoints: totalById.get(n.id) ?? 0 }))
          .sort((a, b) => b.totalPoints - a.totalPoints);
        setRows(merged);
        setActivities(acts);
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : 'Не вдалося завантажити новачків.'));
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMonth = useCallback(() => {
    if (!selectedId) return;
    const from = dateKey(anchor.y, anchor.m, 1);
    const to = dateKey(anchor.y, anchor.m, new Date(anchor.y, anchor.m + 1, 0).getDate());
    fetchNewbieChecksRange(selectedId, from, to)
      .then(setChecksByDate)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Не вдалося завантажити відвідуваність.'));
  }, [selectedId, anchor]);

  useEffect(() => {
    setChecksByDate(null);
    loadMonth();
  }, [loadMonth]);

  const selected = useMemo(() => (selectedId ? rows?.find((r) => r.id === selectedId) ?? null : null), [selectedId, rows]);

  const stepMonth = (dir: 1 | -1) =>
    setAnchor(({ y, m }) => {
      const d = new Date(y, m + dir, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

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
        {!checksByDate ? (
          <p className="loading"><span className="spinner" /> Завантаження…</p>
        ) : (
          <AttendanceCalendar year={anchor.y} month={anchor.m} activities={activities} checksByDate={checksByDate} showPoints={false} />
        )}
      </div>
    </div>
  );

  return (
    <div className="page">
      <PageMeta title="Новачки — Thunder" description="Ростер новачків гільдії Thunder: клас і активність." />
      <div className="page-head">
        <div className="page-head-text">
          <span className="eyebrow">Гільдія</span>
          <h1>Новачки</h1>
          <p>
            Клас підсвічено за пріоритетністю (⚡ — пріоритетний клас), сортування — за сумою балів активності. Клікни на
            новачка, щоб побачити календар відвідуваності.
          </p>
        </div>
      </div>

      {err && <p className="form-err">{err}</p>}
      {!rows && !err && <p className="loading"><span className="spinner" /> Завантаження…</p>}

      {rows && (
        <div className={'split' + (selected ? ' main-side' : '')}>
          <div className="panel">
            <div className="panel-head">
              <h3><IcoList /> Ростер новачків</h3>
              <span className="badge mute">{rows.length}</span>
            </div>
            <div className="panel-body flush">
              <div className="rowlist">
                <div className="rowlist-head" style={{ gridTemplateColumns: columns }}>
                  <span>#</span>
                  <span>Нікнейм</span>
                  <span>Клас</span>
                  {isAdmin && <span className="cell-right">Бали</span>}
                </div>
                {rows.length === 0 ? (
                  <p className="rowlist-empty">Новачків ще немає.</p>
                ) : (
                  rows.map((r, i) => (
                    <div
                      key={r.id}
                      className={'rowlist-row row-click' + (r.id === selectedId ? ' selected' : '')}
                      style={{ gridTemplateColumns: columns }}
                      onClick={() => setSelectedId((cur) => (cur === r.id ? null : r.id))}
                    >
                      <span className="cell-rank"><span className={'medal' + (isAdmin && r.totalPoints > 0 && i < 3 ? ` m${i + 1}` : '')}>{i + 1}</span></span>
                      <span className="cell-nick">
                        <b>{r.nickname}</b>
                        {r.note && <small className="hint">{r.note}</small>}
                      </span>
                      <span><ClassBadge cls={r.cls} /></span>
                      {isAdmin && <span className="cell-pts cell-right">{r.totalPoints}</span>}
                    </div>
                  ))
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
