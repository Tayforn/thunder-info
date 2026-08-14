// Той самий CRUD-патерн, що NewbiesTab, але для гравців (без балів) +
// колонка нотатки.
import { useEffect, useState } from 'react';
import { errorMessage, reportError } from '../../app/errorMessage';
import AdminTable from '../../components/AdminTable';
import { fetchClasses } from '../../data/classes';
import { createPlayer, deletePlayer, fetchPlayers, updatePlayer } from '../../data/players';
import type { ClassRow, Player } from '../../data/types';

const COLUMNS = '1fr 200px 1fr 90px';

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

function TextCell({ initial, placeholder, onSave }: { initial: string; placeholder?: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== initial && onSave(value)}
    />
  );
}

export default function PlayersTab() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [newNickname, setNewNickname] = useState('');
  const [newClassId, setNewClassId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = () =>
    Promise.all([fetchPlayers(), fetchClasses()]).then(([p, c]) => {
      setPlayers(p);
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
      await createPlayer({ nickname: newNickname, classId: newClassId });
      setNewNickname('');
      setNewClassId(null);
      await reload();
    } catch (e) {
      setErr(errorMessage(e, 'Не вдалося додати гравця.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3>Гравці</h3>
      <AdminTable
        columns={COLUMNS}
        header={['Нікнейм', 'Клас', 'Нотатка', '']}
        rows={players}
        keyFn={(p) => p.id}
        emptyLabel="Гравців ще немає."
        renderRow={(p) => [
          <TextCell key="nick" initial={p.nickname} onSave={(v) => v.trim() && updatePlayer(p.id, { nickname: v }).then(reload).catch(reportError)} />,
          <ClassSelect key="cls" classes={classes} value={p.classId} onChange={(v) => updatePlayer(p.id, { classId: v }).then(reload).catch(reportError)} />,
          <TextCell key="note" initial={p.note ?? ''} placeholder="—" onSave={(v) => updatePlayer(p.id, { note: v || null }).then(reload).catch(reportError)} />,
          <button
            key="del"
            type="button"
            className="btn btn-bad btn-sm"
            onClick={() => confirm(`Видалити гравця «${p.nickname}»? Історія відвідуваності теж зникне.`) && deletePlayer(p.id).then(reload).catch(reportError)}
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
