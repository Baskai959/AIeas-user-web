import type { ReactNode } from 'react';

import { EmptyState } from './EmptyState';
import { LoadingBlock } from './LoadingBlock';

export function ResultList({
  loading,
  empty,
  emptyText,
  children
}: {
  loading: boolean;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  if (loading) return <LoadingBlock />;
  if (empty) return <EmptyState text={emptyText} />;
  return <div className="result-list">{children}</div>;
}
