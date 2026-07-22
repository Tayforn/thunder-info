// =========================================================
// /activity — галочки за сьогоднішні активності. Спільні для всіх
// адмінів (realtime-підписка на activity_checks), toggle = миттєвий
// insert/delete без модалок. О 23:00+ (за Києвом) серверний крон
// (award_daily_points) підсумовує сьогоднішні галочки в point_awards.
// =========================================================

import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import PageMeta from '../app/PageMeta';
import { reportError } from '../app/errorMessage';
import AdminGate from '../components/AdminGate';
import ClassBadge from '../components/ClassBadge';
import { fetchActivities } from '../data/activities';
import { fetchTodayChecks, setCheck, subscribeToActivityChecks } from '../data/activityChecks';
import { fetchClasses } from '../data/classes';
import { fetchNewbies } from '../data/newbies';
import type { Activity, ClassRow, Newbie } from '../data/types';
import { WEEKDAY_LABELS_FULL, todayWeekday } from '../data/types';

function ActivityGrid({ session }: { session: Session }) {
  const [newbies, setNewbies] = useState<Newbie[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set()); // `${activityId}:${newbieId}`
  const [err, setErr] = useState<string | null>(null);

  const reloadChecks = () => fetchTodayChecks().then((rows) => setChecked(new Set(rows.map((r) => `${r.activityId}:${r.newbieId}`))));

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchNewbies(), fetchClasses(), fetchActivities()])
      .then(([n, c, a]) => {
        if (cancelled) return;
        setNewbies(n);
        setClasses(c);
        setActivities(a);
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : 'Не вдалося завантажити дані.'));
    reloadChecks().catch(() => {});
    return subscribeToActivityChecks(() => reloadChecks().catch(() => {}));
  }, []);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const todaysActivities = useMemo(
    () => (activities ?? []).filter((a) => a.weekdays.includes(todayWeekday())),
    [activities],
  );

  const toggle = async (activityId: string, newbieId: string) => {
    const key = `${activityId}:${newbieId}`;
    const isChecked = checked.has(key);
    // Оптимістичне оновлення — інакше клік відчувається з затримкою на кожен toggle.
    setChecked((prev) => {
      const next = new Set(prev);
      if (isChecked) next.delete(key);
      else next.add(key);
      return next;
    });
    try {
      await setCheck(activityId, newbieId, !isChecked, session.user.id);
    } catch (e) {
      setChecked((prev) => {
        const next = new Set(prev);
        if (isChecked) next.add(key);
        else next.delete(key);
        return next;
      });
      reportError(e);
    }
  };

  if (err) return <p className="form-err">{err}</p>;
  if (!newbies || !activities) return <p className="hint">Завантаження…</p>;

  return (
    <div>
      <p className="hint" style={{ marginBottom: 16 }}>
        Сьогодні: {WEEKDAY_LABELS_FULL[todayWeekday()]}. Галочки спільні для всіх адмінів і оновлюються в реальному часі.
      </p>
      {newbies.length === 0 ? (
        <p className="hint">Спершу додай новачків в Адмінці.</p>
      ) : todaysActivities.length === 0 ? (
        <p className="hint">На сьогодні активностей не заплановано.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div className="rowlist" style={{ minWidth: 360 + todaysActivities.length * 130 }}>
            <div className="rowlist-head" style={{ gridTemplateColumns: `220px repeat(${todaysActivities.length}, 130px)` }}>
              <span>Новачок</span>
              {todaysActivities.map((a) => (
                <span key={a.id} title={`${a.points} балів`}>{a.name} · {a.points}</span>
              ))}
            </div>
            {newbies.map((n) => (
              <div key={n.id} className="rowlist-row" style={{ gridTemplateColumns: `220px repeat(${todaysActivities.length}, 130px)` }}>
                <span>
                  {n.nickname} <ClassBadge cls={n.classId ? classById.get(n.classId) : null} />
                </span>
                {todaysActivities.map((a) => (
                  <span key={a.id}>
                    <input
                      type="checkbox"
                      checked={checked.has(`${a.id}:${n.id}`)}
                      onChange={() => toggle(a.id, n.id)}
                      style={{ accentColor: 'var(--accent)', width: 19, height: 19, cursor: 'pointer' }}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ActivityPage() {
  return (
    <div>
      <PageMeta title="Активність — Thunder" />
      <div className="section-head">
        <span className="eyebrow">Гільдія</span>
        <h2>Активність сьогодні</h2>
      </div>
      <AdminGate>{(session) => <ActivityGrid session={session} />}</AdminGate>
    </div>
  );
}
