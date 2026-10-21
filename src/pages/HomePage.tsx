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
import { copyText } from '../app/clipboard';
import { fetchLadderPreview, type LadderPreviewEntry } from '../data/ladderPreview';
import { CALC_REFINE_URL, LADDER_PRIZE_CHESTS, LADDER_URL, PAST_TOURNAMENT_600, RECRUITMENT_OFFICERS } from '../data/community';
import { IcoBolt, IcoBook, IcoCheck, IcoClock, IcoCoins, IcoCopy, IcoDiscord, IcoShield, IcoSword, IcoTrophy, IcoUsers } from '../components/Icons';
import PvpBlock from '../components/PvpBlock';

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
  'Живий Discord і купа мемів',
  'Допомога своїм, рофли над чужими (і ще більше над своїми)',
  "В міру токсичне ком'юніті",
  "Навчимо, підскажемо, забулимо (не обов'язково саме в такому порядку)",
  'Навчимо брати асіст в серверному Discord каналі',
  'Клан-банк на фарм КХ → крафт Р8 для всіх',
  'Турніри, розіграші та конкурси спільноти',
];

const FARM_COLS = 'minmax(160px, 1fr) 110px repeat(4, 76px)';

/** Клікабельний нік — копіює в буфер, на 1.2с показує підтвердження. */
function CopyableNick({ nickname }: { nickname: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={'chip' + (copied ? ' is-on' : '')}
      title="Клік — скопіювати нік"
      onClick={() => {
        copyText(nickname);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <><IcoCheck style={{ width: 13, height: 13 }} /> Скопійовано</> : <><IcoCopy style={{ width: 13, height: 13 }} /> {nickname}</>}
    </button>
  );
}

export default function HomePage() {
  const [rows, setRows] = useState<GearFarmRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ladderTop, setLadderTop] = useState<LadderPreviewEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLadderPreview(5)
      .then((top) => !cancelled && setLadderTop(top))
      .catch(() => !cancelled && setLadderTop([]));
    return () => {
      cancelled = true;
    };
  }, []);

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
    <div className="page">
      <PageMeta
        title="Thunder — гільдія"
        description="PvPvE • КХ • TW • FUN. Живий Discord, клан-банк на крафт Р8, турніри та конкурси спільноти. Дізнайся, як влаштоване життя гільдії Thunder."
      />

      <section className="hero">
        <img className="hero-crest" src={import.meta.env.BASE_URL + 'assets/thunder-hero.gif'} alt="Thunder" />
        <div className="hero-text">
          <span className="eyebrow">Гільдія Thunder</span>
          <h1>
            PvPvE<span className="sep">•</span>КХ<span className="sep">•</span>TW<span className="sep">•</span>FUN
          </h1>
          <p>Like Thunder from the sky, sworn to fight and die 💪⚡⚡⚡</p>
          <div className="hero-actions">
            <a href={DISCORD_URL} target="_blank" rel="noopener" className="btn btn-discord">
              <IcoDiscord /> Приєднатися в Discord
            </a>
            <a href={FORUM_URL} target="_blank" rel="noopener" className="btn btn-ghost">
              Тема на форумі
            </a>
          </div>
        </div>
        <div className="hero-facts">
          <div className="tile icon">
            <span className="tile-i"><IcoDiscord /></span>
            <span className="tile-l">Головна вимога</span>
            <span className="tile-v text">Discord на івентах</span>
            <span className="tile-s">готовність заходити під час івентів</span>
          </div>
          <div className="tile icon">
            <span className="tile-i"><IcoClock /></span>
            <span className="tile-l">Онлайн</span>
            <span className="tile-v text">2+ год / день</span>
            <span className="tile-s">менше — не підходить під наш темп</span>
          </div>
          <div className="tile icon">
            <span className="tile-i"><IcoCoins /></span>
            <span className="tile-l">Фарм</span>
            <span className="tile-v text">На клан-банк</span>
            <span className="tile-s">з нього крафтяться шмотки Р8 по черзі</span>
          </div>
        </div>
      </section>

      <PvpBlock />

      <div className="section-head">
        <span className="eyebrow">Спільнота сервера</span>
        <h2>Розіграші та конкурси</h2>
        <p>
          Окрім клану, та сама команда веде й сусідні проєкти сервера — турніри, марафон заточки й калькулятори (посилання є
          і в шапці сайту: «PvP», «Ладдер», «Хелпер»).
        </p>
      </div>
      <div className="feature-grid">
        <div className="panel feature">
          <div className="panel-head">
            <h3><IcoBolt /> Ладдер страждання</h3>
            <span className="panel-sub">КХ-марафон заточки</span>
          </div>
          <div className="panel-body stack sm">
            <p>
              Хто підніме шмотку на найвищий рівень і за найменше спроб. Лідери вже далеко попереду, але рахується будь-яка
              спроба — доєднатися можна в будь-який момент.
            </p>
            {ladderTop === null && <p className="loading"><span className="spinner" /> Завантаження…</p>}
            {ladderTop !== null && ladderTop.length === 0 && <p className="hint">Поки що немає результатів.</p>}
            {ladderTop !== null && ladderTop.length > 0 && (
              <div className="stack sm">
                {ladderTop.map((e, i) => (
                  <div key={e.nickname} className="row between">
                    <span className="row" style={{ gap: 8 }}>
                      <span className={'medal' + (i < 3 ? ` m${i + 1}` : '')} style={{ width: 24, height: 24, fontSize: 11 }}>{i + 1}</span>
                      <b>{e.nickname}</b>
                    </span>
                    <span className="badge mute">+{e.level} · {e.attempts} спроб</span>
                  </div>
                ))}
              </div>
            )}
            <p className="hint">Минулого розіграшу фонд {LADDER_PRIZE_CHESTS} скринь розподілили між топ-10 місць ладдера.</p>
          </div>
          <div className="panel-foot">
            <a href={LADDER_URL} target="_blank" rel="noopener" className="link">Перейти до ладдера →</a>
          </div>
        </div>

        <div className="panel feature">
          <div className="panel-head">
            <h3><IcoTrophy /> Турнір на {PAST_TOURNAMENT_600.prizeChests} скринь</h3>
          </div>
          <div className="panel-body">
            Один з минулих турнірів розігрував призовий фонд у {PAST_TOURNAMENT_600.prizeChests} скринь — сітка й фінальні
            результати за посиланням.
          </div>
          <div className="panel-foot">
            <a href={PAST_TOURNAMENT_600.bracketUrl} target="_blank" rel="noopener" className="link">Сітка турніру →</a>
          </div>
        </div>

        <div className="panel feature">
          <div className="panel-head">
            <h3><IcoCoins /> Калькулятор заточки</h3>
            <span className="panel-sub">PW Хелпер</span>
          </div>
          <div className="panel-body">
            Калькулятор на calc.thunderpw.fun/refine рахує найдешевший очікуваний план заточки шмотки з одного рівня до
            бажаного (камені, шанси, штраф при невдачі) — зроблений спеціально під наш сервер.
          </div>
          <div className="panel-foot">
            <a href={CALC_REFINE_URL} target="_blank" rel="noopener" className="link">Відкрити калькулятор →</a>
          </div>
        </div>
      </div>

      <div className="section-head">
        <span className="eyebrow">Про нас</span>
        <h2>Чому Thunder</h2>
      </div>
      <div className="traits">
        {TRAITS.map((t) => (
          <div key={t} className="trait">
            <span className="trait-i"><IcoCheck /></span>
            <span>{t}</span>
          </div>
        ))}
      </div>

      <blockquote className="quote">
        Поки інші збирають альянс, щоб задавити нас числом, ми просто виходимо битися.
        <br />
        Не обіцяємо легкого життя, але — буде весело)
      </blockquote>

      <div className="section-head">
        <span className="eyebrow">Наживо</span>
        <h2>Чому вигідніше фармити кланом</h2>
        <p>
          Весь лут з КХ іде в клан-банк, а не осідає в кожного соло — тож шмотка фармиться настільки швидше, у скільки вікон її
          фактично тягнуть: своїм одним персонажем, чи разом із твінками/кланом у 2–4. Вигода реальна лише за умови, що фармиш
          регулярно й активно скидаєш лут у банк — просто перебувати в клані недостатньо.
        </p>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h3><IcoCoins /> Тижнів фарму на шмотку</h3>
          <span className="panel-sub">за кількістю вікон КХ одночасно</span>
          <div className="panel-actions">
            <button type="button" className="btn btn-ghost btn-xs" data-goto="farm">Калькулятор →</button>
          </div>
        </div>
        <div className="panel-body flush">
          {err && <p className="form-err" style={{ padding: 14 }}>{err}</p>}
          {!rows && !err && <p className="loading" style={{ padding: '10px 14px' }}><span className="spinner" /> Завантаження…</p>}
          {rows && rows.length === 0 && <p className="rowlist-empty">Шмоток ще не додано (керування — на сторінці «Шмотки Р8»).</p>}
          {rows && rows.length > 0 && (
            <div className="rowlist">
              <div className="rowlist-head" style={{ gridTemplateColumns: FARM_COLS }}>
                <span>Шмотка</span>
                <span>Ціна</span>
                <span>1 перс</span>
                <span>2 перса</span>
                <span>3 перса</span>
                <span>4 перса</span>
              </div>
              {rows.map((r, i) => (
                <div key={r.id} className={'rowlist-row' + (i === 0 ? ' highlight strong' : '')} style={{ gridTemplateColumns: FARM_COLS }}>
                  <span className="cell-ellipsis">{r.name}</span>
                  <span className="cell-price" title={formatPriceExact(r.price)}>{formatPrice(r.price)}</span>
                  {r.weeksByWindows.map((w, wi) => (
                    <span key={wi} className="num" title={w === null ? 'немає дропу' : `${w} тижн.`}>
                      {w === null ? '—' : <>{w}<span className="hint"> тижн.</span></>}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        {rows && rows.length > 0 && (
          <div className="panel-foot">
            Значення в колонках «N перс» — тижні соло-фарму цією кількістю персонажів одночасно. Черга крафту й видачі лута з
            РБ визначається активністю та пріоритетністю класу — хто найбільше долучається, той раніше отримує своє. Власний
            набір і точний калькулятор — на сторінці «Р8 фарм».
          </div>
        )}
      </div>

      <div className="section-head">
        <span className="eyebrow">Вимоги</span>
        <h2>Кого ми шукаємо</h2>
      </div>
      <div className="req">
        <div className="req-item">
          <span className="req-ico"><IcoDiscord /></span>
          <div>
            <b>Discord під час івентів</b>
            <p>
              Головна вимога — готовність заходити в{' '}
              <a href={DISCORD_URL} target="_blank" rel="noopener" className="link">Discord</a> під час івентів. Якщо так, з
              імовірністю ~90% ти нам підходиш — це перше, що уточнюємо на співбесіді.
            </p>
          </div>
        </div>
        <div className="req-item">
          <span className="req-ico"><IcoClock /></span>
          <div>
            <b>Онлайн — мінімум 2 години на день</b>
            <p>Менше — на жаль, не підходить під наш темп.</p>
          </div>
        </div>
      </div>

      <div className="section-head">
        <span className="eyebrow">Механіки клану</span>
        <h2>Як влаштоване життя гільдії</h2>
      </div>
      <div className="feature-grid">
        <div className="panel feature">
          <div className="panel-head"><h3><IcoShield /> Фарм КХ</h3></div>
          <div className="panel-body">
            Фарм КХ у нас відбувається на клан-банк: усе, що падає під час фарму, скидається туди. З цих ресурсів по черзі
            крафтяться шмотки 8 рангу для членів клану.
          </div>
        </div>
        <div className="panel feature">
          <div className="panel-head"><h3><IcoSword /> Лут з РБ</h3></div>
          <div className="panel-body">
            Лут з рейд-босів видається в порядку черги. Черга залежить від активності в клані, участі у РБ і прокачаності
            персонажа.
          </div>
        </div>
        <div className="panel feature">
          <div className="panel-head"><h3><IcoBook /> Банк скілів</h3></div>
          <div className="panel-body">
            Повторювані скіли, які вже є у когось із клану, складаються у спільний банк — звідти можна забрати ті, яких у тебе
            ще немає.
          </div>
        </div>
      </div>

      <div className="section-head">
        <span className="eyebrow">Співбесіда</span>
        <h2>Що запитаємо при вступі</h2>
        <p>
          Мета розмови — зрозуміти, чи людина адекватна, чи підходить їй стиль гри клану, і чи готова вона до наших вимог та
          активностей. Нічого страшного: якщо ти новачок, тут же підкажемо з фармом і розвитком персонажа.
        </p>
      </div>
      <div className="feature-grid">
        <div className="panel feature">
          <div className="panel-head"><span className="feature-n">1</span><h3>Попередня гільдія</h3></div>
          <div className="panel-body">
            З якої гільдії перейшов (якщо була)? Чи були конфлікти — і з якого приводу? Якщо був свідком конфлікту — на чиєму
            боці був?
          </div>
        </div>
        <div className="panel feature">
          <div className="panel-head"><span className="feature-n">2</span><h3>Онлайн</h3></div>
          <div className="panel-body">
            Скільки часу проводиш у грі? <span className="badge bad wrap">менше 2 год/день — не підходить</span>
          </div>
        </div>
        <div className="panel feature">
          <div className="panel-head"><span className="feature-n">3</span><h3>Спосіб фарму</h3></div>
          <div className="panel-body">Як плануєш фармити — донат, конста чи твіни? Так ми зрозуміємо твій план розвитку персонажа.</div>
        </div>
      </div>

      <div className="section-head">
        <span className="eyebrow">Набір</span>
        <h2>Хто відповідає за набір</h2>
        <p>Є питання про вступ — пиши будь-кому з офіцерів нижче (клік по ніку — скопіювати).</p>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h3><IcoUsers /> Офіцери набору</h3>
          <span className="panel-sub">у грі або в Discord</span>
        </div>
        <div className="panel-body">
          <div className="chips">
            {RECRUITMENT_OFFICERS.map((o) => (
              <CopyableNick key={o.nickname} nickname={o.nickname} />
            ))}
          </div>
        </div>
      </div>

      <p className="hint">
        Більше про нас — на{' '}
        <a href={FORUM_URL} target="_blank" rel="noopener" className="link">
          офіційній темі гільдії на форумі сервера
        </a>
        .
      </p>
    </div>
  );
}
