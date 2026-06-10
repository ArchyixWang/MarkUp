import { Empty } from 'antd';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className = '' }: EmptyStateProps) {
  return (
    <Empty
      className={['ui-empty-state-ant', className].filter(Boolean).join(' ')}
      description={<span>{title}{description ? <small>{description}</small> : null}</span>}
    >
      {action}
    </Empty>
  );
}
