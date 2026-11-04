import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const baseField =
  'fazoo-field h-11 w-full rounded-[9px] border bg-white px-3 text-sm text-ink placeholder:text-muted/70 focus:border-primary focus:outline-2 focus:outline-offset-1 focus:outline-primary';

export function Input({ className, id, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      id={id}
      className={cn(baseField, className)}
      aria-required={props.required}
      {...props}
    />
  );
}

export function Select({ className, id, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      id={id}
      className={cn(baseField, 'pr-8', className)}
      aria-required={props.required}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-xs font-medium text-muted', className)}
      {...props}
    />
  );
}
