// =========================================================
// /activity — галочки за активності. Спільні для всіх адмінів
// (realtime-підписки), toggle = миттєвий insert/delete без модалок.
// Дві секції з однаковим грідом:
//  - Новачки (activity_checks) — лише "сьогодні": о 23:00+ (за Києвом)
//    серверний крон (award_daily_points) підсумовує галочки в
//    point_awards, а минулі дні він не перераховує — тому ретро-редагування
//    новачків тут свідомо немає;
//  - Гравці (player_activity_checks) — з навігацією по датах (сьогодні й
//    минулі дні): бали рахуються напряму з галочок, тож минулі дні можна
//    масово виправляти всім гравцям одразу. Тут же колонка "Премія" —
//    число за вибраний день (player_bonuses, одна премія на гравця на
//    день; детальніше з нотаткою — в календарі на /players).
// =========================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import PageMeta from '../app/PageMeta';
import { reportError } from '../app/errorMessage';
import AdminGate from '../components/AdminGate';
import { dateKey } from '../components/AttendanceCalendar';
import ClassBadge from '../components/ClassBadge';
import { ClassFilterChips, classOrder, sortByClass, useClassFilter } from '../components/ClassFilter';
import { IcoBolt, IcoCheck, IcoChevL, IcoChevR, IcoList, IcoUsers } from '../components/Icons';
import { SortHeader, useColumnSort } from '../app/useColumnSort';
import { fetchActivities } from '../data/activities';
import { fetchTodayChecks, setCheck, subscribeToActivityChecks } from '../data/activityChecks';
import { fetchPlayerChecksOnDate, setPlayerCheckOnDate, subscribeToPlayerActivityChecks } from '../data/playerActivityChecks';
import { deletePlayerBonus, fetchBonusesOnDate, setPlayerBonus, subscribeToPlayerBonuses } from '../data/playerBonuses';
import { fetchClasses } from '../data/classes';
import { fetchNewbies } from '../data/newbies';
import { fetchPlayers } from '../data/players';
import type { Activity, ClassRow, Newbie, Player, PlayerBonus } from '../data/types';
import { WEEKDAY_LABELS_FULL, kyivDateString, todayWeekday } from '../data/types';

interface GridPerson {
  id: string;
  nickname: string;
  classId: string | null;
}

/** Спільний грід "людина × активності дня" для обох секцій; клас — окрема
 * колонка. Оптимістичний toggle і відкат при помилці. extra — додаткова
 * колонка справа (премія у гравців); personHeader/classHeader — заміна
 * текстових заголовків (сортувальні кнопки в секції гравців). */
function ChecksGrid({
  people,
  personLabel,
  personHeader,
  classHeader,
  activities,
  checked,
  setChecked,
  persist,
  classById,
  emptyLabel,
  extra,
}: {
  people: GridPerson[];
  personLabel: string;
  personHeader?: React.ReactNode;
  classHeader?: React.ReactNode;
  activities: Activity[];
  checked: Set<string>; // `${activityId}:${personId}`
  setChecked: React.Dispatch<React.SetStateAction<Set<string>>>;
  persist: (activityId: string, personId: string, next: boolean) => Promise<void>;
  classById: Map<string, ClassRow>;
  emptyLabel: string;
  extra?: { header: React.ReactNode; render: (p: GridPerson) => React.ReactNode };
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

  if (people.length === 0) return <p className="rowlist-empty">{emptyLabel}</p>;

  const columns = ['minmax(170px, 1fr)', '130px', ...activities.map(() => '120px'), ...(extra ? ['110px'] : [])].join(' ');
  const minWidth = 300 + (activities.length + (extra ? 1 : 0)) * 120;

  return (
    <div className="rowlist checks">
      <div className="rowlist-head" style={{ gridTemplateColumns: columns, minWidth }}>
        <span>{personHeader ?? personLabel}</span>
        <span>{classHeader ?? 'Клас'}</span>
        {activities.map((a) => (
          <span key={a.id} className="col-act" title={`${a.points} балів`}>
            {a.name}
            <small>+{a.points}</small>
          </span>
        ))}
        {extra && <span>{extra.header}</span>}
      </div>
      {people.map((p) => (
        <div key={p.id} className="rowlist-row" style={{ gridTemplateColumns: columns, minWidth }}>
          <span className="cell-nick"><b>{p.nickname}</b></span>
          <span><ClassBadge cls={p.classId ? classById.get(p.classId) ?? null : null} /></span>
          {activities.map((a) => {
            const on = checked.has(`${a.id}:${p.id}`);
            return (
              <span key={a.id}>
                <button
                  type="button"
                  className={'check lg' + (on ? ' is-on' : '')}
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`${a.name}: ${p.nickname}`}
                  onClick={() => toggle(a.id, p.id)}
                >
                  <IcoCheck />
                </button>
              </span>
            );
          })}
          {extra && <span>{extra.render(p)}</span>}
        </div>
      ))}
    </div>
  );
}

/** Інпут премії за вибраний день: збереження на blur, порожнє/0 = прибрати.
 * Нотатка "за що" редагується в календарі на /players — тут лише сума. */
function BonusCell({
  bonus,
  onCommit,
}: {
  bonus: PlayerBonus | null;
  onCommit: (points: number | null, prevNote: string | null) => Promise<void>;
}) {
  const initial = bonus ? String(bonus.points) : '';
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);

  const commit = async () => {
    const v = value.trim();
    if (v === initial) return;
    const n = Number(v);
    try {
      if (!v || !Number.isFinite(n) || n <= 0) {
        setValue('');
        if (bonus) await onCommit(null, bonus.note);
      } else {
        await onCommit(n, bonus?.note ?? null);
      }
    } catch (e) {
      setValue(initial);
      reportError(e);
    }
  };

  return (
    <input
      type="number"
      min={1}
      placeholder="—"
      value={value}
      title={bonus?.note ? `Премія: ${bonus.note}` : 'Премія за цей день (порожнє = без премії)'}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      style={{ width: 84, textAlign: 'center' }}
    />
  );
}

function NewbiesSection({ session, newbies, activities, classById }: {
  session: Session;
  newbies: Newbie[];
  activities: Activity[];
  classById: Map<string, ClassRow>;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const reload = () => fetchTodayChecks().then((rows) => setChecked(new Set(rows.map((r) => `${r.activityId}:${r.newbieId}`))));

  useEffect(() => {
    reload().catch(() => {});
    return subscribeToActivityChecks(() => reload().catch(() => {}));
  }, []);

  const todaysActivities = useMemo(() => activities.filter((a) => a.weekdays.includes(todayWeekday())), [activities]);

  return (
    <div className="panel">
      <div className="panel-head">
        <h3><IcoList /> Новачки</h3>
        <span className="badge accent">сьогодні</span>
        <span className="panel-sub">лише поточний день — бали новачкам нараховує крон увечері</span>
      </div>
      <div className="panel-body flush">
        {todaysActivities.length === 0 ? (
          <p className="rowlist-empty">На сьогодні активностей не заплановано.</p>
        ) : (
          <ChecksGrid
            people={newbies}
            personLabel="Новачок"
            activities={todaysActivities}
            checked={checked}
            setChecked={setChecked}
            persist={(activityId, newbieId, next) => setCheck(activityId, newbieId, next, session.user.id)}
            classById={classById}
            emptyLabel="Спершу додай новачків в Адмінці."
          />
        )}
      </div>
    </div>
  );
}

function PlayersSection({ session, players, activities, classById }: {
  session: Session;
  players: Player[];
  activities: Activity[];
  classById: Map<string, ClassRow>;
}) {
  const today = kyivDateString();
  const [date, setDate] = useState(today);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bonuses, setBonuses] = useState<Map<string, PlayerBonus>>(new Map());
  const classFilter = useClassFilter(players, classById);
  const { sort, toggle: toggleSort } = useColumnSort();

  const reload = useCallback(
    () =>
      Promise.all([fetchPlayerChecksOnDate(date), fetchBonusesOnDate(date)]).then(([rows, b]) => {
        setChecked(new Set(rows.map((r) => `${r.activityId}:${r.playerId}`)));
        setBonuses(b);
      }),
    [date],
  );

  useEffect(() => {
    setChecked(new Set());
    setBonuses(new Map());
    reload().catch(() => {});
    const unsubChecks = subscribeToPlayerActivityChecks(() => reload().catch(() => {}));
    const unsubBonuses = subscribeToPlayerBonuses(() => reload().catch(() => {}));
    return () => {
      unsubChecks();
      unsubBonuses();
    };
  }, [reload]);

  // Без useMemo: список гільдійного розміру, сортування на рендер дешеве.
  // Дефолт — групування за класом; клік по заголовку — three-state.
  let list = sortByClass(players, classById);
  if (sort) {
    const mul = sort.dir === 'asc' ? 1 : -1;
    list = list.slice().sort((a, b) => {
      if (sort.col === 'class') return mul * (classOrder(a, classById) - classOrder(b, classById)) || a.nickname.localeCompare(b.nickname);
      return mul * a.nickname.localeCompare(b.nickname);
    });
  }
  const visiblePlayers = classFilter.visible(list);

  const dow = new Date(date + 'T12:00:00').getDay();
  // Активності вибраного дня: заплановані за weekdays + ті, де вже є
  // галочки (розклад могли змінити — інакше стару галочку не зняти звідси).
  const dayActivities = useMemo(() => {
    const checkedActIds = new Set(Array.from(checked, (k) => k.split(':')[0]));
    return activities.filter((a) => a.weekdays.includes(dow) || checkedActIds.has(a.id));
  }, [activities, dow, checked]);

  const shiftDay = (dir: 1 | -1) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + dir);
    const next = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
    if (next <= today) setDate(next);
  };

  const saveBonus = async (playerId: string, points: number | null, prevNote: string | null) => {
    if (points === null) await deletePlayerBonus(playerId, date);
    else await setPlayerBonus(playerId, date, points, prevNote, session.user.id);
    await reload();
  };

  const checkedCount = Array.from(checked).filter((k) => visiblePlayers.some((p) => k.endsWith(`:${p.id}`))).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <h3><IcoUsers /> Гравці</h3>
        <span className={'badge ' + (date === today ? 'accent' : 'warn')}>{date === today ? 'сьогодні' : WEEKDAY_LABELS_FULL[dow].toLowerCase()}</span>
        {dayActivities.length > 0 && <span className="panel-sub">відмічено {checkedCount}</span>}
        <div className="panel-actions">
          <div className="date-nav">
            <button type="button" className="btn btn-ghost btn-xs btn-ico" aria-label="Попередній день" onClick={() => shiftDay(-1)}><IcoChevL /></button>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && e.target.value <= today && setDate(e.target.value)} />
            <button type="button" className="btn btn-ghost btn-xs btn-ico" aria-label="Наступний день" disabled={date >= today} onClick={() => shiftDay(1)}><IcoChevR /></button>
            {date !== today && (
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setDate(today)}>Сьогодні</button>
            )}
          </div>
        </div>
      </div>
      {classFilter.chips.length > 1 && (
        <div className="panel-body tight" style={{ borderBottom: '1px solid var(--line)' }}>
          <ClassFilterChips filter={classFilter} />
        </div>
      )}
      <div className="panel-body flush">
        {dayActivities.length === 0 ? (
          <p className="rowlist-empty">У цей день активностей не заплановано.</p>
        ) : visiblePlayers.length === 0 ? (
          <p className="rowlist-empty">Під вибраний фільтр не потрапив жоден гравець.</p>
        ) : (
          <ChecksGrid
            people={visiblePlayers}
            personLabel="Гравець"
            personHeader={<SortHeader label="Гравець" col="nickname" sort={sort} onToggle={toggleSort} />}
            classHeader={<SortHeader label="Клас" col="class" sort={sort} onToggle={toggleSort} />}
            activities={dayActivities}
            checked={checked}
            setChecked={setChecked}
            persist={(activityId, playerId, next) => setPlayerCheckOnDate(activityId, playerId, date, next, session.user.id)}
            classById={classById}
            emptyLabel="Спершу додай гравців в Адмінці."
            extra={{
              header: 'Премія',
              render: (p) => (
                <BonusCell
                  key={`${p.id}:${date}`}
                  bonus={bonuses.get(p.id) ?? null}
                  onCommit={(points, prevNote) => saveBonus(p.id, points, prevNote)}
                />
              ),
            }}
          />
        )}
      </div>
      <div className="panel-foot">Можна відмічати й минулі дні — бали гравців рахуються з галочок напряму. Премія — число за день; нотатка «за що» — в календарі на сторінці «Гравці».</div>
    </div>
  );
}

function ActivitySections({ session }: { session: Session }) {
  const [newbies, setNewbies] = useState<Newbie[] | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
    return () => {
      cancelled = true;
    };
  }, []);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  if (err) return <p className="form-err">{err}</p>;
  if (!newbies || !players || !activities) return <p className="loading"><span className="spinner" /> Завантаження…</p>;

  return (
    <>
      <NewbiesSection session={session} newbies={newbies} activities={activities} classById={classById} />
      <PlayersSection session={session} players={players} activities={activities} classById={classById} />
    </>
  );
}

export default function ActivityPage() {
  return (
    <div className="page">
      <PageMeta title="Активність — Thunder" />
      <div className="page-head">
        <div className="page-head-text">
          <span className="eyebrow">Керування</span>
          <h1>Активність</h1>
          <p>Галочки спільні для всіх адмінів і оновлюються в реальному часі.</p>
        </div>
        <div className="page-head-actions">
          <span className="badge"><IcoBolt style={{ width: 12, height: 12 }} /> {WEEKDAY_LABELS_FULL[todayWeekday()]}</span>
        </div>
      </div>
      <AdminGate>{(session) => <ActivitySections session={session} />}</AdminGate>
    </div>
  );
}
