import { useEffect, useState } from 'react';
import { errorMessage, reportError } from '../../app/errorMessage';
import AdminTable from '../../components/AdminTable';
import { fetchClasses } from '../../data/classes';
import { createNewbie, deleteNewbie, fetchNewbies, updateNewbie } from '../../data/newbies';
import type { ClassRow, Newbie } from '../../data/types';

const COLUMNS = '1fr 200px 90px';

function ClassSelect({ classes, value, onChange }: { classes: ClassRow[]; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— без класу —</option>
      {classes.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}

function NicknameInput({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value.trim() && value !== initial && onSave(value)}
    />
  );
}

export default function NewbiesTab() {
  const [newbies, setNewbies] = useState<Newbie[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [newNickname, setNewNickname] = useState('');
  const [newClassId, setNewClassId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = () =>
    Promise.all([fetchNewbies(), fetchClasses()]).then(([n, c]) => {
      setNewbies(n);
      setClasses(c);
    });

  useEffect(() => {
    reload().catch((e) => setErr(e instanceof Error ? e.message : 'Не вдалося завантажити.'));
  }, []);

  const add = async () => {
    if (!newNickname.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createNewbie({ nickname: newNickname, classId: newClassId });
      setNewNickname('');
      setNewClassId(null);
      await reload();
    } catch (e) {
      setErr(errorMessage(e, 'Не вдалося додати новачка.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3>Новачки</h3>
      <AdminTable
        columns={COLUMNS}
        header={['Нікнейм', 'Клас', '']}
        rows={newbies}
        keyFn={(n) => n.id}
        emptyLabel="Новачків ще немає."
        renderRow={(n) => [
          <NicknameInput key="nick" initial={n.nickname} onSave={(v) => updateNewbie(n.id, { nickname: v }).then(reload).catch(reportError)} />,
          <ClassSelect key="cls" classes={classes} value={n.classId} onChange={(v) => updateNewbie(n.id, { classId: v }).then(reload).catch(reportError)} />,
          <button
            key="del"
            type="button"
            className="btn btn-bad btn-sm"
            onClick={() => confirm(`Видалити новачка «${n.nickname}»?`) && deleteNewbie(n.id).then(reload).catch(reportError)}
          >
            Видалити
          </button>,
        ]}
        addRow={
          <>
            <label className="field" style={{ flex: '1 1 220px' }}>
              <span>Нікнейм</span>
              <input type="text" value={newNickname} placeholder="Нікнейм" onChange={(e) => setNewNickname(e.target.value)} />
            </label>
            <label className="field" style={{ flex: '0 0 200px' }}>
              <span>Клас</span>
              <ClassSelect classes={classes} value={newClassId} onChange={setNewClassId} />
            </label>
            <button type="button" className="btn btn-primary" disabled={busy || !newNickname.trim()} onClick={add}>+ Додати</button>
          </>
        }
      />
      {err && <p className="form-err">{err}</p>}
    </div>
  );
}
