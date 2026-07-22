// =========================================================
// Стан авторизації адміна: сесія Supabase Auth + перевірка allow-list
// таблиці `admins` (RLS-функція is_admin() дзеркалить цю ж перевірку на
// стороні бази — цей хук лише для UI-стану).
//
// На відміну від pw-pvp тут немає ролей (superadmin/gm) — усі адміни
// Thunder рівноправні (будь-хто може редагувати новачків/лут/активності
// і ставити галочки на /activity).
// =========================================================

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

interface AuthState {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkAdmin(s: Session | null) {
      if (!s) {
        if (!cancelled) setIsAdmin(false);
        return;
      }
      const { data } = await supabase.from('admins').select('user_id').eq('user_id', s.user.id).maybeSingle();
      if (!cancelled) setIsAdmin(!!data);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      checkAdmin(data.session).finally(() => !cancelled && setLoading(false));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(true);
      checkAdmin(s).finally(() => !cancelled && setLoading(false));
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, isAdmin, loading };
}
