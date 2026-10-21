// =========================================================
// Таб «Доступ»: усі, хто входив через Discord, з кнопкою бан/розбан.
// Бан діє миттєво — бекенд перевіряє прапорець на кожному запиті, тож
// людина одразу втрачає і ладдер, і закриті розділи гільдії (публічні
// сторінки лишаються доступні всім).
// =========================================================

import { useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../../app/errorMessage';
import AdminTable from '../../components/AdminTable';
import { IcoSearch } from '../../components/Icons';
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
    <div className="stack">
      <div className="tiles" style={{ maxWidth: 480 }}>
        <div className="tile">
          <span className="tile-l">Входили через Discord</span>
          <span className="tile-v">{players.length}</span>
          <span className="tile-s">Головна та «Р8 фарм» відкриті всім</span>
        </div>
        <div className={'tile' + (bannedCount > 0 ? ' bad' : '')}>
          <span className="tile-l">Забанено</span>
          <span className="tile-v">{bannedCount}</span>
          <span className="tile-s">бан діє миттєво, без перезаходу</span>
        </div>
      </div>

      {err && <p className="form-err">{err}</p>}
      {loading ? (
        <p className="loading"><span className="spinner" /> Завантаження…</p>
      ) : (
        <AdminTable
          title="Доступ"
          hint="людина лишається зі своєю сесією, але нічого закритого нею не відкриє"
          actions={
            <label className="row" style={{ gap: 6 }}>
              <IcoSearch style={{ width: 14, height: 14, color: 'var(--text-mute)' }} />
              <input type="text" className="input input-sm" style={{ width: 180 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Пошук за ніком" />
            </label>
          }
          columns="minmax(160px, 2fr) minmax(140px, 1.4fr) 120px 120px"
          minWidth={560}
          header={['Нік', 'Останній вхід', 'Статус', '']}
          rows={shown}
          keyFn={(p) => p.id}
          emptyLabel={players.length === 0 ? 'Ще ніхто не входив через Discord.' : 'Нікого не знайдено.'}
          renderRow={(p) => [
            <b key="n">{p.nickname}</b>,
            <span key="w" className="hint">{when(p.lastLoginAt)}</span>,
            p.banned ? <span key="s" className="badge bad">Забанений</span> : <span key="s" className="badge good">Доступ є</span>,
            <span key="a" className="cell-actions">
              <button
                type="button"
                className={'btn btn-xs ' + (p.banned ? 'btn-ghost' : 'btn-bad')}
                disabled={busyId === p.id}
                onClick={() => toggle(p)}
              >
                {busyId === p.id ? '…' : p.banned ? 'Розбанити' : 'Забанити'}
              </button>
            </span>,
          ]}
        />
      )}
    </div>
  );
}
