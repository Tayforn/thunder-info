// =========================================================
// Стан авторизації адміна: сесія Supabase Auth + перевірка allow-list
// таблиці `admins` (RLS-функція is_admin() дзеркалить цю ж перевірку на
// стороні бази — цей хук лише для UI-стану).
//
// На відміну від pw-pvp тут немає ролей (superadmin/gm) — усі адміни
// Thunder рівноправні (будь-хто може редагувати новачків/лут/активності
// і ставити галочки на /activity).
// =========================================================

import { useEffect, useRef, useState } from 'react';
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
  // Останній перевірений user id — щоб відрізняти реальну зміну користувача
  // (вхід/вихід) від TOKEN_REFRESHED, який supabase-js кидає щоразу, коли
  // вкладка повертає фокус. Якщо на refresh виставляти loading=true,
  // AdminGate на мить ховає вміст і демонтує сторінку — стан UI (активний
  // адмін-таб, гріди) скидається при кожному поверненні з іншого вікна.
  const lastUserId = useRef<string | null | undefined>(undefined);

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
      lastUserId.current = data.session?.user.id ?? null;
      setSession(data.session);
      checkAdmin(data.session).finally(() => !cancelled && setLoading(false));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      const userId = s?.user.id ?? null;
      if (userId === lastUserId.current) return; // оновлення токена — той самий користувач
      lastUserId.current = userId;
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
