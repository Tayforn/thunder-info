// =========================================================
// Спільні сортування/фільтр по класах для списків гравців (/activity,
// /players): групування за sort_order класу (як у "Приоритетності
// класів", без класу — в кінець), чіпи-фільтр з мультивибором
// (порожній вибір = усі).
// =========================================================

import { useMemo, useState } from 'react';
import type { ClassRow } from '../data/types';

interface HasClass {
  classId: string | null;
  nickname: string;
}

/** Позиція класу людини в порядку "Приоритетності класів"; без класу — в кінець. */
export function classOrder(p: HasClass, classById: Map<string, ClassRow>): number {
  return (p.classId ? classById.get(p.classId)?.sortOrder : undefined) ?? Number.MAX_SAFE_INTEGER;
}

export function sortByClass<T extends HasClass>(people: T[], classById: Map<string, ClassRow>): T[] {
  return people.slice().sort((a, b) => classOrder(a, classById) - classOrder(b, classById) || a.nickname.localeCompare(b.nickname));
}

export interface ClassFilterState {
  /** Чіпи — лише класи, в яких є люди, + 'none' ("Без класу") за потреби. */
  chips: { key: string; label: string }[];
  selected: Set<string>;
  toggle: (key: string) => void;
  clear: () => void;
  visible: <T extends HasClass>(people: T[]) => T[];
}

export function useClassFilter(people: HasClass[], classById: Map<string, ClassRow>): ClassFilterState {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const chips = useMemo(() => {
    const usedClassIds = new Set(people.map((p) => p.classId).filter((id): id is string => !!id));
    const result = Array.from(usedClassIds, (id) => classById.get(id))
      .filter((c): c is ClassRow => !!c)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({ key: c.id, label: c.name }));
    if (people.some((p) => !p.classId)) result.push({ key: 'none', label: 'Без класу' });
    return result;
  }, [people, classById]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const visible = <T extends HasClass>(list: T[]): T[] =>
    selected.size === 0 ? list : list.filter((p) => selected.has(p.classId ?? 'none'));

  return { chips, selected, toggle, clear: () => setSelected(new Set()), visible };
}

/** Рядок чіпів; ховається, коли фільтрувати нема між чим (один клас). */
export function ClassFilterChips({ filter }: { filter: ClassFilterState }) {
  if (filter.chips.length <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }} role="group" aria-label="Фільтр по класах">
      <button
        type="button"
        className={'btn btn-sm ' + (filter.selected.size === 0 ? 'btn-primary' : 'btn-ghost')}
        onClick={filter.clear}
      >
        Всі
      </button>
      {filter.chips.map((c) => (
        <button
          key={c.key}
          type="button"
          className={'btn btn-sm ' + (filter.selected.has(c.key) ? 'btn-primary' : 'btn-ghost')}
          onClick={() => filter.toggle(c.key)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
