// =========================================================
// "/" — публічна About-сторінка гільдії: хто ми, вимоги до кандидатів,
// як влаштований фарм/лут/скіли, і що запитуємо на співбесіді. Текст
// зібраний з брифу гільдмайстра + офіційної теми на форумі сервера
// (https://forum.cyberpw.fun/index.php?threads/high-voltagethunderhigh-voltage.252/).
// Раніше тут була сторінка ціни лута/фарму Р8 — вона винесена на "/farm".
// =========================================================

import { useEffect, useState } from 'react';
import PageMeta from '../app/PageMeta';
import { formatPrice, formatPriceExact } from '../app/formatPrice';
import { fetchLootItems } from '../data/lootItems';
import { fetchGearItemComponents, fetchGearItems } from '../data/gearItems';
import type { GearItemComponent, LootItem } from '../data/types';
import { calcFarmWeeks } from '../data/khFarm';

const FORUM_URL = 'https://forum.cyberpw.fun/index.php?threads/high-voltagethunderhigh-voltage.252/';
const DISCORD_URL = 'https://discord.gg/p8bYdfKBQd';
const WINDOW_OPTIONS = [1, 2, 3, 4];

interface GearFarmRow {
  id: string;
  name: string;
  price: number;
  weeksByWindows: (number | null)[];
}

function computeGearFarmRow(name: string, gearComponents: GearItemComponent[], lootById: Map<string, LootItem>): GearFarmRow {
  const neededByLoot = new Map<string, number>();
  for (const c of gearComponents) neededByLoot.set(c.lootItemId, (neededByLoot.get(c.lootItemId) ?? 0) + c.quantity);
  const needs = Array.from(neededByLoot, ([lootItemId, needed]) => ({ item: lootById.get(lootItemId), needed }))
    .filter((n): n is { item: LootItem; needed: number } => !!n.item);
  const price = needs.reduce((sum, n) => sum + n.needed * n.item.price, 0);
  const weeksByWindows = WINDOW_OPTIONS.map((w) => calcFarmWeeks(needs, w).totalWeeks);
  return { id: name, name, price, weeksByWindows };
}

const TRAITS = [
  'Весь PvP та PvE контент',
  'TW, КХ, світові боси',
  'Живий Discord і купа мемів',
  'Допомога своїм, рофли над чужими (і ще більше над своїми)',
  "В міру токсичне ком'юніті",
  "Навчимо, підскажемо, забулимо (не обов'язково саме в такому порядку)",
  'Баталії як в світі, так і в світовому чатику',
  'Навчимо брати асіст в серверному Discord каналі',
];

export default function HomePage() {
  const [rows, setRows] = useState<GearFarmRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLootItems(), fetchGearItems(), fetchGearItemComponents()])
      .then(([loot, gear, comps]) => {
        if (cancelled) return;
        const lootById = new Map(loot.map((l) => [l.id, l]));
        if (gear.length === 0) {
          setRows([]);
          return;
        }
        const fullSetRow = computeGearFarmRow('Весь сет Р8', comps, lootById);
        const gearRows = gear.map((g) => computeGearFarmRow(g.name, comps.filter((c) => c.gearItemId === g.id), lootById));
        setRows([fullSetRow, ...gearRows]);
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : 'Не вдалося завантажити дані фарму.'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageMeta
        title="Thunder — гільдія"
        description="PvPvE • КХ • TW • FUN. Живий Discord, весь контент сервера і трохи мемів. Дізнайся, як влаштоване життя гільдії Thunder."
      />

      <div className="hero-banner">
        <img src={import.meta.env.BASE_URL + 'assets/thunder-hero.gif'} alt="Thunder" />
        <div>
          <span className="eyebrow">Гільдія Thunder</span>
          <h1>PvPvE • КХ • TW • FUN</h1>
          <p>Like Thunder from the sky, sworn to fight and die 💪⚡⚡⚡</p>
          <a href={DISCORD_URL} target="_blank" rel="noopener" className="btn btn-primary" style={{ marginTop: 14 }}>
            Приєднатися в Discord
          </a>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 8 }}>
        <span className="eyebrow">Про нас</span>
        <h2>Чому Thunder</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, marginBottom: 8 }}>
        {TRAITS.map((t) => (
          <div key={t} className="card" style={{ padding: '14px 18px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--good)', fontWeight: 700, flex: '0 0 auto' }}>✔</span>
            <span>{t}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 20, textAlign: 'center' }}>
        <p style={{ fontSize: 17, fontStyle: 'italic', margin: 0, color: 'var(--text-dim)' }}>
          «Поки інші збирають альянс, щоб задавити нас числом, ми просто виходимо битися.
          <br />
          Не обіцяємо легкого життя, але — буде весело)»
        </p>
      </div>

      <div className="section-head" style={{ marginTop: 32 }}>
        <span className="eyebrow">Наживо</span>
        <h2>Чому вигідніше фармити кланом</h2>
        <p>
          Весь лут з КХ іде в клан-банк, а не осідає в кожного соло — тож шмотка фармиться настільки швидше, у скільки вікон її
          фактично тягнуть: своїм одним персонажем, чи разом із твінками/кланом у 2–4. Вигода реальна лише за умови, що фармиш
          регулярно й активно скидаєш лут у банк — просто перебувати в клані недостатньо.
        </p>
      </div>
      {err && <p className="form-err">{err}</p>}
      {!rows && !err && <p className="hint">Завантаження…</p>}
      {rows && rows.length === 0 && <p className="hint">Шмоток ще не додано (керування — на сторінці «Р8»).</p>}
      {rows && rows.length > 0 && (
        <>
          <div className="rowlist" style={{ marginBottom: 8 }}>
            <div className="rowlist-head" style={{ gridTemplateColumns: '1fr 110px 72px 72px 72px 72px' }}>
              <span>Шмотка</span>
              <span>Ціна</span>
              <span>1 перс</span>
              <span>2 перса</span>
              <span>3 перса</span>
              <span>4 перса</span>
            </div>
            {rows.map((r, i) => (
              <div
                key={r.id}
                className="rowlist-row"
                style={{ gridTemplateColumns: '1fr 110px 72px 72px 72px 72px', fontWeight: i === 0 ? 700 : 400 }}
              >
                <span>{r.name}</span>
                <span title={formatPriceExact(r.price)}>{formatPrice(r.price)}</span>
                {r.weeksByWindows.map((w, wi) => (
                  <span key={wi} title={w === null ? 'немає дропу' : `${w} тижн.`}>
                    {w === null ? '—' : w}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="hint">
            Значення в колонках «N перс» — тижні соло-фарму цією кількістю персонажів одночасно. Черга крафту й видачі лута з
            РБ визначається активністю та пріоритетністю класу — хто найбільше долучається, той раніше отримує своє. Власний
            набір і точний калькулятор — на сторінці «Р8 фарм».
          </p>
        </>
      )}

      <div className="section-head" style={{ marginTop: 32 }}>
        <span className="eyebrow">Вимоги</span>
        <h2>Кого ми шукаємо</h2>
      </div>
      <div className="card">
        <p>
          <strong>⚠️ Головна вимога — готовність заходити в{' '}
          <a href={DISCORD_URL} target="_blank" rel="noopener" className="link">Discord</a> під час івентів.</strong> Якщо
          так, з імовірністю ~90% ти нам підходиш — це перше, що уточнюємо на співбесіді.
        </p>
        <p style={{ marginBottom: 0 }}>
          <strong>Онлайн — мінімум 2 години на день у грі.</strong> Менше — на жаль, не підходить під наш темп.
        </p>
      </div>

      <div className="section-head" style={{ marginTop: 32 }}>
        <span className="eyebrow">Механіки клану</span>
        <h2>Як влаштоване життя гільдії</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>🛡️ Фарм КХ</h3>
          <p style={{ marginBottom: 0 }}>
            Фарм КХ у нас відбувається на клан-банк: усе, що падає під час фарму, скидається туди. З цих ресурсів по черзі
            крафтяться шмотки 8 рангу для членів клану.
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>⚔️ Лут з РБ</h3>
          <p style={{ marginBottom: 0 }}>
            Лут з рейд-босів видається в порядку черги. Черга залежить від активності в клані, участі у РБ і прокачаності
            персонажа.
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>📚 Банк скілів</h3>
          <p style={{ marginBottom: 0 }}>
            Повторювані скіли, які вже є у когось із клану, складаються у спільний банк — звідти можна забрати ті, яких у тебе
            ще немає.
          </p>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 32 }}>
        <span className="eyebrow">Співбесіда</span>
        <h2>Що запитаємо при вступі</h2>
        <p>
          Мета розмови — зрозуміти, чи людина адекватна, чи підходить їй стиль гри клану, і чи готова вона до наших вимог та
          активностей. Нічого страшного: якщо ти новачок, тут же підкажемо з фармом і розвитком персонажа.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>1️⃣ Попередня гільдія</h3>
          <p style={{ marginBottom: 0 }}>
            З якої гільдії перейшов (якщо була)? Чи були конфлікти — і з якого приводу? Якщо був свідком конфлікту — на чиєму
            боці був?
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>2️⃣ Онлайн</h3>
          <p style={{ marginBottom: 0 }}>
            Скільки часу проводиш у грі? <span className="badge bad">Менше 2 год/день — не підходить.</span>
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>3️⃣ Спосіб фарму</h3>
          <p style={{ marginBottom: 0 }}>Як плануєш фармити — донат, конста чи твіни? Так ми зрозуміємо твій план розвитку персонажа.</p>
        </div>
      </div>

      <p className="hint" style={{ marginTop: 32 }}>
        Більше про нас — на{' '}
        <a href={FORUM_URL} target="_blank" rel="noopener" className="link">
          офіційній темі гільдії на форумі сервера
        </a>
        .
      </p>
    </div>
  );
}
