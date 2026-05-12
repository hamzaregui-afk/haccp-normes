import { type LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-muted bg-white py-20 text-center">
      {/* Illustration circle */}
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-lighter">
        <Icon className="h-8 w-8 text-brand-medium" />
      </div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-gray-500">{description}</p>
      {actionLabel && onAction && (
        <Button className="mt-6" onClick={onAction} size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
