// =========================================================
// Таб «Евенти»: що саме піде в щоденний пост у Discord. Стартово рядки
// підтягуються з «Активностей» (тригер у БД + імпорт у міграції 0005),
// але далі живуть окремо: можна правити назву/дні, додавати час початку,
// разові евенти на дату, примітку і пінг за N хв до початку.
//
// Пост веде Edge Function discord-events (крон кожні 5 хв). Тут — стан
// поста і кнопка "Оновити зараз", щоб не чекати крону після правок.
// =========================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, reportError } from '../../app/errorMessage';
import AdminTable from '../../components/AdminTable';
import WeekdayPicker from '../../components/WeekdayPicker';
import { fetchActivities } from '../../data/activities';
import {
  activitiesWithoutEvent,
  cleanDiscordPings,
  createEvent,
  deleteEvent,
  divergedFromActivity,
  eventsForToday,
  fetchDiscordPostState,
  fetchEvents,
  importActivities,
  triggerDiscordSync,
  updateEvent,
  type DiscordPostState,
} from '../../data/events';
import type { Activity, GuildEvent } from '../../data/types';
import { WEEKDAY_LABELS, WEEKDAY_LABELS_FULL, kyivDateString, todayWeekday } from '../../data/types';

const COLUMNS = '1.2fr 300px 180px 180px 60px 150px';

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
}

/** YYYY-MM-DD → DD.MM.YYYY */
function dateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

function TextInput({ initial, placeholder, allowEmpty, onSave }: { initial: string; placeholder?: string; allowEmpty?: boolean; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => (allowEmpty || value.trim()) && value !== initial && onSave(value)}
    />
  );
}

/** Примітка: кілька рядків, посилання тощо — textarea, що росте під вміст
 * (до ~160px, далі скрол). Зберігається на blur, як і решта полів. */
function NoteInput({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setValue(initial), [initial]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder="Примітка, посилання… (необов'язково)"
      title="Можна кілька рядків і посилання — у пості йде під евентом, у «Події» — як опис"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== initial && onSave(value)}
    />
  );
}

function TimeInput({ initial, onSave }: { initial: string | null; onSave: (v: string | null) => void }) {
  const [value, setValue] = useState(initial ?? '');
  useEffect(() => setValue(initial ?? ''), [initial]);
  const commit = () => {
    const next = value || null;
    if (next !== initial) onSave(next);
  };
  return <input type="time" value={value} onChange={(e) => setValue(e.target.value)} onBlur={commit} />;
}

function MinutesInput({ initial, min, max, placeholder, onSave }: { initial: number | null; min: number; max: number; placeholder?: string; onSave: (v: number | null) => void }) {
  const [value, setValue] = useState(initial === null ? '' : String(initial));
  useEffect(() => setValue(initial === null ? '' : String(initial)), [initial]);
  const commit = () => {
    const n = value.trim() === '' ? null : Number(value);
    if (n !== null && (!Number.isInteger(n) || n < min || n > max)) {
      setValue(initial === null ? '' : String(initial));
      return;
    }
    if (n !== initial) onSave(n);
  };
  return <input type="number" min={min} max={max} value={value} placeholder={placeholder ?? '—'} onChange={(e) => setValue(e.target.value)} onBlur={commit} />;
}

/** "Коли": щотижня (дні тижня) або разово (дата). Дата має пріоритет —
 * перемикання на "Дата" ставить сьогоднішню, повернення на "Щотижня"
 * прибирає дату (дні тижня лишаються як були). */
function WhenPicker({ weekdays, eventDate, onChange }: { weekdays: number[]; eventDate: string | null; onChange: (patch: { weekdays?: number[]; eventDate?: string | null }) => void }) {
  const dated = eventDate !== null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className={'btn btn-sm ' + (!dated ? 'btn-primary' : 'btn-ghost')} style={{ padding: '3px 9px', fontSize: 12 }} onClick={() => dated && onChange({ eventDate: null })}>
          Щотижня
        </button>
        <button type="button" className={'btn btn-sm ' + (dated ? 'btn-primary' : 'btn-ghost')} style={{ padding: '3px 9px', fontSize: 12 }} onClick={() => !dated && onChange({ eventDate: kyivDateString() })}>
          Дата
        </button>
      </div>
      {dated ? (
        <input type="date" value={eventDate ?? ''} onChange={(e) => e.target.value && onChange({ eventDate: e.target.value })} />
      ) : (
        <WeekdayPicker value={weekdays} onChange={(v) => onChange({ weekdays: v })} />
      )}
    </div>
  );
}

function DiscordStatus({ state, onSynced }: { state: DiscordPostState | null; onSynced: () => void }) {
  const [busy, setBusy] = useState<'sync' | 'clean' | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const postLabel = { created: 'пост створено', edited: 'пост оновлено', unchanged: 'пост без змін' } as const;

  const run = async (what: 'sync' | 'clean') => {
    setBusy(what);
    setErr(null);
    setResult(null);
    try {
      if (what === 'sync') {
        const r = await triggerDiscordSync();
        const sch = r.scheduled;
        setResult(
          `${postLabel[r.post]}, евентів на ${dateLabel(r.date)}: ${r.events}` +
            (r.pings.length > 0 ? `, пінги: ${r.pings.join(', ')}` : '') +
            (r.cleaned > 0 ? `, прибрано старих пінгів: ${r.cleaned}` : '') +
            (sch ? `; події Discord: +${sch.created} / змінено ${sch.updated} / −${sch.deleted}` + (sch.started > 0 ? ` / стартовано ${sch.started}` : '') : '') +
            '.' +
            (r.warnings?.length ? ` Увага: ${r.warnings.join('; ')}` : ''),
        );
        onSynced();
      } else {
        if (!confirm('Прибрати з каналу всі нагадування (пінги)? Пост лишиться. Сьогоднішні пінги повторно не надсилатимуться.')) return;
        const r = await cleanDiscordPings();
        setResult(r.cleaned > 0 ? `Прибрано пінгів: ${r.cleaned}.` : 'Пінгів у каналі немає.');
      }
    } catch (e) {
      setErr(errorMessage(e, what === 'sync' ? 'Не вдалося оновити пост у Discord.' : 'Не вдалося почистити пінги.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card" style={{ padding: '16px 20px', marginBottom: 18, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Пост у Discord</div>
        {state ? (
          <div className="hint">
            Зараз показує {dateLabel(state.postDate)}, останні зміни {when(state.updatedAt)}. Крон перевіряє його кожні 5 хв.
          </div>
        ) : (
          <div className="hint">Ще не створений — натисни «Оновити зараз» або дочекайся крону (див. supabase/DISCORD.md).</div>
        )}
        {result && <div className="hint" style={{ marginTop: 4, color: 'var(--good)' }}>{result}</div>}
        {err && <p className="form-err" style={{ marginTop: 4 }}>{err}</p>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} title="Видалити з каналу всі надіслані нагадування; пост лишається" onClick={() => run('clean')}>
          {busy === 'clean' ? 'Чищення…' : 'Почистити пінги'}
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => run('sync')}>
          {busy === 'sync' ? 'Оновлення…' : 'Оновити зараз'}
        </button>
      </div>
    </div>
  );
}

export default function EventsTab() {
  const [events, setEvents] = useState<GuildEvent[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [postState, setPostState] = useState<DiscordPostState | null>(null);
  const [newName, setNewName] = useState('');
  const [newWeekdays, setNewWeekdays] = useState<number[]>([]);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [newTime, setNewTime] = useState('');
  const [newPing, setNewPing] = useState('15');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = () =>
    Promise.all([fetchEvents(), fetchActivities(), fetchDiscordPostState().catch(() => null)]).then(([e, a, p]) => {
      setEvents(e);
      setActivities(a);
      setPostState(p);
    });

  useEffect(() => {
    reload().catch((e) => setErr(errorMessage(e, 'Не вдалося завантажити.')));
  }, []);

  const activityById = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const missing = useMemo(() => activitiesWithoutEvent(activities, events), [activities, events]);
  const today = useMemo(() => eventsForToday(events), [events]);
  const todayLabel = `${WEEKDAY_LABELS_FULL[todayWeekday()]}, ${dateLabel(kyivDateString())}`;

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const ping = newPing.trim() === '' ? null : Number(newPing);
      await createEvent({
        name: newName,
        weekdays: newWeekdays,
        eventDate: newDate,
        startTime: newTime || null,
        pingMinutesBefore: ping !== null && Number.isInteger(ping) && ping >= 1 && ping <= 180 ? ping : null,
        activityId: null,
      });
      setNewName('');
      setNewWeekdays([]);
      setNewDate(null);
      setNewTime('');
      setNewPing('15');
      await reload();
    } catch (e) {
      setErr(errorMessage(e, 'Не вдалося додати евент.'));
    } finally {
      setBusy(false);
    }
  };

  const patch = (id: string, p: Parameters<typeof updateEvent>[1]) => updateEvent(id, p).then(reload).catch(reportError);

  const pullFromActivity = (e: GuildEvent) => {
    const a = e.activityId ? activityById.get(e.activityId) : undefined;
    if (!a) return;
    patch(e.id, { name: a.name, weekdays: a.weekdays });
  };

  return (
    <div className="events-admin">
      <h3>Евенти</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Що піде в щоденний пост у Discord. Нові активності з'являються тут самі; назву, дні, час і пінг можна міняти незалежно
        від «Активностей». Евент із часом і пінгом нагадує в каналі за N хв до початку. Усе за київським часом.
      </p>

      <DiscordStatus state={postState} onSynced={() => fetchDiscordPostState().then(setPostState).catch(() => undefined)} />

      <div className="card" style={{ padding: '16px 20px', marginBottom: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Сьогодні в пості — {todayLabel}</div>
        {today.length === 0 ? (
          <div className="hint">Сьогодні евентів немає.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2 }}>
            {today.map((e) => (
              <li key={e.id}>
                {e.startTime ? <b>{e.startTime}</b> : <span className="hint">без часу</span>} — {e.name}
                {e.startTime && e.pingMinutesBefore ? <span className="hint"> · пінг за {e.pingMinutesBefore} хв</span> : null}
                {e.note ? <span className="hint"> · {e.note.split('\n')[0]}{e.note.includes('\n') ? ' …' : ''}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {missing.length > 0 && (
        <div className="card" style={{ padding: '14px 20px', marginBottom: 18, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="hint">
            Активності без евента: <b>{missing.map((a) => a.name).join(', ')}</b>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => importActivities(missing).then(reload).catch(reportError)}>
            Підтягнути з активностей
          </button>
        </div>
      )}

      <AdminTable
        columns={COLUMNS}
        header={['Назва · примітка', 'Коли', 'Час · роль для пінгу', 'Пінг · тривалість', 'Увімк.', '']}
        rows={events}
        keyFn={(e) => e.id}
        emptyLabel="Евентів ще немає — додай нижче або підтягни з активностей."
        renderRow={(e) => {
          const activity = e.activityId ? activityById.get(e.activityId) : undefined;
          const diverged = divergedFromActivity(e, activity);
          const dim = { opacity: e.enabled ? 1 : 0.55 };
          return [
            <span key="name" className="cell-stack" style={dim}>
              <TextInput initial={e.name} onSave={(v) => patch(e.id, { name: v })} />
              <NoteInput initial={e.note ?? ''} onSave={(v) => patch(e.id, { note: v })} />
              {activity && <span className="hint cell-note">з активності «{activity.name}»</span>}
            </span>,
            <span key="when" className="cell-stack" style={dim}>
              <WhenPicker weekdays={e.weekdays} eventDate={e.eventDate} onChange={(p) => patch(e.id, p)} />
              {!e.eventDate && e.weekdays.length === 0 && <span className="hint cell-note">дні не вибрано — у пост не потрапить</span>}
            </span>,
            <span key="time" className="cell-stack" style={dim}>
              <TimeInput initial={e.startTime} onSave={(v) => patch(e.id, { startTime: v })} />
              <TextInput initial={e.pingRoleId ?? ''} placeholder="ID ролі (необов'язково)" allowEmpty onSave={(v) => patch(e.id, { pingRoleId: v })} />
            </span>,
            <span key="ping" className="cell-stack" style={dim}>
              <span className="inline-num hint" title="За скільки хвилин до початку пінгнути роль у каналі; порожньо = не пінгувати">
                пінг за <MinutesInput initial={e.pingMinutesBefore} min={1} max={180} onSave={(v) => patch(e.id, { pingMinutesBefore: v })} /> хв
              </span>
              <span className="inline-num hint" title="Тривалість для «Події» Discord; порожньо = 60 хв">
                триває <MinutesInput initial={e.durationMinutes} min={5} max={1440} placeholder="60" onSave={(v) => patch(e.id, { durationMinutes: v })} /> хв
              </span>
            </span>,
            <input key="on" type="checkbox" checked={e.enabled} title={e.enabled ? 'Увімкнено — потрапляє в пост' : 'Вимкнено — у пост не потрапляє'} onChange={(ev) => patch(e.id, { enabled: ev.target.checked })} style={{ accentColor: 'var(--accent)', width: 18, height: 18, cursor: 'pointer' }} />,
            <span key="actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {diverged && activity && (
                <button type="button" className="btn btn-ghost btn-sm" title={`Підтягнути назву і дні з активності «${activity.name}» (${activity.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ') || 'без днів'})`} onClick={() => pullFromActivity(e)}>
                  ↻
                </button>
              )}
              <button type="button" className="btn btn-bad btn-sm" onClick={() => confirm(`Видалити евент «${e.name}»?`) && deleteEvent(e.id).then(reload).catch(reportError)}>
                Видалити
              </button>
            </span>,
          ];
        }}
        addRow={
          <>
            <label className="field" style={{ flex: '1 1 200px' }}>
              <span>Назва</span>
              <input type="text" value={newName} placeholder="Назва евенту" onChange={(e) => setNewName(e.target.value)} />
            </label>
            <div className="field" style={{ flex: '1 1 280px' }}>
              <span>Коли</span>
              <WhenPicker
                weekdays={newWeekdays}
                eventDate={newDate}
                onChange={(p) => {
                  if (p.weekdays !== undefined) setNewWeekdays(p.weekdays);
                  if (p.eventDate !== undefined) setNewDate(p.eventDate);
                }}
              />
            </div>
            <label className="field" style={{ flex: '0 0 130px' }}>
              <span>Час</span>
              <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            </label>
            <label className="field" style={{ flex: '0 0 110px' }}>
              <span>Пінг за, хв</span>
              <input type="number" min={1} max={180} value={newPing} placeholder="—" onChange={(e) => setNewPing(e.target.value)} />
            </label>
            <button type="button" className="btn btn-primary" disabled={busy || !newName.trim()} onClick={add}>+ Додати</button>
          </>
        }
      />
      {err && <p className="form-err">{err}</p>}
    </div>
  );
}
