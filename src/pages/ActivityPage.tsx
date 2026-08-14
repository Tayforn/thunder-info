// =========================================================
// /activity — галочки за сьогоднішні активності. Спільні для всіх
// адмінів (realtime-підписка), toggle = миттєвий insert/delete без
// модалок. Дві незалежні секції з однаковим грідом:
//  - Новачки (activity_checks) — о 23:00+ (за Києвом) серверний крон
//    (award_daily_points) підсумовує галочки в point_awards;
//  - Гравці (player_activity_checks) — без крону: бали гравця рахуються
//    напряму з галочок (сума activity.points, без коефіцієнтів класу),
//    календар і премії — на /players.
// =========================================================

import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import PageMeta from '../app/PageMeta';
import { reportError } from '../app/errorMessage';
import AdminGate from '../components/AdminGate';
import ClassBadge from '../components/ClassBadge';
import { fetchActivities } from '../data/activities';
import { fetchTodayChecks, setCheck, subscribeToActivityChecks } from '../data/activityChecks';
import { fetchTodayPlayerChecks, setPlayerCheck, subscribeToPlayerActivityChecks } from '../data/playerActivityChecks';
import { fetchClasses } from '../data/classes';
import { fetchNewbies } from '../data/newbies';
import { fetchPlayers } from '../data/players';
import type { Activity, ClassRow, Newbie, Player } from '../data/types';
import { WEEKDAY_LABELS_FULL, todayWeekday } from '../data/types';

interface GridPerson {
  id: string;
  nickname: string;
  classId: string | null;
}

/** Спільний грід "людина × сьогоднішні активності" для обох секцій.
 * Оптимістичний toggle і відкат при помилці — як було в новачків. */
function ChecksGrid({
  people,
  personLabel,
  activities,
  checked,
  setChecked,
  persist,
  classById,
  emptyLabel,
}: {
  people: GridPerson[];
  personLabel: string;
  activities: Activity[];
  checked: Set<string>; // `${activityId}:${personId}`
  setChecked: React.Dispatch<React.SetStateAction<Set<string>>>;
  persist: (activityId: string, personId: string, next: boolean) => Promise<void>;
  classById: Map<string, ClassRow>;
  emptyLabel: string;
}) {
  const toggle = async (activityId: string, personId: string) => {
    const key = `${activityId}:${personId}`;
    const isChecked = checked.has(key);
    // Оптимістичне оновлення — інакше клік відчувається з затримкою на кожен toggle.
    setChecked((prev) => {
      const next = new Set(prev);
      if (isChecked) next.delete(key);
      else next.add(key);
      return next;
    });
    try {
      await persist(activityId, personId, !isChecked);
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

  if (people.length === 0) return <p className="hint">{emptyLabel}</p>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div className="rowlist" style={{ minWidth: 360 + activities.length * 130 }}>
        <div className="rowlist-head" style={{ gridTemplateColumns: `220px repeat(${activities.length}, 130px)` }}>
          <span>{personLabel}</span>
          {activities.map((a) => (
            <span key={a.id} title={`${a.points} балів`}>{a.name} · {a.points}</span>
          ))}
        </div>
        {people.map((p) => (
          <div key={p.id} className="rowlist-row" style={{ gridTemplateColumns: `220px repeat(${activities.length}, 130px)` }}>
            <span>
              {p.nickname} <ClassBadge cls={p.classId ? classById.get(p.classId) ?? null : null} />
            </span>
            {activities.map((a) => (
              <span key={a.id}>
                <input
                  type="checkbox"
                  checked={checked.has(`${a.id}:${p.id}`)}
                  onChange={() => toggle(a.id, p.id)}
                  style={{ accentColor: 'var(--accent)', width: 19, height: 19, cursor: 'pointer' }}
                />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityGrid({ session }: { session: Session }) {
  const [newbies, setNewbies] = useState<Newbie[] | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [checkedNewbies, setCheckedNewbies] = useState<Set<string>>(new Set());
  const [checkedPlayers, setCheckedPlayers] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const reloadNewbieChecks = () =>
    fetchTodayChecks().then((rows) => setCheckedNewbies(new Set(rows.map((r) => `${r.activityId}:${r.newbieId}`))));
  const reloadPlayerChecks = () =>
    fetchTodayPlayerChecks().then((rows) => setCheckedPlayers(new Set(rows.map((r) => `${r.activityId}:${r.playerId}`))));

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchNewbies(), fetchPlayers(), fetchClasses(), fetchActivities()])
      .then(([n, p, c, a]) => {
        if (cancelled) return;
        setNewbies(n);
        setPlayers(p);
        setClasses(c);
        setActivities(a);
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : 'Не вдалося завантажити дані.'));
    reloadNewbieChecks().catch(() => {});
    reloadPlayerChecks().catch(() => {});
    const unsubN = subscribeToActivityChecks(() => reloadNewbieChecks().catch(() => {}));
    const unsubP = subscribeToPlayerActivityChecks(() => reloadPlayerChecks().catch(() => {}));
    return () => {
      cancelled = true;
      unsubN();
      unsubP();
    };
  }, []);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const todaysActivities = useMemo(
    () => (activities ?? []).filter((a) => a.weekdays.includes(todayWeekday())),
    [activities],
  );

  if (err) return <p className="form-err">{err}</p>;
  if (!newbies || !players || !activities) return <p className="hint">Завантаження…</p>;

  return (
    <div>
      <p className="hint" style={{ marginBottom: 16 }}>
        Сьогодні: {WEEKDAY_LABELS_FULL[todayWeekday()]}. Галочки спільні для всіх адмінів і оновлюються в реальному часі.
      </p>
      {todaysActivities.length === 0 ? (
        <p className="hint">На сьогодні активностей не заплановано.</p>
      ) : (
        <>
          <h3>Новачки</h3>
          <ChecksGrid
            people={newbies}
            personLabel="Новачок"
            activities={todaysActivities}
            checked={checkedNewbies}
            setChecked={setCheckedNewbies}
            persist={(activityId, newbieId, next) => setCheck(activityId, newbieId, next, session.user.id)}
            classById={classById}
            emptyLabel="Спершу додай новачків в Адмінці."
          />
          <h3 style={{ marginTop: 28 }}>Гравці</h3>
          <ChecksGrid
            people={players}
            personLabel="Гравець"
            activities={todaysActivities}
            checked={checkedPlayers}
            setChecked={setCheckedPlayers}
            persist={(activityId, playerId, next) => setPlayerCheck(activityId, playerId, next, session.user.id)}
            classById={classById}
            emptyLabel="Спершу додай гравців в Адмінці."
          />
        </>
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
