import { useEffect, useState } from 'react';
import { errorMessage, reportError } from '../../app/errorMessage';
import { formatPrice, formatPriceInputMask, parsePriceInput } from '../../app/formatPrice';
import AdminTable from '../../components/AdminTable';
import { IcoPlus, IcoTrash } from '../../components/Icons';
import { createLootItem, deleteLootItem, fetchLootItems, updateLootItem } from '../../data/lootItems';
import type { LootItem } from '../../data/types';

const COLUMNS = 'minmax(160px, 1fr) 140px 110px 60px';

function TextInput({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return <input type="text" value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => value !== initial && onSave(value)} />;
}

function PriceInput({ initial, onSave }: { initial: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(formatPriceInputMask(initial));
  useEffect(() => setValue(formatPriceInputMask(initial)), [initial]);
  return (
    <input
      type="text"
      inputMode="numeric"
      className="num"
      value={editing ? value : formatPrice(initial)}
      title={formatPriceInputMask(initial)}
      onFocus={() => {
        setEditing(true);
        setValue(formatPriceInputMask(initial));
      }}
      onChange={(e) => setValue(formatPriceInputMask(e.target.value))}
      onBlur={() => {
        setEditing(false);
        const n = parsePriceInput(value);
        if (n !== initial) onSave(n);
      }}
    />
  );
}

export default function LootPricesTab() {
  const [items, setItems] = useState<LootItem[]>([]);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newIsStone, setNewIsStone] = useState(true); // "все інше що добавлятиметься — буде камінням"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => fetchLootItems().then(setItems);

  useEffect(() => {
    reload().catch((e) => setErr(e instanceof Error ? e.message : 'Не вдалося завантажити.'));
  }, []);

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createLootItem({ name: newName, price: parsePriceInput(newPrice), isGearStone: newIsStone });
      setNewName('');
      setNewPrice('');
      setNewIsStone(true);
      await reload();
    } catch (e) {
      setErr(errorMessage(e, 'Не вдалося додати айтем.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <AdminTable
        title="Ціна лута"
        hint="«Камінь в шмот» — усе, крім 5 стартових валютних айтемів КХ; для них перемикач заблокований, щоб не зламати рецепти Р8"
        columns={COLUMNS}
        minWidth={520}
        header={['Назва', 'Ціна', 'Камінь', '']}
        rows={items}
        keyFn={(i) => i.id}
        emptyLabel="Лут ще не додано."
        renderRow={(item) => {
          const isKhCurrency = item.khChancePct !== null;
          return [
            <TextInput key="name" initial={item.name} onSave={(v) => updateLootItem(item.id, { name: v }).then(reload).catch(reportError)} />,
            <PriceInput key="price" initial={item.price} onSave={(v) => updateLootItem(item.id, { price: v }).then(reload).catch(reportError)} />,
            isKhCurrency ? (
              <span key="stone" className="badge accent" title="Стартовий валютний айтем КХ — не може бути каменем в шмот">валюта КХ</span>
            ) : (
              <label key="stone" className="switch" title="Камінь в шмот">
                <input
                  type="checkbox"
                  checked={item.isGearStone}
                  onChange={(e) => updateLootItem(item.id, { isGearStone: e.target.checked }).then(reload).catch(reportError)}
                />
                <span className="switch-track" />
                <span>{item.isGearStone ? 'камінь' : 'ні'}</span>
              </label>
            ),
            isKhCurrency ? null : (
              <span key="del" className="cell-actions">
                <button
                  type="button"
                  className="btn btn-bad btn-xs"
                  title="Видалити"
                  onClick={() => confirm(`Видалити «${item.name}»?`) && deleteLootItem(item.id).then(reload).catch(reportError)}
                >
                  <IcoTrash />
                </button>
              </span>
            ),
          ];
        }}
        addRow={
          <>
            <label className="field">
              <span>Назва</span>
              <input type="text" value={newName} placeholder="Назва лута" onChange={(e) => setNewName(e.target.value)} />
            </label>
            <label className="field narrow">
              <span>Ціна</span>
              <input type="text" inputMode="numeric" placeholder="0" value={newPrice} onChange={(e) => setNewPrice(formatPriceInputMask(e.target.value))} />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={newIsStone} onChange={(e) => setNewIsStone(e.target.checked)} />
              Камінь в шмот
            </label>
            <button type="button" className="btn btn-primary" disabled={busy || !newName.trim()} onClick={add}><IcoPlus /> Додати</button>
          </>
        }
      />
      {err && <p className="form-err">{err}</p>}
    </div>
  );
}
