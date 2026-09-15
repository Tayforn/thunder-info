// =========================================================
// Discord-сесія (спільна на всі піддомени thunderpw.fun). Дає доступ до
// закритих сторінок гільдії — але лише на читання. Адмінські права — окремо,
// через вхід Supabase (useAuth).
// =========================================================

import { useCallback, useEffect, useState } from 'react';

export interface Me {
  playerId: string;
  nickname: string;
  avatarUrl: string | null;
}

export interface MeState {
  me: Me | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

export function useMe(): MeState {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setMe(d as Me | null); })
      .catch(() => { if (alive) setMe(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    setMe(null);
    window.location.reload();
  }, []);

  return {
    me,
    loading,
    login: () => { window.location.href = '/api/auth/login'; },
    logout,
  };
}
