import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-control font-sans text-sm font-medium ' +
    'transition-[transform,background-color,color,box-shadow] duration-quick ease-folio ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    'active:scale-[0.98] cursor-pointer select-none whitespace-nowrap',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink shadow-glass hover:brightness-110',
        secondary:
          'bg-paper-deep text-ink border border-hairline hover:bg-accent-soft hover:border-accent/30',
        ghost: 'text-ink-soft hover:text-ink hover:bg-accent-soft',
        danger: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

/** Primary action control. Drive everything through variant/size props. */
export function Button({ variant, size, className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      data-slot="button"
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
