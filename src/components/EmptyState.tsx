import { Package } from 'lucide-react';

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <Package size={30} />
      <span>{text}</span>
    </div>
  );
}
