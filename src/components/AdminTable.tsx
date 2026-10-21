// =========================================================
// Спільна "таблична" панель для адмін-табів (Новачки/Гравці/Ціна лута/
// Активності/Приоритетність класів/Доступ) — однакова структура: смужка
// панелі (заголовок + лічильник + підказка) + шапка колонок + редаговані
// рядки + рядок додавання внизу. Inline-редагування комірок і форма
// додавання — відповідальність кожного таба.
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
  /** Смужка панелі: заголовок і підказка. Без title — лише таблиця. */
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  /** Мінімальна ширина сітки — на вузьких екранах з'являється горизонтальний скрол. */
  minWidth?: number;
}

export default function AdminTable<T>({ columns, header, rows, keyFn, renderRow, addRow, emptyLabel, title, hint, actions, minWidth }: AdminTableProps<T>) {
  const table = (
    <div className="rowlist">
      <div className="rowlist-head" style={{ gridTemplateColumns: columns, minWidth }}>
        {header.map((h, i) => (
          <span key={i}>{h}</span>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="rowlist-empty">{emptyLabel ?? 'Порожньо.'}</p>
      ) : (
        rows.map((r) => (
          <div key={keyFn(r)} className="rowlist-row" style={{ gridTemplateColumns: columns, minWidth }}>
            {renderRow(r).map((cell, i) => (
              <span key={i}>{cell}</span>
            ))}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="panel">
      {title && (
        <div className="panel-head">
          <h3>{title}</h3>
          {rows.length > 0 && <span className="badge mute">{rows.length}</span>}
          {hint && <span className="panel-sub">{hint}</span>}
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      <div className="panel-body flush">{table}</div>
      {addRow && <div className="rowlist-add">{addRow}</div>}
    </div>
  );
}
