// =========================================================
// /farm — публічна інформативна сторінка: ціна лута (валюта КХ / камені),
// сумарна ціна шмоток Р8, і калькулятор соло-фарму (скільки тижнів
// потрібно нафармити валюту КХ на обрану шмотку/весь сет). Була на "/"
// (Головна), винесена на окремий роут — на "/" тепер About-сторінка клану.
// =========================================================

import { useEffect, useMemo, useState } from 'react';
import PageMeta from '../app/PageMeta';
import { formatPrice, formatPriceExact } from '../app/formatPrice';
import { fetchLootItems } from '../data/lootItems';
import { fetchGearItemComponents, fetchGearItems } from '../data/gearItems';
import type { GearItem, GearItemComponent, LootItem } from '../data/types';
import { calcFarmWeeks } from '../data/khFarm';

function gearPrice(gearId: string, components: GearItemComponent[], lootById: Map<string, LootItem>): number {
  return components
    .filter((c) => c.gearItemId === gearId)
    .reduce((sum, c) => sum + c.quantity * (lootById.get(c.lootItemId)?.price ?? 0), 0);
}

export default function R8FarmPage() {
  const [lootItems, setLootItems] = useState<LootItem[] | null>(null);
  const [gearItems, setGearItems] = useState<GearItem[] | null>(null);
  const [components, setComponents] = useState<GearItemComponent[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [windows, setWindows] = useState(1);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLootItems(), fetchGearItems(), fetchGearItemComponents()])
      .then(([loot, gear, comps]) => {
        if (cancelled) return;
        setLootItems(loot);
        setGearItems(gear);
        setComponents(comps);
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : 'Не вдалося завантажити дані.'));
    return () => {
      cancelled = true;
    };
  }, []);

  const lootById = useMemo(() => new Map((lootItems ?? []).map((l) => [l.id, l])), [lootItems]);
  const currency = (lootItems ?? []).filter((l) => !l.isGearStone);
  const stones = (lootItems ?? []).filter((l) => l.isGearStone);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const farm = useMemo(() => {
    if (!gearItems) return null;
    const chosen = selected.size > 0 ? gearItems.filter((g) => selected.has(g.id)) : [];
    if (chosen.length === 0) return null;
    const neededByLoot = new Map<string, number>();
    for (const c of components) {
      if (!selected.has(c.gearItemId)) continue;
      neededByLoot.set(c.lootItemId, (neededByLoot.get(c.lootItemId) ?? 0) + c.quantity);
    }
    const needs = Array.from(neededByLoot, ([lootItemId, needed]) => ({ item: lootById.get(lootItemId), needed }))
      .filter((n): n is { item: LootItem; needed: number } => !!n.item);
    const calc = calcFarmWeeks(needs, windows);
    const totalCost = needs.reduce((sum, n) => sum + n.needed * n.item.price, 0);
    return { ...calc, totalCost };
  }, [gearItems, components, selected, lootById, windows]);

  const farmEta = farm && farm.totalWeeks !== null
    ? new Date(Date.now() + farm.totalWeeks * 7 * 86_400_000).toLocaleDateString('uk-UA')
    : null;

  return (
    <div>
      <PageMeta title="Thunder — ціна лута та фарм Р8" description="Ціна лута, вартість шмоток Р8 і калькулятор соло-фарму КХ." />

      <div className="hero-banner">
        <img src={import.meta.env.BASE_URL + 'assets/thunder-hero.gif'} alt="Thunder" />
        <div>
          <span className="eyebrow">Гільдія Thunder</span>
          <h1>Ціна лута, Р8 і соло-фарм</h1>
          <p>Актуальна ціна валюти КХ і каменів, вартість шмоток Р8 та скільки тижнів соло-фарму потрібно на обраний набір.</p>
        </div>
      </div>

      {err && <p className="form-err">{err}</p>}
      {!lootItems && !err && <p className="hint">Завантаження…</p>}

      {lootItems && (
        <>
          <div className="section-head" style={{ marginTop: 8 }}>
            <span className="eyebrow">Р8</span>
            <h2>Шмотки та їх вартість</h2>
            <p>Онови вибір нижче, щоб порахувати, скільки тижнів соло-фарму потрібно на обрані шмотки (або весь сет).</p>
          </div>

          {!gearItems || gearItems.length === 0 ? (
            <p className="hint">Шмоток ще не додано (керування — на сторінці «Р8»).</p>
          ) : (
            <div className="rowlist" style={{ marginBottom: 24 }}>
              <div className="rowlist-head" style={{ gridTemplateColumns: '28px minmax(150px, 1fr) 140px' }}>
                <span></span>
                <span>Шмотка</span>
                <span>Ціна</span>
              </div>
              {gearItems.map((g) => (
                <div key={g.id} className="rowlist-row" style={{ gridTemplateColumns: '28px minmax(150px, 1fr) 140px' }}>
                  <span>
                    <input
                      type="checkbox"
                      checked={selected.has(g.id)}
                      onChange={() => toggleSelected(g.id)}
                      style={{ accentColor: 'var(--accent)', width: 17, height: 17, cursor: 'pointer' }}
                    />
                  </span>
                  <span>{g.name}</span>
                  <span style={{ fontWeight: 700 }} title={formatPriceExact(gearPrice(g.id, components, lootById))}>
                    {formatPrice(gearPrice(g.id, components, lootById))}
                  </span>
                </div>
              ))}
            </div>
          )}

          {gearItems && gearItems.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 20 }} onClick={() => setSelected(new Set(gearItems.map((g) => g.id)))}>
              Обрати весь сет
            </button>
          )}

          {farm && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
                <div>
                  <h3 style={{ margin: 0 }}>Соло-фарм на обране</h3>
                  <p className="hint" style={{ marginTop: 6 }}>
                    Рахунок за 2 круги КХ на тиждень (на 1 вікно): 9 етапів 1-го круга + 8 етапів 2-го (9-й етап 2-го круга не
                    проходиться). Фармиш у кілька вікон — вкажи їх кількість, очікування за тиждень зросте пропорційно.
                  </p>
                </div>
                <label className="field" style={{ flex: '0 0 150px' }}>
                  <span>Вікон КХ</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={windows}
                    onChange={(e) => setWindows(Math.max(1, Math.round(Number(e.target.value)) || 1))}
                  />
                </label>
              </div>
              <div className="rowlist" style={{ marginTop: 16 }}>
                <div className="rowlist-head" style={{ gridTemplateColumns: 'minmax(150px, 1fr) 90px 100px 140px 110px' }}>
                  <span>Айтем</span>
                  <span>Шанс</span>
                  <span>Потрібно</span>
                  <span>За тиждень</span>
                  <span>Тижнів</span>
                </div>
                {farm.rows.map((r) => (
                  <div key={r.lootItemId} className="rowlist-row" style={{ gridTemplateColumns: 'minmax(150px, 1fr) 90px 100px 140px 110px' }}>
                    <span>{r.name}</span>
                    <span>{r.chancePct !== null ? `${r.chancePct}%` : '—'}</span>
                    <span>{r.needed}</span>
                    <span title={windows > 1 ? `${r.perWindowYield.toFixed(2)}/вікно × ${windows}` : undefined}>
                      {r.weeklyYield.toFixed(2)}
                    </span>
                    <span>{r.weeksNeeded === null ? <span className="badge bad">немає дропу</span> : r.weeksNeeded}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  Загалом: {farm.totalWeeks === null ? (
                    <span className="badge bad">не вифармити (немає дропу)</span>
                  ) : (
                    `${farm.totalWeeks} тижн.${farmEta ? ` (орієнтовно до ${farmEta})` : ''}`
                  )}
                </p>
                <p className="hint" style={{ margin: 0 }} title={formatPriceExact(farm.totalCost)}>
                  Вартість фарму за поточними цінами лута (якби купувати): {formatPrice(farm.totalCost)}
                </p>
              </div>
            </div>
          )}

          <div className="section-head" style={{ marginTop: 32 }}>
            <span className="eyebrow">Ціна лута</span>
            <h2>Валюта КХ</h2>
          </div>
          <LootTable items={currency} />

          <div className="section-head" style={{ marginTop: 32 }}>
            <span className="eyebrow">Ціна лута</span>
            <h2>Камені</h2>
          </div>
          <LootTable items={stones} />
        </>
      )}
    </div>
  );
}

function LootTable({ items }: { items: LootItem[] }) {
  if (items.length === 0) return <p className="hint">Порожньо.</p>;
  return (
    <div className="rowlist" style={{ marginBottom: 8 }}>
      <div className="rowlist-head" style={{ gridTemplateColumns: 'minmax(150px, 1fr) 120px' }}>
        <span>Назва</span>
        <span>Ціна</span>
      </div>
      {items.map((item) => (
        <div key={item.id} className="rowlist-row" style={{ gridTemplateColumns: 'minmax(150px, 1fr) 120px' }}>
          <span>{item.name}</span>
          <span style={{ fontWeight: 700 }} title={formatPriceExact(item.price)}>{formatPrice(item.price)}</span>
        </div>
      ))}
    </div>
  );
}
