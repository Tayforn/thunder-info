import { useEffect, useState } from 'react';
import { errorMessage, reportError } from '../../app/errorMessage';
import { formatPrice, formatPriceInputMask, parsePriceInput } from '../../app/formatPrice';
import AdminTable from '../../components/AdminTable';
import { createLootItem, deleteLootItem, fetchLootItems, updateLootItem } from '../../data/lootItems';
import type { LootItem } from '../../data/types';

const COLUMNS = '1fr 130px 70px 90px';

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
    <div>
      <h3>Ціна лута</h3>
      <p className="hint" style={{ marginBottom: 12 }}>
        «Камінь в шмот» — усе, крім 5 стартових валютних айтемів КХ (монета, медаль, емблема, мішки), для них чекбокс
        заблокований, щоб не зламати рецепти шмоток Р8.
      </p>
      <AdminTable
        columns={COLUMNS}
        header={['Назва', 'Ціна', 'Камінь', '']}
        rows={items}
        keyFn={(i) => i.id}
        emptyLabel="Лут ще не додано."
        renderRow={(item) => {
          const isKhCurrency = item.khChancePct !== null;
          return [
            <TextInput key="name" initial={item.name} onSave={(v) => updateLootItem(item.id, { name: v }).then(reload).catch(reportError)} />,
            <PriceInput key="price" initial={item.price} onSave={(v) => updateLootItem(item.id, { price: v }).then(reload).catch(reportError)} />,
            <input
              key="stone"
              type="checkbox"
              checked={item.isGearStone}
              disabled={isKhCurrency}
              title={isKhCurrency ? 'Стартовий валютний айтем КХ — не може бути каменем в шмот' : ''}
              onChange={(e) => updateLootItem(item.id, { isGearStone: e.target.checked }).then(reload).catch(reportError)}
              style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
            />,
            isKhCurrency ? null : (
              <button
                key="del"
                type="button"
                className="btn btn-bad btn-sm"
                onClick={() => confirm(`Видалити «${item.name}»?`) && deleteLootItem(item.id).then(reload).catch(reportError)}
              >
                Видалити
              </button>
            ),
          ];
        }}
        addRow={
          <>
            <label className="field" style={{ flex: '2 1 220px' }}>
              <span>Назва</span>
              <input type="text" value={newName} placeholder="Назва лута" onChange={(e) => setNewName(e.target.value)} />
            </label>
            <label className="field" style={{ flex: '0 0 120px' }}>
              <span>Ціна</span>
              <input type="text" inputMode="numeric" placeholder="0" value={newPrice} onChange={(e) => setNewPrice(formatPriceInputMask(e.target.value))} />
            </label>
            <label className="checkbox-row" style={{ paddingBottom: 12 }}>
              <input type="checkbox" checked={newIsStone} onChange={(e) => setNewIsStone(e.target.checked)} />
              Камінь в шмот
            </label>
            <button type="button" className="btn btn-primary" disabled={busy || !newName.trim()} onClick={add}>+ Додати</button>
          </>
        }
      />
      {err && <p className="form-err">{err}</p>}
    </div>
  );
}
