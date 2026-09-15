// =========================================================
// Заглушка для розділів, доступних лише учасникам клану. Дані цих розділів
// закриті й на сервері — тут просто пояснення й кнопка входу.
// =========================================================

export default function MemberNotice({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '32px 20px', maxWidth: 520, margin: '24px auto' }}>
      <h2 style={{ marginTop: 0 }}>Розділ для своїх</h2>
      <p className="hint" style={{ margin: '0 auto 18px', maxWidth: 400 }}>
        Цей розділ бачать лише учасники сервера клану. Увійди через Discord — якщо ти в клані
        й маєш потрібну роль, доступ відкриється автоматично.
      </p>
      <button type="button" className="btn btn-primary btn-lg" onClick={onLogin}>
        Увійти через Discord
      </button>
      <p className="hint" style={{ margin: '16px 0 0', fontSize: 12 }}>
        Головна та «Р8 фарм» доступні всім і без входу.
      </p>
    </div>
  );
}
