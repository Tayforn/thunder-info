// =========================================================
// Спільна "таблична" панель для 4 адмін-табів (Новачки/Ціна лута/
// Активності/Приоритетність класів) — однакова структура: шапка колонок +
// редаговані рядки + рядок додавання. Сам компонент лише хроми/лейаут
// (.rowlist* класи в styles.css); inline-редагування комірок і форма
// додавання — відповідальність кожного таба (значно різняться: select
// класу, чекбокс "камінь в шмот", мультиселект днів тижня тощо).
// =========================================================

import type { ReactNode } from 'react';

interface AdminTableProps<T> {
  /** CSS grid-template-columns, спільний для шапки й рядків. */
  columns: string;
  header: ReactNode[];
  rows: T[];
  keyFn: (item: T) => string;
  renderRow: (item: T) => ReactNode[];
  addRow?: ReactNode;
  emptyLabel?: string;
}

export default function AdminTable<T>({ columns, header, rows, keyFn, renderRow, addRow, emptyLabel }: AdminTableProps<T>) {
  return (
    <div className="rowlist">
      <div className="rowlist-head" style={{ gridTemplateColumns: columns }}>
        {header.map((h, i) => (
          <span key={i}>{h}</span>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="rowlist-empty hint">{emptyLabel ?? 'Порожньо.'}</p>
      ) : (
        rows.map((r) => (
          <div key={keyFn(r)} className="rowlist-row" style={{ gridTemplateColumns: columns }}>
            {renderRow(r).map((cell, i) => (
              <span key={i}>{cell}</span>
            ))}
          </div>
        ))
      )}
      {addRow && <div className="rowlist-add">{addRow}</div>}
    </div>
  );
}
