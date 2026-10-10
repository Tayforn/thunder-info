// =========================================================
// Мультиселект днів тижня (0=неділя..6=субота, як Postgres extract(dow))
// — спільний для табів "Активності" та "Евенти".
// =========================================================

import { WEEKDAY_LABELS } from '../data/types';

export default function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
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
