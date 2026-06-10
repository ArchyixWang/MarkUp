import { Tag as AntTag, type TagProps as AntTagProps } from 'antd';
import type { ReactNode } from 'react';

type TagTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

interface TagProps extends Omit<AntTagProps, 'color'> {
  tone?: TagTone;
  children: ReactNode;
}

export function Tag({ tone = 'neutral', className = '', children, ...props }: TagProps) {
  const classes = ['ui-tag-ant', `ui-tag-ant--${tone}`, className].filter(Boolean).join(' ');
  const color = tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : tone === 'danger' ? 'error' : tone === 'info' ? 'processing' : undefined;
  return <AntTag color={color} className={classes} {...props}>{children}</AntTag>;
}
