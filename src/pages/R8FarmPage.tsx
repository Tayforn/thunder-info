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
import { IcoCheck, IcoCoins, IcoInbox, IcoSword } from '../components/Icons';

function gearPrice(gearId: string, components: GearItemComponent[], lootById: Map<string, LootItem>): number {
  return components
    .filter((c) => c.gearItemId === gearId)
    .reduce((sum, c) => sum + c.quantity * (lootById.get(c.lootItemId)?.price ?? 0), 0);
}

const QUICK_WINDOWS = [1, 2, 3, 4];
const PICK_COLS = '34px minmax(140px, 1fr) 110px';
const NEED_COLS = 'minmax(140px, 1fr) 70px 90px 110px 90px';

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
    return { ...calc, totalCost, chosen: chosen.length };
  }, [gearItems, components, selected, lootById, windows]);

  const farmEta = farm && farm.totalWeeks !== null
    ? new Date(Date.now() + farm.totalWeeks * 7 * 86_400_000).toLocaleDateString('uk-UA')
    : null;

  const allSelected = !!gearItems && gearItems.length > 0 && gearItems.every((g) => selected.has(g.id));
  const selectedPrice = gearItems ? gearItems.filter((g) => selected.has(g.id)).reduce((s, g) => s + gearPrice(g.id, components, lootById), 0) : 0;

  return (
    <div className="page">
      <PageMeta title="Thunder — ціна лута та фарм Р8" description="Ціна лута, вартість шмоток Р8 і калькулятор соло-фарму КХ." />

      <section className="hero compact">
        <img className="hero-crest" src={import.meta.env.BASE_URL + 'assets/thunder-hero.gif'} alt="Thunder" />
        <div className="hero-text">
          <span className="eyebrow">Гільдія Thunder</span>
          <h1>Ціна лута, Р8 і соло-фарм</h1>
          <p>Актуальна ціна валюти КХ і каменів, вартість шмоток Р8 та скільки тижнів соло-фарму потрібно на обраний набір.</p>
        </div>
      </section>

      {err && <p className="form-err">{err}</p>}
      {!lootItems && !err && <p className="loading"><span className="spinner" /> Завантаження…</p>}

      {lootItems && (
        <>
          <div className="split main-side">
            <div className="panel">
              <div className="panel-head">
                <h3><IcoSword /> Шмотки Р8</h3>
                {selected.size > 0 && <span className="badge accent">обрано {selected.size}</span>}
                <span className="panel-sub">обери, щоб порахувати фарм</span>
                {gearItems && gearItems.length > 0 && (
                  <div className="panel-actions">
                    {selected.size > 0 && (
                      <button type="button" className="btn btn-quiet btn-xs" onClick={() => setSelected(new Set())}>Скинути</button>
                    )}
                    <button type="button" className="btn btn-ghost btn-xs" disabled={allSelected} onClick={() => setSelected(new Set(gearItems.map((g) => g.id)))}>
                      Весь сет
                    </button>
                  </div>
                )}
              </div>
              <div className="panel-body flush">
                {!gearItems || gearItems.length === 0 ? (
                  <p className="rowlist-empty">Шмоток ще не додано (керування — на сторінці «Шмотки Р8»).</p>
                ) : (
                  <div className="rowlist">
                    <div className="rowlist-head" style={{ gridTemplateColumns: PICK_COLS }}>
                      <span></span>
                      <span>Шмотка</span>
                      <span className="cell-right">Ціна</span>
                    </div>
                    {gearItems.map((g) => {
                      const on = selected.has(g.id);
                      return (
                        <div
                          key={g.id}
                          className={'rowlist-row pick-row' + (on ? ' on' : '')}
                          style={{ gridTemplateColumns: PICK_COLS }}
                          role="checkbox"
                          aria-checked={on}
                          tabIndex={0}
                          onClick={() => toggleSelected(g.id)}
                          onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), toggleSelected(g.id))}
                        >
                          <span className={'check' + (on ? ' is-on' : '')} aria-hidden="true"><IcoCheck /></span>
                          <span className="cell-ellipsis" style={{ fontWeight: on ? 700 : 500 }}>{g.name}</span>
                          <span className="cell-price cell-right" title={formatPriceExact(gearPrice(g.id, components, lootById))}>
                            {formatPrice(gearPrice(g.id, components, lootById))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {selected.size > 0 && (
                <div className="panel-foot">
                  <span>Обране разом:</span>
                  <b className="cell-price" style={{ color: 'var(--text)' }} title={formatPriceExact(selectedPrice)}>{formatPrice(selectedPrice)}</b>
                </div>
              )}
            </div>

            <div className="panel sticky">
              <div className="panel-head">
                <h3><IcoCoins /> Соло-фарм на обране</h3>
                <div className="panel-actions">
                  <span className="toolbar-label">вікон КХ</span>
                  <div className="seg seg-sm" role="group" aria-label="Кількість вікон КХ">
                    {QUICK_WINDOWS.map((w) => (
                      <button key={w} type="button" className={windows === w ? 'is-on' : ''} onClick={() => setWindows(w)}>{w}</button>
                    ))}
                  </div>
                  <input
                    type="number"
                    className="input input-sm"
                    style={{ width: 64, textAlign: 'center' }}
                    min={1}
                    max={20}
                    value={windows}
                    aria-label="Кількість вікон КХ"
                    onChange={(e) => setWindows(Math.max(1, Math.round(Number(e.target.value)) || 1))}
                  />
                </div>
              </div>
              {!farm ? (
                <div className="panel-body">
                  <div className="empty">
                    <IcoInbox />
                    <b>Нічого не обрано</b>
                    <span>Познач шмотки ліворуч або обери весь сет — тут з'явиться розрахунок.</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="panel-body">
                    <div className="tiles">
                      <div className={'tile ' + (farm.totalWeeks === null ? 'bad' : 'accent')}>
                        <span className="tile-l">Тижнів</span>
                        <span className="tile-v">{farm.totalWeeks === null ? '—' : farm.totalWeeks}</span>
                        <span className="tile-s">{farm.totalWeeks === null ? 'немає дропу' : `${windows} ${windows === 1 ? 'вікно' : windows < 5 ? 'вікна' : 'вікон'} × 2 круги/тиждень`}</span>
                      </div>
                      <div className="tile">
                        <span className="tile-l">Орієнтовно до</span>
                        <span className="tile-v text">{farmEta ?? '—'}</span>
                        <span className="tile-s">якщо почати сьогодні</span>
                      </div>
                      <div className="tile">
                        <span className="tile-l">Вартість</span>
                        <span className="tile-v" title={formatPriceExact(farm.totalCost)}>{formatPrice(farm.totalCost)}</span>
                        <span className="tile-s">якби купувати за ціною лута</span>
                      </div>
                    </div>
                  </div>
                  <div className="panel-body flush" style={{ borderTop: '1px solid var(--line)' }}>
                    <div className="rowlist">
                      <div className="rowlist-head" style={{ gridTemplateColumns: NEED_COLS }}>
                        <span>Айтем</span>
                        <span>Шанс</span>
                        <span>Потрібно</span>
                        <span>За тиждень</span>
                        <span className="cell-right">Тижнів</span>
                      </div>
                      {farm.rows.map((r) => (
                        <div key={r.lootItemId} className="rowlist-row" style={{ gridTemplateColumns: NEED_COLS }}>
                          <span className="cell-ellipsis">{r.name}</span>
                          <span className="num">{r.chancePct !== null ? `${r.chancePct}%` : '—'}</span>
                          <span className="num">{r.needed}</span>
                          <span className="num" title={windows > 1 ? `${r.perWindowYield.toFixed(2)}/вікно × ${windows}` : undefined}>
                            {r.weeklyYield.toFixed(2)}
                          </span>
                          <span className="cell-right">
                            {r.weeksNeeded === null ? <span className="badge bad">немає дропу</span> : <b className="num">{r.weeksNeeded}</b>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="panel-foot">
                    Рахунок за 2 круги КХ на тиждень (на 1 вікно): 9 етапів 1-го круга + 8 етапів 2-го (9-й етап 2-го круга не
                    проходиться). Найповільніший айтем визначає загальний строк.
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="section-head">
            <span className="eyebrow">Ціна лута</span>
            <h2>Валюта КХ і камені</h2>
          </div>
          <div className="split two">
            <LootTable title="Валюта КХ" items={currency} />
            <LootTable title="Камені" items={stones} />
          </div>
        </>
      )}
    </div>
  );
}

const LOOT_COLS = 'minmax(150px, 1fr) 110px';

function LootTable({ title, items }: { title: string; items: LootItem[] }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        {items.length > 0 && <span className="badge mute">{items.length}</span>}
      </div>
      <div className="panel-body flush">
        {items.length === 0 ? (
          <p className="rowlist-empty">Порожньо.</p>
        ) : (
          <div className="rowlist">
            <div className="rowlist-head" style={{ gridTemplateColumns: LOOT_COLS }}>
              <span>Назва</span>
              <span className="cell-right">Ціна</span>
            </div>
            {items.map((item) => (
              <div key={item.id} className="rowlist-row" style={{ gridTemplateColumns: LOOT_COLS }}>
                <span className="cell-ellipsis">
                  {item.pwdbUrl ? <a className="link" href={item.pwdbUrl} target="_blank" rel="noopener">{item.name}</a> : item.name}
                </span>
                <span className="cell-price cell-right" title={formatPriceExact(item.price)}>{formatPrice(item.price)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
