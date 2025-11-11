import React from 'react';
import { cn } from '../../utils/cn';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'ghost' | 'primary';
  tooltip?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  size = 'md',
  variant = 'default',
  className,
  tooltip,
  ...props
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6 text-sm',
    md: 'w-8 h-8 text-base',
    lg: 'w-10 h-10 text-lg',
  };

  const variantClasses = {
    default: 'bg-notion-bg-tertiary hover:bg-notion-bg-secondary text-notion-text-primary',
    ghost: 'bg-transparent hover:bg-notion-bg-tertiary text-notion-text-secondary',
    primary: 'bg-notion-accent-blue hover:bg-opacity-90 text-white',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-notion transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-notion-accent-blue focus:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed active:scale-95',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      title={tooltip}
      {...props}
    >
      {icon}
    </button>
  );
};
