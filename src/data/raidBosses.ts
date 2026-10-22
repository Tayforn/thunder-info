// =========================================================
// Статичний список світових РБ — узгоджений вручну зі списком на
// calc.thunderpw.fun/rb (WORLD_BOSSES у pw.calc/src/modules/rb/index.ts).
// Координати на мапі там не потрібні — тут лише назви для чеклиста й
// таблиці розподілу. nick — коротка назва, якою боса звуть у гільдії
// (те саме значення, що й ярлик на мапі calc); id = nick, бо він унікальний.
// Хроно — по пункту на тір (як у гільдії й кажуть: «на хроно 2»), а не на
// окремого боса; у name — боси тіра з CHRONO_BOSSES у calc.
// =========================================================

export interface RaidBoss {
  id: string;
  nick: string;
  name: string;
  /** Відмічений «під контроль» одразу при відкритті /rb — боси, яких гільдія тримає зазвичай. */
  defaultOn: boolean;
}

export const RAID_BOSSES: RaidBoss[] = [
  { id: 'Сніги', nick: 'Сніги', name: 'Дух селища', defaultOn: true },
  { id: 'Загадка', nick: 'Загадка', name: 'Загадка', defaultOn: true },
  { id: 'Жестянка', nick: 'Жестянка', name: 'Енгерранд', defaultOn: true },
  { id: 'Огірок', nick: 'Огірок', name: 'Примарний вершник', defaultOn: false },
  { id: '24', nick: '24', name: 'Шилонос', defaultOn: false },
  { id: 'ГМ', nick: 'ГМ', name: 'Крилатий воїн', defaultOn: true },
  { id: 'ПУО', nick: 'ПУО', name: 'Сталевий меч демона', defaultOn: false },
  { id: 'Шабля', nick: 'Шабля', name: 'Шабля демона', defaultOn: true },
  { id: 'Обеан', nick: 'Обеан', name: 'Обеан', defaultOn: true },
  { id: 'Порт 1', nick: 'Порт 1', name: 'Златий король', defaultOn: true },
  { id: 'Порт 2', nick: 'Порт 2', name: 'Мисливець за душами', defaultOn: false },
  { id: 'Шляпа', nick: 'Шляпа', name: 'Тінь померлого', defaultOn: true },
  { id: 'Альфа', nick: 'Альфа', name: 'Альфа', defaultOn: true },
  { id: 'НД', nick: 'НД', name: 'Аптійський щит', defaultOn: true },
  { id: 'Сколопендра', nick: 'Сколопендра', name: 'Сколопендра вбивця', defaultOn: false },
  { id: 'Око', nick: 'Око', name: 'Око', defaultOn: true },
  { id: 'Хроно 1', nick: 'Хроно 1', name: 'Потрошитель, Майстер-воїн з сокирою', defaultOn: false },
  { id: 'Хроно 2', nick: 'Хроно 2', name: 'Звір грому, Обпалений король скелетів', defaultOn: false },
  { id: 'Хроно 3', nick: 'Хроно 3', name: 'Воїн Гаї, Отруєний король скелетів', defaultOn: false },
  { id: 'Хроно 4', nick: 'Хроно 4', name: 'Пекельний гончак, Страж морозу', defaultOn: false },
];
