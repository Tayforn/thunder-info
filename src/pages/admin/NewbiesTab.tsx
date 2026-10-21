import { useEffect, useState } from 'react';
import { errorMessage, reportError } from '../../app/errorMessage';
import AdminTable from '../../components/AdminTable';
import { IcoPlus, IcoTrash } from '../../components/Icons';
import { fetchClasses } from '../../data/classes';
import { createNewbie, deleteNewbie, fetchNewbies, updateNewbie } from '../../data/newbies';
import { promoteNewbieToPlayer } from '../../data/players';
import type { ClassRow, Newbie } from '../../data/types';

const COLUMNS = 'minmax(160px, 1fr) 200px 220px';

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
    <div className="stack">
      <AdminTable
        title="Новачки"
        hint="бали новачкам нараховує крон увечері за галочками з «Активності»"
        columns={COLUMNS}
        minWidth={620}
        header={['Нікнейм', 'Клас', '']}
        rows={newbies}
        keyFn={(n) => n.id}
        emptyLabel="Новачків ще немає."
        renderRow={(n) => [
          <NicknameInput key="nick" initial={n.nickname} onSave={(v) => updateNewbie(n.id, { nickname: v }).then(reload).catch(reportError)} />,
          <ClassSelect key="cls" classes={classes} value={n.classId} onChange={(v) => updateNewbie(n.id, { classId: v }).then(reload).catch(reportError)} />,
          <span key="actions" className="cell-actions">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              title="Перевести в гравці: історія відвідуваності збережеться, бали новачка (point_awards) зникнуть — у гравців бали рахуються інакше."
              onClick={() =>
                confirm(`Перевести «${n.nickname}» у гравці? Історія відвідуваності збережеться, бали новачка зникнуть.`) &&
                promoteNewbieToPlayer(n).then(reload).catch(reportError)
              }
            >
              У гравці →
            </button>
            <button
              type="button"
              className="btn btn-bad btn-xs"
              title="Видалити"
              onClick={() => confirm(`Видалити новачка «${n.nickname}»?`) && deleteNewbie(n.id).then(reload).catch(reportError)}
            >
              <IcoTrash />
            </button>
          </span>,
        ]}
        addRow={
          <>
            <label className="field">
              <span>Нікнейм</span>
              <input type="text" value={newNickname} placeholder="Нікнейм" onChange={(e) => setNewNickname(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            </label>
            <label className="field mid">
              <span>Клас</span>
              <ClassSelect classes={classes} value={newClassId} onChange={setNewClassId} />
            </label>
            <button type="button" className="btn btn-primary" disabled={busy || !newNickname.trim()} onClick={add}><IcoPlus /> Додати</button>
          </>
        }
      />
      {err && <p className="form-err">{err}</p>}
    </div>
  );
}
