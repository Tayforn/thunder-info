// =========================================================
// Заглушка для розділів, доступних лише учасникам клану. Дані цих розділів
// закриті й на сервері — тут просто пояснення й кнопка входу.
// =========================================================

import { IcoDiscord, IcoLock } from './Icons';

export default function MemberNotice({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="auth-wrap">
      <div className="panel auth-card">
        <div className="panel-head">
          <h3><IcoLock /> Розділ для своїх</h3>
        </div>
        <div className="panel-body" style={{ textAlign: 'center' }}>
          <img className="auth-crest" src={import.meta.env.BASE_URL + 'assets/favicon-180.png'} alt="" />
          <div className="auth-title">
            <h2>Увійди через Discord</h2>
            <p>
              Цей розділ бачать лише учасники сервера клану. Якщо ти в клані й маєш потрібну роль — доступ
              відкриється автоматично.
            </p>
          </div>
          <button type="button" className="btn btn-discord btn-lg" onClick={onLogin}>
            <IcoDiscord /> Увійти через Discord
          </button>
          <p className="hint">Головна та «Р8 фарм» доступні всім і без входу.</p>
        </div>
      </div>
    </div>
  );
}
