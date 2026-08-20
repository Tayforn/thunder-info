// =========================================================
// /admin — 5 табів, кожен окрема "таблична" CRUD-панель (AdminTable):
// Новачки, Гравці, Ціна лута, Активності, Приоритетність класів.
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

type TabName = 'newbies' | 'players' | 'loot' | 'activities' | 'classes';

const TABS: { name: TabName; label: string }[] = [
  { name: 'newbies', label: 'Новачки' },
  { name: 'players', label: 'Гравці' },
  { name: 'loot', label: 'Ціна лута' },
  { name: 'activities', label: 'Активності' },
  { name: 'classes', label: 'Приоритетність класів' },
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
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }} role="tablist" aria-label="Адмін-таби">
        {TABS.map((t) => (
          <button
            key={t.name}
            type="button"
            role="tab"
            aria-selected={tab === t.name}
            className={'btn btn-sm ' + (tab === t.name ? 'btn-primary' : 'btn-ghost')}
            onClick={() => selectTab(t.name)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'newbies' && <NewbiesTab />}
      {tab === 'players' && <PlayersTab />}
      {tab === 'loot' && <LootPricesTab />}
      {tab === 'activities' && <ActivitiesTab />}
      {tab === 'classes' && <ClassPriorityTab />}
    </div>
  );
}

export default function AdminPage() {
  const { session } = useAuth();
  return (
    <div>
      <PageMeta title="Адмінка — Thunder" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="section-head">
        <div>
          <span className="eyebrow">Адмінка</span>
          <h2>Керування гільдією</h2>
        </div>
        {session && <button type="button" className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>Вийти</button>}
      </div>
      <AdminGate>{() => <AdminTabs />}</AdminGate>
    </div>
  );
}
