import { Spin } from 'antd';

interface WorkspaceLoadingProps {
  tip: string;
  className?: string;
}

export function WorkspaceLoading({ tip, className }: WorkspaceLoadingProps) {
  return (
    <div className={['workspace-loading', className].filter(Boolean).join(' ')} role="status" aria-label={tip}>
      <Spin size="large" />
      <span className="workspace-loading-tip">{tip}</span>
    </div>
  );
}
