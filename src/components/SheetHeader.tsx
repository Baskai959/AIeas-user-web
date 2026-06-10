import { X } from 'lucide-react';

import { t } from '../i18n/runtime';

export function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header className="sheet-header">
      <h2>{title}</h2>
      <button type="button" aria-label={t('common.close')} onClick={onClose}>
        <X size={18} />
      </button>
    </header>
  );
}
