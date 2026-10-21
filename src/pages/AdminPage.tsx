// =========================================================
// /admin — 6 табів: п'ять "табличних" CRUD-панелей (AdminTable) —
// Новачки, Гравці, Ціна лута, Активності, Приоритетність класів — і
// «Доступ»: хто входив через Discord, з баном/розбаном. Евенти для Discord —
// окрема сторінка /events («ДС Евенти»), доступна й адмінам з роллю 'events'.
// =========================================================

import { useState } from 'react';
import PageMeta from '../app/PageMeta';
import { supabase } from '../app/supabaseClient';
import { useAuth } from '../app/useAuth';
import AdminGate from '../components/AdminGate';
import NewbiesTab from './admin/NewbiesTab';
import PlayersTab from './admin/PlayersTab';
import LootPricesTab from './admin/LootPricesTab';
import ActivitiesTab from './admin/ActivitiesTab';
import ClassPriorityTab from './admin/ClassPriorityTab';
import AccessTab from './admin/AccessTab';

type TabName = 'newbies' | 'players' | 'loot' | 'activities' | 'classes' | 'access';

const TABS: { name: TabName; label: string }[] = [
  { name: 'newbies', label: 'Новачки' },
  { name: 'players', label: 'Гравці' },
  { name: 'loot', label: 'Ціна лута' },
  { name: 'activities', label: 'Активності' },
  { name: 'classes', label: 'Приоритетність класів' },
  { name: 'access', label: 'Доступ' },
];

// Активний таб переживає ремаунт і релоад (повернення фокусу вкладці,
// F5) — ключ у localStorage, той самий підхід, що thunder-theme у Header.
const TAB_STORAGE_KEY = 'thunder-admin-tab';

function AdminTabs() {
  const [tab, setTab] = useState<TabName>(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (TABS.some((t) => t.name === saved)) return saved as TabName;
    } catch {
      /* ignore */
    }
    return 'newbies';
  });

  const selectTab = (t: TabName) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="stack">
      <div className="seg seg-scroll admin-tabs" role="tablist" aria-label="Адмін-таби">
        {TABS.map((t) => (
          <button key={t.name} type="button" role="tab" aria-selected={tab === t.name} className={tab === t.name ? 'is-on' : ''} onClick={() => selectTab(t.name)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'newbies' && <NewbiesTab />}
      {tab === 'players' && <PlayersTab />}
      {tab === 'loot' && <LootPricesTab />}
      {tab === 'activities' && <ActivitiesTab />}
      {tab === 'classes' && <ClassPriorityTab />}
      {tab === 'access' && <AccessTab />}
    </div>
  );
}

export default function AdminPage() {
  const { session } = useAuth();
  return (
    <div className="page">
      <PageMeta title="Адмінка — Thunder" />
      <div className="page-head">
        <div className="page-head-text">
          <span className="eyebrow">Адмінка</span>
          <h1>Керування гільдією</h1>
          <p>Зміни в комірках зберігаються одразу, щойно поле втрачає фокус.</p>
        </div>
        {session && (
          <div className="page-head-actions">
            <span className="hint">{session.user.email}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => supabase.auth.signOut()}>Вийти</button>
          </div>
        )}
      </div>
      <AdminGate>{() => <AdminTabs />}</AdminGate>
    </div>
  );
}
