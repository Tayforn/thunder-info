// =========================================================
// Таб «Евенти»: що саме піде в щоденний пост у Discord. Стартово рядки
// підтягуються з «Активностей» (тригер у БД + імпорт у міграції 0005),
// але далі живуть окремо: можна правити назву/дні, додавати час початку,
// разові евенти на дату, примітку і пінг за N хв до початку.
//
// Пост веде Edge Function discord-events (крон кожні 5 хв). Тут — стан
// поста і кнопки "Оновити зараз" / "Почистити пінги", щоб не чекати крону.
//
// Верстка рядка — три лінії (не AdminTable: полів забагато для колонок):
//   1) назва + «коли» (щотижня/дата, дні);
//   2) час · пінг · тривалість · роль · увімк. · дії;
//   3) примітка на всю ширину (кілька рядків, посилання).
// =========================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, reportError } from '../../app/errorMessage';
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

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
}

/** YYYY-MM-DD → DD.MM.YYYY */
function dateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

// ---------------------------------------------------------
// Поля з локальним станом і збереженням на blur (як в інших табах).
// ---------------------------------------------------------

function TextInput({ initial, placeholder, allowEmpty, className, onSave }: { initial: string; placeholder?: string; allowEmpty?: boolean; className?: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return (
    <input
      type="text"
      className={className}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => (allowEmpty || value.trim()) && value !== initial && onSave(value)}
    />
  );
}

/** Примітка: кілька рядків, посилання тощо — textarea, що росте під вміст
 * (до ~160px, далі скрол). */
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
      placeholder="Примітка: текст, посилання, кілька рядків — у пості йде під евентом, у «Події» — як опис (необов'язково)"
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

/** "Коли": щотижня (дні тижня) або разово (дата) — в одну лінію. Дата має
 * пріоритет: перемикання на "Дата" ставить сьогоднішню, повернення на
 * "Щотижня" прибирає дату (дні тижня лишаються як були). */
function WhenPicker({ weekdays, eventDate, onChange }: { weekdays: number[]; eventDate: string | null; onChange: (patch: { weekdays?: number[]; eventDate?: string | null }) => void }) {
  const dated = eventDate !== null;
  return (
    <div className="event-when">
      <div className="event-when-mode">
        <button type="button" className={'btn btn-sm ' + (!dated ? 'btn-primary' : 'btn-ghost')} onClick={() => dated && onChange({ eventDate: null })}>
          Щотижня
        </button>
        <button type="button" className={'btn btn-sm ' + (dated ? 'btn-primary' : 'btn-ghost')} onClick={() => !dated && onChange({ eventDate: kyivDateString() })}>
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

// ---------------------------------------------------------
// Блок стану поста в Discord.
// ---------------------------------------------------------

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
    <div className="card events-card">
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

// ---------------------------------------------------------
// Рядок евента.
// ---------------------------------------------------------

type Patch = Parameters<typeof updateEvent>[1];

function EventRow({ event: e, activity, onPatch, onPull, onDelete }: { event: GuildEvent; activity: Activity | undefined; onPatch: (p: Patch) => void; onPull: () => void; onDelete: () => void }) {
  const diverged = divergedFromActivity(e, activity);
  return (
    <div className={'rowlist-row event-row' + (e.enabled ? '' : ' off')}>
      <div className="event-line">
        <TextInput className="event-name" initial={e.name} onSave={(v) => onPatch({ name: v })} />
        <WhenPicker weekdays={e.weekdays} eventDate={e.eventDate} onChange={onPatch} />
      </div>

      <div className="event-line">
        <label className="ctl" title="Час початку за Києвом; порожньо = без часу (у пості без години, без пінгу й «Події»)">
          час <TimeInput initial={e.startTime} onSave={(v) => onPatch({ startTime: v })} />
        </label>
        <label className="ctl" title="За скільки хвилин до початку пінгнути роль у каналі; порожньо = не пінгувати">
          пінг за <MinutesInput initial={e.pingMinutesBefore} min={1} max={180} onSave={(v) => onPatch({ pingMinutesBefore: v })} /> хв
        </label>
        <label className="ctl" title="Тривалість для «Події» Discord; порожньо = 60 хв">
          триває <MinutesInput initial={e.durationMinutes} min={5} max={1440} placeholder="60" onSave={(v) => onPatch({ durationMinutes: v })} /> хв
        </label>
        <label className="ctl" title="ID ролі Discord для пінгу; порожньо = роль за замовчуванням із секретів або @here">
          роль <TextInput className="ctl-role" initial={e.pingRoleId ?? ''} placeholder="ID ролі" allowEmpty onSave={(v) => onPatch({ pingRoleId: v })} />
        </label>
        <label className="ctl ctl-on" title={e.enabled ? 'Увімкнено — потрапляє в пост і «Події»' : 'Вимкнено — у пост не потрапляє'}>
          <input type="checkbox" checked={e.enabled} onChange={(ev) => onPatch({ enabled: ev.target.checked })} /> увімк.
        </label>
        <div className="event-actions">
          {activity && !diverged && <span className="hint event-src">з активності «{activity.name}»</span>}
          {diverged && activity && (
            <button type="button" className="btn btn-ghost btn-sm" title={`Підтягнути назву і дні з активності «${activity.name}» (${activity.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ') || 'без днів'})`} onClick={onPull}>
              ↻ з активності
            </button>
          )}
          <button type="button" className="btn btn-bad btn-sm" onClick={() => confirm(`Видалити евент «${e.name}»?`) && onDelete()}>
            Видалити
          </button>
        </div>
      </div>

      <NoteInput initial={e.note ?? ''} onSave={(v) => onPatch({ note: v })} />
      {!e.eventDate && e.weekdays.length === 0 && <span className="hint event-warn">Дні не вибрано — у пост не потрапить.</span>}
    </div>
  );
}

// ---------------------------------------------------------
// Таб.
// ---------------------------------------------------------

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

  const patch = (id: string, p: Patch) => updateEvent(id, p).then(reload).catch(reportError);

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

      <div className="card events-card" style={{ display: 'block' }}>
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
        <div className="card events-card">
          <div className="hint">
            Активності без евента: <b>{missing.map((a) => a.name).join(', ')}</b>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => importActivities(missing).then(reload).catch(reportError)}>
            Підтягнути з активностей
          </button>
        </div>
      )}

      <div className="rowlist">
        {events.length === 0 ? (
          <p className="rowlist-empty hint">Евентів ще немає — додай нижче або підтягни з активностей.</p>
        ) : (
          events.map((e) => (
            <EventRow
              key={e.id}
              event={e}
              activity={e.activityId ? activityById.get(e.activityId) : undefined}
              onPatch={(p) => patch(e.id, p)}
              onPull={() => pullFromActivity(e)}
              onDelete={() => deleteEvent(e.id).then(reload).catch(reportError)}
            />
          ))
        )}

        <div className="rowlist-row event-row event-add">
          <div className="event-line">
            <span className="event-add-title">Новий евент</span>
          </div>
          <div className="event-line">
            <input type="text" className="event-name" value={newName} placeholder="Назва евенту" onChange={(e) => setNewName(e.target.value)} />
            <WhenPicker
              weekdays={newWeekdays}
              eventDate={newDate}
              onChange={(p) => {
                if (p.weekdays !== undefined) setNewWeekdays(p.weekdays);
                if (p.eventDate !== undefined) setNewDate(p.eventDate);
              }}
            />
          </div>
          <div className="event-line">
            <label className="ctl">
              час <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            </label>
            <label className="ctl">
              пінг за <input type="number" min={1} max={180} value={newPing} placeholder="—" onChange={(e) => setNewPing(e.target.value)} /> хв
            </label>
            <div className="event-actions">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy || !newName.trim()} onClick={add}>+ Додати</button>
            </div>
          </div>
        </div>
      </div>
      {err && <p className="form-err">{err}</p>}
    </div>
  );
}
