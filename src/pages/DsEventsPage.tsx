// =========================================================
// /events — «ДС Евенти»: що саме піде в щоденний пост у Discord. Окрема
// сторінка (не таб адмінки), бо її відкривають і адміни з роллю 'events'
// (міграція 0008), яким решта адмінки закрита. Стартово рядки
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
import PageMeta from '../app/PageMeta';
import { errorMessage, reportError } from '../app/errorMessage';
import { supabase } from '../app/supabaseClient';
import { useAuth } from '../app/useAuth';
import AdminGate from '../components/AdminGate';
import WeekdayPicker from '../components/WeekdayPicker';
import { fetchActivities } from '../data/activities';
import {
  activitiesWithoutEvent,
  cleanDiscordPings,
  createEvent,
  deleteEvent,
  divergedFromActivity,
  eventsForToday,
  fetchDiscordPostState,
  fetchEvents,
  discordLinkExpiry,
  importActivities,
  rehostImage,
  removeEventImage,
  testDiscordPing,
  uploadEventImage,
  triggerDiscordSync,
  updateEvent,
  type DiscordPostState,
  DISCORD_FN_VERSION,
} from '../data/events';
import type { Activity, GuildEvent } from '../data/types';
import { WEEKDAY_LABELS, WEEKDAY_LABELS_FULL, kyivDateString, todayWeekday } from '../data/types';

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

/** Картинка евента: Ctrl+V (картинка з буфера або посилання), перетягнути
 * файл або вибрати. Вставлена/вибрана картинка заливається в Storage —
 * посилання постійне. Посилання на чужу картинку пробуємо перезалити до
 * себе; не вийшло — лишаємо як є (з попередженням, якщо це тимчасове
 * посилання Discord). */
function ImageField({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (job: () => Promise<string | null>) => {
    setBusy(true);
    setErr(null);
    try {
      const url = await job();
      if (url) {
        onChange(url);
        setText('');
      }
    } catch (e) {
      setErr(errorMessage(e, 'Не вдалося додати картинку.'));
    } finally {
      setBusy(false);
    }
  };
  const fromFile = (file: File | null | undefined) => file && run(() => uploadEventImage(file));
  const fromUrl = (raw: string) => {
    const url = raw.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      setErr('Встав картинку (Ctrl+V) або посилання на неї.');
      return;
    }
    run(async () => (await rehostImage(url)) ?? url);
  };

  const onPaste = (ev: React.ClipboardEvent<HTMLInputElement>) => {
    const file = Array.from(ev.clipboardData.files).find((f) => f.type.startsWith('image/'));
    ev.preventDefault();
    if (file) fromFile(file);
    else fromUrl(ev.clipboardData.getData('text'));
  };
  const onDrop = (ev: React.DragEvent) => {
    ev.preventDefault();
    const file = Array.from(ev.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) fromFile(file);
    else {
      const url = ev.dataTransfer.getData('text/uri-list') || ev.dataTransfer.getData('text');
      if (url) fromUrl(url);
    }
  };

  const expiry = value ? discordLinkExpiry(value) : null;

  return (
    <div className="event-image" onDragOver={(ev) => ev.preventDefault()} onDrop={onDrop}>
      {value ? (
        <div className="event-image-set">
          <a href={value} target="_blank" rel="noreferrer" title="Відкрити картинку">
            <img src={value} alt="" />
          </a>
          <button type="button" className="btn btn-ghost btn-sm" title="Прибрати картинку" disabled={busy} onClick={() => onChange(null)}>
            ✕
          </button>
        </div>
      ) : (
        <div className="event-image-empty">
          <input
            type="text"
            value={text}
            disabled={busy}
            placeholder={busy ? 'Завантаження…' : '🖼 Картинка: Ctrl+V'}
            title="Скопіюй картинку (у Discord: ПКМ → Копіювати зображення) і натисни тут Ctrl+V. Можна перетягнути файл або вставити посилання."
            onPaste={onPaste}
            onChange={(ev) => setText(ev.target.value)}
            onKeyDown={(ev) => ev.key === 'Enter' && text.trim() && fromUrl(text)}
            onBlur={() => text.trim() && fromUrl(text)}
          />
          <button type="button" className="btn btn-ghost btn-sm" title="Вибрати файл" disabled={busy} onClick={() => fileRef.current?.click()}>
            📁
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(ev) => { fromFile(ev.target.files?.[0]); ev.target.value = ''; }} />
        </div>
      )}
      {expiry && (
        <span className="hint event-image-warn">
          Тимчасове посилання Discord{expiry.getTime() > Date.now() ? `, спливе ${expiry.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })}` : ', вже не працює'}. Краще встав саму картинку: у Discord ПКМ → «Копіювати зображення» → тут Ctrl+V.
        </span>
      )}
      {err && <span className="form-err">{err}</span>}
    </div>
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
            (r.warnings?.length ? ` Увага: ${r.warnings.join('; ')}` : '') +
            (r.version === DISCORD_FN_VERSION ? '' : ` ⚠ На Supabase стара версія функції (${r.version ?? 'без номера'}, потрібна ${DISCORD_FN_VERSION}) — передеплой: supabase functions deploy discord-events --no-verify-jwt`),
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
  const [testing, setTesting] = useState(false);
  const target = e.pingRoleId?.trim() || 'роль за замовчуванням';
  const testPing = async () => {
    if (!confirm(`Надіслати тестовий пінг «${e.name}» у канал зараз? Пінгне: ${target}. Справжній пінг перед евентом це не зачепить.`)) return;
    setTesting(true);
    try {
      const r = await testDiscordPing(e.id);
      alert(`Тестовий пінг «${r.event}» надіслано (${r.mention}). Прибрати — «Почистити пінги».`);
    } catch (err) {
      reportError(err);
    } finally {
      setTesting(false);
    }
  };
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
        <label className="ctl" title="Кого пінгувати: ID ролі, everyone (усі, хто бачить канал) або here (лише онлайн); порожньо = значення за замовчуванням із секретів">
          роль <TextInput className="ctl-role" initial={e.pingRoleId ?? ''} placeholder="ID ролі / everyone" allowEmpty onSave={(v) => onPatch({ pingRoleId: v })} />
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
          <button type="button" className="btn btn-ghost btn-sm" disabled={testing} title="Надіслати пінг цього евента в канал зараз — перевірити роль / @everyone" onClick={testPing}>
            {testing ? '…' : 'Тест пінгу'}
          </button>
          <button type="button" className="btn btn-bad btn-sm" onClick={() => confirm(`Видалити евент «${e.name}»?`) && onDelete()}>
            Видалити
          </button>
        </div>
      </div>

      <div className="event-note-line">
        <NoteInput initial={e.note ?? ''} onSave={(v) => onPatch({ note: v })} />
        <ImageField
          value={e.imageUrl}
          onChange={(url) => {
            const old = e.imageUrl;
            onPatch({ imageUrl: url });
            if (old && old !== url) removeEventImage(old);
          }}
        />
      </div>
      {!e.eventDate && e.weekdays.length === 0 && <span className="hint event-warn">Дні не вибрано — у пост не потрапить.</span>}
    </div>
  );
}

// ---------------------------------------------------------
// Панель (після AdminGate).
// ---------------------------------------------------------

function EventsPanel() {
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
                {e.imageUrl ? <span className="hint"> · 🖼</span> : null}
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

      <div className="event-list">
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
              onDelete={() => deleteEvent(e.id).then(() => removeEventImage(e.imageUrl)).then(reload).catch(reportError)}
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

export default function DsEventsPage() {
  const { session } = useAuth();
  return (
    <div>
      <PageMeta title="ДС Евенти — Thunder" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="section-head">
        <div>
          <span className="eyebrow">Discord</span>
          <h2>ДС Евенти</h2>
        </div>
        {session && <button type="button" className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Вийти</button>}
      </div>
      <AdminGate allow="events">{() => <EventsPanel />}</AdminGate>
    </div>
  );
}
