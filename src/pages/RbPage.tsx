// =========================================================
// /rb — адмінська сторінка розподілу людей по контрольованих РБ.
//
// 1) Вибір класів (за замовчуванням Танк/Сікер/Сін) — визначає, кого
//    показувати в чеклисті «онлайн» нижче.
// 2) Чеклист персонажів вибраних класів — адмін відмічає, хто зараз
//    на зв'язку (готовий іти захищати боса).
// 3) Чеклист босів — статичний список світових РБ, узгоджений з
//    calc.thunderpw.fun/rb (див. data/raidBosses.ts; спільної БД/API з
//    тим проєктом немає, тож список підтримується тут вручну).
// 4) «Розподілити» — на кожного відміченого боса по черзі: 1 Сін +
//    1 Танк/Сікер з відмічених онлайн (хто не влігся — лишається поза
//    розподілом, видно в «Резерві»); кожне призначення можна поправити
//    вручну випадаючим списком.
// 5) Чистий текстовий блок-прев'ю результату — його копіюють як картинку
//    (html-to-image) і кидають гільдії в Діскорд.
//
// Стан — лише в пам'яті вкладки (сесія роботи), нічого не пишеться в
// Supabase: це одноразовий робочий інструмент, а не спільні дані.
// =========================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { toBlob, toPng } from 'html-to-image';
import PageMeta from '../app/PageMeta';
import { errorMessage } from '../app/errorMessage';
import AdminGate from '../components/AdminGate';
import ClassBadge from '../components/ClassBadge';
import { sortByClass } from '../components/ClassFilter';
import { fetchClasses } from '../data/classes';
import { fetchPlayers } from '../data/players';
import { RAID_BOSSES } from '../data/raidBosses';
import type { ClassRow, Player } from '../data/types';

const DEFAULT_CLASS_NAMES = ['танк', 'сікер', 'сін'];
// «Страж» — розмовна назва Сікера в гільдії, тож обидві рахуються як пара до Сіна.
const SIN_NAMES = ['сін'];
const GUARD_NAMES = ['танк', 'сікер', 'страж'];
const norm = (s: string) => s.trim().toLowerCase();

interface Slot {
  sinId: string | null;
  guardId: string | null;
}

function nicknameOf(players: Player[], id: string | null): string {
  if (!id) return '—';
  return players.find((p) => p.id === id)?.nickname ?? '—';
}

function RbManager() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const defaultsApplied = useRef(false);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
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

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const toggleInSet = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const candidates = useMemo(
    () => sortByClass(players.filter((p) => p.classId && selectedClassIds.has(p.classId)), classById),
    [players, selectedClassIds, classById],
  );

  // Якщо персонажа зняли з вибраних класів — прибираємо й позначку "онлайн".
  useEffect(() => {
    setOnlineIds((prev) => {
      const candidateIds = new Set(candidates.map((p) => p.id));
      const next = new Set(Array.from(prev).filter((id) => candidateIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [candidates]);

  const onlinePlayers = useMemo(() => candidates.filter((p) => onlineIds.has(p.id)), [candidates, onlineIds]);
  const selectedBosses = useMemo(() => RAID_BOSSES.filter((b) => selectedBossIds.has(b.id)), [selectedBossIds]);

  const classNameOf = (p: Player) => (p.classId ? classById.get(p.classId)?.name ?? '' : '');
  const isSin = (p: Player) => SIN_NAMES.includes(norm(classNameOf(p)));
  const isGuard = (p: Player) => GUARD_NAMES.includes(norm(classNameOf(p)));

  const distribute = () => {
    const sinPool = onlinePlayers.filter(isSin);
    const guardPool = onlinePlayers.filter(isGuard);
    const next: Record<string, Slot> = {};
    selectedBosses.forEach((b, i) => {
      next[b.id] = { sinId: sinPool[i]?.id ?? null, guardId: guardPool[i]?.id ?? null };
    });
    setSlots(next);
  };

  const setSlot = (bossId: string, key: keyof Slot, playerId: string) =>
    setSlots((prev) => ({
      ...prev,
      [bossId]: { sinId: prev[bossId]?.sinId ?? null, guardId: prev[bossId]?.guardId ?? null, [key]: playerId || null },
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
  const reserve = onlinePlayers.filter((p) => !assignedIds.has(p.id));

  const sinOnline = onlinePlayers.filter(isSin);
  const guardOnline = onlinePlayers.filter(isGuard);
  // Варіанти для селекта: лише своя роль, без тих, хто вже стоїть на іншому
  // слоті (поточне значення лишаємо, інакше селект «втратить» вибір).
  const optionsFor = (pool: Player[], current: string | null) => pool.filter((p) => p.id === current || !assignedIds.has(p.id));

  const bgColor = () => getComputedStyle(document.body).backgroundColor || '#111';

  const copyImage = async () => {
    if (!printRef.current) return;
    setActionErr(null);
    try {
      const blob = await toBlob(printRef.current, { pixelRatio: 2, backgroundColor: bgColor() });
      if (!blob) throw new Error('Не вдалося згенерувати картинку.');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setActionErr(errorMessage(e, 'Не вдалося скопіювати картинку — спробуй «Завантажити PNG».'));
    }
  };

  const downloadImage = async () => {
    if (!printRef.current) return;
    setActionErr(null);
    try {
      const url = await toPng(printRef.current, { pixelRatio: 2, backgroundColor: bgColor() });
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rb-rozpodil.png';
      a.click();
    } catch (e) {
      setActionErr(errorMessage(e, 'Не вдалося зберегти картинку.'));
    }
  };

  if (loading) return <p className="hint">Завантаження…</p>;
  if (loadErr) return <p className="form-err">{loadErr}</p>;

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>1. Класи</h3>
        <p className="hint" style={{ marginBottom: 12 }}>Кого показувати нижче в списку «онлайн».</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {classes.length === 0 && <p className="hint">Спершу додай класи в Адмінці.</p>}
          {classes.map((c) => (
            <button
              key={c.id}
              type="button"
              className={'btn btn-sm ' + (selectedClassIds.has(c.id) ? 'btn-primary' : 'btn-ghost')}
              onClick={() => toggleInSet(setSelectedClassIds, c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>2. Хто онлайн</h3>
        {candidates.length === 0 ? (
          <p className="hint">Нема персонажів вибраних класів — зміни вибір вище або додай гравців у «Гравці» / Адмінці.</p>
        ) : (
          <div className="rb-online">
            {classes.filter((c) => selectedClassIds.has(c.id)).map((c) => {
              const group = candidates.filter((p) => p.classId === c.id);
              if (group.length === 0) return null;
              const on = group.filter((p) => onlineIds.has(p.id)).length;
              return (
                <div key={c.id} className="rb-online-group">
                  <div className="rb-online-head">
                    <ClassBadge cls={c} />
                    <span className="hint">{on} / {group.length}</span>
                  </div>
                  {group.map((p) => (
                    <label key={p.id} className={'checkbox-row rb-online-item' + (onlineIds.has(p.id) ? ' on' : '')}>
                      <input type="checkbox" checked={onlineIds.has(p.id)} onChange={() => toggleInSet(setOnlineIds, p.id)} />
                      <span>{p.nickname}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>3. Боси під контроль</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {RAID_BOSSES.map((b) => (
            <label key={b.id} className="checkbox-row">
              <input type="checkbox" checked={selectedBossIds.has(b.id)} onChange={() => toggleInSet(setSelectedBossIds, b.id)} />
              <span title={b.name}>{b.nick}</span>
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={selectedBosses.length === 0 || onlinePlayers.length === 0}
          onClick={distribute}
        >
          🔀 Розподілити
        </button>
        <span className="hint">На боса: 1 Сін + 1 Танк/Сікер по черзі з відмічених онлайн; хто не влігся — в «Резерві».</span>
      </div>

      {selectedBosses.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Розподіл (можна поправити вручну)</h3>
          <div className="rowlist">
            <div className="rowlist-head" style={{ gridTemplateColumns: 'minmax(110px, 1fr) 1fr 1fr 110px' }}>
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
                <div key={b.id} className="rowlist-row" style={{ gridTemplateColumns: 'minmax(110px, 1fr) 1fr 1fr 110px' }}>
                  <span title={b.name} style={{ fontWeight: 700 }}>{b.nick}</span>
                  <span>
                    <select value={sinId ?? ''} onChange={(e) => setSlot(b.id, 'sinId', e.target.value)}>
                      <option value="">—</option>
                      {optionsFor(sinOnline, sinId).map((p) => (
                        <option key={p.id} value={p.id}>{p.nickname}</option>
                      ))}
                    </select>
                  </span>
                  <span>
                    <select value={guardId ?? ''} onChange={(e) => setSlot(b.id, 'guardId', e.target.value)}>
                      <option value="">—</option>
                      {optionsFor(guardOnline, guardId).map((p) => (
                        <option key={p.id} value={p.id}>{p.nickname}</option>
                      ))}
                    </select>
                  </span>
                  <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-ghost btn-sm rb-reset" disabled={!sinId && !guardId} onClick={() => resetSlot(b.id)}>
                      Скинути
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
          {reserve.length > 0 && (
            <p className="hint" style={{ marginTop: 10 }}>
              Резерв (онлайн, але без боса): {reserve.map((p) => p.nickname).join(', ')}
            </p>
          )}
        </div>
      )}

      {actionErr && <p className="form-err">{actionErr}</p>}

      {selectedBosses.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Картинка для гільдії</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={copyImage}>
                {copied ? 'Скопійовано ✓' : '📋 Копіювати картинку'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={downloadImage}>⭳ Завантажити PNG</button>
            </div>
          </div>

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
                    <span>{nicknameOf(players, slot?.sinId ?? null)}</span>
                    <span>{nicknameOf(players, slot?.guardId ?? null)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RbPage() {
  return (
    <div>
      <PageMeta title="РБ — Thunder" />
      <div className="section-head">
        <span className="eyebrow">Гільдія</span>
        <h2>РБ</h2>
        <p>Розподіл онлайн-персонажів по контрольованих рейд-босах — на картинку для Діскорду.</p>
      </div>
      <AdminGate>{() => <RbManager />}</AdminGate>
    </div>
  );
}
