import { useEffect, useState } from 'react';
import { errorMessage, reportError } from '../../app/errorMessage';
import AdminTable from '../../components/AdminTable';
import { IcoPlus, IcoTrash } from '../../components/Icons';
import WeekdayPicker from '../../components/WeekdayPicker';
import { createActivity, deleteActivity, fetchActivities, updateActivity } from '../../data/activities';
import type { Activity } from '../../data/types';

const COLUMNS = 'minmax(160px, 1fr) 90px 300px 60px';

function TextInput({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return <input type="text" value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => value.trim() && value !== initial && onSave(value)} />;
}

function PointsInput({ initial, onSave }: { initial: number; onSave: (v: number) => void }) {
  const [value, setValue] = useState(String(initial));
  useEffect(() => setValue(String(initial)), [initial]);
  return (
    <input
      type="number"
      min={0}
      value={value}
      className="num"
      style={{ textAlign: 'center' }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const n = Number(value);
        if (!Number.isNaN(n) && n !== initial) onSave(n);
      }}
    />
  );
}

export default function ActivitiesTab() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [newName, setNewName] = useState('');
  const [newPoints, setNewPoints] = useState('1');
  const [newWeekdays, setNewWeekdays] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => fetchActivities().then(setActivities);

  useEffect(() => {
    reload().catch((e) => setErr(e instanceof Error ? e.message : 'Не вдалося завантажити.'));
  }, []);

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await createActivity({ name: newName, points: Number(newPoints) || 0, weekdays: newWeekdays });
      setNewName('');
      setNewPoints('1');
      setNewWeekdays([]);
      await reload();
    } catch (e) {
      setErr(errorMessage(e, 'Не вдалося додати активність.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <AdminTable
        title="Активності"
        hint="дні тижня визначають, у які дні активність зʼявляється на сторінці «Активність»"
        columns={COLUMNS}
        minWidth={660}
        header={['Назва', 'Бали', 'Дні тижня', '']}
        rows={activities}
        keyFn={(a) => a.id}
        emptyLabel="Активностей ще немає."
        renderRow={(a) => [
          <TextInput key="name" initial={a.name} onSave={(v) => updateActivity(a.id, { name: v }).then(reload).catch(reportError)} />,
          <PointsInput key="pts" initial={a.points} onSave={(v) => updateActivity(a.id, { points: v }).then(reload).catch(reportError)} />,
          <WeekdayPicker key="days" value={a.weekdays} onChange={(v) => updateActivity(a.id, { weekdays: v }).then(reload).catch(reportError)} />,
          <span key="del" className="cell-actions">
            <button
              type="button"
              className="btn btn-bad btn-xs"
              title="Видалити"
              onClick={() => confirm(`Видалити активність «${a.name}»?`) && deleteActivity(a.id).then(reload).catch(reportError)}
            >
              <IcoTrash />
            </button>
          </span>,
        ]}
        addRow={
          <>
            <label className="field">
              <span>Назва</span>
              <input type="text" value={newName} placeholder="Назва активності" onChange={(e) => setNewName(e.target.value)} />
            </label>
            <label className="field narrow" style={{ flexBasis: 90 }}>
              <span>Бали</span>
              <input type="number" min={0} value={newPoints} onChange={(e) => setNewPoints(e.target.value)} />
            </label>
            <div className="field" style={{ flex: '0 0 auto' }}>
              <span>Дні тижня</span>
              <WeekdayPicker value={newWeekdays} onChange={setNewWeekdays} />
            </div>
            <button type="button" className="btn btn-primary" disabled={busy || !newName.trim()} onClick={add}><IcoPlus /> Додати</button>
          </>
        }
      />
      {err && <p className="form-err">{err}</p>}
    </div>
  );
}
