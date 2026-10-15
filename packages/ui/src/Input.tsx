import * as React from 'react';
import { cn } from './cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/** Text input. Token-styled, focus ring on accent. */
export function Input({ className, type = 'text', ...props }: InputProps) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        'flex h-10 w-full rounded-control border border-hairline bg-paper px-3 py-2 font-sans text-sm text-ink',
        'placeholder:text-ink-faint',
        'transition-[border-color,box-shadow] duration-quick ease-folio',
        'focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
