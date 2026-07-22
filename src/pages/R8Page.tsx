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
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="field-row">
        <label className="field">
          <span>Назва шмотки</span>
          <input type="text" value={name} placeholder="Р8 зброя" onChange={(e) => setName(e.target.value)} />
        </label>
      </div>

      <h4 style={{ marginBottom: 8 }}>Склад (валютні айтеми з «Ціна лута»)</h4>
      {comps.length === 0 && <p className="hint">Компонентів ще немає.</p>}
      {comps.map((c, i) => (
        <div key={i} className="field-row" style={{ alignItems: 'flex-end', marginBottom: 8 }}>
          <label className="field" style={{ flex: '2 1 240px' }}>
            <span>Айтем</span>
            <select value={c.lootItemId} onChange={(e) => updateComp(i, { lootItemId: e.target.value })}>
              {lootOptions.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <label className="field" style={{ flex: '0 0 120px' }}>
            <span>Кількість</span>
            <input type="number" min={1} value={c.quantity} onChange={(e) => updateComp(i, { quantity: Number(e.target.value) })} />
          </label>
          <button type="button" className="btn btn-bad btn-sm" onClick={() => removeComp(i)}>Прибрати</button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" disabled={comps.length >= lootOptions.length} onClick={addComp} style={{ marginBottom: 16 }}>
        + Додати компонент
      </button>

      {err && <p className="form-err">{err}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={save}>
          {busy ? 'Збереження…' : 'Зберегти'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
}

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

  const priceOf = (gearId: string) =>
    components.filter((c) => c.gearItemId === gearId).reduce((sum, c) => sum + c.quantity * (lootById.get(c.lootItemId)?.price ?? 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Шмотки Р8</h3>
        <button type="button" className="btn btn-primary" disabled={currencyOptions.length === 0} onClick={() => setEditing('new')}>
          + Нова шмотка
        </button>
      </div>
      {currencyOptions.length === 0 && (
        <p className="hint" style={{ marginBottom: 16 }}>
          Спершу додай хоча б один не-камінний айтем у вкладці «Ціна лута» в Адмінці.
        </p>
      )}

      {err && <p className="form-err">{err}</p>}

      {editing && (
        <GearForm
          lootOptions={currencyOptions}
          initial={editing === 'new' ? null : { item: editing, components: components.filter((c) => c.gearItemId === editing.id) }}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}

      {gearItems.length === 0 ? (
        <p className="hint">Шмоток ще немає.</p>
      ) : (
        <div className="rowlist">
          <div className="rowlist-head" style={{ gridTemplateColumns: 'minmax(150px, 1fr) 140px 180px' }}>
            <span>Назва</span>
            <span>Ціна</span>
            <span></span>
          </div>
          {gearItems.map((g) => (
            <div key={g.id} className="rowlist-row" style={{ gridTemplateColumns: 'minmax(150px, 1fr) 140px 180px' }}>
              <span>{g.name}</span>
              <span style={{ fontWeight: 700 }} title={formatPriceExact(priceOf(g.id))}>{formatPrice(priceOf(g.id))}</span>
              <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(g)}>Редагувати</button>
                <button
                  type="button"
                  className="btn btn-bad btn-sm"
                  onClick={() => confirm(`Видалити шмотку «${g.name}»?`) && deleteGearItem(g.id).then(reload).catch(reportError)}
                >
                  Видалити
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function R8Page() {
  return (
    <div>
      <PageMeta title="Р8 — Thunder" />
      <div className="section-head">
        <span className="eyebrow">Гільдія</span>
        <h2>Шмотки Р8</h2>
      </div>
      <AdminGate>{() => <R8Manager />}</AdminGate>
    </div>
  );
}
