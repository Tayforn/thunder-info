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
    <div className="card" style={{ maxWidth: 380, margin: '40px auto' }}>
      <div className="section-head" style={{ marginBottom: 16 }}>
        <span className="eyebrow">Адмінка Thunder</span>
        <h2>Вхід</h2>
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} required onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input type="password" value={password} required onChange={(e) => setPassword(e.target.value)} />
        </label>
        {err && <p className="form-err">{err}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Вхід…' : 'Увійти'}</button>
      </form>
    </div>
  );
}

export default function AdminGate({ allow = 'admin', children }: { allow?: 'admin' | 'events'; children: (session: Session, role: AdminRole) => ReactNode }) {
  const { session, role, loading } = useAuth();

  if (loading) return <p className="hint">Перевірка сесії…</p>;
  if (!session) return <LoginForm />;
  if (role === 'events' && allow === 'admin') {
    return (
      <div className="card">
        <p>Цей акаунт має доступ лише до розділу «ДС Евенти».</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" data-goto="events">До евентів</button>
          <button type="button" className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Вийти</button>
        </div>
      </div>
    );
  }
  if (!role) {
    return (
      <div className="card">
        <p>Цей акаунт не має прав адміністратора Thunder.</p>
        <button type="button" className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Вийти</button>
      </div>
    );
  }

  return <>{children(session, role)}</>;
}
