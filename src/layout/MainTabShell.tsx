import type { ReactNode } from 'react';
import { Compass, Home, User } from 'lucide-react';
import type { MessageKey } from '../i18n/messages';

export type MainTab = 'home' | 'discover' | 'me';

interface MainTabShellProps {
  activeTab: MainTab;
  children: ReactNode;
  onTabChange: (tab: MainTab) => void;
  t: (key: MessageKey) => string;
}

export function MainTabShell({ activeTab, children, onTabChange, t }: MainTabShellProps) {
  return (
    <section className={activeTab === 'home' ? 'tab-shell is-home-tab' : 'tab-shell'}>
      <div className="tab-content">{children}</div>
      <BottomTabBar activeTab={activeTab} onTabChange={onTabChange} t={t} />
    </section>
  );
}

function BottomTabBar({ activeTab, onTabChange, t }: Omit<MainTabShellProps, 'children'>) {
  const tabs: Array<{ key: MainTab; label: string; icon: ReactNode }> = [
    { key: 'home', label: t('nav.home'), icon: <Home size={20} /> },
    { key: 'discover', label: t('nav.discover'), icon: <Compass size={20} /> },
    { key: 'me', label: t('nav.me'), icon: <User size={20} /> }
  ];

  return (
    <div className="bottom-tab-frame" data-testid="bottom-tab-frame">
      <nav className="bottom-tabs" aria-label={t('common.navigation')} data-testid="bottom-tabs">
        {tabs.map((item) => (
          <button key={item.key} className={activeTab === item.key ? 'is-active' : ''} type="button" onClick={() => onTabChange(item.key)}>
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
