import type { LucideIcon } from 'lucide-react';
import { Globe } from 'lucide-react';
import { useState } from 'react';

import { NotificationBell } from '@/components/notifications';
import { setLanguage, SUPPORTED_LANGUAGES, type LangCode } from '@/i18n';

interface HeaderProps {
  title:     string;
  subtitle?: string;
  /** Optional icon displayed to the left of the title */
  icon?:     LucideIcon;
  /** Tailwind bg + text classes for the icon badge, e.g. "bg-brand-light text-brand-dark" */
  iconColor?: string;
}

export function Header({ title, subtitle, icon: Icon, iconColor = 'bg-brand-light text-brand-dark' }: HeaderProps) {
  const [currentLang, setCurrentLang] = useState<LangCode>(
    (localStorage.getItem('haccp_lang') as LangCode) ?? 'fr',
  );

  const handleLangChange = (code: LangCode) => {
    setLanguage(code);
    setCurrentLang(code);
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-surface-muted bg-white px-6">
      {/* Page title */}
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconColor}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div>
          <h1 className="text-lg font-semibold text-brand-dark">{title}</h1>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Real-time notification bell */}
        <NotificationBell />

        {/* Language selector — FR / EN / AR with RTL support via setLanguage */}
        <div className="flex items-center gap-1 rounded-lg border border-surface-muted bg-white px-2 py-1">
          <Globe className="h-4 w-4 text-gray-400" aria-hidden="true" />
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => handleLangChange(l.code)}
              aria-pressed={currentLang === l.code}
              className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                currentLang === l.code
                  ? 'bg-brand-medium text-white'
                  : 'text-gray-500 hover:text-brand-dark'
              }`}
            >
              {l.code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
