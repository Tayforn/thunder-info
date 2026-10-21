import { useEffect, useState } from 'react';
import { errorMessage, reportError } from '../../app/errorMessage';
import AdminTable from '../../components/AdminTable';
import { IcoPlus, IcoTrash } from '../../components/Icons';
import { createClass, deleteClass, fetchClasses, updateClass } from '../../data/classes';
import type { ClassRow } from '../../data/types';
import { classBadgeVariant } from '../../data/types';

const COLUMNS = 'minmax(160px, 1fr) 110px 150px minmax(180px, 220px) 60px';

function TextInput({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return <input type="text" value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => value.trim() && value !== initial && onSave(value)} />;
}

/** Емодзі реакції для збору на РБ; порожнє = клас у зборі не бере участі. */
function EmojiInput({ initial, onSave }: { initial: string | null; onSave: (v: string | null) => void }) {
  const [value, setValue] = useState(initial ?? '');
  useEffect(() => setValue(initial ?? ''), [initial]);
  return (
    <input
      type="text"
      value={value}
      placeholder="ClassIcon_Assassin або 🗡️"
      title="Назва кастомного емодзі сервера (як у списку Емодзі в налаштуваннях сервера, без двокрапок), або <:назва:id>, або звичайний емодзі."
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value.trim() !== (initial ?? '') && onSave(value.trim() || null)}
    />
  );
}

function CoefInput({ initial, onSave }: { initial: number; onSave: (v: number) => void }) {
  const [value, setValue] = useState(String(initial));
  useEffect(() => setValue(String(initial)), [initial]);
  return (
    <input
      type="number"
      min={0}
      step={0.1}
      value={value}
      className="num"
      style={{ textAlign: 'center' }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const n = Number(value);
        if (!Number.isNaN(n) && n > 0 && n !== initial) onSave(n);
      }}
    />
  );
}

function VariantBadge({ coef }: { coef: number }) {
  const variant = classBadgeVariant(coef);
  const label = variant === 'priority' ? '⚡ пріоритетний' : variant === 'mute' ? 'знижений' : 'звичайний';
  return <span className={variant === 'neutral' ? 'badge' : `badge ${variant}`}>{label}</span>;
}

export default function ClassPriorityTab() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [newName, setNewName] = useState('');
  const [newCoef, setNewCoef] = useState('1');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => fetchClasses().then(setClasses);

  useEffect(() => {
    reload().catch((e) => setErr(e instanceof Error ? e.message : 'Не вдалося завантажити.'));
  }, []);

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createClass({ name: newName, coef: Number(newCoef) || 1 });
      setNewName('');
      setNewCoef('1');
      await reload();
    } catch (e) {
      setErr(errorMessage(e, 'Не вдалося додати клас.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <AdminTable
        title="Приоритетність класів"
        hint="коефіцієнт множиться на бали активності при нарахуванні (1 — звичайний, >1.2 — пріоритетний, <0.8 — знижений); «Емодзі РБ» — реакція під постом збору на РБ, класи без емодзі в зборі не беруть участі"
        columns={COLUMNS}
        minWidth={760}
        header={['Клас', 'Коефіцієнт', 'Підсвітка', 'Емодзі РБ', '']}
        rows={classes}
        keyFn={(c) => c.id}
        emptyLabel="Класів ще немає."
        renderRow={(c) => [
          <TextInput key="name" initial={c.name} onSave={(v) => updateClass(c.id, { name: v }).then(reload).catch(reportError)} />,
          <CoefInput key="coef" initial={c.coef} onSave={(v) => updateClass(c.id, { coef: v }).then(reload).catch(reportError)} />,
          <VariantBadge key="badge" coef={c.coef} />,
          <EmojiInput key="emoji" initial={c.rbEmoji} onSave={(v) => updateClass(c.id, { rbEmoji: v }).then(reload).catch(reportError)} />,
          <span key="del" className="cell-actions">
            <button
              type="button"
              className="btn btn-bad btn-xs"
              title="Видалити"
              onClick={() => confirm(`Видалити клас «${c.name}»?`) && deleteClass(c.id).then(reload).catch(reportError)}
            >
              <IcoTrash />
            </button>
          </span>,
        ]}
        addRow={
          <>
            <label className="field">
              <span>Назва класу</span>
              <input type="text" value={newName} placeholder="Назва класу" onChange={(e) => setNewName(e.target.value)} />
            </label>
            <label className="field narrow">
              <span>Коефіцієнт</span>
              <input type="number" min={0} step={0.1} value={newCoef} onChange={(e) => setNewCoef(e.target.value)} />
            </label>
            <button type="button" className="btn btn-primary" disabled={busy || !newName.trim()} onClick={add}><IcoPlus /> Додати</button>
          </>
        }
      />
      {err && <p className="form-err">{err}</p>}
    </div>
  );
}
