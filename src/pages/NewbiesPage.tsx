// =========================================================
// Публічна сторінка "Новачки" — ростер гільдії: клас (з підсвіткою
// пріоритетності) + сума балів активності, сортування за спаданням балів.
// Редагування новачків/класів — лише в /admin.
// =========================================================

import { useEffect, useState } from 'react';
import PageMeta from '../app/PageMeta';
import ClassBadge from '../components/ClassBadge';
import { fetchClasses } from '../data/classes';
import { fetchNewbieTotals, fetchNewbies } from '../data/newbies';
import type { ClassRow, Newbie } from '../data/types';

interface Row extends Newbie {
  cls: ClassRow | null;
  totalPoints: number;
}

export default function NewbiesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchNewbies(), fetchClasses(), fetchNewbieTotals()])
      .then(([newbies, classes, totals]) => {
        if (cancelled) return;
        const classById = new Map(classes.map((c) => [c.id, c]));
        const totalById = new Map(totals.map((t) => [t.newbieId, t.totalPoints]));
        const merged = newbies
          .map((n): Row => ({ ...n, cls: n.classId ? classById.get(n.classId) ?? null : null, totalPoints: totalById.get(n.id) ?? 0 }))
          .sort((a, b) => b.totalPoints - a.totalPoints);
        setRows(merged);
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : 'Не вдалося завантажити новачків.'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageMeta title="Новачки — Thunder" description="Ростер новачків гільдії Thunder: клас і активність." />
      <div className="section-head">
        <span className="eyebrow">Гільдія</span>
        <h2>Новачки</h2>
        <p>Клас підсвічено за пріоритетністю (⚡ — пріоритетний клас), сортування — за сумою балів активності.</p>
      </div>

      {err && <p className="form-err">{err}</p>}
      {!rows && !err && <p className="hint">Завантаження…</p>}

      {rows && (
        <div className="rowlist">
          <div className="rowlist-head" style={{ gridTemplateColumns: 'minmax(150px, 1fr) 160px 120px' }}>
            <span>Нікнейм</span>
            <span>Клас</span>
            <span>Бали</span>
          </div>
          {rows.length === 0 ? (
            <p className="rowlist-empty hint">Новачків ще немає.</p>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="rowlist-row" style={{ gridTemplateColumns: 'minmax(150px, 1fr) 160px 120px' }}>
                <span>{r.nickname}</span>
                <span><ClassBadge cls={r.cls} /></span>
                <span style={{ fontWeight: 700 }}>{r.totalPoints}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
