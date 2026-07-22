import { useEffect, useState } from 'react';
import { errorMessage, reportError } from '../../app/errorMessage';
import AdminTable from '../../components/AdminTable';
import { createActivity, deleteActivity, fetchActivities, updateActivity } from '../../data/activities';
import type { Activity } from '../../data/types';
import { WEEKDAY_LABELS } from '../../data/types';

const COLUMNS = '1fr 100px 1fr 90px';

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
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const n = Number(value);
        if (!Number.isNaN(n) && n !== initial) onSave(n);
      }}
    />
  );
}

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const toggle = (d: number) => {
    const next = value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort();
    onChange(next);
  };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {WEEKDAY_LABELS.map((label, d) => (
        <button
          key={d}
          type="button"
          className={'btn btn-sm ' + (value.includes(d) ? 'btn-primary' : 'btn-ghost')}
          style={{ padding: '4px 9px', fontSize: 12 }}
          onClick={() => toggle(d)}
        >
          {label}
        </button>
      ))}
    </div>
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
    <div>
      <h3>Активності</h3>
      <AdminTable
        columns={COLUMNS}
        header={['Назва', 'Бали', 'Дні тижня', '']}
        rows={activities}
        keyFn={(a) => a.id}
        emptyLabel="Активностей ще немає."
        renderRow={(a) => [
          <TextInput key="name" initial={a.name} onSave={(v) => updateActivity(a.id, { name: v }).then(reload).catch(reportError)} />,
          <PointsInput key="pts" initial={a.points} onSave={(v) => updateActivity(a.id, { points: v }).then(reload).catch(reportError)} />,
          <WeekdayPicker key="days" value={a.weekdays} onChange={(v) => updateActivity(a.id, { weekdays: v }).then(reload).catch(reportError)} />,
          <button
            key="del"
            type="button"
            className="btn btn-bad btn-sm"
            onClick={() => confirm(`Видалити активність «${a.name}»?`) && deleteActivity(a.id).then(reload).catch(reportError)}
          >
            Видалити
          </button>,
        ]}
        addRow={
          <>
            <label className="field" style={{ flex: '1 1 200px' }}>
              <span>Назва</span>
              <input type="text" value={newName} placeholder="Назва активності" onChange={(e) => setNewName(e.target.value)} />
            </label>
            <label className="field" style={{ flex: '0 0 100px' }}>
              <span>Бали</span>
              <input type="number" min={0} value={newPoints} onChange={(e) => setNewPoints(e.target.value)} />
            </label>
            <div className="field" style={{ flex: '1 1 260px' }}>
              <span>Дні тижня</span>
              <WeekdayPicker value={newWeekdays} onChange={setNewWeekdays} />
            </div>
            <button type="button" className="btn btn-primary" disabled={busy || !newName.trim()} onClick={add}>+ Додати</button>
          </>
        }
      />
      {err && <p className="form-err">{err}</p>}
    </div>
  );
}
