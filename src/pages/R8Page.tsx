// =========================================================
// /r8 — адмінське керування шмотками Р8: назва + рецепт (валютні айтеми
// з "Ціна лута", ті що НЕ "камінь в шмот", + кількість). Сумарна ціна
// шмотки рахується клієнтом з loot_items.price.
// =========================================================

import { useEffect, useState } from 'react';
import PageMeta from '../app/PageMeta';
import { errorMessage, reportError } from '../app/errorMessage';
import { formatPrice, formatPriceExact } from '../app/formatPrice';
import AdminGate from '../components/AdminGate';
import { IcoEdit, IcoPlus, IcoSword, IcoTrash } from '../components/Icons';
import { fetchLootItems } from '../data/lootItems';
import {
  createGearItem, deleteGearItem, fetchGearItemComponents, fetchGearItems,
  setGearItemComponents, updateGearItem,
} from '../data/gearItems';
import type { GearItem, GearItemComponent, LootItem } from '../data/types';

interface DraftComponent { lootItemId: string; quantity: number }

function GearForm({
  lootOptions, initial, onCancel, onSaved,
}: {
  lootOptions: LootItem[];
  initial: { item: GearItem; components: GearItemComponent[] } | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.item.name ?? '');
  const [comps, setComps] = useState<DraftComponent[]>(
    initial ? initial.components.map((c) => ({ lootItemId: c.lootItemId, quantity: c.quantity })) : [],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addComp = () => {
    const firstFree = lootOptions.find((l) => !comps.some((c) => c.lootItemId === l.id));
    if (!firstFree) return;
    setComps((prev) => [...prev, { lootItemId: firstFree.id, quantity: 1 }]);
  };
  const removeComp = (i: number) => setComps((prev) => prev.filter((_, idx) => idx !== i));
  const updateComp = (i: number, patch: Partial<DraftComponent>) =>
    setComps((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const lootById = new Map(lootOptions.map((l) => [l.id, l]));
  const draftPrice = comps.reduce((sum, c) => sum + c.quantity * (lootById.get(c.lootItemId)?.price ?? 0), 0);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const validComps = comps.filter((c) => c.lootItemId && c.quantity > 0);
      const gearItem = initial ? initial.item : await createGearItem({ name });
      if (initial) await updateGearItem(gearItem.id, { name });
      await setGearItemComponents(gearItem.id, validComps);
      onSaved();
    } catch (e) {
      setErr(errorMessage(e, 'Не вдалося зберегти шмотку.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel accent">
      <div className="panel-head">
        <h3>{initial ? <><IcoEdit /> Редагування шмотки</> : <><IcoPlus /> Нова шмотка</>}</h3>
        <span className="panel-sub">склад — валютні айтеми з «Ціна лута»</span>
        <div className="panel-actions">
          <span className="badge accent" title={formatPriceExact(draftPrice)}>ціна {formatPrice(draftPrice)}</span>
        </div>
      </div>
      <div className="panel-body stack">
        <label className="field" style={{ maxWidth: 420 }}>
          <span>Назва шмотки</span>
          <input type="text" value={name} placeholder="Р8 зброя" autoFocus onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="stack sm">
          <span className="field"><span>Склад</span></span>
          {comps.length === 0 && <p className="hint">Компонентів ще немає — додай перший.</p>}
          {comps.map((c, i) => (
            <div key={i} className="field-row">
              <label className="field" style={{ flex: '2 1 240px' }}>
                <span>Айтем</span>
                <select value={c.lootItemId} onChange={(e) => updateComp(i, { lootItemId: e.target.value })}>
                  {lootOptions.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ flex: '0 0 110px' }}>
                <span>Кількість</span>
                <input type="number" min={1} value={c.quantity} onChange={(e) => updateComp(i, { quantity: Number(e.target.value) })} />
              </label>
              <span className="field" style={{ flex: '0 0 110px' }}>
                <span>Разом</span>
                <span className="cell-price" style={{ height: 38, display: 'inline-flex', alignItems: 'center' }} title={formatPriceExact(c.quantity * (lootById.get(c.lootItemId)?.price ?? 0))}>
                  {formatPrice(c.quantity * (lootById.get(c.lootItemId)?.price ?? 0))}
                </span>
              </span>
              <button type="button" className="btn btn-bad btn-sm" style={{ height: 38 }} onClick={() => removeComp(i)}><IcoTrash /> Прибрати</button>
            </div>
          ))}
          <div>
            <button type="button" className="btn btn-ghost btn-sm" disabled={comps.length >= lootOptions.length} onClick={addComp}>
              <IcoPlus /> Додати компонент
            </button>
          </div>
        </div>

        {err && <p className="form-err">{err}</p>}
      </div>
      <div className="panel-foot" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Скасувати</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !name.trim()} onClick={save}>
          {busy ? 'Збереження…' : 'Зберегти'}
        </button>
      </div>
    </div>
  );
}

const COLS = 'minmax(150px, 1fr) minmax(200px, 1.4fr) 110px 200px';

function R8Manager() {
  const [lootItems, setLootItems] = useState<LootItem[]>([]);
  const [gearItems, setGearItems] = useState<GearItem[]>([]);
  const [components, setComponents] = useState<GearItemComponent[]>([]);
  const [editing, setEditing] = useState<GearItem | 'new' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = () =>
    Promise.all([fetchLootItems(), fetchGearItems(), fetchGearItemComponents()])
      .then(([loot, gear, comps]) => {
        setLootItems(loot);
        setGearItems(gear);
        setComponents(comps);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Не вдалося завантажити дані.'));

  useEffect(() => {
    reload();
  }, []);

  const currencyOptions = lootItems.filter((l) => !l.isGearStone);
  const lootById = new Map(lootItems.map((l) => [l.id, l]));

  const compsOf = (gearId: string) => components.filter((c) => c.gearItemId === gearId);
  const priceOf = (gearId: string) =>
    compsOf(gearId).reduce((sum, c) => sum + c.quantity * (lootById.get(c.lootItemId)?.price ?? 0), 0);
  const setPrice = gearItems.reduce((s, g) => s + priceOf(g.id), 0);

  return (
    <div className="stack">
      {currencyOptions.length === 0 && (
        <div className="notice warn">
          <span className="grow">Спершу додай хоча б один не-камінний айтем у вкладці «Ціна лута» в Адмінці.</span>
          <div className="notice-acts"><button type="button" className="btn btn-ghost btn-xs" data-goto="admin">В Адмінку</button></div>
        </div>
      )}

      {err && <p className="form-err">{err}</p>}

      {editing && (
        <GearForm
          key={editing === 'new' ? 'new' : editing.id}
          lootOptions={currencyOptions}
          initial={editing === 'new' ? null : { item: editing, components: compsOf(editing.id) }}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}

      <div className="panel">
        <div className="panel-head">
          <h3><IcoSword /> Шмотки Р8</h3>
          {gearItems.length > 0 && <span className="badge mute">{gearItems.length}</span>}
          {gearItems.length > 0 && <span className="panel-sub" title={formatPriceExact(setPrice)}>весь сет — {formatPrice(setPrice)}</span>}
          <div className="panel-actions">
            <button type="button" className="btn btn-primary btn-sm" disabled={currencyOptions.length === 0 || editing === 'new'} onClick={() => setEditing('new')}>
              <IcoPlus /> Нова шмотка
            </button>
          </div>
        </div>
        <div className="panel-body flush">
          {gearItems.length === 0 ? (
            <p className="rowlist-empty">Шмоток ще немає.</p>
          ) : (
            <div className="rowlist">
              <div className="rowlist-head" style={{ gridTemplateColumns: COLS }}>
                <span>Назва</span>
                <span>Склад</span>
                <span className="cell-right">Ціна</span>
                <span></span>
              </div>
              {gearItems.map((g) => (
                <div key={g.id} className={'rowlist-row' + (editing !== 'new' && editing?.id === g.id ? ' highlight' : '')} style={{ gridTemplateColumns: COLS }}>
                  <span className="cell-nick"><b>{g.name}</b>{g.note && <small className="hint">{g.note}</small>}</span>
                  <span className="chips">
                    {compsOf(g.id).length === 0 && <span className="hint">без компонентів</span>}
                    {compsOf(g.id).map((c) => (
                      <span key={c.id} className="chip static" style={{ height: 24, fontSize: 12 }}>
                        {lootById.get(c.lootItemId)?.name ?? '?'} <b>×{c.quantity}</b>
                      </span>
                    ))}
                  </span>
                  <span className="cell-price cell-right" title={formatPriceExact(priceOf(g.id))}>{formatPrice(priceOf(g.id))}</span>
                  <span className="cell-actions">
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditing(g)}><IcoEdit /> Редагувати</button>
                    <button
                      type="button"
                      className="btn btn-bad btn-xs"
                      onClick={() => confirm(`Видалити шмотку «${g.name}»?`) && deleteGearItem(g.id).then(reload).catch(reportError)}
                    >
                      <IcoTrash />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function R8Page() {
  return (
    <div className="page">
      <PageMeta title="Р8 — Thunder" />
      <div className="page-head">
        <div className="page-head-text">
          <span className="eyebrow">Керування</span>
          <h1>Шмотки Р8</h1>
          <p>Назва й рецепт кожної шмотки. Ціна рахується з поточних цін лута — її бачать усі на сторінці «Р8 фарм».</p>
        </div>
      </div>
      <AdminGate>{() => <R8Manager />}</AdminGate>
    </div>
  );
}
