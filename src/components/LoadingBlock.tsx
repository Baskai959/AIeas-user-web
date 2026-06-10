import { DotLoading } from 'antd-mobile';

import { t } from '../i18n/runtime';

export function LoadingBlock() {
  return (
    <div className="loading-block">
      <DotLoading />
      <span>{t('state.loading')}</span>
    </div>
  );
}
