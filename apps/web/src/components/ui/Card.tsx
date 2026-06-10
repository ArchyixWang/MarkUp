import { Card as AntCard, type CardProps as AntCardProps } from 'antd';
import type { ReactNode } from 'react';

interface CardProps extends Omit<AntCardProps, 'children'> {
  as?: 'article' | 'section' | 'div';
  tone?: 'brand' | 'workbench';
  padding?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Card({
  as: Component = 'div',
  tone = 'brand',
  padding = 'md',
  className = '',
  children,
  ...props
}: CardProps) {
  const classes = ['ui-card-ant', `ui-card-ant--${tone}`, `ui-card-ant--${padding}`, className].filter(Boolean).join(' ');
  return (
    <AntCard className={classes} styles={{ body: { padding: padding === 'sm' ? 12 : padding === 'lg' ? 20 : 16 } }} {...props}>
      <Component className="ui-card-ant__content">{children}</Component>
    </AntCard>
  );
}
