import type { ClassRow } from '../data/types';
import { classBadgeVariant } from '../data/types';

/** Бейдж класу з підсвіткою пріоритетності (коеф з "Приоритетність
 * класів") — priority (coef>1.2, яскравий glow), mute (coef<0.8), інакше
 * нейтральний бейдж без класу-модифікатора. */
export default function ClassBadge({ cls }: { cls: ClassRow | null | undefined }) {
  if (!cls) return <span className="badge mute">без класу</span>;
  const variant = classBadgeVariant(cls.coef);
  const cls2 = variant === 'neutral' ? 'badge' : `badge ${variant}`;
  return (
    <span className={cls2} title={`Коефіцієнт: ${cls.coef}`}>
      {cls.name}
      {variant === 'priority' && ' ⚡'}
    </span>
  );
}
