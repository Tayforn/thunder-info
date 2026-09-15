// =========================================================
// Таб «Доступ»: усі, хто входив через Discord, з кнопкою бан/розбан.
// Бан діє миттєво — бекенд перевіряє прапорець на кожному запиті, тож
// людина одразу втрачає і ладдер, і закриті розділи гільдії (публічні
// сторінки лишаються доступні всім).
// =========================================================

import { useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../../app/errorMessage';
import AdminTable from '../../components/AdminTable';
import { fetchDiscordPlayers, setPlayerBanned, type DiscordPlayer } from '../../data/discordPlayers';

function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AccessTab() {
  const [players, setPlayers] = useState<DiscordPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = () => {
    setLoading(true);
    fetchDiscordPlayers()
      .then((list) => { setPlayers(list); setErr(null); })
      .catch((e) => setErr(errorMessage(e, 'Не вдалося завантажити список.')))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? players.filter((p) => p.nickname.toLowerCase().includes(needle)) : players;
  }, [players, q]);

  const toggle = async (p: DiscordPlayer) => {
    const next = !p.banned;
    const msg = next
      ? `Забанити «${p.nickname}»? Він одразу втратить доступ до ладдера й закритих розділів гільдії.`
      : `Зняти бан з «${p.nickname}»? Доступ повернеться одразу.`;
    if (!confirm(msg)) return;
    setBusyId(p.id);
    try {
      await setPlayerBanned(p.id, next);
      setPlayers((cur) => cur.map((x) => (x.id === p.id ? { ...x, banned: next } : x)));
      setErr(null);
    } catch (e) {
      setErr(errorMessage(e, 'Не вдалося змінити доступ.'));
    } finally {
      setBusyId(null);
    }
  };

  const bannedCount = players.filter((p) => p.banned).length;

  return (
    <div>
      <p className="hint" style={{ marginTop: 0 }}>
        Усі, хто входив через Discord ({players.length}
        {bannedCount > 0 ? `, з них забанено ${bannedCount}` : ''}). Бан діє миттєво, без перезаходу:
        людина лишається зі своєю сесією, але нічого закритого нею не відкриє. Головна та «Р8 фарм» доступні всім і без входу.
      </p>

      <label className="field" style={{ maxWidth: 280, marginBottom: 14 }}>
        <span>Пошук за ніком</span>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Почни вводити нік" />
      </label>

      {err && <p className="form-err">{err}</p>}
      {loading ? (
        <p className="hint">Завантаження…</p>
      ) : (
        <AdminTable
          columns="2fr 1fr 1.6fr 1.1fr auto"
          header={['Нік', 'Забігів', 'Останній вхід', 'Статус', '']}
          rows={shown}
          keyFn={(p) => p.id}
          emptyLabel={players.length === 0 ? 'Ще ніхто не входив через Discord.' : 'Нікого не знайдено.'}
          renderRow={(p) => [
            <b>{p.nickname}</b>,
            p.runsCount,
            when(p.lastLoginAt),
            p.banned ? <span className="badge bad">Забанений</span> : <span className="badge good">Доступ є</span>,
            <button
              type="button"
              className={'btn btn-sm ' + (p.banned ? 'btn-ghost' : 'btn-bad')}
              disabled={busyId === p.id}
              onClick={() => toggle(p)}
            >
              {busyId === p.id ? '…' : p.banned ? 'Розбанити' : 'Забанити'}
            </button>,
          ]}
        />
      )}
    </div>
  );
}
