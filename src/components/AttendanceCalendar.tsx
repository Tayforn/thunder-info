// =========================================================
// Місячний календар відвідуваності гравця (референс — календар
// pw-events, але без тижневого/денного вигляду: тут не події з часом, а
// денні галочки). Кожен день: скільки активностей було заплановано
// (weekdays активності) і скільки з них людина відвідала; ★ — видана
// премія. Клік на день — детальний список ✓/✗ під календарем; адмін там
// же бачить бали, може видати/змінити/прибрати премію (onSaveBonus/
// onDeleteBonus) і ретро-виправити галочки (onToggleCheck). Використання:
// /players (усі можливості) та /newbies (read-only відвідуваність — без
// премій і ретро-редагування, бо бали новачків фіналізує крон і минулі
// дні він не перераховує).
// =========================================================

import { useEffect, useMemo, useState } from 'react';
import { reportError } from '../app/errorMessage';
import type { Activity, PlayerBonus } from '../data/types';
import { kyivDateString } from '../data/types';
import { IcoCheck } from './Icons';

export const MONTH_NOM = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
] as const;

const WEEK_HEAD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const;

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** YYYY-MM-DD → DD.MM.YYYY */
function prettyDate(key: string): string {
  const [y, m, d] = key.split('-');
  return `${d}.${m}.${y}`;
}

interface DayInfo {
  key: string;
  day: number;
  /** Активності дня: заплановані за weekdays + відвідані, навіть якщо
   * розклад активності відтоді змінили (галочка не має "зникати"). */
  items: { activity: Activity; attended: boolean }[];
  attended: number;
  points: number;
  bonus: PlayerBonus | null;
  state: 'future' | 'none' | 'full' | 'partial' | 'miss';
}

interface Props {
  year: number;
  month: number; // 0-11
  activities: Activity[];
  /** YYYY-MM-DD → set відвіданих activity_id (fetch*ChecksRange). */
  checksByDate: Map<string, Set<string>>;
  /** YYYY-MM-DD → премія за день (fetchPlayerBonusesRange); не передана =
   * премій у цієї сутності немає (новачки). */
  bonusByDate?: Map<string, PlayerBonus>;
  /** Показувати бали (підсумок місяця, бали активностей у деталях дня).
   * Права на редагування задаються НЕ цим прапорцем, а наявністю
   * onSaveBonus/onDeleteBonus/onToggleCheck — сторінка передає їх лише
   * адмінам. */
  showPoints: boolean;
  onSaveBonus?: (dateKey: string, points: number, note: string) => Promise<void>;
  onDeleteBonus?: (dateKey: string) => Promise<void>;
  /** Ретро-редагування: клік по активності в деталях дня ставить/знімає
   * галочку. Не передано = список read-only. */
  onToggleCheck?: (dateKey: string, activityId: string, next: boolean) => Promise<void>;
}

/** Редактор премії за вибраний день — стан скидається зміною key=dateKey. */
function BonusEditor({
  bonus,
  onSave,
  onDelete,
}: {
  bonus: PlayerBonus | null;
  onSave: (points: number, note: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [points, setPoints] = useState(bonus ? String(bonus.points) : '');
  const [note, setNote] = useState(bonus?.note ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPoints(bonus ? String(bonus.points) : '');
    setNote(bonus?.note ?? '');
  }, [bonus]);

  const parsed = Number(points);
  const valid = points.trim() !== '' && Number.isFinite(parsed) && parsed > 0;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bonus-editor">
      <label className="field narrow">
        <span>Премія, балів</span>
        <input type="number" min={1} value={points} className="input-sm" onChange={(e) => setPoints(e.target.value)} />
      </label>
      <label className="field">
        <span>За що (необовʼязково)</span>
        <input type="text" value={note} className="input-sm" onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || !valid} onClick={() => run(() => onSave(parsed, note))}>
        {bonus ? 'Оновити премію' : '★ Видати премію'}
      </button>
      {bonus && (
        <button type="button" className="btn btn-bad btn-sm" disabled={busy} onClick={() => run(onDelete)}>
          Прибрати
        </button>
      )}
    </div>
  );
}

const NO_BONUSES = new Map<string, PlayerBonus>();

export default function AttendanceCalendar({ year, month, activities, checksByDate, bonusByDate = NO_BONUSES, showPoints, onSaveBonus, onDeleteBonus, onToggleCheck }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const today = kyivDateString();

  const toggleCheck = async (dateKey: string, activityId: string, next: boolean) => {
    if (!onToggleCheck) return;
    setToggleBusy(true);
    try {
      await onToggleCheck(dateKey, activityId, next);
    } catch (e) {
      reportError(e);
    } finally {
      setToggleBusy(false);
    }
  };

  const days = useMemo<DayInfo[]>(() => {
    const count = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => {
      const day = i + 1;
      const key = dateKey(year, month, day);
      const dow = new Date(year, month, day).getDay();
      const checked = checksByDate.get(key) ?? new Set<string>();
      const items = activities
        .filter((a) => a.weekdays.includes(dow) || checked.has(a.id))
        .map((activity) => ({ activity, attended: checked.has(activity.id) }));
      const attended = items.filter((it) => it.attended).length;
      const points = items.reduce((s, it) => s + (it.attended ? it.activity.points : 0), 0);
      const state: DayInfo['state'] =
        key > today ? 'future' : items.length === 0 ? 'none' : attended === items.length ? 'full' : attended > 0 ? 'partial' : 'miss';
      return { key, day, items, attended, points, bonus: bonusByDate.get(key) ?? null, state };
    });
  }, [year, month, activities, checksByDate, bonusByDate, today]);

  const leadBlanks = (new Date(year, month, 1).getDay() + 6) % 7; // Пн-перший тиждень
  const selected = selectedKey ? days.find((d) => d.key === selectedKey) : null;

  // Підсумок місяця — лише минулі/сьогоднішні дні.
  const totals = useMemo(() => {
    const done = days.filter((d) => d.state !== 'future');
    return {
      attended: done.reduce((s, d) => s + d.attended, 0),
      total: done.reduce((s, d) => s + d.items.length, 0),
      points: done.reduce((s, d) => s + d.points, 0),
      bonus: done.reduce((s, d) => s + (d.bonus?.points ?? 0), 0),
    };
  }, [days]);

  const pct = totals.total > 0 ? Math.round((totals.attended / totals.total) * 100) : null;

  return (
    <div className="stack">
      <div className="tiles">
        <div className={'tile' + (pct === null ? '' : pct >= 80 ? ' good' : pct >= 50 ? ' warn' : ' bad')}>
          <span className="tile-l">Відвідано</span>
          <span className="tile-v">{totals.attended}<small>з {totals.total}</small></span>
          <span className="tile-s">{pct === null ? 'активностей ще не було' : `${pct}% за місяць`}</span>
        </div>
        {showPoints && (
          <div className="tile accent">
            <span className="tile-l">Балів</span>
            <span className="tile-v">{totals.points + totals.bonus}</span>
            <span className="tile-s">{totals.bonus > 0 ? `з них премій: ${totals.bonus}` : 'за активності'}</span>
          </div>
        )}
      </div>

      <div className="att-cal">
        {WEEK_HEAD.map((w) => (
          <span key={w} className="att-cal-head">{w}</span>
        ))}
        {Array.from({ length: leadBlanks }, (_, i) => (
          <span key={`b${i}`} className="att-cal-cell out" aria-hidden="true"></span>
        ))}
        {days.map((d) => (
          <button
            key={d.key}
            type="button"
            className={
              'att-cal-cell ' + d.state + (d.key === today ? ' today' : '') + (d.key === selectedKey ? ' selected' : '')
            }
            title={d.state === 'none' ? 'Активностей не заплановано' : d.state === 'future' ? '' : `Відвідано ${d.attended} з ${d.items.length}`}
            onClick={() => setSelectedKey((cur) => (cur === d.key ? null : d.key))}
          >
            <span className="att-cal-day">{d.day}</span>
            {d.state !== 'none' && d.state !== 'future' && (
              <span className="att-cal-score">{d.attended}/{d.items.length}</span>
            )}
            {d.bonus && <span className="att-cal-star" title={`Премія: ${d.bonus.points}`}>★</span>}
          </button>
        ))}
      </div>

      <div className="row between">
        <span className="legend">
          <span><i className="sw full" /> усе</span>
          <span><i className="sw partial" /> частково</span>
          <span><i className="sw miss" /> пропуск</span>
          <span><i className="sw none" /> без активностей</span>
        </span>
        <span className="hint">Клікни на день — деталі{onSaveBonus ? ' або премія' : ''}.</span>
      </div>

      {selected && (
        <div className="cal-day">
          <div className="cal-day-head">
            <b>{prettyDate(selected.key)}</b>
            {selected.state !== 'future' && selected.items.length > 0 && (
              <span className={'badge ' + (selected.state === 'full' ? 'good' : selected.state === 'partial' ? 'warn' : 'bad')}>
                {selected.attended} / {selected.items.length}
              </span>
            )}
          </div>
          {selected.state === 'future' ? (
            <p className="hint">Цей день ще попереду.</p>
          ) : selected.items.length === 0 ? (
            <p className="hint">Активностей не заплановано.</p>
          ) : (
            <div className="cal-acts">
              {selected.items.map(({ activity, attended }) => {
                const inner = (
                  <>
                    <span className={'check' + (attended ? ' is-on' : '')} aria-hidden="true"><IcoCheck /></span>
                    <span>{activity.name}</span>
                    {showPoints && attended && activity.points > 0 && <span className="pts">+{activity.points}</span>}
                  </>
                );
                return onToggleCheck ? (
                  <button
                    key={activity.id}
                    type="button"
                    className={'cal-act' + (attended ? ' on' : '')}
                    disabled={toggleBusy}
                    title={attended ? 'Клікни, щоб зняти галочку' : 'Клікни, щоб позначити відвіданою'}
                    onClick={() => toggleCheck(selected.key, activity.id, !attended)}
                  >
                    {inner}
                  </button>
                ) : (
                  <span key={activity.id} className={'cal-act' + (attended ? ' on' : '')}>{inner}</span>
                );
              })}
              {onToggleCheck && <small className="hint">Клік по активності ставить або знімає галочку.</small>}
            </div>
          )}
          {selected.bonus && (
            <p className="badge warn" style={{ marginTop: 10 }}>
              ★ Премія: {selected.bonus.points}{selected.bonus.note ? ` — ${selected.bonus.note}` : ''}
            </p>
          )}
          {selected.state !== 'future' && onSaveBonus && onDeleteBonus && (
            <BonusEditor
              key={selected.key}
              bonus={selected.bonus}
              onSave={(points, note) => onSaveBonus(selected.key, points, note)}
              onDelete={() => onDeleteBonus(selected.key)}
            />
          )}
        </div>
      )}
    </div>
  );
}
