// =========================================================
// Мультиселект днів тижня (0=неділя..6=субота, як Postgres extract(dow))
// — спільний для табів "Активності" та "Евенти". Показуємо Пн..Нд, зберігаємо
// у системі dow.
// =========================================================

import { WEEKDAY_LABELS } from '../data/types';

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const toggle = (d: number) => {
    const next = value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort();
    onChange(next);
  };
  return (
    <div className="seg seg-sm" role="group" aria-label="Дні тижня">
      {ORDER.map((d) => (
        <button key={d} type="button" className={value.includes(d) ? 'is-on' : ''} aria-pressed={value.includes(d)} onClick={() => toggle(d)}>
          {WEEKDAY_LABELS[d]}
        </button>
      ))}
    </div>
  );
}
