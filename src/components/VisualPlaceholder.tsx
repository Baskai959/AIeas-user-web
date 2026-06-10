import { t } from '../i18n/runtime';

export function VisualPlaceholder({ title, imageUrl, tone = 'red' }: { title: string; imageUrl?: string; tone?: 'red' | 'blue' | 'gold' }) {
  if (imageUrl) return <img src={imageUrl} alt={title} />;
  return (
    <div className={`visual-placeholder tone-${tone}`} aria-label={title}>
      <span>{title.slice(0, 2)}</span>
      <small>{t('image.placeholder')}</small>
    </div>
  );
}
