import { Button as AntButton, type ButtonProps as AntButtonProps } from 'antd';
import type { ReactNode } from 'react';

type ButtonTone = 'brand' | 'workbench';
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<AntButtonProps, 'variant' | 'color' | 'size' | 'icon' | 'type' | 'htmlType'> {
  tone?: ButtonTone;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  type?: 'button' | 'submit' | 'reset';
}

export function Button({
  tone = 'brand',
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = [`ui-button-ant--${tone}`, `ui-button-ant--${variant}`, className]
    .filter(Boolean)
    .join(' ');
  const antType = variant === 'primary' ? 'primary' : variant === 'link' ? 'link' : variant === 'ghost' ? 'text' : 'default';
  const danger = variant === 'danger';
  const antSize = size === 'sm' ? 'small' : size === 'lg' ? 'large' : 'middle';

  return (
    <AntButton type={antType} danger={danger} size={antSize} icon={icon} htmlType={type} className={classes} {...props}>
      {children}
    </AntButton>
  );
}
