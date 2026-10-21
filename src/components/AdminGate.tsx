// =========================================================
// Спільний гейт для сторінок, що потребують адмінських прав
// (/activity, /r8, /admin) — витягнутий з LoginForm-патерну pw-pvp
// AdminPage.tsx, бо тут він потрібен трьом сторінкам, а не одній.
//
// allow: 'admin' (за замовчуванням) — лише повні адміни; 'events' — і адміни
// евентів (role = 'events', міграція 0008) — для сторінки «ДС Евенти».
// children отримують сесію і роль уже після перевірки — без миготіння.
// =========================================================

import { useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../app/supabaseClient';
import { useAuth, type AdminRole } from '../app/useAuth';
import { IcoLock } from './Icons';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    setBusy(false);
  };

  return (
    <div className="auth-wrap">
      <form className="panel auth-card" onSubmit={submit}>
        <div className="panel-head">
          <h3><IcoLock /> Адмінка Thunder</h3>
        </div>
        <div className="panel-body">
          <img className="auth-crest" src={import.meta.env.BASE_URL + 'assets/favicon-180.png'} alt="" />
          <div className="auth-title">
            <h2>Вхід</h2>
            <p>Окремий акаунт адміністратора — не Discord.</p>
          </div>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} required autoComplete="username" onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input type="password" value={password} required autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
          </label>
          {err && <p className="form-err">{err}</p>}
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Вхід…' : 'Увійти'}</button>
        </div>
      </form>
    </div>
  );
}

function Blocked({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="panel auth-card">
        <div className="panel-head"><h3><IcoLock /> Доступ</h3></div>
        <div className="panel-body">
          <p style={{ margin: 0 }}>{text}</p>
          <div className="row">
            {children}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut()}>Вийти</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminGate({ allow = 'admin', children }: { allow?: 'admin' | 'events'; children: (session: Session, role: AdminRole) => ReactNode }) {
  const { session, role, loading } = useAuth();

  if (loading) return <p className="loading"><span className="spinner" /> Перевірка сесії…</p>;
  if (!session) return <LoginForm />;
  if (role === 'events' && allow === 'admin') {
    return (
      <Blocked text="Цей акаунт має доступ лише до розділу «ДС Евенти».">
        <button type="button" className="btn btn-primary btn-sm" data-goto="events">До евентів</button>
      </Blocked>
    );
  }
  if (!role) return <Blocked text="Цей акаунт не має прав адміністратора Thunder." />;

  return <>{children(session, role)}</>;
}
