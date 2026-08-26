// =========================================================
// Three-state сортування по колонках (/players, /activity): перший клік
// по заголовку — firstDir, другий — протилежний напрям, третій — скидання
// до дефолтного порядку списку (групування за класом).
// =========================================================

import { useState } from 'react';

export type SortDir = 'asc' | 'desc';
export interface ColumnSort {
  col: string;
  dir: SortDir;
}

export function useColumnSort() {
  const [sort, setSort] = useState<ColumnSort | null>(null);

  const toggle = (col: string, firstDir: SortDir = 'asc') =>
    setSort((cur) => {
      if (!cur || cur.col !== col) return { col, dir: firstDir };
      if (cur.dir === firstDir) return { col, dir: firstDir === 'asc' ? 'desc' : 'asc' };
      return null;
    });

  return { sort, toggle };
}

/** Кнопка-заголовок колонки: успадковує вигляд .rowlist-head, показує
 * ▲/▼ коли сортування по цій колонці активне. firstDir — напрям першого
 * кліку (для балів природніше починати зі спадання). */
export function SortHeader({
  label,
  col,
  sort,
  onToggle,
  firstDir = 'asc',
}: {
  label: string;
  col: string;
  sort: ColumnSort | null;
  onToggle: (col: string, firstDir: SortDir) => void;
  firstDir?: SortDir;
}) {
  const active = sort?.col === col;
  return (
    <button
      type="button"
      className="sort-header"
      title="Клік — сортувати, повторний — навпаки, третій — скинути"
      onClick={() => onToggle(col, firstDir)}
    >
      {label}
      <span className="sort-header-arrow">{active ? (sort!.dir === 'asc' ? '▲' : '▼') : ''}</span>
    </button>
  );
}
