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
// Картка евента — панель: смужка (назва + «коли» + увімк.), тіло (час ·
// пінг · тривалість · роль; примітка + картинка), підвал (джерело, дії).
// =========================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import PageMeta from '../app/PageMeta';
import { errorMessage, reportError } from '../app/errorMessage';
import { supabase } from '../app/supabaseClient';
import { useAuth } from '../app/useAuth';
import AdminGate from '../components/AdminGate';
import { IcoCal, IcoDiscord, IcoImage, IcoPlus, IcoRefresh, IcoTrash } from '../components/Icons';
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
          <button type="button" className="btn btn-ghost btn-xs btn-ico" title="Прибрати картинку" disabled={busy} onClick={() => onChange(null)}>
            ✕
          </button>
        </div>
      ) : (
        <div className="event-image-empty">
          <input
            type="text"
            value={text}
            disabled={busy}
            placeholder={busy ? 'Завантаження…' : 'Картинка: Ctrl+V або посилання'}
            title="Скопіюй картинку (у Discord: ПКМ → Копіювати зображення) і натисни тут Ctrl+V. Можна перетягнути файл або вставити посилання."
            onPaste={onPaste}
            onChange={(ev) => setText(ev.target.value)}
            onKeyDown={(ev) => ev.key === 'Enter' && text.trim() && fromUrl(text)}
            onBlur={() => text.trim() && fromUrl(text)}
          />
          <button type="button" className="btn btn-ghost btn-sm btn-ico" style={{ width: 36, height: 36 }} title="Вибрати файл" disabled={busy} onClick={() => fileRef.current?.click()}>
            <IcoImage />
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(ev) => { fromFile(ev.target.files?.[0]); ev.target.value = ''; }} />
        </div>
      )}
      {expiry && (
        <span className="hint warn-text">
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
      <div className="seg seg-sm" role="group" aria-label="Коли">
        <button type="button" className={!dated ? 'is-on' : ''} onClick={() => dated && onChange({ eventDate: null })}>Щотижня</button>
        <button type="button" className={dated ? 'is-on' : ''} onClick={() => !dated && onChange({ eventDate: kyivDateString() })}>Дата</button>
      </div>
      {dated ? (
        <input type="date" className="input input-sm" value={eventDate ?? ''} onChange={(e) => e.target.value && onChange({ eventDate: e.target.value })} />
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
    <div className="panel">
      <div className="panel-head">
        <h3><IcoDiscord /> Пост у Discord</h3>
        {state ? <span className="badge good"><span className="dot live" /> працює</span> : <span className="badge warn">ще не створений</span>}
        <span className="panel-sub">крон перевіряє кожні 5 хв</span>
      </div>
      <div className="panel-body tight" style={{ flex: '1 1 auto' }}>
        {state ? (
          <dl className="kv">
            <dt>Показує</dt>
            <dd>{dateLabel(state.postDate)}</dd>
            <dt>Останні зміни</dt>
            <dd>{when(state.updatedAt)}</dd>
          </dl>
        ) : (
          <span className="hint">Натисни «Оновити зараз» або дочекайся крону (див. supabase/DISCORD.md).</span>
        )}
        {result && <div className="hint good-text" style={{ marginTop: 6 }}>{result}</div>}
        {err && <p className="form-err" style={{ marginTop: 6 }}>{err}</p>}
      </div>
      <div className="panel-foot" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} title="Видалити з каналу всі надіслані нагадування; пост лишається" onClick={() => run('clean')}>
          {busy === 'clean' ? 'Чищення…' : 'Почистити пінги'}
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => run('sync')}>
          <IcoRefresh /> {busy === 'sync' ? 'Оновлення…' : 'Оновити зараз'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Картка евента.
// ---------------------------------------------------------

type Patch = Parameters<typeof updateEvent>[1];

function EventCard({ event: e, activity, onPatch, onPull, onDelete }: { event: GuildEvent; activity: Activity | undefined; onPatch: (p: Patch) => void; onPull: () => void; onDelete: () => void }) {
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
  const noDays = !e.eventDate && e.weekdays.length === 0;

  return (
    <div className={'panel event' + (e.enabled ? '' : ' off')}>
      <div className="panel-head">
        <TextInput className="event-name" initial={e.name} onSave={(v) => onPatch({ name: v })} />
        <WhenPicker weekdays={e.weekdays} eventDate={e.eventDate} onChange={onPatch} />
        <div className="panel-actions">
          <label className="switch" title={e.enabled ? 'Увімкнено — потрапляє в пост і «Події»' : 'Вимкнено — у пост не потрапляє'}>
            <input type="checkbox" checked={e.enabled} onChange={(ev) => onPatch({ enabled: ev.target.checked })} />
            <span className="switch-track" />
            <span>{e.enabled ? 'увімк.' : 'вимк.'}</span>
          </label>
        </div>
      </div>

      <div className="panel-body stack sm">
        <div className="event-ctl">
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
      </div>

      <div className="panel-foot event-foot">
        {noDays && <span className="badge warn">дні не вибрано — у пост не потрапить</span>}
        {activity && !diverged && <span className="hint">з активності «{activity.name}»</span>}
        {diverged && activity && (
          <button type="button" className="btn btn-ghost btn-xs" title={`Підтягнути назву і дні з активності «${activity.name}» (${activity.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ') || 'без днів'})`} onClick={onPull}>
            <IcoRefresh /> з активності
          </button>
        )}
        <div className="event-actions">
          <button type="button" className="btn btn-ghost btn-xs" disabled={testing} title="Надіслати пінг цього евента в канал зараз — перевірити роль / @everyone" onClick={testPing}>
            {testing ? '…' : 'Тест пінгу'}
          </button>
          <button type="button" className="btn btn-bad btn-xs" onClick={() => confirm(`Видалити евент «${e.name}»?`) && onDelete()}>
            <IcoTrash /> Видалити
          </button>
        </div>
      </div>
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

  const enabledCount = events.filter((e) => e.enabled).length;

  return (
    <div className="stack">
      <div className="split two">
        <DiscordStatus state={postState} onSynced={() => fetchDiscordPostState().then(setPostState).catch(() => undefined)} />

        <div className="panel">
          <div className="panel-head">
            <h3><IcoCal /> Сьогодні в пості</h3>
            <span className="panel-sub">{todayLabel}</span>
            {today.length > 0 && <span className="badge accent">{today.length}</span>}
          </div>
          <div className="panel-body tight">
            {today.length === 0 ? (
              <span className="hint">Сьогодні евентів немає.</span>
            ) : (
              <div className="timeline">
                {today.map((e) => (
                  <div key={e.id} className="timeline-item">
                    {e.startTime ? <span className="timeline-time">{e.startTime}</span> : <span className="timeline-time mute">без часу</span>}
                    <div className="timeline-body">
                      <b>{e.name}</b>
                      <div className="timeline-meta">
                        {e.startTime && e.pingMinutesBefore ? <span>пінг за {e.pingMinutesBefore} хв</span> : null}
                        {e.note ? <span>{e.note.split('\n')[0]}{e.note.includes('\n') ? ' …' : ''}</span> : null}
                        {e.imageUrl ? <span><IcoImage style={{ width: 12, height: 12, verticalAlign: '-2px' }} /> картинка</span> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="notice warn">
          <span className="grow">
            Активності без евента: <b>{missing.map((a) => a.name).join(', ')}</b>
          </span>
          <div className="notice-acts">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => importActivities(missing).then(reload).catch(reportError)}>
              <IcoPlus /> Підтягнути з активностей
            </button>
          </div>
        </div>
      )}

      <div className="section-head row">
        <div>
          <span className="eyebrow">Евенти</span>
          <h2>Розклад</h2>
        </div>
        <span className="hint">увімкнено {enabledCount} з {events.length} · усе за київським часом</span>
      </div>

      {events.length === 0 ? (
        <div className="empty">
          <IcoCal />
          <b>Евентів ще немає</b>
          <span>Додай нижче або підтягни з активностей.</span>
        </div>
      ) : (
        events.map((e) => (
          <EventCard
            key={e.id}
            event={e}
            activity={e.activityId ? activityById.get(e.activityId) : undefined}
            onPatch={(p) => patch(e.id, p)}
            onPull={() => pullFromActivity(e)}
            onDelete={() => deleteEvent(e.id).then(() => removeEventImage(e.imageUrl)).then(reload).catch(reportError)}
          />
        ))
      )}

      <div className="panel dashed event">
        <div className="panel-head">
          <h3><IcoPlus /> Новий евент</h3>
        </div>
        <div className="panel-body stack sm">
          <div className="row">
            <input type="text" className="event-name" style={{ borderColor: 'var(--line-2)' }} value={newName} placeholder="Назва евенту" onChange={(e) => setNewName(e.target.value)} />
            <WhenPicker
              weekdays={newWeekdays}
              eventDate={newDate}
              onChange={(p) => {
                if (p.weekdays !== undefined) setNewWeekdays(p.weekdays);
                if (p.eventDate !== undefined) setNewDate(p.eventDate);
              }}
            />
          </div>
          <div className="event-ctl">
            <label className="ctl">
              час <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            </label>
            <label className="ctl">
              пінг за <input type="number" min={1} max={180} value={newPing} placeholder="—" onChange={(e) => setNewPing(e.target.value)} /> хв
            </label>
            <button type="button" className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} disabled={busy || !newName.trim()} onClick={add}><IcoPlus /> Додати</button>
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
    <div className="page">
      <PageMeta title="ДС Евенти — Thunder" />
      <div className="page-head">
        <div className="page-head-text">
          <span className="eyebrow">Discord</span>
          <h1>ДС Евенти</h1>
          <p>
            Що піде в щоденний пост у Discord. Нові активності з'являються тут самі; назву, дні, час і пінг можна міняти
            незалежно від «Активностей». Евент із часом і пінгом нагадує в каналі за N хв до початку.
          </p>
        </div>
        {session && (
          <div className="page-head-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut()}>Вийти</button>
          </div>
        )}
      </div>
      <AdminGate allow="events">{() => <EventsPanel />}</AdminGate>
    </div>
  );
}
