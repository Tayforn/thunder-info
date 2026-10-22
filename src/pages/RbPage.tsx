// =========================================================
// /rb — адмінська сторінка розподілу людей по контрольованих РБ.
//
// Хто онлайн — сума трьох джерел, усі одночасно:
//  * Discord: пост «Збір на РБ» з реакціями-класами (емодзі кожного класу —
//    Адмінка → Приоритетність класів), сторінка читає, хто натиснув (Edge
//    Function discord-events, бот). Нік — з Discord, клас — з емодзі.
//    Зайвих можна зняти, когось без реакції — дописати ніком у колонку.
//  * Ростер: вибір класів (за замовчуванням Танк/Сікер/Сін) і чеклист
//    персонажів з таблиці players — для тих, хто в грі, але не реагував.
//    Нік, що вже прийшов з Discord (той самий клас-роль), не дублюється.
// Далі: чеклист босів (статичний список, узгоджений з
// calc.thunderpw.fun/rb — data/raidBosses.ts), «Розподілити» — на кожного
// відміченого боса по черзі 1 Сін + 1 Танк/Сікер (хто не влігся — в
// «Резерві»), селекти для ручних правок (лише своя роль, без уже
// зайнятих), «Скинути» на рядок, і чистий текстовий блок-прев'ю, який
// копіюють як картинку (html-to-image) у Діскорд.
//
// Стан сторінки — лише в пам'яті вкладки; у Supabase пише лише функція
// (який пост збору зараз активний).
// =========================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toBlob, toPng } from 'html-to-image';
import PageMeta from '../app/PageMeta';
import { errorMessage } from '../app/errorMessage';
import AdminGate from '../components/AdminGate';
import ClassBadge from '../components/ClassBadge';
import { sortByClass } from '../components/ClassFilter';
import { IcoCheck, IcoCopy, IcoDiscord, IcoDownload, IcoImage, IcoMegaphone, IcoRefresh, IcoSettings, IcoShuffle, IcoTarget, IcoTrash, IcoUsers } from '../components/Icons';
import { fetchClasses } from '../data/classes';
import { DISCORD_FN_VERSION } from '../data/events';
import { fetchPlayers } from '../data/players';
import { RAID_BOSSES } from '../data/raidBosses';
import {
  RB_DEFAULT_TEXT, createRbPoll, deleteRbPoll, fetchRbReactions, fetchRbSettings, saveRbSettings,
  type RbReactionsResult, type RbSettings,
} from '../data/rbPoll';
import type { ClassRow, Player } from '../data/types';

type Kind = 'sin' | 'tank' | 'seeker' | 'other';

interface Person {
  id: string;
  nickname: string;
  kind: Kind;
}

interface Slot {
  sinId: string | null;
  guardId: string | null;
}

interface Group {
  key: string;
  title: ReactNode;
  people: Person[];
}

const DEFAULT_CLASS_NAMES = ['танк', 'сікер', 'сін'];
const norm = (s: string) => s.trim().toLowerCase();

// «Страж» — розмовна назва Сікера в гільдії.
function kindOf(className: string): Kind {
  const n = norm(className);
  if (n === 'сін') return 'sin';
  if (n === 'танк') return 'tank';
  if (n === 'сікер' || n === 'страж') return 'seeker';
  return 'other';
}
const isSin = (p: Person) => p.kind === 'sin';
const isGuard = (p: Person) => p.kind === 'tank' || p.kind === 'seeker';
// Роль у розподілі: танк і сікер взаємозамінні, тож «той самий» персонаж —
// той самий нік у тій самій ролі (у людини можуть бути твіни різних класів).
const roleOf = (k: Kind) => (k === 'tank' || k === 'seeker' ? 'guard' : k);
const dupKey = (p: Person) => `${roleOf(p.kind)}|${norm(p.nickname)}`;

function toggleIn(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function kyivTime(iso: string | Date): string {
  return new Date(iso).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function AddPersonInput({ onAdd }: { onAdd: (nick: string) => void }) {
  const [value, setValue] = useState('');
  const commit = () => {
    const n = value.trim();
    if (!n) return;
    onAdd(n);
    setValue('');
  };
  return (
    <input
      type="text"
      className="input input-sm rb-add"
      value={value}
      placeholder="+ дописати нік"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

type PingMode = 'default' | 'everyone' | 'here' | 'none' | 'role';

function pingMode(ping: string): PingMode {
  const p = ping.trim().toLowerCase().replace(/^@/, '');
  if (!p) return 'default';
  if (p === 'everyone' || p === 'here' || p === 'none') return p;
  return 'role';
}

/** Текст поста збору й пінг — зберігаються в БД (discord_rb_settings),
 * функція читає їх при створенні поста. */
function PostSettings({ initial, onSaved }: { initial: RbSettings; onSaved: (s: RbSettings) => void }) {
  const [text, setText] = useState(initial.postText);
  const [mode, setMode] = useState<PingMode>(() => pingMode(initial.ping));
  const [roleId, setRoleId] = useState(() => (pingMode(initial.ping) === 'role' ? initial.ping : ''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const ping = mode === 'default' ? '' : mode === 'role' ? roleId.trim() : mode;
  const dirty = text !== initial.postText || ping !== initial.ping;

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const s = { postText: text, ping };
      await saveRbSettings(s);
      onSaved(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(errorMessage(e, 'Не вдалося зберегти налаштування поста.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack sm" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <div className="field-row" style={{ alignItems: 'flex-start' }}>
        <label className="field" style={{ flex: '2 1 320px' }}>
          <span>Текст поста збору</span>
          <textarea rows={4} value={text} placeholder={RB_DEFAULT_TEXT} onChange={(e) => setText(e.target.value)} />
          <small className="hint">
            Порожньо — стандартний текст. <code>{'{date}'}</code> — день тижня й дата, <code>{'{classes}'}</code> — емодзі класів (без нього легенда
            додається в кінець). Працює markdown Discord.
          </small>
        </label>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <span>Пінг</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as PingMode)}>
            <option value="default">Роль за замовчуванням</option>
            <option value="everyone">@everyone</option>
            <option value="here">@here</option>
            <option value="role">Інша роль (ID)</option>
            <option value="none">Без пінгу</option>
          </select>
          {mode === 'role' && <input type="text" className="input-mono" value={roleId} placeholder="ID ролі" onChange={(e) => setRoleId(e.target.value)} />}
        </div>
      </div>
      {err && <p className="form-err">{err}</p>}
      <div className="row">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !dirty || (mode === 'role' && !/^\d{5,25}$/.test(roleId.trim()))} onClick={save}>
          {busy ? 'Збереження…' : saved ? 'Збережено ✓' : 'Зберегти'}
        </button>
        <span className="hint">Застосується до наступного поста збору. Для @everyone вебхук має мати право «Згадувати @everyone, @here і всі ролі».</span>
      </div>
    </div>
  );
}

function OnlineColumns({ groups, isOn, onToggle, onAdd, lockedNote }: {
  groups: Group[];
  isOn: (p: Person) => boolean;
  onToggle: (p: Person) => void;
  onAdd?: (groupKey: string, nick: string) => void;
  /** Текст — людина вже в пулі з іншого джерела: показуємо відміченою й неклікабельною. */
  lockedNote?: (p: Person) => string | null;
}) {
  return (
    <div className="rb-online">
      {groups.map((g) => (
        <div key={g.key} className="rb-online-group">
          <div className="rb-online-head">
            {g.title}
            <span className="badge mute">{g.people.filter(isOn).length} / {g.people.length}</span>
          </div>
          {g.people.length === 0 && <p className="hint" style={{ margin: '4px 0' }}>Нікого.</p>}
          {g.people.map((p) => {
            const locked = lockedNote?.(p) ?? null;
            const on = locked !== null || isOn(p);
            return (
              <button
                key={p.id}
                type="button"
                className={'cal-act' + (on ? ' on' : '') + (locked ? ' is-locked' : '')}
                role="checkbox"
                aria-checked={on}
                disabled={locked !== null}
                title={locked ?? undefined}
                onClick={() => onToggle(p)}
              >
                <span className={'check' + (on ? ' is-on' : '')} aria-hidden="true"><IcoCheck /></span>
                <span>{p.nickname}</span>
                {locked && <small className="hint" style={{ marginLeft: 'auto' }}>{locked}</small>}
              </button>
            );
          })}
          {onAdd && <AddPersonInput onAdd={(n) => onAdd(g.key, n)} />}
        </div>
      ))}
    </div>
  );
}

const SLOT_COLS = 'minmax(110px, 1fr) minmax(150px, 1fr) minmax(150px, 1fr) 100px';

function RbManager() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [imageErr, setImageErr] = useState<string | null>(null);

  // Ростер.
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const defaultsApplied = useRef(false);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [rosterOpen, setRosterOpen] = useState(true);

  // Discord.
  const [reactions, setReactions] = useState<RbReactionsResult | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState<'post' | 'fetch' | 'delete' | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [extras, setExtras] = useState<{ groupKey: string; person: Person }[]>([]);
  const [settings, setSettings] = useState<RbSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [selectedBossIds, setSelectedBossIds] = useState<Set<string>>(
    () => new Set(RAID_BOSSES.filter((b) => b.defaultOn).map((b) => b.id)),
  );
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([fetchClasses(), fetchPlayers()])
      .then(([c, p]) => {
        setClasses(c);
        setPlayers(p);
        if (!defaultsApplied.current) {
          defaultsApplied.current = true;
          setSelectedClassIds(new Set(c.filter((x) => DEFAULT_CLASS_NAMES.includes(norm(x.name))).map((x) => x.id)));
        }
      })
      .catch((e) => setLoadErr(errorMessage(e, 'Не вдалося завантажити дані.')))
      .finally(() => setLoading(false));
  }, []);

  const loadReactions = useCallback(async () => {
    setBusy('fetch');
    setActionErr(null);
    try {
      const r = await fetchRbReactions();
      if (!r.groups) {
        throw new Error(`На Supabase стара версія функції discord-events (потрібна ${DISCORD_FN_VERSION}) — передеплой: supabase functions deploy discord-events --no-verify-jwt`);
      }
      setReactions(r);
      setFetchedAt(new Date());
      if (r.warnings.length) setActionErr(r.warnings.join(' '));
    } catch (e) {
      setActionErr(errorMessage(e, 'Не вдалося прочитати реакції з Discord.'));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    loadReactions();
  }, [loadReactions]);

  useEffect(() => {
    if (settings) return;
    fetchRbSettings()
      .then(setSettings)
      .catch((e) => setActionErr(errorMessage(e, 'Не вдалося прочитати налаштування поста (міграція 0010 виконана?).')));
  }, [settings]);

  const postPoll = async () => {
    if (!confirm('Створити новий пост збору в Discord? Попередній пост збору буде прибрано, реакції почнуться з нуля.')) return;
    setBusy('post');
    setActionErr(null);
    try {
      const r = await createRbPoll();
      setSlots({});
      setExcludedIds(new Set());
      setExtras([]);
      await loadReactions();
      // loadReactions скидає помилку на старті — попередження поста додаємо після нього.
      if (r.warnings.length) setActionErr((prev) => [r.warnings.join(' '), prev].filter(Boolean).join(' '));
    } catch (e) {
      setActionErr(errorMessage(e, 'Не вдалося створити пост збору.'));
      setBusy(null);
    }
  };

  const removePoll = async () => {
    if (!confirm('Прибрати пост збору з Discord? Реакції під ним пропадуть.')) return;
    setBusy('delete');
    setActionErr(null);
    try {
      await deleteRbPoll();
      setSlots({});
      setExcludedIds(new Set());
      setExtras([]);
      await loadReactions();
    } catch (e) {
      setActionErr(errorMessage(e, 'Не вдалося прибрати пост збору.'));
      setBusy(null);
    }
  };

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  // --- Ростер ---
  const candidates = useMemo(
    () => sortByClass(players.filter((p) => p.classId && selectedClassIds.has(p.classId)), classById),
    [players, selectedClassIds, classById],
  );
  const rosterGroups = useMemo<Group[]>(
    () =>
      classes
        .filter((c) => selectedClassIds.has(c.id))
        .map((c) => ({
          key: c.id,
          title: <ClassBadge cls={c} />,
          people: candidates.filter((p) => p.classId === c.id).map((p) => ({ id: p.id, nickname: p.nickname, kind: kindOf(c.name) })),
        }))
        .filter((g) => g.people.length > 0),
    [classes, selectedClassIds, candidates],
  );

  // --- Discord ---
  const discordGroups = useMemo<Group[]>(() => {
    if (!reactions?.poll) return [];
    return reactions.groups.map((g) => {
      const kind = kindOf(g.className);
      const people: Person[] = g.people.map((u) => ({ id: `${g.classId}:${u.id}`, nickname: u.name, kind }));
      extras.filter((x) => x.groupKey === g.classId).forEach((x) => people.push(x.person));
      return { key: g.classId, title: <span className="badge">{g.className}</span>, people };
    });
  }, [reactions, extras]);
  const discordPeople = useMemo(() => discordGroups.flatMap((g) => g.people).filter((p) => !excludedIds.has(p.id)), [discordGroups, excludedIds]);

  const addExtra = (groupKey: string, nick: string) => {
    const g = reactions?.groups.find((x) => x.classId === groupKey);
    if (!g) return;
    setExtras((prev) => [...prev, { groupKey, person: { id: `x:${groupKey}:${Date.now()}`, nickname: nick, kind: kindOf(g.className) } }]);
  };

  // Ростер лише доповнює Discord: нік, що вже прийшов звідти в тій самій
  // ролі, з ростера не додаємо (інакше одна людина стоїть у пулі двічі).
  const discordKeys = useMemo(() => new Set(discordPeople.map(dupKey)), [discordPeople]);
  const rosterLocked = (p: Person) => (discordKeys.has(dupKey(p)) ? 'вже з Діскорду' : null);
  const rosterPeople = useMemo(
    () => rosterGroups.flatMap((g) => g.people).filter((p) => onlineIds.has(p.id) && !discordKeys.has(dupKey(p))),
    [rosterGroups, onlineIds, discordKeys],
  );

  const people = useMemo(() => [...discordPeople, ...rosterPeople], [discordPeople, rosterPeople]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  // Зняли людину з «онлайн» — прибираємо її зі слотів.
  useEffect(() => {
    setSlots((prev) => {
      let changed = false;
      const next: Record<string, Slot> = {};
      for (const [bossId, s] of Object.entries(prev)) {
        const sinId = s.sinId && peopleById.has(s.sinId) ? s.sinId : null;
        const guardId = s.guardId && peopleById.has(s.guardId) ? s.guardId : null;
        if (sinId !== s.sinId || guardId !== s.guardId) changed = true;
        next[bossId] = { sinId, guardId };
      }
      return changed ? next : prev;
    });
  }, [peopleById]);

  const selectedBosses = useMemo(() => RAID_BOSSES.filter((b) => selectedBossIds.has(b.id)), [selectedBossIds]);
  const sinPool = people.filter(isSin);
  const guardPool = people.filter(isGuard);

  const distribute = () => {
    const next: Record<string, Slot> = {};
    selectedBosses.forEach((b, i) => {
      next[b.id] = { sinId: sinPool[i]?.id ?? null, guardId: guardPool[i]?.id ?? null };
    });
    setSlots(next);
  };

  const setSlot = (bossId: string, key: keyof Slot, personId: string) =>
    setSlots((prev) => ({
      ...prev,
      [bossId]: { sinId: prev[bossId]?.sinId ?? null, guardId: prev[bossId]?.guardId ?? null, [key]: personId || null },
    }));
  const resetSlot = (bossId: string) => setSlots((prev) => ({ ...prev, [bossId]: { sinId: null, guardId: null } }));

  const assignedIds = useMemo(() => {
    const ids = new Set<string>();
    selectedBosses.forEach((b) => {
      const s = slots[b.id];
      if (s?.sinId) ids.add(s.sinId);
      if (s?.guardId) ids.add(s.guardId);
    });
    return ids;
  }, [slots, selectedBosses]);
  const reserve = people.filter((p) => !assignedIds.has(p.id));

  // Варіанти для селекта: лише своя роль, без тих, хто вже стоїть на іншому
  // слоті (поточне значення лишаємо, інакше селект «втратить» вибір).
  const optionsFor = (pool: Person[], current: string | null) => pool.filter((p) => p.id === current || !assignedIds.has(p.id));
  const nicknameOf = (id: string | null) => (id ? peopleById.get(id)?.nickname ?? '—' : '—');

  const bgColor = () => getComputedStyle(document.body).backgroundColor || '#111';

  const copyImage = async () => {
    if (!printRef.current) return;
    setImageErr(null);
    try {
      const blob = await toBlob(printRef.current, { pixelRatio: 2, backgroundColor: bgColor() });
      if (!blob) throw new Error('Не вдалося згенерувати картинку.');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setImageErr(errorMessage(e, 'Не вдалося скопіювати картинку — спробуй «PNG».'));
    }
  };

  const downloadImage = async () => {
    if (!printRef.current) return;
    setImageErr(null);
    try {
      const url = await toPng(printRef.current, { pixelRatio: 2, backgroundColor: bgColor() });
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rb-rozpodil.png';
      a.click();
    } catch (e) {
      setImageErr(errorMessage(e, 'Не вдалося зберегти картинку.'));
    }
  };

  if (loading) return <p className="loading"><span className="spinner" /> Завантаження…</p>;
  if (loadErr) return <p className="form-err">{loadErr}</p>;

  const poll = reactions?.poll ?? null;
  const filled = selectedBosses.filter((b) => slots[b.id]?.sinId || slots[b.id]?.guardId).length;

  return (
    <div className="stack">
      <div className="toolbar">
        <span className="toolbar-label">Хто онлайн:</span>
        <span className="hint">
          усього {people.length} (з Діскорду {discordPeople.length} · з ростера {rosterPeople.length}) · сінів {sinPool.length} · танків/сікерів {guardPool.length}
        </span>
      </div>

      <div className="panel">
          <div className="panel-head">
            <h3><IcoDiscord /> Хто онлайн — з Діскорду</h3>
            {poll ? <span className="badge good"><span className="dot live" /> пост є</span> : <span className="badge mute">поста немає</span>}
            <span className="panel-sub">
              {poll ? (
                <>Пост від {kyivTime(poll.postedAt)}{fetchedAt && <> · реакції станом на {kyivTime(fetchedAt)}</>}</>
              ) : reactions ? (
                'створи пост — люди відмітяться реакціями'
              ) : busy === 'fetch' ? (
                'читаю реакції…'
              ) : (
                'реакції не прочитано — див. помилку нижче'
              )}
            </span>
            {poll && (
              <div className="panel-actions">
                <a className="btn btn-quiet btn-xs" href={poll.url} target="_blank" rel="noreferrer">відкрити в Discord →</a>
              </div>
            )}
          </div>
          <div className="panel-body stack">
            <div className="row">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={postPoll}>
                <IcoMegaphone /> {busy === 'post' ? 'Створення…' : 'Створити пост збору'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={loadReactions}>
                <IcoRefresh /> {busy === 'fetch' ? 'Читання…' : 'Підтягнути реакції'}
              </button>
              <button type="button" className={'btn btn-ghost btn-sm' + (settingsOpen ? ' is-on' : '')} aria-pressed={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}>
                <IcoSettings /> Текст і пінг
              </button>
              {poll && (
                <button type="button" className="btn btn-bad btn-sm" disabled={busy !== null} onClick={removePoll}>
                  <IcoTrash /> {busy === 'delete' ? 'Прибираю…' : 'Прибрати пост'}
                </button>
              )}
            </div>
            {actionErr && <p className="form-err">{actionErr}</p>}
            {settingsOpen && (settings ? <PostSettings initial={settings} onSaved={setSettings} /> : <p className="loading"><span className="spinner" /> Читаю налаштування…</p>)}
            {poll && discordGroups.length === 0 && <p className="hint">Жодному класу не задано емодзі — Адмінка → Приоритетність класів.</p>}
            {poll && discordGroups.length > 0 && (
              <OnlineColumns
                groups={discordGroups}
                isOn={(p) => !excludedIds.has(p.id)}
                onToggle={(p) => setExcludedIds((prev) => toggleIn(prev, p.id))}
                onAdd={addExtra}
              />
            )}
          </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3><IcoUsers /> Додати з ростера</h3>
          {rosterPeople.length > 0 && <span className="badge good">+{rosterPeople.length}</span>}
          <span className="panel-sub">хто в грі, але без реакції — додаються до тих, хто з Діскорду</span>
          <div className="panel-actions">
            <button type="button" className="btn btn-quiet btn-xs" aria-expanded={rosterOpen} onClick={() => setRosterOpen((v) => !v)}>
              {rosterOpen ? 'згорнути' : 'розгорнути'}
            </button>
          </div>
        </div>
        {rosterOpen && (
          <>
            <div className="panel-body tight" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="chips">
                {classes.length === 0 && <span className="hint">Спершу додай класи в Адмінці.</span>}
                {classes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={'chip' + (selectedClassIds.has(c.id) ? ' is-on' : '')}
                    aria-pressed={selectedClassIds.has(c.id)}
                    onClick={() => setSelectedClassIds((prev) => toggleIn(prev, c.id))}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="panel-body">
              {rosterGroups.length === 0 ? (
                <p className="hint">Нема персонажів вибраних класів — зміни вибір вище або додай гравців у «Гравці» / Адмінці.</p>
              ) : (
                <OnlineColumns
                  groups={rosterGroups}
                  isOn={(p) => onlineIds.has(p.id)}
                  onToggle={(p) => setOnlineIds((prev) => toggleIn(prev, p.id))}
                  lockedNote={rosterLocked}
                />
              )}
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3><IcoTarget /> Боси під контроль</h3>
          <span className="badge mute">{selectedBosses.length} з {RAID_BOSSES.length}</span>
          <div className="panel-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={selectedBosses.length === 0 || people.length === 0} onClick={distribute}>
              <IcoShuffle /> Розподілити
            </button>
          </div>
        </div>
        <div className="panel-body">
          <div className="chips">
            {RAID_BOSSES.map((b) => (
              <button
                key={b.id}
                type="button"
                className={'chip' + (selectedBossIds.has(b.id) ? ' is-on' : '')}
                aria-pressed={selectedBossIds.has(b.id)}
                title={b.name}
                onClick={() => setSelectedBossIds((prev) => toggleIn(prev, b.id))}
              >
                {b.nick}
              </button>
            ))}
          </div>
        </div>
        <div className="panel-foot">На боса: 1 Сін + 1 Танк/Сікер по черзі з відмічених онлайн; хто не влігся — в «Резерві».</div>
      </div>

      {selectedBosses.length > 0 && (
        <div className="split main-side">
          <div className="panel">
            <div className="panel-head">
              <h3><IcoShuffle /> Розподіл</h3>
              <span className="badge mute">{filled} з {selectedBosses.length}</span>
              <span className="panel-sub">можна поправити вручну</span>
            </div>
            <div className="panel-body flush">
              <div className="rowlist">
                <div className="rowlist-head" style={{ gridTemplateColumns: SLOT_COLS }}>
                  <span>Бос</span>
                  <span>Сін</span>
                  <span>Танк/Сікер</span>
                  <span></span>
                </div>
                {selectedBosses.map((b) => {
                  const slot = slots[b.id];
                  const sinId = slot?.sinId ?? null;
                  const guardId = slot?.guardId ?? null;
                  return (
                    <div key={b.id} className="rowlist-row" style={{ gridTemplateColumns: SLOT_COLS }}>
                      <span title={b.name} className="cell-nick"><b>{b.nick}</b></span>
                      <span>
                        <select value={sinId ?? ''} onChange={(e) => setSlot(b.id, 'sinId', e.target.value)}>
                          <option value="">—</option>
                          {optionsFor(sinPool, sinId).map((p) => (
                            <option key={p.id} value={p.id}>{p.nickname}</option>
                          ))}
                        </select>
                      </span>
                      <span>
                        <select value={guardId ?? ''} onChange={(e) => setSlot(b.id, 'guardId', e.target.value)}>
                          <option value="">—</option>
                          {optionsFor(guardPool, guardId).map((p) => (
                            <option key={p.id} value={p.id}>{p.nickname}</option>
                          ))}
                        </select>
                      </span>
                      <span className="cell-actions">
                        <button type="button" className="btn btn-quiet btn-xs" disabled={!sinId && !guardId} onClick={() => resetSlot(b.id)}>
                          Скинути
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {reserve.length > 0 && (
              <div className="panel-foot">
                <span>Резерв (онлайн, але без боса):</span>
                <span className="chips">
                  {reserve.map((p) => <span key={p.id} className="chip static" style={{ height: 24, fontSize: 12 }}>{p.nickname}</span>)}
                </span>
              </div>
            )}
          </div>

          <div className="panel sticky">
            <div className="panel-head">
              <h3><IcoImage /> Картинка для гільдії</h3>
              <div className="panel-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={copyImage}>
                  <IcoCopy /> {copied ? 'Скопійовано ✓' : 'Копіювати'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" title="Завантажити PNG" onClick={downloadImage}><IcoDownload /> PNG</button>
              </div>
            </div>
            <div className="panel-body">
              {imageErr && <p className="form-err" style={{ marginBottom: 10 }}>{imageErr}</p>}
              <div ref={printRef} className="rb-print">
                <div className="rb-print-head">
                  <span className="eyebrow">Thunder</span>
                  <h3>Розподіл по РБ</h3>
                </div>
                <div className="rb-print-table">
                  <div className="rb-print-row rb-print-row-head">
                    <span>Бос</span>
                    <span>Сін</span>
                    <span>Танк/Сікер</span>
                  </div>
                  {selectedBosses.map((b) => {
                    const slot = slots[b.id];
                    return (
                      <div key={b.id} className="rb-print-row">
                        <span className="rb-print-boss">{b.nick}</span>
                        <span>{nicknameOf(slot?.sinId ?? null)}</span>
                        <span>{nicknameOf(slot?.guardId ?? null)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RbPage() {
  return (
    <div className="page">
      <PageMeta title="РБ — Thunder" />
      <div className="page-head">
        <div className="page-head-text">
          <span className="eyebrow">Керування</span>
          <h1>РБ</h1>
          <p>Розподіл онлайн-персонажів по контрольованих рейд-босах — на картинку для Діскорду.</p>
        </div>
      </div>
      <AdminGate>{() => <RbManager />}</AdminGate>
    </div>
  );
}
