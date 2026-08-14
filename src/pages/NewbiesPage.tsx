// =========================================================
// Публічна сторінка "Новачки" — ростер гільдії: клас (з підсвіткою
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
  const columns = isAdmin ? 'minmax(150px, 1fr) 160px 120px' : 'minmax(150px, 1fr) 160px';

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

  return (
    <div>
      <PageMeta title="Новачки — Thunder" description="Ростер новачків гільдії Thunder: клас і активність." />
      <div className="section-head">
        <span className="eyebrow">Гільдія</span>
        <h2>Новачки</h2>
        <p>Клас підсвічено за пріоритетністю (⚡ — пріоритетний клас), сортування — за сумою балів активності. Клікни на новачка, щоб побачити календар відвідуваності.</p>
      </div>

      {err && <p className="form-err">{err}</p>}
      {!rows && !err && <p className="hint">Завантаження…</p>}

      {rows && (
        <div className="rowlist">
          <div className="rowlist-head" style={{ gridTemplateColumns: columns }}>
            <span>Нікнейм</span>
            <span>Клас</span>
            {isAdmin && <span>Бали</span>}
          </div>
          {rows.length === 0 ? (
            <p className="rowlist-empty hint">Новачків ще немає.</p>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                className={'rowlist-row rowlist-row-click' + (r.id === selectedId ? ' selected' : '')}
                style={{ gridTemplateColumns: columns, cursor: 'pointer' }}
                onClick={() => setSelectedId((cur) => (cur === r.id ? null : r.id))}
              >
                <span>{r.nickname}</span>
                <span><ClassBadge cls={r.cls} /></span>
                {isAdmin && <span style={{ fontWeight: 700 }}>{r.totalPoints}</span>}
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
          {!checksByDate ? (
            <p className="hint">Завантаження…</p>
          ) : (
            <AttendanceCalendar year={anchor.y} month={anchor.m} activities={activities} checksByDate={checksByDate} admin={false} />
          )}
        </div>
      )}
    </div>
  );
}
