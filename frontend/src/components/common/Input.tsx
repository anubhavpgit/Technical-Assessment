import React from 'react';
import { cn } from '../../utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  icon,
  className,
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-notion-text-primary mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-notion-text-tertiary">
            {icon}
          </div>
        )}
        <input
          className={cn(
            'w-full px-3 py-2 bg-white border rounded-notion',
            'text-notion-text-primary placeholder-notion-text-tertiary',
            'focus:outline-none focus:ring-2 focus:ring-notion-accent-blue focus:border-transparent',
            'transition-all duration-200',
            error
              ? 'border-notion-accent-red focus:ring-notion-accent-red'
              : 'border-notion-border',
            icon && 'pl-10',
            className
          )}
          {...props}
        />
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-notion-accent-red">{error}</p>
      )}
    </div>
  );
};
